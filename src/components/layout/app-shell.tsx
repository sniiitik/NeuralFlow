"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Box,
  MoreHorizontal,
  Grid2X2,
  Menu,
  Rocket,
  Settings,
  UsersRound,
  Workflow,
  X,
} from "lucide-react";
import { useState } from "react";
import { clsx } from "clsx";

const navItems = [
  { href: "/", label: "Overview", icon: Grid2X2 },
  { href: "/models", label: "Models", icon: Box },
  { href: "/deployments", label: "Deployments", icon: Rocket },
  { href: "/monitoring", label: "Monitoring", icon: BarChart3 },
];

const settingsItems = [
  { href: "/team", label: "Team", icon: UsersRound },
  { href: "/settings", label: "Settings", icon: Settings },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      <div className="flex h-[136px] items-center gap-4 border-b border-white/10 px-10">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#6457f6] shadow-lg shadow-[#6457f6]/20">
          <Workflow className="h-7 w-7 text-white" strokeWidth={2.6} />
        </div>
        <span className="text-[28px] font-bold tracking-[-0.04em] text-[#f5f3ed]">NeuralFlow</span>
      </div>

      <nav className="space-y-1 py-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={clsx(
                "group relative flex h-[62px] items-center gap-5 px-10 text-[27px] font-semibold tracking-[-0.04em] transition",
                active ? "bg-white/[0.045] text-[#f5f3ed]" : "text-[#c4c1b8] hover:bg-white/[0.035] hover:text-[#f5f3ed]"
              )}
            >
              {active ? <span className="absolute left-0 top-0 h-full w-1 rounded-r-full bg-[#6457f6]" /> : null}
              <Icon className="h-7 w-7 shrink-0" strokeWidth={2.2} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-7 px-10 text-sm font-bold uppercase tracking-[0.22em] text-[#8b887f]">Settings</div>
      <nav className="mt-4 space-y-1">
        {settingsItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={clsx(
                "group relative flex h-[62px] items-center gap-5 px-10 text-[27px] font-semibold tracking-[-0.04em] transition",
                active ? "bg-white/[0.045] text-[#f5f3ed]" : "text-[#c4c1b8] hover:bg-white/[0.035] hover:text-[#f5f3ed]"
              )}
            >
              {active ? <span className="absolute left-0 top-0 h-full w-1 rounded-r-full bg-[#6457f6]" /> : null}
              <Icon className="h-7 w-7 shrink-0" strokeWidth={2.2} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <div className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-white/10 bg-[#282826]/80 px-5 backdrop-blur xl:hidden">
      <button
        type="button"
        onClick={onOpenMenu}
        className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-[#f5f3ed]"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#6457f6]">
          <Workflow className="h-5 w-5 text-white" />
        </div>
        <span className="text-xl font-bold tracking-[-0.04em]">NeuralFlow</span>
      </div>
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
        <Activity className="h-5 w-5 text-[#82c853]" />
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#282826] text-[#f5f3ed]">
      <TopBar onOpenMenu={() => setMobileOpen(true)} />

      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-[390px] border-r border-white/10 bg-[#242520]/95 xl:block">
        <SidebarContent />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 xl:hidden">
          <button
            type="button"
            aria-label="Close navigation backdrop"
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-[330px] max-w-[84vw] border-r border-white/10 bg-[#242520] shadow-2xl">
            <button
              type="button"
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-[#d7d3c7]"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <main className="xl:pl-[390px]">
        <div className="mx-auto min-h-screen w-full max-w-[1200px] px-5 py-8 sm:px-8 xl:px-10 xl:py-12">
          <div className="mb-9 hidden items-center justify-end gap-4 xl:flex">
            <div className="flex items-center gap-3 rounded-full bg-[#345f1d] px-5 py-2 text-lg font-bold text-[#91dc60]">
              <span className="h-3 w-3 rounded-full bg-[#88cf4f]" />
              Live
            </div>
            <button className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1f201d] text-[#d6d2c8] transition hover:bg-[#2f302b]" aria-label="More options">
              <MoreHorizontal className="h-7 w-7" />
            </button>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
