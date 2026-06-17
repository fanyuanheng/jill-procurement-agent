import { NextResponse } from "next/server";
import { store } from "../../../../lib/store";

type RouteContext = {
  params: Promise<{ rfqId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { rfqId } = await context.params;
    const rfq = store.getRfq(rfqId);

    if (!rfq) return NextResponse.json({ error: `RFQ not found: ${rfqId}` }, { status: 404 });

    const deleted = store.deleteRfq(rfq.id);
    return NextResponse.json({ deleted });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Jill could not delete that draft RFQ." }, { status: 500 });
  }
}
