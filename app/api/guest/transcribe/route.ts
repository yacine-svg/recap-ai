import { NextResponse } from "next/server";
import { fail, userMessage } from "@/lib/api";
import { asGuestRecap, guestDisabled } from "@/lib/guest-server";
import { HttpError, transcribeUploadChunk, transcribeYoutubePiece } from "@/lib/recap-core";

export const maxDuration = 120;

/** Guest mode: transcribes one piece. Uploads send the recap as a "recap" form field, YouTube in the JSON body. */
export async function POST(req: Request) {
  const off = guestDisabled();
  if (off) return off;
  try {
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await req.formData();
      const recap = asGuestRecap(JSON.parse(String(form.get("recap") ?? "null")));
      if (!recap) return fail(400, "Missing recap.");
      return NextResponse.json(await transcribeUploadChunk(recap, form));
    }
    const body = (await req.json()) as { recap?: unknown; start?: number; end?: number; captions?: boolean };
    const recap = asGuestRecap(body.recap);
    if (!recap) return fail(400, "Missing recap.");
    return NextResponse.json(await transcribeYoutubePiece(recap, body));
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message);
    return fail(502, userMessage(e));
  }
}
