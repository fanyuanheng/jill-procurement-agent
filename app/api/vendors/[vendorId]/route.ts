import { NextResponse } from "next/server";
import { store } from "../../../../lib/store";
import type { ComplianceStatus, VendorSource } from "../../../../lib/types";

type VendorPatch = {
  name?: string;
  source?: VendorSource;
  reliabilityPercent?: number;
  rating?: number;
  complianceStatus?: ComplianceStatus;
  pastSpend?: number;
  emailAddress?: string;
  notes?: string;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ vendorId: string }> }) {
  try {
    const { vendorId } = await params;
    const body = (await request.json()) as VendorPatch;

    if (typeof body.emailAddress === "string" && !isEmailLike(body.emailAddress)) {
      return NextResponse.json({ error: "Enter a valid supplier email before Jill sends an RFQ." }, { status: 400 });
    }

    const patch: VendorPatch = {};
    if (typeof body.name === "string") patch.name = body.name.trim();
    if (body.source === "Vendor Master" || body.source === "External") patch.source = body.source;
    if (typeof body.reliabilityPercent === "number") patch.reliabilityPercent = clamp(body.reliabilityPercent, 0, 100);
    if (typeof body.rating === "number") patch.rating = clamp(body.rating, 0, 5);
    if (body.complianceStatus === "Compliant" || body.complianceStatus === "Review" || body.complianceStatus === "Blocked") {
      patch.complianceStatus = body.complianceStatus;
    }
    if (typeof body.pastSpend === "number") patch.pastSpend = Math.max(0, body.pastSpend);
    if (typeof body.emailAddress === "string") patch.emailAddress = body.emailAddress.trim();
    if (typeof body.notes === "string") patch.notes = body.notes;

    const vendor = store.updateVendor(vendorId, patch);
    return NextResponse.json({ vendor });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Jill could not update that vendor." }, { status: 500 });
  }
}

function isEmailLike(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
