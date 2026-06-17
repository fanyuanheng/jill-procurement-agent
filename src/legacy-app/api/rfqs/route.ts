import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import type { ProcurementRequest } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ProcurementRequest;
    validateProcurementRequest(body);
    return NextResponse.json(await store.createRfq(body), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

function validateProcurementRequest(body: ProcurementRequest) {
  const missing = ["title", "category", "neededBy", "budget", "shipTo", "requirements"].filter((key) => !body[key as keyof ProcurementRequest]);
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(", ")}`);
  }
  if (Number(body.budget) <= 0) {
    throw new Error("Budget must be greater than zero");
  }
}

function jsonError(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 400 });
}
