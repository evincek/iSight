import { useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * Set just before an eviction sign-out, read once by AuthView. Without it the
 * displaced device drops to the login screen with no explanation at all.
 */
export const EVICTED_KEY = "pl:evicted";

/**
 * Enforces one active session per account (migration 008).
 *
 * Supabase allows unlimited concurrent sessions and its single-session switch is
 * a Pro-plan feature, so the rule lives here: signing in anywhere claims the
 * user's row in `active_sessions`, and whichever device no longer owns that row
 * signs itself out. Newest login wins, so a user can always get in from wherever
 * they are — a stale claim from a browser closed without signing out can never
 * lock them out of their own ledger.
 *
 * Identity is the access token's own `session_id` claim: GoTrue mints one per
 * sign-in and keeps it stable across token refreshes, which is exactly the
 * lifetime we want. Nothing is generated or persisted client-side, so a reload
 * or a refreshed token never looks like a different device.
 *
 * This is cooperative. An evicted access token stays cryptographically valid
 * until it expires; enforcing the rule against a tampered-with client would mean
 * gating every RLS policy on the session id, which 008 deliberately does not do.
 */
export function useSessionGuard(session) {
  const userId = session?.user?.id;

  useEffect(() => {
    if (!supabase || !userId) return;

    let cancelled = false;
    let channel = null;
    let mySessionId = null;

    const evict = async () => {
      if (cancelled) return;
      cancelled = true;
      try {
        sessionStorage.setItem(EVICTED_KEY, "1");
      } catch {
        // Private mode can refuse storage. The sign-out still matters more than
        // the explanation, so carry on without it.
      }
      // `scope: "local"` is load-bearing. signOut defaults to "global", which
      // revokes every refresh token for the user — this device would take the
      // device that just displaced it down with it. Clear only what is local.
      await supabase.auth.signOut({ scope: "local" });
    };

    /** Evicted the moment the row names a session other than ours. */
    const checkRow = async () => {
      if (cancelled || !mySessionId) return;
      const { data, error } = await supabase
        .from("active_sessions")
        .select("session_id")
        .eq("user_id", userId)
        .maybeSingle();
      // A read failure is not evidence of eviction — a flaky network or a
      // database where 008 has not been run yet must not sign anyone out.
      if (error || !data) return;
      if (data.session_id !== mySessionId) await evict();
    };

    const onWake = () => {
      if (document.visibilityState === "visible") checkRow();
    };

    (async () => {
      const { data: claimsRes, error: claimsErr } = await supabase.auth.getClaims();
      const sessionId = claimsRes?.claims?.session_id;
      // No claim means no way to tell devices apart, and guessing would sign
      // someone out of a working session. Leave the account unguarded instead.
      if (claimsErr || !sessionId || cancelled) return;
      mySessionId = sessionId;

      // Claim the account for this device. The upsert *is* the eviction —
      // everyone else is watching this row.
      const { error } = await supabase
        .from("active_sessions")
        .upsert(
          { user_id: userId, session_id: sessionId, claimed_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
      if (error || cancelled) return;

      channel = supabase
        .channel(`active_session:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "active_sessions",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const claimed = payload.new?.session_id;
            if (claimed && claimed !== mySessionId) evict();
          }
        )
        .subscribe();

      // Realtime is the prompt path, not the only one: it does nothing at all if
      // 008's publication block was skipped, and a backgrounded tab can miss the
      // event outright. Re-checking whenever the tab comes back covers both.
      window.addEventListener("focus", checkRow);
      document.addEventListener("visibilitychange", onWake);

      // The window between claiming and subscribing is small but real — another
      // device could claim inside it, and that event would go unheard.
      checkRow();
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("focus", checkRow);
      document.removeEventListener("visibilitychange", onWake);
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId]);
}
