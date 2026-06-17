import { NextResponse } from "next/server";
import { mockQuoteInputs } from "@/lib/seed";
import { store } from "@/lib/store";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(await store.addQuotes(id, mockQuoteInputs));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 400 });
  }
}
