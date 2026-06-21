const Stripe = require('stripe');

// ─── Pricing (in sen: RM169 = 16900) ─────────────────────────────────────────
const PRICE_SINGLE = 16900;   // RM169 — single item
const PRICE_BUNDLE = 14900;   // RM149 each — 2 or more items

// ─── Product catalogue ────────────────────────────────────────────────────────
// Keys must match what YOTH Page.html sends in the cart payload
const PRODUCTS = {
  'yoth-tee': {
    name: 'Year of the Horse Tee',
    description: 'Atlas Poolside — Limited Drop',
  },
  // Add more products here if needed:
  // 'yoth-cap': { name: 'Year of the Horse Cap', description: '...' },
};

// ─── Allowed countries for shipping ──────────────────────────────────────────
const ALLOWED_COUNTRIES = ['MY', 'SG', 'AU', 'GB', 'US'];

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS — allow requests from your site only
  const origin = process.env.SITE_ORIGIN || '';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });

    // ── Parse cart from request body ─────────────────────────────────────────
    // Expected shape: [{ productId: 'yoth-tee', size: 'M', quantity: 2 }, ...]
    const { cart } = req.body;

    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: 'Cart is empty or malformed.' });
    }

    // Validate all productIds
    for (const item of cart) {
      if (!PRODUCTS[item.productId]) {
        return res.status(400).json({ error: `Unknown product: ${item.productId}` });
      }
      if (!item.quantity || item.quantity < 1) {
        return res.status(400).json({ error: 'Invalid quantity.' });
      }
    }

    // ── Decide price tier server-side ─────────────────────────────────────────
    const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);
    const unitPrice = totalQty >= 2 ? PRICE_BUNDLE : PRICE_SINGLE;
    const tierLabel = totalQty >= 2 ? 'Bundle price (RM149 each)' : 'Single price (RM169)';

    // ── Build Stripe line items ───────────────────────────────────────────────
    const lineItems = cart.map((item) => {
      const product = PRODUCTS[item.productId];
      return {
        price_data: {
          currency: 'myr',
          unit_amount: unitPrice,
          product_data: {
            name: product.name,
            description: item.size ? `Size: ${item.size} — ${tierLabel}` : tierLabel,
          },
        },
        quantity: item.quantity,
      };
    });

    // ── Create Stripe Checkout Session ────────────────────────────────────────
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: lineItems,
      shipping_address_collection: {
        allowed_countries: ALLOWED_COUNTRIES,
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 0, currency: 'myr' },
            display_name: 'Standard Shipping',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 3 },
              maximum: { unit: 'business_day', value: 7 },
            },
          },
        },
      ],
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/shop`,
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('Stripe error:', err.message);
    return res.status(500).json({ error: 'Could not create checkout session.' });
  }
};
