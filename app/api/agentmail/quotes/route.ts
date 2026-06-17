import { NextResponse } from "next/server";
import { agentMailService } from "../../../../lib/services/agentmail";

export async function GET(request: Request) {
  const rfqId = new URL(request.url).searchParams.get("rfqId");
  if (!rfqId) return NextResponse.json({ error: "rfqId is required" }, { status: 400 });

  try {
    const quotes = await agentMailService.getQuotes(rfqId);
    return NextResponse.json({ quotes });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Jill could not read supplier replies." }, { status: 502 });
  }
}
