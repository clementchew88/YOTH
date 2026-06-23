import { applyCors } from './_cors.js';
import { getAllStock } from './_stock.js';

// Public read-only endpoint the shop page polls to grey out sold-out sizes.
export default async function handler(req, res) {
  applyCors(req, res, 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const stock = await getAllStock();
    return res.status(200).json(stock);
  } catch (err) {
    console.error('Stock fetch error:', err.message);
    return res.status(500).json({ error: 'Could not retrieve stock.' });
  }
}
