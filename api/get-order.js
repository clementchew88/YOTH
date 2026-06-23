import Stripe from 'stripe';
import { applyCors } from './_cors.js';

// Returns order details for the success page, looked up by the Stripe
// Checkout session id that was appended to success_url.
export default async function handler(req, res) {
  applyCors(req, res, 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sessionId = req.query.session_id;
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'Missing session_id.' });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items', 'shipping_cost.shipping_rate'],
    });

    if (session.payment_status !== 'paid') {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const items = (session.line_items?.data || []).map((li) => ({
      name: li.description,
      quantity: li.quantity,
      amount_total: li.amount_total,
    }));

    return res.status(200).json({
      id: session.id,
      created: session.created,
      currency: session.currency,
      amount_total: session.amount_total,
      shipping_option: session.shipping_cost?.shipping_rate?.display_name || null,
      shipping_amount: session.shipping_cost?.amount_total ?? 0,
      customer: {
        name: session.customer_details?.name || null,
        email: session.customer_details?.email || null,
        phone: session.customer_details?.phone || null,
        address: session.customer_details?.address || null,
      },
      items,
    });
  } catch (err) {
    console.error('Stripe error:', err.message);
    return res.status(500).json({ error: 'Could not retrieve order.' });
  }
}
