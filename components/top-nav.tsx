"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Dashboard" },
  { href: "/social", label: "Social" },
  { href: "/profile", label: "Profile" },
];

export default function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-8 flex border-b border-white/10">
      {tabs.map((tab) => {
        const isActive =
          tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={
              isActive
                ? "border-b-2 border-cyan-400 px-1 pb-3 pr-6 text-sm font-semibold text-white"
                : "px-1 pb-3 pr-6 text-sm font-medium text-slate-500 transition hover:text-slate-300"
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}