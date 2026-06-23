import { kv } from '@vercel/kv';

// Only these products carry size-level stock; others (e.g. training_suit) are untracked/unlimited.
export const TRACKED_PRODUCTS = ['aquashorts', 'briefs'];

function stockKey(product) {
  return `stock:${product}`;
}

export async function getStock(product) {
  if (!TRACKED_PRODUCTS.includes(product)) return null;
  return (await kv.hgetall(stockKey(product))) || {};
}

export async function getAllStock() {
  const result = {};
  for (const product of TRACKED_PRODUCTS) {
    result[product] = await getStock(product);
  }
  return result;
}

// Checks each cart item against current stock. Does not reserve/decrement —
// decrementing happens only once payment is confirmed (see decrementStock).
export async function checkAvailability(items) {
  for (const item of items) {
    if (!TRACKED_PRODUCTS.includes(item.product)) continue;
    if (!item.size) {
      return { ok: false, reason: 'size_required', product: item.product };
    }
    const stock = await getStock(item.product);
    const available = Number(stock[item.size] ?? 0);
    if (item.qty > available) {
      return { ok: false, reason: 'insufficient_stock', product: item.product, size: item.size, available };
    }
  }
  return { ok: true };
}

// Decrements stock for a paid order. Idempotent per Stripe session id so
// webhook retries don't double-deduct.
export async function decrementStock(items, sessionId) {
  const markerKey = `stock:processed:${sessionId}`;
  const alreadyProcessed = await kv.get(markerKey);
  if (alreadyProcessed) return;

  for (const item of items) {
    if (!TRACKED_PRODUCTS.includes(item.product) || !item.size) continue;
    await kv.hincrby(stockKey(item.product), item.size, -item.qty);
  }

  await kv.set(markerKey, '1', { ex: 60 * 60 * 24 * 30 });
}
