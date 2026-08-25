"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A thin progress bar across the top of the window during page navigation.
 *
 * Server-rendered pages have a real gap between the click and the new page arriving. Without a
 * signal in that gap the click reads as ignored, which is the single biggest reason a fast app can
 * still feel broken. The bar starts on any in-app link click and finishes when the route settles.
 *
 * It creeps toward 90% rather than tracking real progress — there is no meaningful percentage to
 * report — then snaps to 100% on arrival.
 */
export function NavProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Finish whenever the route actually changes.
  useEffect(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    setWidth(100);
    hideTimer.current = setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 220);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [pathname, searchParams]);

  // Start on any click that will navigate within the app.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || anchor.target === "_blank") return;
      if (anchor.hasAttribute("download")) return;

      // Only same-origin, and not the page we are already on.
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      start();
    }

    function start() {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setVisible(true);
      setWidth(8);
      if (timer.current) clearInterval(timer.current);
      timer.current = setInterval(() => {
        setWidth((w) => (w >= 90 ? w : w + Math.max(0.6, (90 - w) * 0.08)));
      }, 90);
    }

    document.addEventListener("click", onClick, { capture: true });
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 100,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${width}%`,
          background: "var(--prism-arc)",
          boxShadow: "0 0 10px rgba(108,75,246,.7)",
          transition: "width 200ms ease-out, opacity 200ms ease",
          opacity: width >= 100 ? 0 : 1,
        }}
      />
    </div>
  );
}
