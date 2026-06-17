import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import type { OperationalException } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { rfqId?: string; message?: string; type?: OperationalException["type"] };
    if (!body.message) throw new Error("Exception message is required");
    return NextResponse.json(await store.recordException(body.rfqId, body.message, body.type ?? "system"), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 400 });
  }
}
