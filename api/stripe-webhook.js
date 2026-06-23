import Stripe from 'stripe';
import { decrementStock } from './_stock.js';

// Stripe needs the raw request body to verify the webhook signature.
export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
  const signature = req.headers['stripe-signature'];

  let event;
  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature.' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    try {
      const items = JSON.parse(session.metadata?.items || '[]');
      await decrementStock(items, session.id);
    } catch (err) {
      console.error('Stock decrement error:', err.message);
    }
  }

  return res.status(200).json({ received: true });
}
