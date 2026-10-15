"use client";
import { authClient } from "@/lib/auth-client";
export function useAccess() {
  const { data, isPending } = authClient.useSession();
  const role = (data?.user as { role?: string } | undefined)?.role ?? "viewer";
  return {
    user: data?.user,
    role,
    loading: isPending,
    canWrite: role === "admin" || role === "operator",
  };
}
