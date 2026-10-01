import { authed } from './_lib.js';

/* The authoritative copy of the extraction.
   Confirmed wallpaper orders placed on or after MB_SINCE, sourced to
   Macro Media or Life N Colors, installation and site audit excluded,
   newest order first. Kept server-side so the browser cannot alter it. */
const MB_SINCE = process.env.MB_SINCE || '2026-08-20';

const SQL = `
SELECT so.zoho_salesorder_number AS order_no,
       e.order_placed_time AS order_placed_at,
       COALESCE(e.lead_id,'') AS enq_id,
       e.estimate_status,
       COALESCE(v.name,'') AS vendor_name,
       ei.category_name AS category,
       trim(concat_ws(' ', c.f_name, c.l_name)) AS customer,
       COALESCE(c.contact::text,'') AS phone,
       COALESCE(c.city,'') AS city,
       trim(concat_ws(' ', b.f_name, b.l_name)) AS bm,
       max(sol.promised_delivery_date)::text AS promised_delivery_date,
       bool_and(COALESCE(sol.availability_confirmed,false)) AS availability_confirmed,
       round(sum(sol.ordered_qty - COALESCE(sol.cancelled_qty,0)),2)::float8 AS sqft,
       count(*)::int AS items,
       min(ei.product_handle) AS design_handle,
       bool_or(ei.product_handle ILIKE '%customized-size%') AS is_custom
FROM oms_sales_order_line sol
JOIN oms_sales_order so ON so.id = sol.salesorder_id
JOIN estimate_items ei ON ei.id = sol.estimate_item_id AND COALESCE(ei.is_deleted,false)=false
JOIN estimate e ON e.id = so.estimate_id
JOIN vendor v ON v.id = sol.source_vendor_id
LEFT JOIN users_user c ON c.id = e.client_id
LEFT JOIN users_user b ON b.id = e.assigned_to_id
WHERE ei.category_name = 'Wallpapers'
  AND ei.category_name NOT IN ('Installation','Site Audit')
  AND e.estimate_status IN ('order_placed','order_confirmed','shipped','partly_shipped','partly_delivered','delivered')
  AND (v.name ILIKE '%MACRO MEDIA%' OR v.name ILIKE '%LIFE N COLORS%')
  AND e.order_placed_time >= TIMESTAMP '${MB_SINCE} 00:00:00'
GROUP BY 1,2,3,4,5,6,7,8,9,10
ORDER BY e.order_placed_time DESC`;

export default async function handler(req, res) {
  if (!authed(req)) {
    return res.status(401).json({ error: 'Sign in with the team key first.' });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const base = (process.env.METABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.METABASE_API_KEY;
  if (!base || !key) {
    return res.status(500).json({ error: 'METABASE_URL and METABASE_API_KEY are not set.' });
  }

  try {
    const r = await fetch(base + '/api/dataset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({
        database: Number(process.env.METABASE_DB_ID || 5),
        type: 'native',
        native: { query: SQL }
      })
    });

    const j = await r.json().catch(() => null);
    if (!r.ok || !j || j.status === 'failed' || j.error) {
      const detail = (j && (j.error || j.message)) || ('HTTP ' + r.status);
      console.error('metabase:', detail);
      return res.status(502).json({ error: 'Metabase rejected the query: ' + detail });
    }

    return res.status(200).json({
      rows: j.data.rows,
      cols: j.data.cols,
      at: new Date().toISOString()
    });
  } catch (e) {
    console.error('metabase:', e);
    return res.status(502).json({ error: 'Metabase could not be reached.' });
  }
}
