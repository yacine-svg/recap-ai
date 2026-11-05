"use client";

import Link from "next/link";
import RecapView from "@/components/RecapView";
import ResumeRecap from "@/components/ResumeRecap";
import { useGuestRecap } from "@/components/guest/useGuestRecaps";

/** A recap page for guests, read from browser storage. */
export default function GuestRecap({ id }: { id: string }) {
  const recap = useGuestRecap(id);
  if (recap === undefined) return null;
  if (recap === null)
    return (
      <div className="panel stack" style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)" }}>Recap not found</h1>
        <p className="muted">Guest recaps are saved in the browser that made them. This one isn't in this browser.</p>
        <Link className="btn primary" href="/app/new">
          Create a recap
        </Link>
      </div>
    );
  if (recap.status !== "done")
    return (
      <div className="stack" style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)" }}>{recap.title}</h1>
        <ResumeRecap recap={recap} guest />
      </div>
    );
  return <RecapView recap={recap} editable guest />;
}
