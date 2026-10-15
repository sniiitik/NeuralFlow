"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Box,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Menu,
  Rocket,
  Settings,
  History,
  X,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { authClient } from "@/lib/auth-client";
import { useAccess } from "@/hooks/use-access";
import { PixelField } from "@/components/ui/pixel-field";
const items = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/models", label: "Model Registry", icon: Box },
  { href: "/deployments", label: "Deployments", icon: Rocket },
  { href: "/inference", label: "Inference Playground", icon: FlaskConical },
  { href: "/monitoring", label: "Monitoring", icon: Activity },
  { href: "/audit", label: "Audit History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];
export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement;
    navigation.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "Tab") {
        const nodes = Array.from(
          navigation.current?.querySelectorAll<HTMLElement>("a,button") ?? [],
        );
        const first = nodes[0],
          last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [open]);
  const pathname = usePathname(),
    router = useRouter();
  const { user, role } = useAccess();
  if (pathname === "/login") return <main>{children}</main>;
  return (
    <div className="app-shell relative min-h-screen isolate">
      <PixelField />
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      {open && (
        <button
          className="fixed inset-0 z-30 bg-black/70 lg:hidden"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        ref={navigation}
        aria-label="Workspace navigation"
        className={`${open ? "flex" : "hidden"} fixed inset-y-0 left-0 z-40 w-60 flex-col border-r border-[var(--border)] bg-[var(--sidebar)] lg:flex`}
      >
        <Link
          href="/"
          className="flex h-16 items-center gap-3 px-5 text-base font-semibold"
        >
          <Image src="/neuralflow-logo.svg" alt="" width={26} height={26} className="h-[26px] w-[26px] rounded" />
          NeuralFlow
        </Link>
        <button
          className="absolute right-3 top-5 lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close navigation"
        >
          <X size={18} />
        </button>
        <div className="mx-3 mb-6 rounded-md border border-[var(--border)] px-3 py-2">
          <span className="text-xs muted">Workspace</span>
          <div className="text-sm">
            NeuralFlow <span className="float-right badge">Local</span>
          </div>
        </div>
        <nav aria-label="Main navigation" className="space-y-1 px-3">
          {items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              aria-current={pathname === href ? "page" : undefined}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-[13px] ${pathname === href ? "bg-[var(--elevated)] text-[var(--foreground)]" : "text-[var(--secondary)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"}`}
            >
              <Icon size={17} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-[var(--border)] p-4">
          <Link href="/settings" className="block truncate text-sm">
            {user?.name ?? "Account"}
          </Link>
          <div className="mt-1 flex items-center justify-between">
            <span className="badge capitalize">{role}</span>
            <button
              aria-label="Sign out"
              title="Sign out"
              onClick={async () => {
                await authClient.signOut();
                router.push("/login");
                router.refresh();
              }}
              className="btn"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>
      <div inert={open} className="relative z-10 lg:pl-60">
        <header className="flex h-14 items-center gap-3 border-b border-[var(--border)] px-5 sm:px-8">
          <button
            className="rounded-md border border-[var(--border)] p-2 lg:hidden"
            aria-label="Open navigation"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <Menu size={18} />
          </button>
          <span className="text-xs muted">Workspace</span>
          <span className="muted">/</span>
          <span className="text-xs">
            {items.find((i) => i.href === pathname)?.label ?? "NeuralFlow"}
          </span>
          <span className="ml-auto badge">Local environment</span>
        </header>
        <main
          id="content"
          className="mx-auto max-w-[1600px] px-5 py-7 sm:px-8 sm:py-9"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
