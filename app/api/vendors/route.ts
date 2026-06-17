import { NextResponse } from "next/server";
import { store } from "../../../lib/store";
import type { ComplianceStatus, VendorSource } from "../../../lib/types";

type VendorCreateBody = {
  name?: string;
  emailAddress?: string;
  source?: VendorSource;
  reliabilityPercent?: number;
  rating?: number;
  complianceStatus?: ComplianceStatus;
  pastSpend?: number;
  notes?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VendorCreateBody;
    const name = body.name?.trim();
    const emailAddress = body.emailAddress?.trim();

    if (!name) return NextResponse.json({ error: "Vendor name is required." }, { status: 400 });
    if (!emailAddress || !isEmailLike(emailAddress)) {
      return NextResponse.json({ error: "Enter a valid supplier email before adding the vendor." }, { status: 400 });
    }

    const vendor = store.createVendor({
      name,
      emailAddress,
      source: body.source ?? "External",
      reliabilityPercent: clamp(body.reliabilityPercent ?? 80, 0, 100),
      rating: clamp(body.rating ?? 4, 0, 5),
      complianceStatus: body.complianceStatus ?? "Review",
      pastSpend: Math.max(0, body.pastSpend ?? 0),
      notes: body.notes ?? "",
      categories: []
    });

    return NextResponse.json({ vendor }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Jill could not add that vendor." }, { status: 500 });
  }
}

function isEmailLike(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
