"use client";

import { useEffect, useRef } from "react";

/**
 * Calls `callback` every `ms` while `enabled`, but only while the tab is
 * visible. A hidden tab stops polling entirely (a campaign page left open in
 * a background tab used to keep three pollers hitting the server all day);
 * coming back runs the callback at once, so the view is fresh the moment
 * it is seen, then resumes the interval.
 *
 * `immediate` also runs it as soon as polling starts.
 */
export function useVisibleInterval(
  callback: () => void,
  ms: number,
  enabled: boolean,
  options: { immediate?: boolean } = {},
): void {
  const saved = useRef(callback);
  saved.current = callback;
  const immediate = options.immediate ?? false;

  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    const start = () => {
      if (timer === undefined)
        timer = window.setInterval(() => saved.current(), ms);
    };
    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        saved.current();
        start();
      } else {
        stop();
      }
    };
    if (immediate) saved.current();
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, ms, immediate]);
}
