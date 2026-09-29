import { redirect } from "next/navigation";

/**
 * Bare /admin has no content of its own — RBAC/auth is already enforced by
 * admin/layout.tsx (which wraps this route), so this is an unconditional
 * redirect to the real dashboard, not a second entry point.
 */
export default function AdminIndexPage() {
  redirect("/admin/dashboard");
}
