import { fail } from "@/lib/api";
import { GUEST_MODE } from "@/lib/guest";
import type { Recap } from "@/lib/types";

/** 404 unless guest mode is on, so these routes don't exist in normal operation. */
export const guestDisabled = () => (GUEST_MODE ? null : fail(404, "Not found."));

/** The recap the browser sent along: only a light shape check, it's the visitor's own data. */
export function asGuestRecap(v: unknown): Recap | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Recap;
  if (typeof r.id !== "string" || !/^[0-9a-f-]{36}$/i.test(r.id)) return null;
  if (typeof r.status !== "string" || !Array.isArray(r.trace)) return null;
  if (r.source_type !== "upload" && r.source_type !== "youtube") return null;
  return { ...r, user_id: "guest", is_public: false };
}

/* Best-effort brake on the shared AI keys (per server instance, resets daily). */
const created = new Map<string, number>();
let day = "";
export function overGuestLimit(req: Request, limit: number): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    created.clear();
    day = today;
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const n = (created.get(ip) ?? 0) + 1;
  created.set(ip, n);
  return n > limit;
}
