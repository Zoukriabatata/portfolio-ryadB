"use client";

import { useEffect, useState } from "react";

/**
 * 1-second wall-clock tick + greeting that flips at noon and 6pm.
 * Mounted once at the top of the dashboard so the header pill can
 * render a live time without forcing every widget to share state.
 */
export function useClock() {
  const [time, setTime] = useState("");
  const [greeting, setGreeting] = useState("");

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const h = now.getHours();
      setGreeting(
        h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening",
      );
      setTime(
        now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return { time, greeting };
}
