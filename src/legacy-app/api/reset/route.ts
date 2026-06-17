import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function POST() {
  return NextResponse.json(await store.reset());
}
