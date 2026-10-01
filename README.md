# Wallpaper Order Line

Procurement board for custom wallpaper orders at Material Depot, plus a public
tracking page for BMs and customers.

This is the Claude artifact rebuilt to run on your own infrastructure. The UI is
unchanged. What changed is underneath: the artifact runtime is gone, replaced by
three serverless functions and a Postgres table.

| Concern | In the artifact | Here |
|---|---|---|
| Storage | Claude's built-in store | Postgres (`orders` table) |
| Metabase | Each viewer's own connector | One server-side API key |
| Access | Anyone in the Claude workspace | Shared team key, tracking page public |
| Refresh | Live push | Polls every 15 seconds |

## Files

```
public/index.html   the whole UI, one file, no build step
api/orders.js       list, create, update, delete orders  (team key required)
api/metabase.js     runs the extraction against Metabase (team key required)
api/track.js        public lookup by PO or enquiry ID
api/_lib.js         database pool, auth, body parsing
schema.sql          the one table to create
```

The extraction SQL lives in `api/metabase.js` and nowhere else. The browser
never sees it and never sends SQL, so a visitor cannot rewrite the query.

## 1. Database

Any Postgres works. Vercel Postgres, Neon and Supabase all have a free tier.

Create one, then run `schema.sql` against it:

```bash
psql "$DATABASE_URL" -f schema.sql
```

Use the **pooled** connection string. Serverless functions open many short
connections and a direct string will exhaust the server.

## 2. Metabase API key

In Metabase: **Settings → Admin → Authentication → API keys → Create**.

Give it a group with **read access to the warehouse only**. This key can run any
query the group allows, so do not hand it an admin group.

## 3. Team key

This is the shared secret that unlocks the board. Generate one:

```bash
openssl rand -hex 24
```

Anyone with it can read and change every order, so send it through a password
manager, not over chat. To rotate it, change the variable in Vercel and
redeploy; everyone signs in again.

## 4. Push to GitHub

```bash
cd wallpaper-order-line
git init
git add .
git commit -m "Wallpaper order line"
git branch -M main
git remote add origin git@github.com:YOUR-ORG/wallpaper-order-line.git
git push -u origin main
```

`.gitignore` already excludes `.env` and `node_modules`. Check that `.env` is
not in `git status` before your first commit.

## 5. Deploy on Vercel

1. **vercel.com → Add New → Project**, import the repository.
2. Framework preset: **Other**. No build command. Output directory `public`
   (already pinned in `vercel.json`).
3. Add the environment variables from `.env.example` under **Settings →
   Environment Variables**, for Production, Preview and Development:
   `DATABASE_URL`, `TEAM_KEY`, `METABASE_URL`, `METABASE_API_KEY`,
   `METABASE_DB_ID`, `MB_SINCE`.
4. **Deploy.**

Environment variables are only read at runtime, so after changing any of them
you must redeploy.

## 6. First run

Open the deployment. Click **Read-only — tap to sign in** in the top right and
paste the team key. The page reloads, the Metabase panel appears, and **Check
now** pulls in confirmed wallpaper orders placed since `MB_SINCE`.

## Metabase must accept traffic from Vercel

This is the step that usually fails first. `metabase.materialdepot.in` has to be
reachable from Vercel's servers. If it sits behind a VPN or an IP allowlist, the
function will time out and the panel will report that Metabase could not be
reached.

Options, best first:

- Allowlist Vercel's egress IPs. This needs a Pro plan and **Settings → Functions
  → Secure Compute**, which gives you a fixed IP range to allow.
- Put Metabase behind a public hostname with the API key as the only credential.
- Run the import on a machine inside your network and have it POST into
  `/api/orders` instead, leaving `api/metabase.js` unused.

## Things worth knowing

**Polling, not live.** Two people editing the same order within 15 seconds can
overwrite each other; last write wins. The artifact had the same behaviour. If
that starts to bite, add an `updated_at` check to the `PUT` in `api/orders.js`
and reject stale writes.

**The tracking page is public by design.** Anyone who can guess a PO number sees
the customer name, design and delivery date for that order. `api/track.js`
already withholds phone, vendor and internal notes. If that is still too much,
put the customer name behind a second field, such as the last four digits of
their phone.

**No rate limiting.** `api/track.js` is open to the internet and will answer as
fast as it is asked. Before you publicise the link, put Vercel's WAF or a rate
limiter in front of it, or someone can enumerate PO numbers.

**Costs.** Well inside the free tier at this volume: 99 orders, a handful of
users, a query every few minutes.

## Running it locally

```bash
npm install
npm i -g vercel
cp .env.example .env    # fill it in
vercel dev
```

`vercel dev` serves `public/index.html` and runs the functions the same way
production does. Opening the HTML file directly will not work, because `/api/*`
will 404.

## Layout matters

Static files live in `public/`, functions in `api/`. If you move `index.html`
back to the repo root, Vercel serves its own 404 at `/` instead of the page,
because a `package.json` with no build step makes it stop treating the root as
static.
