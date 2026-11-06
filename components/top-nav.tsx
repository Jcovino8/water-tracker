"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Dashboard" },
  { href: "/manual-log", label: "Manual Log" },
  { href: "/achievements", label: "Achievements" },
  { href: "/profile", label: "Profile" },
];

export default function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="mt-6">
      <div className="inline-flex rounded-xl border border-white/10 bg-[#111720] p-1.5 shadow-lg shadow-black/20">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={[
                "rounded-lg px-4 py-2.5 text-sm font-semibold transition",
                isActive
                  ? "bg-cyan-300 text-[#071015]"
                  : "text-slate-400 hover:bg-white/5 hover:text-white",
              ].join(" ")}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}