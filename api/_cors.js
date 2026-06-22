// Shared CORS handling for the api/ functions.
// Accepts both www and non-www variants of the configured site origin.

export function resolveOrigin(reqOrigin) {
  const base = (process.env.SITE_ORIGIN || '').replace(/\/$/, '');
  if (!base) return reqOrigin || '';
  const allowed = new Set([base]);
  if (base.startsWith('https://www.')) {
    allowed.add('https://' + base.slice('https://www.'.length));
  } else if (base.startsWith('https://')) {
    allowed.add('https://www.' + base.slice('https://'.length));
  }
  if (reqOrigin && allowed.has(reqOrigin)) return reqOrigin;
  return base;
}

export function applyCors(req, res, methods) {
  const reqOrigin = req.headers.origin || '';
  const allowOrigin = resolveOrigin(reqOrigin);
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return allowOrigin;
}
