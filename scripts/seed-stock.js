// One-off script to set initial stock levels in Vercel KV.
// Run locally with `vercel env pull` done first (so KV_REST_API_* env vars are set), then:
//   node scripts/seed-stock.js
import { kv } from '@vercel/kv';

const INITIAL_STOCK = {
  XXS: 8,
  XS: 7,
  S: 7,
  M: 3,
  L: 5,
};

const PRODUCTS = ['aquashorts', 'briefs'];

for (const product of PRODUCTS) {
  await kv.hset(`stock:${product}`, INITIAL_STOCK);
  console.log(`Seeded stock:${product} ->`, INITIAL_STOCK);
}
