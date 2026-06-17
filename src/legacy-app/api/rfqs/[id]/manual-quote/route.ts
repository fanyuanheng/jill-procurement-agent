import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import type { QuoteInput } from "@/lib/types";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as QuoteInput;
    if (!body.vendorId || !body.rawText) throw new Error("Manual quote requires vendorId and rawText");
    return NextResponse.json(await store.addManualQuote(id, body));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 400 });
  }
}
