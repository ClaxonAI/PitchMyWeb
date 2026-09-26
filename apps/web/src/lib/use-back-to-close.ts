"use client";

import { useCallback, useEffect, useRef } from "react";

// Lets the phone's Back button (and the browser's) close an open overlay —
// menu, sheet, dialog — instead of leaving the page underneath it, which is
// what people expect on a phone.
//
// Opening pushes one history entry (same URL); Back pops it and we close.
// Returns `dismiss`, for the overlay's own close controls (X, tap outside,
// Escape): it goes back through that entry so the history stays clean, and the
// popstate then closes the overlay. Closing because a link navigated away must
// NOT use dismiss — stepping back while the router is mid-navigation would
// cancel it — so those paths just close; the leftover entry is harmless (Back
// from the new page returns to this one, as it would anyway).
export function useBackToClose(open: boolean, close: () => void): () => void {
  const pushed = useRef(false);
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
    window.history.pushState({ ...(window.history.state ?? {}), pmwOverlay: true }, "");
    pushed.current = true;
    const onPop = () => {
      pushed.current = false;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      pushed.current = false;
    };
  }, [open]);

  return useCallback(() => {
    if (pushed.current && window.history.state?.pmwOverlay) {
      window.history.back();
      return;
    }
    closeRef.current();
  }, []);
}
