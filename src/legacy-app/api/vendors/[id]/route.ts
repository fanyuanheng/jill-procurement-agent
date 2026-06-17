import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { email?: string };
    if (!body.email) throw new Error("Supplier email is required");
    return NextResponse.json(await store.updateVendorEmail(id, body.email));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 400 });
  }
}
