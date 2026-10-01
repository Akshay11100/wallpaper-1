create extension if not exists pgcrypto;

create table if not exists orders (
  id          uuid primary key default gen_random_uuid(),
  po          text,
  enq         text,
  vendor      text,
  doc         jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Lookups used by the tracking page.
create index if not exists orders_po_idx  on orders (upper(po));
create index if not exists orders_enq_idx on orders (upper(enq));

-- Stops the same vendor job being imported twice.
create unique index if not exists orders_po_vendor_idx
  on orders (upper(po), coalesce(vendor,'')) where po is not null;
