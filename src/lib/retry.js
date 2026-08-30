/**
 * PostgREST rejects an access token whose `iat` claim sits ahead of its own
 * clock, with code PGRST301 and the message "JWT issued at future".
 *
 * It is transient by construction: a few seconds of skew between the Auth
 * server that stamps `iat` and the data API that checks it, and it clears the
 * moment wall-clock time passes `iat`. Only a token minted seconds ago can trip
 * it, which is why it shows up on the first load after a fresh sign-in and
 * never mid-session — and why waiting is the whole fix.
 */
export const isClockSkewError = (err) =>
  err?.code === "PGRST301" || /issued at future/i.test(err?.message || "");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs `fn`, retrying only on the skew error above. Anything else throws on the
 * first attempt — a retry loop must not paper over a real failure.
 *
 * Backs off linearly (1.5s, then 3s) and rethrows after the last attempt, so a
 * skew wider than the budget still surfaces to the caller's error handling.
 */
export async function retryOnClockSkew(fn, { attempts = 3, delayMs = 1500 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts || !isClockSkewError(err)) throw err;
      await sleep(delayMs * attempt);
    }
  }
}
