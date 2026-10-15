import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

type Role = "admin" | "operator" | "viewer" | "demo";
const writes = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const counters = new Map<string, { count: number; reset: number }>();

function rateLimited(key: string, limit: number, windowMs = 60_000) {
  const now = Date.now();
  const current = counters.get(key);
  if (!current || current.reset <= now) {
    counters.set(key, { count: 1, reset: now + windowMs });
    return false;
  }
  current.count += 1;
  if (counters.size > 10_000) {
    for (const [name, entry] of counters) if (entry.reset <= now) counters.delete(name);
  }
  return current.count > limit;
}

function allowed(role: Role, path: string, method: string) {
  if (role === "admin") return true;
  if (path === "/api/inference/predict" && method === "POST") return true;
  if (role === "demo") return false;
  if (!writes.has(method)) return true;
  return role === "operator";
}

function fail(request: NextRequest, status: number, code: string) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ code, error: status === 401 ? "Authentication required" : "Access denied" }, { status });
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/auth/") || path === "/login" || path === "/neuralflow-logo.svg") return NextResponse.next();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return fail(request, 401, "unauthorized");
  const role = session.user.role as Role;
  if (!["admin", "operator", "viewer", "demo"].includes(role)) return fail(request, 403, "forbidden");
  if (!allowed(role, path, request.method)) {
    if (path.startsWith("/api/") && writes.has(request.method)) {
      await getPrisma().auditLog.create({ data: { actor: session.user.id, action: "security.denied",
        entityType: "api", entityId: path, details: { method: request.method, role } } });
    }
    return fail(request, 403, "forbidden");
  }
  if (writes.has(request.method)) {
    const origin = request.headers.get("origin");
    const expectedOrigin = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").origin;
    if (origin !== expectedOrigin) return fail(request, 403, "invalid_origin");
    if (path.startsWith("/api/") && rateLimited(`${session.user.id}:${path}`, path === "/api/inference/predict" ? 120 : 60)) {
      return NextResponse.json({ code: "rate_limited", error: "Too many requests" }, { status: 429 });
    }
  }
  if (path.startsWith("/api/") && writes.has(request.method) && path !== "/api/inference/predict") {
    await getPrisma().auditLog.create({ data: { actor: session.user.id, action: "security.control_request",
      entityType: "api", entityId: path, details: { method: request.method, role } } });
  }
  const headers = new Headers(request.headers);
  headers.delete("x-neuralflow-traffic-source");
  headers.set("x-neuralflow-trusted-role", role);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
