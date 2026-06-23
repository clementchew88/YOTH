// Stripe Checkout Session creator — Vercel serverless function.
// The browser cart POSTs { items: [{ product, size, qty }] } here.
// Pricing is recomputed server-side so the client can never set its own price.

const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const CURRENCY = 'myr';

// Server-side source of truth. Amounts are in sen (1 MYR = 100 sen).
const PRODUCTS = {
  aquashorts: { name: 'Year of the Horse Aquashorts' },
  briefs: { name: 'Year of the Horse Briefs' },
};
const PRICE_SINGLE = 16900; // RM169 — single item
const PRICE_BUNDLE = 14900; // RM149 each — when total quantity >= 2

// Set SITE_ORIGIN in Vercel to your live site URL, e.g. https://atlaspoolside.com
const SITE_ORIGIN = process.env.SITE_ORIGIN || '';
const ALLOWED_ORIGIN = SITE_ORIGIN || '*';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items in cart' });
    }

    // Bundle rule: ordering 2+ items (mixed freely) drops every unit to RM149.
    const totalQty = items.reduce((n, it) => n + (parseInt(it.qty, 10) || 0), 0);
    const unitAmount = totalQty >= 2 ? PRICE_BUNDLE : PRICE_SINGLE;

    const line_items = items.map((it) => {
      const product = PRODUCTS[it.product];
      if (!product) throw new Error('Unknown product: ' + it.product);
      const qty = parseInt(it.qty, 10) || 0;
      if (qty < 1) throw new Error('Invalid quantity');
      const size = String(it.size || '').slice(0, 10);
      return {
        quantity: qty,
        price_data: {
          currency: CURRENCY,
          unit_amount: unitAmount,
          product_data: {
            name: product.name,
            description: size ? 'Size: ' + size : undefined,
          },
        },
      };
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      shipping_address_collection: {
        allowed_countries: ['MY', 'SG', 'BN', 'ID', 'TH', 'PH', 'VN', 'HK', 'AU', 'GB'],
      },
      shipping_options: [
        { shipping_rate_data: { type: 'fixed_amount', display_name: 'Malaysia', fixed_amount: { amount: 1000, currency: CURRENCY } } },
        { shipping_rate_data: { type: 'fixed_amount', display_name: 'Rest of Asia', fixed_amount: { amount: 2500, currency: CURRENCY } } },
        { shipping_rate_data: { type: 'fixed_amount', display_name: 'International', fixed_amount: { amount: 4000, currency: CURRENCY } } },
      ],
      phone_number_collection: { enabled: true },
      success_url: SITE_ORIGIN + '/?checkout=success',
      cancel_url: SITE_ORIGIN + '/?checkout=cancelled',
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
