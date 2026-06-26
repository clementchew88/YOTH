import Stripe from 'stripe';
import { applyCors } from './_cors.js';
import { checkAvailability } from './_stock.js';

// ─── Product catalogue (prices in sen) ───────────────────────────────────────
// Bundle pricing kicks in once 2+ items (any product, any mix) are in the cart.
const PRODUCTS = {
  'aquashorts':     { name: 'Year of the Horse Aquashorts',           priceSingle: 16900, priceBundle: 14900 }, // RM169 / RM149
  'briefs':         { name: 'Year of the Horse Briefs',               priceSingle: 16900, priceBundle: 14900 }, // RM169 / RM149
  'training_suit':  { name: 'Year of the Horse Girls Training Suit',  priceSingle: 18900, priceBundle: 16900 }, // RM189 / RM169
};

const ALLOWED_COUNTRIES = ['MY', 'SG'];

export default async function handler(req, res) {
  const allowOrigin = applyCors(req, res, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Origin for success/cancel redirects — prefer the configured base.
  const redirectBase = (process.env.SITE_ORIGIN || allowOrigin).replace(/\/$/, '');

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

    const availability = await checkAvailability(items);
    if (!availability.ok) {
      if (availability.reason === 'size_required') {
        return res.status(400).json({ error: `Size is required for ${availability.product}.` });
      }
      return res.status(409).json({
        error: `Only ${availability.available} left in size ${availability.size} for ${availability.product}.`,
      });
    }

    const totalQty = items.reduce((sum, it) => sum + it.qty, 0);
    const bundleActive = totalQty >= 2;
    const freeMalaysiaShipping = totalQty > 2; // 3+ items, any product — free West/East Malaysia shipping

    const lineItems = items.map((item) => {
      const product = PRODUCTS[item.product];
      const unitPrice = bundleActive ? product.priceBundle : product.priceSingle;
      const tierLabel = bundleActive ? `Bundle price (RM${unitPrice / 100} each)` : `Single price (RM${unitPrice / 100})`;
      return {
        price_data: {
          currency: 'myr',
          unit_amount: unitPrice,
          product_data: {
            name: product.name,
            description: item.size ? `Size: ${item.size} — ${tierLabel}` : tierLabel,
          },
        },
        quantity: item.qty,
      };
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: lineItems,
      allow_promotion_codes: true,
      shipping_address_collection: { allowed_countries: ALLOWED_COUNTRIES },
      phone_number_collection: { enabled: true },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: freeMalaysiaShipping ? 0 : 850, currency: 'myr' },  // RM8.50, free for 3+ items
            display_name: freeMalaysiaShipping ? 'West Malaysia (Semenanjung) — Free (3+ items)' : 'West Malaysia (Semenanjung)',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 3 },
              maximum: { unit: 'business_day', value: 7 },
            },
          },
        },
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: freeMalaysiaShipping ? 0 : 1750, currency: 'myr' },  // RM17.50, free for 3+ items
            display_name: freeMalaysiaShipping ? 'East Malaysia (Sabah & Sarawak) — Free (3+ items)' : 'East Malaysia (Sabah & Sarawak)',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 5 },
              maximum: { unit: 'business_day', value: 10 },
            },
          },
        },
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 3500, currency: 'myr' },  // RM35 — Singapore via Teleport
            display_name: 'Singapore (via Teleport)',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 3 },
              maximum: { unit: 'business_day', value: 7 },
            },
          },
        },
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 0, currency: 'myr' },  // Free — self collect
            display_name: 'Self-collect from Clement',
          },
        },
      ],
      success_url: `${redirectBase}/yoth?order=confirmed&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${redirectBase}/yoth`,
      metadata: {
        // Read by api/stripe-webhook.js to decrement stock once payment is confirmed.
        items: JSON.stringify(items.map((it) => ({ product: it.product, size: it.size, qty: it.qty }))),
      },
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('Stripe error:', err.message);
    return res.status(500).json({ error: 'Could not create checkout session.' });
  }
}
