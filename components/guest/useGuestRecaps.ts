"use client";

import { useEffect, useState } from "react";
import { getGuestRecap, listGuestRecaps, onGuestChange } from "@/lib/client/guest-store";
import type { Recap } from "@/lib/types";

/** Browser-stored recaps; `null` until mounted (storage doesn't exist on the server). */
export function useGuestRecaps(): Recap[] | null {
  const [recaps, setRecaps] = useState<Recap[] | null>(null);
  useEffect(() => {
    const read = () => setRecaps(listGuestRecaps());
    read();
    return onGuestChange(read);
  }, []);
  return recaps;
}

/** One stored recap: `undefined` while loading, `null` when it isn't in this browser. */
export function useGuestRecap(id: string): Recap | null | undefined {
  const [recap, setRecap] = useState<Recap | null | undefined>(undefined);
  useEffect(() => {
    const read = () => setRecap(getGuestRecap(id));
    read();
    return onGuestChange(read);
  }, [id]);
  return recap;
}
