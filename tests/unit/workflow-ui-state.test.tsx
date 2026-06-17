import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActiveRfqs, QuoteComparison, QuoteComparisonSummary, workflowDestinationForRfq, type AppState } from "../../components/JillWorkflowApp";
import type { Rfq, Vendor } from "../../lib/types";
import type { NormalizeQuotesResult } from "../../lib/services/jill-fallbacks";

const sentRfq: Rfq = {
  id: "rfq-sent",
  title: "Pump package",
  requester: "Jamie Buyer",
  department: "Operations",
  stage: "Send",
  status: "Sent",
  category: "Industrial Equipment",
  budget: 185000,
  currency: "USD",
  neededBy: "2026-07-15",
  shipTo: "Basin Field Station 4",
  lineItems: [],
  selectedVendorIds: ["vendor-1"],
  createdAt: "2026-06-17T00:00:00.000Z",
  updatedAt: "2026-06-17T00:00:00.000Z"
};

const baseState: AppState = {
  rfqs: [sentRfq],
  vendors: [],
  activityFeed: [],
  emailMessages: [],
  dashboardMetrics: { annualSavings: 0, cycleTimeReductionPercent: 0, hoursRecovered: 0 },
  emailActionsCount: 0,
  pendingApprovalsCount: 0,
  jillInboxAddress: "bsl-procurement@agentmail.to",
  llmStatus: { provider: "local", model: "qwen3.6:27b-64k", baseUrl: "http://100.121.222.58:8082/v1" }
};

const vendors: Vendor[] = [
  {
    id: "vendor-1",
    name: "Northstar Industrial Supply",
    source: "External",
    reliabilityPercent: 90,
    rating: 4.5,
    complianceStatus: "Compliant",
    pastSpend: 0,
    emailAddress: "quotes@northstar.example",
    categories: [],
    notes: ""
  },
  {
    id: "vendor-2",
    name: "Apex Pump Works",
    source: "External",
    reliabilityPercent: 86,
    rating: 4.2,
    complianceStatus: "Compliant",
    pastSpend: 0,
    emailAddress: "sales@apex.example",
    categories: [],
    notes: ""
  }
];

const comparison: NormalizeQuotesResult = {
  quotes: [
    {
      vendorName: "Northstar Industrial Supply",
      unitPriceUsd: 90000,
      quantity: 2,
      totalPriceUsd: 180000,
      leadTimeWeeks: 4,
      warranty: "18 months",
      certifications: ["API 610"],
      paymentTerms: "Net 30",
      complianceCheck: "Compliant",
      flags: []
    }
  ],
  recommendation: {
    vendorName: "Northstar Industrial Supply",
    rationale: "Only one quote has been normalized so far.",
    savingsVsAverage: 0
  }
};

describe("workflow UI state", () => {
  it("keeps sent RFQs in quote-waiting state instead of sending the buyer back to supplier selection", () => {
    render(<QuoteComparisonSummary state={baseState} activeRfq={sentRfq} onStart={vi.fn()} onRefresh={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Refresh AgentMail replies" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Go to supplier selection" })).not.toBeInTheDocument();
    expect(screen.getByText(/waiting for supplier replies/i)).toBeInTheDocument();
  });

  it("keeps AgentMail inbox watch visible when only one of multiple selected vendors has replied", () => {
    render(
      <QuoteComparison
        activeRfq={sentRfq}
        comparison={comparison}
        expectedVendors={vendors}
        inboxMessages={[]}
        quoteReplies={[{ vendor: "Northstar Industrial Supply", rawEmailBody: "Unit price USD 90,000 each" }]}
        onApprove={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    expect(screen.getByText(/Jill has 1 of 2 vendor replies/i)).toBeInTheDocument();
    expect(screen.getByText(/Apex Pump Works/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh AgentMail replies" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Waiting for remaining bids" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Send to approval" })).not.toBeInTheDocument();
  });

  it("counts RFQ-specific inbox replies even when AgentMail returns a display-form sender", () => {
    const stateWithInbox: AppState = {
      ...baseState,
      emailMessages: [
        {
          id: "email-active",
          rfqId: sentRfq.id,
          direction: "Inbound",
          from: "Northstar Quotes <quotes@northstar.example>",
          to: "bsl-procurement@agentmail.to",
          subject: `Re: RFQ ${sentRfq.id}`,
          body: "Quote total USD 180,000.",
          timestamp: "2026-06-17T01:00:00.000Z",
          provider: "agentmail",
          status: "received"
        },
        {
          id: "email-other",
          rfqId: "rfq-other",
          direction: "Inbound",
          from: "Apex Pump Works <sales@apex.example>",
          to: "bsl-procurement@agentmail.to",
          subject: "Re: RFQ rfq-other",
          body: "Wrong RFQ.",
          timestamp: "2026-06-17T01:05:00.000Z",
          provider: "agentmail",
          status: "received"
        }
      ]
    };

    render(
      <QuoteComparison
        activeRfq={sentRfq}
        comparison={comparison}
        expectedVendors={[...vendors, {
          id: "vendor-3",
          name: "Beacon Rotating Equipment",
          source: "External",
          reliabilityPercent: 88,
          rating: 4.1,
          complianceStatus: "Review",
          pastSpend: 0,
          emailAddress: "rfq@beacon.example",
          categories: [],
          notes: ""
        }]}
        inboxMessages={stateWithInbox.emailMessages}
        quoteReplies={[{ vendor: "Northstar Quotes <quotes@northstar.example>", rawEmailBody: "Quote total USD 180,000." }]}
        onApprove={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    expect(screen.getByText(/Jill has 1 of 3 vendor replies/i)).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "AgentMail inbox for RFQ" })).toBeInTheDocument();
    expect(screen.getByText("Northstar Quotes <quotes@northstar.example>")).toBeInTheDocument();
    expect(screen.queryByText("Wrong RFQ.")).not.toBeInTheDocument();
  });

  it("opens the clicked sent RFQ at quote comparison instead of draft", () => {
    const onOpenRfq = vi.fn();

    render(<ActiveRfqs state={baseState} onOpenRfq={onOpenRfq} onDeleteRfq={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: sentRfq.title }));

    expect(onOpenRfq).toHaveBeenCalledWith(sentRfq);
    expect(workflowDestinationForRfq(sentRfq)).toEqual({ activeNav: "Quote Comparisons", screen: 4 });
  });
});
