import { pool, authed, readJson } from './_lib.js';

export default async function handler(req, res) {
  if (!authed(req)) {
    return res.status(401).json({ error: 'Sign in with the team key to use this board.' });
  }

  try {
    if (req.method === 'GET') {
      const { rows } = await pool.query(
        `select id, doc from orders
         order by coalesce(doc->>'createdAt', to_char(created_at,'YYYY-MM-DD"T"HH24:MI:SSZ')) desc`
      );
      return res.status(200).json({ orders: rows });
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const doc = body && body.doc;
      if (!doc || typeof doc !== 'object') {
        return res.status(400).json({ error: 'A doc object is required.' });
      }
      const { rows } = await pool.query(
        `insert into orders (po, enq, vendor, doc) values ($1,$2,$3,$4) returning id`,
        [doc.po || null, doc.enq || null, doc.vendor || null, doc]
      );
      return res.status(200).json({ id: rows[0].id });
    }

    const id = req.query && req.query.id;
    if (!id) return res.status(400).json({ error: 'An order id is required.' });

    if (req.method === 'PUT') {
      const body = await readJson(req);
      const doc = body && body.doc;
      if (!doc || typeof doc !== 'object') {
        return res.status(400).json({ error: 'A doc object is required.' });
      }
      const { rowCount } = await pool.query(
        `update orders
            set doc = $2, po = $3, enq = $4, vendor = $5, updated_at = now()
          where id = $1`,
        [id, doc, doc.po || null, doc.enq || null, doc.vendor || null]
      );
      if (!rowCount) return res.status(404).json({ error: 'That order no longer exists.' });
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      await pool.query('delete from orders where id = $1', [id]);
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (e) {
    console.error('orders:', e);
    return res.status(500).json({ error: 'The order store could not be reached.' });
  }
}
