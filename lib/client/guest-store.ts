"use client";

import type { RecapApi } from "@/lib/client/process";
import type { Recap, Status } from "@/lib/types";

/* Guest mode: recaps live in this browser's localStorage, one key per recap. */

const PREFIX = "recap:guest:";
const EVENT = "recap-guest-change";

export function listGuestRecaps(): Recap[] {
  const out: Recap[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const r = JSON.parse(localStorage.getItem(key) ?? "null") as Recap | null;
      if (r?.id) out.push(r);
    }
  } catch {
    // storage blocked (private window, etc.): behave as empty
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function getGuestRecap(id: string): Recap | null {
  try {
    return JSON.parse(localStorage.getItem(PREFIX + id) ?? "null") as Recap | null;
  } catch {
    return null;
  }
}

export function saveGuestRecap(recap: Recap) {
  try {
    localStorage.setItem(PREFIX + recap.id, JSON.stringify(recap));
  } catch (e) {
    throw new Error(`Couldn't save the recap in this browser (${(e as Error).message}). Free some space or delete an old recap.`);
  }
  window.dispatchEvent(new Event(EVENT));
}

export function deleteGuestRecap(id: string) {
  try {
    localStorage.removeItem(PREFIX + id);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function onGuestChange(fn: () => void) {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}

async function post<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Asks the server for a new recap and keeps it in this browser. */
export async function createGuestRecap(fields: Record<string, unknown>): Promise<Recap> {
  const { recap } = await post<{ recap: Recap }>("/api/guest/recaps", json(fields));
  saveGuestRecap(recap);
  return recap;
}

function current(id: string): Recap {
  const r = getGuestRecap(id);
  if (!r) throw new Error("This recap is no longer saved in this browser.");
  return r;
}

/** Same steps as the signed-in API, with the recap sent along and the result stored locally. */
export function guestApi(id: string): RecapApi {
  return {
    async transcribe(payload) {
      const recap = current(id);
      if (payload instanceof FormData) {
        payload.append("recap", JSON.stringify({ ...recap, transcript: null }));
        return post("/api/guest/transcribe", { method: "POST", body: payload });
      }
      return post("/api/guest/transcribe", json({ ...payload, recap: { ...recap, transcript: null } }));
    },
    async saveTranscript(body) {
      const recap = current(id);
      try {
        const res = await post<{ recap: Recap }>("/api/guest/transcript", json({ ...body, recap }));
        saveGuestRecap(res.recap);
      } catch (e) {
        saveGuestRecap({ ...recap, status: "error", error: (e as Error).message });
        throw e;
      }
    },
    async step(): Promise<Status> {
      const recap = current(id);
      try {
        const res = await post<{ recap: Recap }>("/api/guest/step", json({ recap }));
        saveGuestRecap(res.recap);
        return res.recap.status;
      } catch (e) {
        // keep the status so the same stage can be retried
        saveGuestRecap({ ...recap, error: (e as Error).message });
        throw e;
      }
    },
  };
}
