import { NextResponse } from "next/server";
import { getConfiguredJillInboxAddress } from "../../../lib/services/agentmail";
import { getLlmStatus } from "../../../lib/services/llm";
import { store } from "../../../lib/store";

export async function GET() {
  const state = store.getState();
  return NextResponse.json({
    ...state,
    emailActionsCount: state.emailMessages.length,
    pendingApprovalsCount: state.rfqs.filter((rfq) => rfq.status === "Awaiting Approval").length,
    jillInboxAddress: getConfiguredJillInboxAddress(),
    llmStatus: getLlmStatus()
  });
}
