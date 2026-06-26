"use client";

import { usePathname } from "next/navigation";

// Routes that use the FULL width — wide, horizontally-scrolling content (the pipeline board)
// shouldn't be boxed in. Everything else fills the width on small/medium screens and only
// gains centered side gutters once the screen is wide (≥ 2xl / 1536px).
const FULL_BLEED = new Set(["/"]);

export default function PageFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const full = FULL_BLEED.has(pathname);
  return (
    <div className={`h-full overflow-hidden ${full ? "w-full" : "mx-auto w-full 2xl:max-w-7xl"}`}>
      {children}
    </div>
  );
}
