/**
 * In-memory token blacklist for logout / revocation.
 * Uses a Map<jti, expiresAt> so expired tokens are auto-pruned.
 * Trade-off: cleared on server restart (acceptable — tokens expire in 1d anyway).
 */

const blacklist = new Map(); // jti → expiry timestamp (ms)

// Prune every 30 minutes — removes entries for already-expired tokens
setInterval(() => {
  const now = Date.now();
  for (const [jti, exp] of blacklist) {
    if (exp < now) blacklist.delete(jti);
  }
}, 30 * 60 * 1000).unref(); // .unref() so it doesn't keep process alive

module.exports = {
  add(jti, expiresAt) {
    blacklist.set(jti, expiresAt * 1000); // JWT exp is in seconds
  },
  has(jti) {
    if (!blacklist.has(jti)) return false;
    if (blacklist.get(jti) < Date.now()) {
      blacklist.delete(jti);
      return false;
    }
    return true;
  },
};
