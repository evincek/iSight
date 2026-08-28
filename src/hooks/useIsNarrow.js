import { useState, useEffect } from "react";
import { BREAKPOINT } from "../theme";

/**
 * Subscribes to a media query and returns whether it currently matches.
 *
 * Lives here rather than in Shell so views can make their own layout
 * decisions — a card list instead of a table, fewer axis ticks — without
 * importing from the component that renders them.
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    // Re-read on subscribe: the query may have changed between the initial
    // render and this effect (React 18 StrictMode double-invokes, and the
    // `query` argument itself can change).
    setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** True below the shell's breakpoint — phones and narrow windows. */
export function useIsNarrow(width = BREAKPOINT) {
  return useMediaQuery(`(max-width: ${width - 1}px)`);
}

/** True on touch-primary devices, where hover states are a lie. */
export function useIsTouch() {
  return useMediaQuery("(pointer: coarse)");
}
