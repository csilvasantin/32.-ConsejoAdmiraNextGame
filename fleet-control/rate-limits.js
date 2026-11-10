'use strict';

function isInteractiveEndpoint(pathname, method) {
  return (pathname === '/api/live/frame' && method === 'GET') ||
    (pathname === '/api/input' && method === 'POST');
}

// Retain at most limit+1 recent timestamps per key: those are sufficient to
// reproduce the sliding-window decision, including rejected requests. Refuse
// new keys when full instead of evicting live buckets and resetting budgets.
function createWindowLimiter({ limit, windowMs, maxKeys, now = Date.now }) {
  const buckets = new Map();
  function limited(key) {
    if (typeof key !== 'string' || !key) return true;
    const at = now();
    let hits = buckets.get(key);
    if (!hits) {
      if (buckets.size >= maxKeys) {
        for (const [id, entries] of buckets) if (!entries.length || at - entries[entries.length - 1] >= windowMs) buckets.delete(id);
        if (buckets.size >= maxKeys) return true;
      }
      hits = [];
    }
    hits = hits.filter((time) => at - time < windowMs);
    hits.push(at);
    if (hits.length > limit + 1) hits.splice(0, hits.length - limit - 1);
    buckets.set(key, hits);
    return hits.length > limit;
  }
  return { limited };
}

function createFleetRateLimits({ windowMs = 60000, publicLimit = 300,
  interactiveLimit = 3600, publicKeys = 4096, interactiveKeys = 1024, now = Date.now } = {}) {
  const publicBucket = createWindowLimiter({ limit: publicLimit, windowMs, maxKeys: publicKeys, now });
  const interactiveBucket = createWindowLimiter({ limit: interactiveLimit, windowMs, maxKeys: interactiveKeys, now });
  return { publicLimited: publicBucket.limited, interactiveLimited: interactiveBucket.limited };
}

module.exports = { isInteractiveEndpoint, createWindowLimiter, createFleetRateLimits };
