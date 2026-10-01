import { pool, readJson } from './_lib.js';

/* Public, unauthenticated lookup by PO number or enquiry ID.
   Returns only what a customer should see: no phone, no vendor,
   no internal notes, no cost. */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const body = await readJson(req);
  const q = (body && String(body.q || '')).trim();
  if (!q || q.length > 64) return res.status(400).json({ error: 'Enter a PO number or enquiry ID.' });

  try {
    const { rows } = await pool.query(
      `select doc from orders
        where upper(doc->>'po') = upper($1) or upper(doc->>'enq') = upper($1)
        limit 1`,
      [q]
    );
    if (!rows.length) return res.status(404).json({ error: 'No order found.' });

    const d = rows[0].doc || {};
    return res.status(200).json({
      order: {
        po: d.po || '', enq: d.enq || '',
        customer: d.customer || '', design: d.design || '',
        flow: d.flow || 'custom',
        status: d.status || '', statusAt: d.statusAt || '',
        deliveryDate: d.deliveryDate || '',
        onHold: !!d.onHold,
        log: (d.log || []).map(l => ({ t: l.t, status: l.status }))
      }
    });
  } catch (e) {
    console.error('track:', e);
    return res.status(500).json({ error: 'Lookup failed.' });
  }
}
