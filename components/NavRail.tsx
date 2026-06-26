"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Briefcase, History, Bot, GraduationCap } from "lucide-react";

// Each item's optional `badge` carries its color; the live count is looked up by href
// from the `counts` map below, so adding a new badge is a one-line data change.
const ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/prep", label: "Prep", icon: GraduationCap },
  { href: "/cowork", label: "CoWork", icon: Bot },
  { href: "/changes", label: "Changes", icon: History, badge: "bg-amber-500 text-amber-950" },
];

export default function NavRail() {
  const pathname = usePathname();
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    // refresh counts when navigating (e.g. after resolving a flag). The badge = everything awaiting
    // your action: posting reviews + pending matches (fuzzy/ambiguous + unbound fit/tailor results).
    fetch("/api/events")
      .then((r) => r.json())
      .catch(() => ({}))
      .then((events) =>
        setCounts({ "/changes": (events.needsReview?.length ?? 0) + (events.pendingMatches?.length ?? 0) }));
  }, [pathname]);

  return (
    <nav className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-zinc-800/80 bg-zinc-950 py-4">
      <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-sky-500 text-zinc-950 shadow-lg shadow-emerald-500/20">
        <Briefcase size={18} strokeWidth={2.5} />
      </div>
      {ITEMS.map(({ href, label, icon: Icon, badge }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        const count = counts[href] ?? 0;
        return (
          <Link
            key={href}
            href={href}
            title={label}
            className={`group relative flex h-11 w-11 flex-col items-center justify-center rounded-xl transition ${
              active
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
            }`}
          >
            {active && (
              <span className="absolute -left-[14px] h-5 w-[3px] rounded-full bg-emerald-400" />
            )}
            {badge && count > 0 && (
              <span className={`absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[11px] font-bold ${badge}`}>
                {count}
              </span>
            )}
            <Icon size={19} />
            <span className="mt-0.5 text-[11px] font-medium">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
