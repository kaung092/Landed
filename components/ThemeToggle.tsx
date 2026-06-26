"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

// Flip between the dark cockpit and the light theme (the .light class on <html>; the zinc ramp
// is mirrored in globals.css). Persisted to localStorage; applied pre-paint by the inline script
// in app/layout.tsx so there's no flash.
export default function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.classList.contains("light"));
  }, []);

  const toggle = () => {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle("light", next);
    try {
      localStorage.setItem("theme", next ? "light" : "dark");
    } catch {
      /* ignore */
    }
  };

  return (
    <button
      onClick={toggle}
      title={light ? "Switch to dark" : "Switch to light"}
      aria-label="Toggle theme"
      className="fixed right-3 top-3 z-50 flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900/80 text-zinc-400 ring-1 ring-inset ring-zinc-800 backdrop-blur transition hover:text-zinc-100 hover:ring-zinc-700"
    >
      {light ? <Moon size={14} /> : <Sun size={14} />}
    </button>
  );
}
