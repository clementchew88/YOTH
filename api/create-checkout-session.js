import Stripe from 'stripe';

// ─── Pricing (in sen: RM169 = 16900) ─────────────────────────────────────────
const PRICE_SINGLE = 16900;   // RM169 — single item
const PRICE_BUNDLE = 14900;   // RM149 each — 2 or more items

// ─── Product catalogue ────────────────────────────────────────────────────────
const PRODUCTS = {
  'aquashorts': { name: 'Year of the Horse Aquashorts' },
  'briefs':     { name: 'Year of the Horse Briefs' },
};

const ALLOWED_COUNTRIES = ['MY', 'SG', 'AU', 'GB', 'US'];

export default async function handler(req, res) {
  const origin = process.env.SITE_ORIGIN || '';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

    // Page sends: { items: [{ product, size, qty }] }
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty or malformed.' });
    }

    for (const item of items) {
      if (!PRODUCTS[item.product]) {
        return res.status(400).json({ error: `Unknown product: ${item.product}` });
      }
      if (!item.qty || item.qty < 1) {
        return res.status(400).json({ error: 'Invalid quantity.' });
      }
    }

    // Decide price tier server-side
    const totalQty = items.reduce((sum, it) => sum + it.qty, 0);
    const unitPrice = totalQty >= 2 ? PRICE_BUNDLE : PRICE_SINGLE;
    const tierLabel = totalQty >= 2 ? 'Bundle price (RM149 each)' : 'Single price (RM169)';

    const lineItems = items.map((item) => ({
      price_data: {
        currency: 'myr',
        unit_amount: unitPrice,
        product_data: {
          name: PRODUCTS[item.product].name,
          description: item.size ? `Size: ${item.size} — ${tierLabel}` : tierLabel,
        },
      },
      quantity: item.qty,
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: lineItems,
      shipping_address_collection: { allowed_countries: ALLOWED_COUNTRIES },
      shipping_options: [{
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: 0, currency: 'myr' },
          display_name: 'Standard Shipping',
          delivery_estimate: {
            minimum: { unit: 'business_day', value: 3 },
            maximum: { unit: 'business_day', value: 7 },
          },
        },
      }],
      success_url: `${origin}/yoth?order=confirmed`,
      cancel_url:  `${origin}/yoth`,
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('Stripe error:', err.message);
    return res.status(500).json({ error: 'Could not create checkout session.' });
  }
}
