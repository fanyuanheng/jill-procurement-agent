import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { vendorId?: string };
    if (!body.vendorId) throw new Error("Missing vendorId");
    return NextResponse.json(await store.award(id, body.vendorId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 400 });
  }
}
