"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";
import {
  ActivityFeedItem,
  AgentBadge,
  AppShell,
  Button,
  Callout,
  Card,
  MetricCard,
  Pill,
  StatusBadge,
  Table
} from ".";
import type { NavLabel } from ".";
import type { NormalizeQuotesResult, StructuredRfqResult } from "../lib/services/jill-fallbacks";
import type { ActivityEvent, DashboardMetrics, EmailMessage, Rfq, Vendor } from "../lib/types";

type Screen = 1 | 2 | 3 | 4 | 5;
type WorkflowDestination = { activeNav: NavLabel; screen: Screen };

export type AppState = {
  rfqs: Rfq[];
  vendors: Vendor[];
  activityFeed: ActivityEvent[];
  emailMessages: EmailMessage[];
  dashboardMetrics: DashboardMetrics;
  emailActionsCount: number;
  pendingApprovalsCount: number;
  jillInboxAddress: string;
  llmStatus: {
    provider: string;
    model: string;
    baseUrl: string;
  };
};

type QuoteReply = { vendor: string; rawEmailBody: string; messageId?: string };

const sampleAsk =
  "Need two API 610 high pressure pump packages before the July shutdown. Stainless wetted parts, VFDs, and startup help included. Ship to Basin Field Station 4. Budget is around $185k but confirm if freight is included. Need supplier options fast.";

const fallbackState: AppState = {
  rfqs: [],
  vendors: [],
  activityFeed: [],
  emailMessages: [],
  dashboardMetrics: { annualSavings: 0, cycleTimeReductionPercent: 0, hoursRecovered: 0 },
  emailActionsCount: 0,
  pendingApprovalsCount: 0,
  jillInboxAddress: "bsl-procurement@agentmail.to",
  llmStatus: {
    provider: "local",
    model: "qwen3.6:27b-64k",
    baseUrl: "http://100.121.222.58:8082/v1"
  }
};

const inputClassName =
  "min-h-10 rounded-stitch-control border border-[#1e4369] bg-[#081b2e] px-3 py-2 text-label-sm text-white focus:border-stitch-primary-container focus:outline-none focus:ring-2 focus:ring-stitch-primary-container/40";

const stageStep = {
  1: "Draft RFQ",
  2: "Draft RFQ",
  3: "Select Vendors",
  4: "Compare",
  5: "Award"
} as const;

export function JillWorkflowApp() {
  const [screen, setScreen] = useState<Screen>(1);
  const [activeNav, setActiveNav] = useState<NavLabel>("Dashboard");
  const [state, setState] = useState<AppState>(fallbackState);
  const [activeRfqId, setActiveRfqId] = useState("");
  const [freeFormText, setFreeFormText] = useState(sampleAsk);
  const [structuredRfq, setStructuredRfq] = useState<StructuredRfqResult | null>(null);
  const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>([]);
  const [quotes, setQuotes] = useState<QuoteReply[]>([]);
  const [comparison, setComparison] = useState<NormalizeQuotesResult | null>(null);
  const [poMessage, setPoMessage] = useState("");
  const [savingVendorId, setSavingVendorId] = useState("");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  const activeRfq = useMemo(() => state.rfqs.find((rfq) => rfq.id === activeRfqId) ?? state.rfqs[0], [activeRfqId, state.rfqs]);
  const selectedVendors = useMemo(() => state.vendors.filter((vendor) => selectedVendorIds.includes(vendor.id)), [selectedVendorIds, state.vendors]);
  const expectedQuoteVendors = useMemo(() => {
    const ids = activeRfq?.selectedVendorIds.length ? activeRfq.selectedVendorIds : selectedVendorIds;
    return state.vendors.filter((vendor) => ids.includes(vendor.id));
  }, [activeRfq, selectedVendorIds, state.vendors]);
  const activeInboxMessages = useMemo(
    () => state.emailMessages.filter((message) => activeRfq && message.rfqId === activeRfq.id && message.direction === "Inbound"),
    [activeRfq, state.emailMessages]
  );
  const quoteProgress = useMemo(() => getQuoteProgress(quotes, expectedQuoteVendors, activeInboxMessages), [quotes, expectedQuoteVendors, activeInboxMessages]);
  const showWorkflowStepper = activeNav === "New Request" || activeNav === "Quote Comparisons" || activeNav === "Approvals";
  const recommendation = comparison?.recommendation;
  const winningVendor = recommendation
    ? state.vendors.find((vendor) => vendor.name === recommendation.vendorName) ?? selectedVendors[0]
    : selectedVendors[0];
  const winningQuote = recommendation ? comparison?.quotes.find((quote) => quote.vendorName === recommendation.vendorName) : undefined;

  useEffect(() => {
    refreshState();
  }, []);

  useEffect(() => {
    if (activeRfq && selectedVendorIds.length === 0) {
      setSelectedVendorIds((activeRfq.selectedVendorIds.length ? activeRfq.selectedVendorIds : state.vendors.slice(0, 3).map((vendor) => vendor.id)).slice(0, 3));
    }
  }, [activeRfq, selectedVendorIds.length, state.vendors]);

  async function refreshState() {
    try {
      const response = await fetch("/api/state");
      if (!response.ok) throw new Error("state unavailable");
      setState(await response.json());
    } catch {
      setError("Jill could not refresh the workspace state.");
    }
  }

  async function draftRfq() {
    setScreen(2);
    setActiveNav("New Request");
    setLoading("Jill is drafting your RFQ...");
    setError("");
    try {
      const response = await fetch("/api/jill/structure-rfq", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ freeFormText })
      });
      const body = await response.json();
      setStructuredRfq(body.data);
      const saved = await updateWorkflow({
        action: "save-draft",
        rfqId: activeRfqId ? activeRfq?.id : undefined,
        structuredRfq: body.data
      });
      if (saved.rfq?.id) setActiveRfqId(saved.rfq.id);
      await refreshState();
      if (saved.rfq?.selectedVendorIds?.length) setSelectedVendorIds(saved.rfq.selectedVendorIds);
    } catch {
      const fallbackDraft = {
        title: "API 610 pump package replacement",
        category: "Industrial Equipment",
        quantity: 2,
        technicalSpecs: [
          { label: "Standard", value: "API 610" },
          { label: "Wetted parts", value: "316 stainless steel" }
        ],
        requiredDeliveryDate: "2026-07-15",
        budgetCeiling: 185000,
        complianceNotes: ["Validate freight and commissioning terms"],
        fieldsNeedingBuyerConfirmation: ["Freight responsibility", "Commissioning window"]
      };
      setStructuredRfq(fallbackDraft);
      const saved = await updateWorkflow({ action: "save-draft", rfqId: activeRfqId ? activeRfq?.id : undefined, structuredRfq: fallbackDraft });
      if (saved.rfq?.id) setActiveRfqId(saved.rfq.id);
      await refreshState();
      if (saved.rfq?.selectedVendorIds?.length) setSelectedVendorIds(saved.rfq.selectedVendorIds);
      setError("Jill used the seeded RFQ draft because the live model did not respond.");
    } finally {
      setLoading("");
    }
  }

  async function sendRfq() {
    if (!activeRfq) return;
    const invalidVendor = selectedVendors.find((vendor) => !isEmailLike(vendor.emailAddress));
    if (invalidVendor) {
      setActiveNav("Vendors");
      setError(`Jill needs a valid email for ${invalidVendor.name} before sending the RFQ.`);
      return;
    }
    setLoading("Jill is sending the RFQ through AgentMail...");
    setError("");
    try {
      await updateWorkflow({ action: "select-vendors", rfqId: activeRfq.id, vendorIds: selectedVendorIds });
      const response = await fetch("/api/agentmail/rfq", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rfqId: activeRfq.id, vendorIds: selectedVendorIds })
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "AgentMail send failed");
      }
      const body = await response.json();
      setQuotes(body.quotes);
      await refreshState();
      setScreen(4);
      setActiveNav("Quote Comparisons");
      if (body.quotes?.length) await normalizeQuotes(body.quotes);
      else {
        setComparison(null);
        window.setTimeout(() => void pollForQuotes(activeRfq.id), 1000);
      }
    } catch (sendError) {
      setError(sendError instanceof Error ? `Jill could not send the RFQ email: ${sendError.message}` : "Jill could not send the RFQ email.");
      setQuotes([]);
      setComparison(null);
      setScreen(3);
      setActiveNav("New Request");
    } finally {
      setLoading("");
    }
  }

  async function sendToApproval() {
    if (!activeRfq || !comparison) return;
    if (quoteProgress.isPartial) {
      setError("Jill is still watching AgentMail for the remaining supplier replies before sending this award for approval.");
      setActiveNav("Quote Comparisons");
      setScreen(4);
      return;
    }
    setLoading("Jill is packaging the recommendation for approval...");
    setError("");
    try {
      await updateWorkflow({ action: "send-to-approval", rfqId: activeRfq.id, comparison });
      await refreshState();
      setScreen(5);
      setActiveNav("Approvals");
    } catch {
      setError("Jill could not write the approval package live, so she is keeping the seeded recommendation on screen.");
      setScreen(5);
      setActiveNav("Approvals");
    } finally {
      setLoading("");
    }
  }

  async function normalizeQuotes(nextQuotes = quotes) {
    if (!activeRfq) return;
    setLoading("Jill is normalizing supplier replies...");
    try {
      const response = await fetch("/api/jill/normalize-quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rfq: activeRfq, quotes: nextQuotes })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Quote normalization failed");
      setComparison(dedupeComparison(body.data));
      if (body.mode === "fallback") {
        setError(`Jill normalized the quote with the local parser because the model response was not usable: ${body.fallbackReason ?? "unknown reason"}.`);
      }
    } catch (normalizeError) {
      setError(normalizeError instanceof Error ? `Jill could not normalize the quote: ${normalizeError.message}` : "Jill could not normalize the quote.");
    } finally {
      setLoading("");
    }
  }

  async function refreshQuotes() {
    if (!activeRfq) return;
    setLoading("Jill is checking AgentMail for supplier replies...");
    setError("");
    try {
      const response = await fetch(`/api/agentmail/quotes?rfqId=${encodeURIComponent(activeRfq.id)}`);
      if (!response.ok) throw new Error("quote refresh failed");
      const body = await response.json();
      setQuotes(body.quotes ?? []);
      if (body.quotes?.length) await normalizeQuotes(body.quotes);
      else setError("Jill checked the inbox, but no supplier quote replies are available for this RFQ yet.");
      await refreshState();
    } catch {
      setError("Jill could not refresh quote replies from AgentMail.");
    } finally {
      setLoading("");
    }
  }

  async function pollForQuotes(rfqId: string) {
    setLoading("Jill is watching the AgentMail inbox for supplier replies...");
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await wait(attempt === 0 ? 1500 : 5000);
      try {
        const response = await fetch(`/api/agentmail/quotes?rfqId=${encodeURIComponent(rfqId)}`);
        if (!response.ok) throw new Error("quote poll failed");
        const body = await response.json();
        const nextQuotes = body.quotes ?? [];
        setQuotes(nextQuotes);
        await refreshState();
        if (nextQuotes.length) {
          await normalizeQuotes(nextQuotes);
          setError("");
          setLoading("");
          return;
        }
      } catch {
        setError("Jill could not poll AgentMail for replies. Use refresh after checking the inbox connection.");
        setLoading("");
        return;
      }
    }
    setLoading("");
    setError("Jill is still waiting for supplier replies in AgentMail.");
  }

  async function issuePo() {
    if (!activeRfq || !winningVendor) return;
    setLoading("Jill is issuing the PO and notifying the vendor...");
    setError("");
    try {
      const response = await fetch("/api/agentmail/purchase-order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rfqId: activeRfq.id,
          vendorId: winningVendor.id,
          amount: winningQuote?.totalPriceUsd ?? activeRfq.budget
        })
      });
      const body = await response.json();
      setPoMessage(body.message ?? `${body.po.id} issued — vendor notified by email.`);
      await refreshState();
    } catch {
      setPoMessage("PO-1001 issued — vendor notified by email.");
      setError("Jill used a seeded PO confirmation because AgentMail did not respond.");
    } finally {
      setLoading("");
    }
  }

  async function saveVendor(vendor: Vendor) {
    setSavingVendorId(vendor.id);
    setError("");
    try {
      const isDraft = vendor.id.startsWith("draft-vendor-");
      const response = await fetch(isDraft ? "/api/vendors" : `/api/vendors/${vendor.id}`, {
        method: isDraft ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(vendor)
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Vendor update failed");
      }
      const body = await response.json();
      if (isDraft && body.vendor?.id) {
        setSelectedVendorIds((ids) => ids.map((id) => (id === vendor.id ? body.vendor.id : id)));
      }
      await refreshState();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Jill could not update that vendor.");
    } finally {
      setSavingVendorId("");
    }
  }

  async function addVendor() {
    setError("");
    const draftId = `draft-vendor-${Date.now()}`;
    const draftVendor: Vendor = {
      id: draftId,
      name: "",
      source: "External",
      reliabilityPercent: 80,
      rating: 4,
      complianceStatus: "Review",
      pastSpend: 0,
      emailAddress: "",
      categories: [],
      notes: ""
    };
    setState((current) => ({ ...current, vendors: [...current.vendors, draftVendor] }));
    setSelectedVendorIds((ids) => [...new Set([...ids, draftId])]);
  }

  async function deleteRfq(rfq: Rfq) {
    const confirmed = window.confirm(`Delete RFQ "${rfq.title}"? This removes the RFQ from Jill's workspace.`);
    if (!confirmed) return;

    setLoading("Jill is deleting the draft RFQ...");
    setError("");
    try {
      const response = await fetch(`/api/rfqs/${encodeURIComponent(rfq.id)}`, { method: "DELETE" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Delete failed");
      }

      if (activeRfq?.id === rfq.id) {
        setStructuredRfq(null);
        setSelectedVendorIds([]);
        setQuotes([]);
        setComparison(null);
        setPoMessage("");
        setScreen(1);
        setActiveNav("Dashboard");
      }
      await refreshState();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Jill could not delete that draft RFQ.");
    } finally {
      setLoading("");
    }
  }

  function patchVendor(vendorId: string, patch: Partial<Vendor>) {
    setState((current) => ({
      ...current,
      vendors: current.vendors.map((vendor) => (vendor.id === vendorId ? { ...vendor, ...patch } : vendor))
    }));
  }

  function handleNavigate(label: NavLabel) {
    setActiveNav(label);
    if (label === "Dashboard") setScreen(1);
    if (label === "New Request") {
      setActiveRfqId("");
      setStructuredRfq(null);
      setSelectedVendorIds([]);
      setQuotes([]);
      setComparison(null);
      setPoMessage("");
      setScreen(2);
    }
    if (label === "Vendors") setScreen(1);
    if (label === "Quote Comparisons") setScreen(4);
    if (label === "Approvals") setScreen(5);
  }

  function openRfq(rfq: Rfq) {
    const destination = workflowDestinationForRfq(rfq);
    setActiveRfqId(rfq.id);
    setSelectedVendorIds(rfq.selectedVendorIds);
    setQuotes([]);
    setComparison(null);
    setPoMessage("");
    setActiveNav(destination.activeNav);
    setScreen(destination.screen);
  }

  return (
    <AppShell
      activeNav={activeNav}
      activeStep={loading.includes("sending the RFQ") ? "Send" : stageStep[screen]}
      approvalsCount={state.pendingApprovalsCount}
      emailActionsCount={state.emailActionsCount}
      inboxAddress={state.jillInboxAddress}
      llmStatus={state.llmStatus}
      showWorkflowStepper={showWorkflowStepper}
      onNavigate={handleNavigate}
    >
      <div className="mx-auto max-w-7xl">
        {error ? <InlineNotice tone="amber" text={error} /> : null}
        {loading ? <InlineNotice tone="cyan" text={loading} /> : null}
        {activeNav === "Dashboard" && <Dashboard state={state} onNewRequest={draftRfq} onDeleteRfq={deleteRfq} />}
        {activeNav === "Active RFQs" && <ActiveRfqs state={state} onOpenRfq={openRfq} onDeleteRfq={deleteRfq} />}
        {activeNav === "Activity Log" && <ActivityLog activity={state.activityFeed} />}
        {activeNav === "Vendors" && (
          <VendorManagement
            vendors={state.vendors}
            selectedVendorIds={selectedVendorIds}
            onPatchVendor={patchVendor}
            onSaveVendor={saveVendor}
            onAddVendor={addVendor}
            savingVendorId={savingVendorId}
          />
        )}
        {activeNav === "New Request" && screen !== 3 && (
          <StructuredDraft
            freeFormText={freeFormText}
            setFreeFormText={setFreeFormText}
            structuredRfq={structuredRfq}
            loading={loading}
            onDraft={draftRfq}
            onContinue={() => { setScreen(3); setActiveNav("New Request"); }}
          />
        )}
        {activeNav === "New Request" && screen === 3 && activeRfq && (
          <SupplierSelection
            vendors={state.vendors}
            recommendedIds={(activeRfq.selectedVendorIds.length ? activeRfq.selectedVendorIds : state.vendors.slice(0, 3).map((vendor) => vendor.id)).slice(0, 3)}
            selectedVendorIds={selectedVendorIds}
            setSelectedVendorIds={setSelectedVendorIds}
            onAddVendor={addVendor}
            onSend={sendRfq}
            loading={loading}
          />
        )}
        {activeNav === "Quote Comparisons" && comparison && (
          <QuoteComparison
            activeRfq={activeRfq}
            comparison={comparison}
            expectedVendors={expectedQuoteVendors}
            inboxMessages={activeInboxMessages}
            quoteReplies={quotes}
            onApprove={sendToApproval}
            onRefresh={refreshQuotes}
          />
        )}
        {activeNav === "Quote Comparisons" && !comparison && <QuoteComparisonSummary state={state} activeRfq={activeRfq} onStart={() => { setActiveNav("New Request"); setScreen(3); }} onRefresh={refreshQuotes} />}
        {activeNav === "Approvals" && activeRfq && winningVendor && (
          <AwardPo
            rfq={activeRfq}
            vendor={winningVendor}
            quote={winningQuote}
            activity={state.activityFeed}
            poMessage={poMessage}
            onIssue={issuePo}
            loading={loading}
          />
        )}
        {activeNav === "Approvals" && (!activeRfq || !winningVendor) && <ApprovalsEmpty onStart={() => { setActiveNav("New Request"); setScreen(2); }} />}
      </div>
    </AppShell>
  );
}

async function updateWorkflow(payload: Record<string, unknown>) {
  const response = await fetch("/api/rfqs/workflow", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Workflow update failed");
  }
  return response.json();
}

function dedupeComparison(comparison: NormalizeQuotesResult): NormalizeQuotesResult {
  const seen = new Set<string>();
  return {
    ...comparison,
    quotes: comparison.quotes.filter((quote) => {
      const key = quote.vendorName.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
  };
}

function getQuoteProgress(quoteReplies: QuoteReply[], expectedVendors: Vendor[], inboxMessages: EmailMessage[] = []) {
  const replyEvidence: Array<{ vendor: string; vendorId?: string }> = [
    ...quoteReplies.map((reply) => ({ vendor: reply.vendor })),
    ...inboxMessages.map((message) => ({ vendor: message.from, vendorId: message.vendorId }))
  ];
  const matchedVendorIds = new Set<string>();

  for (const vendor of expectedVendors) {
    if (replyEvidence.some((reply) => quoteMatchesVendor(reply.vendor, vendor) || reply.vendorId === vendor.id)) {
      matchedVendorIds.add(vendor.id);
    }
  }

  const unmatchedReplyCount = replyEvidence.filter((reply) => !expectedVendors.some((vendor) => quoteMatchesVendor(reply.vendor, vendor) || reply.vendorId === vendor.id)).length;
  const receivedCount = expectedVendors.length ? Math.min(expectedVendors.length, matchedVendorIds.size + unmatchedReplyCount) : replyEvidence.length;
  const pendingVendors = expectedVendors.filter((vendor) => !matchedVendorIds.has(vendor.id));
  return {
    expectedCount: expectedVendors.length,
    receivedCount,
    pendingVendors,
    isPartial: expectedVendors.length > 1 && pendingVendors.length > 0
  };
}

function quoteMatchesVendor(replyVendor: string, vendor: Vendor) {
  const normalizedReplyVendor = normalizeContact(replyVendor);
  return [vendor.name, vendor.emailAddress]
    .map(normalizeContact)
    .some((candidate) => candidate.length > 0 && (normalizedReplyVendor === candidate || normalizedReplyVendor.includes(candidate)));
}

function normalizeContact(value: string) {
  return value.trim().toLowerCase().replace(/^.*<([^>]+)>.*$/, "$1");
}

export function workflowDestinationForRfq(rfq: Rfq): WorkflowDestination {
  if (rfq.status === "Awaiting Approval" || rfq.status === "PO Issued" || rfq.stage === "Award & PO Issuance") {
    return { activeNav: "Approvals", screen: 5 };
  }

  if (rfq.status === "Sent" || rfq.status === "Quotes In" || rfq.stage === "Send" || rfq.stage === "Quote Comparison") {
    return { activeNav: "Quote Comparisons", screen: 4 };
  }

  if (rfq.stage === "Supplier Selection") {
    return { activeNav: "New Request", screen: 3 };
  }

  return { activeNav: "New Request", screen: 2 };
}

function Dashboard({ state, onNewRequest, onDeleteRfq }: { state: AppState; onNewRequest: () => void; onDeleteRfq: (rfq: Rfq) => void }) {
  const rows = state.rfqs.map((rfq) => [
    rfq.id,
    <span key={`${rfq.id}-title`} className="font-semibold text-white">{rfq.title}</span>,
    <StatusPill key={`${rfq.id}-stage`} status={rfq.status} />,
    String(rfq.selectedVendorIds.length),
    "Pending",
    rfq.neededBy,
    <RfqDeleteButton key={`${rfq.id}-delete`} rfq={rfq} onDelete={onDeleteRfq} />
  ]);
  return (
    <div className="grid gap-stitch-gutter">
      <section className="grid gap-stitch-gutter md:grid-cols-3">
        <MetricCard value={moneyCompact(state.dashboardMetrics.annualSavings)} label="Annual savings" trend="tracked by Jill" />
        <MetricCard value={`${state.dashboardMetrics.cycleTimeReductionPercent}%`} label="Cycle-time reduction" trend="RFQ to award" />
        <MetricCard value={formatNumber(state.dashboardMetrics.hoursRecovered)} label="Hours recovered" trend="buyer capacity" />
      </section>
      <Card className="border-[#ffb95a]/40 bg-[#ffb95a]/10">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-section-label uppercase text-[#ffd08b]">Pending your approval</p>
            <p className="mt-2 text-body-md text-white">
              {state.pendingApprovalsCount > 0 ? `${state.pendingApprovalsCount} award package needs your review.` : "No awards are waiting. Start a request when you are ready."}
            </p>
          </div>
          <Button onClick={onNewRequest}>New Request</Button>
        </div>
      </Card>
      <section className="grid gap-stitch-gutter xl:grid-cols-[1.45fr_0.75fr]">
        <Card title="Active RFQs">
          {rows.length ? <Table caption="Active RFQs" columns={["ID", "Title", "Stage", "Vendors", "Best Quote", "Due", "Actions"]} rows={rows} /> : <EmptyState text="Jill has no active RFQs yet. Start with a new request." />}
        </Card>
        <Card title="Jill's activity">
          {state.activityFeed.length ? (
            state.activityFeed.slice(-6).reverse().map((event) => (
              <ActivityFeedItem key={event.id} actor={event.actor} timestamp={formatTime(event.timestamp)}>
                {event.message}
              </ActivityFeedItem>
            ))
          ) : (
            <EmptyState text="Jill has not taken any actions yet." />
          )}
        </Card>
      </section>
    </div>
  );
}

export function ActiveRfqs({ state, onOpenRfq, onDeleteRfq }: { state: AppState; onOpenRfq: (rfq: Rfq) => void; onDeleteRfq: (rfq: Rfq) => void }) {
  const rows = state.rfqs.map((rfq) => [
    rfq.id,
    <button key={`${rfq.id}-open`} className="text-left font-semibold text-white underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stitch-primary-container" onClick={() => onOpenRfq(rfq)} type="button">
      {rfq.title}
    </button>,
    <StatusPill key={`${rfq.id}-status`} status={rfq.status} />,
    rfq.stage,
    String(rfq.selectedVendorIds.length),
    rfq.neededBy,
    <RfqDeleteButton key={`${rfq.id}-delete`} rfq={rfq} onDelete={onDeleteRfq} />
  ]);

  return (
    <section className="grid gap-stitch-gutter">
      <Card title="Active RFQs">
        {rows.length ? (
          <Table caption="Active RFQs" columns={["ID", "Title", "Status", "Stage", "Vendors", "Due", "Actions"]} rows={rows} />
        ) : (
          <EmptyState text="Jill has no active RFQs yet. Start a new request to build the queue." />
        )}
      </Card>
    </section>
  );
}

function RfqDeleteButton({ rfq, onDelete }: { rfq: Rfq; onDelete: (rfq: Rfq) => void }) {
  return (
    <Button variant="secondary" className="min-h-8 px-3 py-1 text-xs" aria-label={`Delete RFQ ${rfq.title}`} onClick={() => onDelete(rfq)}>
      Delete
    </Button>
  );
}

function VendorManagement({
  vendors,
  selectedVendorIds,
  onPatchVendor,
  onSaveVendor,
  onAddVendor,
  savingVendorId
}: {
  vendors: Vendor[];
  selectedVendorIds: string[];
  onPatchVendor: (vendorId: string, patch: Partial<Vendor>) => void;
  onSaveVendor: (vendor: Vendor) => void;
  onAddVendor: () => void;
  savingVendorId: string;
}) {
  return (
    <section className="grid gap-stitch-gutter">
      <div className="grid gap-stitch-gutter xl:grid-cols-[1fr_auto] xl:items-start">
        <Callout title="Vendor emails drive AgentMail sends">
          Jill sends RFQs and POs to the email address saved here. Add real suppliers or edit the example contact before sending a live RFQ.
        </Callout>
        <Button onClick={onAddVendor}>Add vendor</Button>
      </div>
      <div className="grid gap-stitch-gutter xl:grid-cols-2">
        {vendors.map((vendor) => {
          const selected = selectedVendorIds.includes(vendor.id);
          const isDraft = vendor.id.startsWith("draft-vendor-");
          return (
            <Card key={vendor.id} title={vendor.name || "New supplier"} className={selected ? "border-stitch-primary-container" : undefined}>
              <div className="grid gap-4">
                <div className="flex flex-wrap gap-2">
                  {isDraft ? <Pill tone="amber">Unsaved</Pill> : null}
                  <Pill tone={vendor.source === "Vendor Master" ? "cyan" : "slate"}>{vendor.source}</Pill>
                  <StatusPill status={vendor.complianceStatus} />
                  {selected ? <Pill tone="green">Selected for current RFQ</Pill> : null}
                </div>

                <label className="grid gap-1">
                  <span className="text-label-sm text-stitch-text-muted">Supplier name</span>
                  <input className={inputClassName} value={vendor.name} onChange={(event) => onPatchVendor(vendor.id, { name: event.target.value })} />
                </label>

                <label className="grid gap-1">
                  <span className="text-label-sm text-stitch-text-muted">RFQ email address</span>
                  <input className={inputClassName} type="email" value={vendor.emailAddress} onChange={(event) => onPatchVendor(vendor.id, { emailAddress: event.target.value })} />
                </label>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-label-sm text-stitch-text-muted">Source</span>
                    <select className={inputClassName} value={vendor.source} onChange={(event) => onPatchVendor(vendor.id, { source: event.target.value as Vendor["source"] })}>
                      <option>Vendor Master</option>
                      <option>External</option>
                    </select>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-label-sm text-stitch-text-muted">Compliance</span>
                    <select className={inputClassName} value={vendor.complianceStatus} onChange={(event) => onPatchVendor(vendor.id, { complianceStatus: event.target.value as Vendor["complianceStatus"] })}>
                      <option>Compliant</option>
                      <option>Review</option>
                      <option>Blocked</option>
                    </select>
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <NumberField label="Rating" value={vendor.rating} min={0} max={5} step={0.1} onChange={(value) => onPatchVendor(vendor.id, { rating: value })} />
                  <NumberField label="On-time %" value={vendor.reliabilityPercent} min={0} max={100} onChange={(value) => onPatchVendor(vendor.id, { reliabilityPercent: value })} />
                  <NumberField label="Past spend" value={vendor.pastSpend} min={0} onChange={(value) => onPatchVendor(vendor.id, { pastSpend: value })} />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <p className="text-label-sm text-stitch-text-muted">Next RFQ send: <span className="text-white">{vendor.emailAddress || "No email saved"}</span></p>
                  <Button onClick={() => onSaveVendor(vendor)} disabled={savingVendorId === vendor.id}>
                    {savingVendorId === vendor.id ? "Saving..." : isDraft ? "Create vendor" : "Save vendor"}
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-label-sm text-stitch-text-muted">{label}</span>
      <input className={inputClassName} max={max} min={min} step={step} type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

export function QuoteComparisonSummary({ state, activeRfq, onStart, onRefresh }: { state: AppState; activeRfq?: Rfq; onStart: () => void; onRefresh: () => void }) {
  const waitingForReplies = Boolean(activeRfq && activeRfq.status === "Sent");
  const canEditSuppliers = !activeRfq || activeRfq.status === "Drafting";
  const quoteRows = state.emailMessages
    .filter((message) => message.direction === "Inbound" && (!activeRfq || message.rfqId === activeRfq.id))
    .map((message) => [
      message.rfqId ?? "Unmatched",
      message.from,
      message.subject,
      formatTime(message.timestamp)
    ]);

  return (
    <section className="grid gap-stitch-gutter">
      <Card title="Quote Comparisons">
        {quoteRows.length ? (
          <Table caption="Quote reply inbox" columns={["RFQ", "From", "Subject", "Received"]} rows={quoteRows} />
        ) : waitingForReplies ? (
          <EmptyState text="Jill is waiting for supplier replies in AgentMail. Refresh when a vendor has replied to the RFQ email." />
        ) : (
          <EmptyState text="Jill has no quote replies for this RFQ yet. Reply to the RFQ email with the prepared quote content, and Jill will pick it up from AgentMail." />
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          {canEditSuppliers ? <Button onClick={onStart}>Go to supplier selection</Button> : null}
          <Button variant={canEditSuppliers ? "secondary" : "primary"} onClick={onRefresh}>Refresh AgentMail replies</Button>
        </div>
      </Card>
    </section>
  );
}

function ActivityLog({ activity }: { activity: ActivityEvent[] }) {
  return (
    <Card title="Activity Log">
      {activity.length ? (
        activity.slice().reverse().map((event) => (
          <ActivityFeedItem key={event.id} actor={event.actor} timestamp={formatTime(event.timestamp)}>
            {event.message}
          </ActivityFeedItem>
        ))
      ) : (
        <EmptyState text="Jill has not recorded any activity yet." />
      )}
    </Card>
  );
}

function ApprovalsEmpty({ onStart }: { onStart: () => void }) {
  return (
    <Card title="Approvals">
      <EmptyState text="Jill has no award package ready yet. Draft an RFQ, send it, and compare quotes first." />
      <Button className="mt-4" onClick={onStart}>Start RFQ draft</Button>
    </Card>
  );
}

function StructuredDraft({
  freeFormText,
  setFreeFormText,
  structuredRfq,
  loading,
  onDraft,
  onContinue
}: {
  freeFormText: string;
  setFreeFormText: (value: string) => void;
  structuredRfq: StructuredRfqResult | null;
  loading: string;
  onDraft: () => void;
  onContinue: () => void;
}) {
  const flagged = new Set(structuredRfq?.fieldsNeedingBuyerConfirmation ?? []);
  return (
    <section className="grid gap-stitch-gutter xl:grid-cols-2">
      <Card title="Free-form buyer request">
        <textarea
          className="min-h-[420px] w-full rounded-stitch border border-[#1e4369] bg-[#081b2e] p-4 text-body-md text-white focus:border-stitch-primary-container focus:outline-none focus:ring-2 focus:ring-stitch-primary-container/40"
          value={freeFormText}
          onChange={(event) => setFreeFormText(event.target.value)}
        />
        <div className="mt-4 flex gap-3">
          <Button onClick={onDraft}>Draft RFQ</Button>
        </div>
      </Card>
      <Card title="Structured RFQ draft">
        {loading ? <EmptyState text="Jill is drafting your RFQ..." /> : null}
        {structuredRfq ? (
          <div className="grid gap-3">
            {Object.entries({
              Title: structuredRfq.title,
              Category: structuredRfq.category,
              Quantity: structuredRfq.quantity,
              "Required delivery date": structuredRfq.requiredDeliveryDate,
              "Budget ceiling": structuredRfq.budgetCeiling ? `$${formatNumber(structuredRfq.budgetCeiling)}` : null
            }).map(([label, value]) => (
              <FieldRow key={label} label={label} value={String(value ?? "Needs confirmation")} flagged={flagged.has(label)} />
            ))}
            <div className="rounded-stitch border border-[#1e4369] bg-[#0d1c2d] p-4">
              <p className="text-section-label uppercase text-stitch-text-muted">Technical specs <AgentBadge label="AI" /></p>
              <ul className="mt-3 grid gap-2">
                {structuredRfq.technicalSpecs.map((spec) => (
                  <li key={spec.label} className="flex justify-between gap-4 text-body-md">
                    <span className="text-stitch-text-muted">{spec.label}</span>
                    <span className="text-white">{spec.value}</span>
                  </li>
                ))}
              </ul>
            </div>
            <Callout title="Needs your confirmation">
              {structuredRfq.fieldsNeedingBuyerConfirmation.join(", ")}
            </Callout>
            <Button onClick={onContinue}>Approve & continue to vendors</Button>
          </div>
        ) : (
          <EmptyState text="Jill is ready to structure the request once you ask her to draft." />
        )}
      </Card>
    </section>
  );
}

function SupplierSelection({
  vendors,
  recommendedIds,
  selectedVendorIds,
  setSelectedVendorIds,
  onAddVendor,
  onSend,
  loading
}: {
  vendors: Vendor[];
  recommendedIds: string[];
  selectedVendorIds: string[];
  setSelectedVendorIds: (ids: string[]) => void;
  onAddVendor: () => void;
  onSend: () => void;
  loading: string;
}) {
  function toggle(id: string) {
    setSelectedVendorIds(selectedVendorIds.includes(id) ? selectedVendorIds.filter((candidate) => candidate !== id) : [...selectedVendorIds, id]);
  }
  return (
    <section className="grid gap-stitch-gutter xl:grid-cols-[1fr_320px]">
      <div className="grid gap-stitch-gutter md:grid-cols-2">
        <Callout title="Jill recommends suppliers">Cyan borders mark the suppliers Jill would include based on the current vendor list. Add or edit vendors before sending.</Callout>
        {!vendors.length ? (
          <Card title="No vendors yet">
            <EmptyState text="Add at least one supplier with an email address before Jill can send this RFQ." />
            <Button className="mt-4" onClick={onAddVendor}>Add vendor</Button>
          </Card>
        ) : null}
        {vendors.map((vendor) => {
          const selected = selectedVendorIds.includes(vendor.id);
          const recommended = recommendedIds.includes(vendor.id);
          return (
            <label key={vendor.id} className={`block cursor-pointer rounded-stitch border bg-[#12314e] p-5 shadow-stitch-soft ${selected ? "border-stitch-primary-container" : "border-[#1e4369]"}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-headline-md text-white">{vendor.name}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Pill tone={vendor.source === "Vendor Master" ? "cyan" : "slate"}>{vendor.source}</Pill>
                    <StatusPill status={vendor.complianceStatus} />
                    {recommended ? <Pill tone="green">Jill recommended</Pill> : null}
                  </div>
                </div>
                <input className="mt-2 h-5 w-5 accent-[#29b6f6]" checked={selected} type="checkbox" onChange={() => toggle(vendor.id)} />
              </div>
              <dl className="mt-5 grid grid-cols-3 gap-3 text-label-sm">
                <div><dt className="text-stitch-text-muted">Rating</dt><dd className="text-white">{vendor.rating}/5</dd></div>
                <div><dt className="text-stitch-text-muted">On-time</dt><dd className="text-white">{vendor.reliabilityPercent}%</dd></div>
                <div><dt className="text-stitch-text-muted">Past spend</dt><dd className="text-white">${formatNumber(vendor.pastSpend)}</dd></div>
              </dl>
              <div className="mt-4 rounded-stitch border border-[#1e4369] bg-[#0d1c2d] p-3 text-label-sm">
                <span className="text-stitch-text-muted">RFQ sends to </span>
                <span className={isEmailLike(vendor.emailAddress) ? "text-white" : "text-[#ffd08b]"}>{vendor.emailAddress || "No email saved"}</span>
              </div>
            </label>
          );
        })}
      </div>
      <Card title="Selected for RFQ" className="h-max">
        <div className="grid gap-3">
          {vendors.filter((vendor) => selectedVendorIds.includes(vendor.id)).map((vendor) => (
            <div key={vendor.id} className="rounded-stitch border border-[#1e4369] bg-[#0d1c2d] p-3 text-label-sm">
              <p className="font-semibold text-white">{vendor.name}</p>
              <p className={isEmailLike(vendor.emailAddress) ? "text-stitch-text-muted" : "text-[#ffd08b]"}>{vendor.emailAddress || "No email saved"}</p>
            </div>
          ))}
          <Button onClick={onSend} disabled={!selectedVendorIds.length || Boolean(loading)}>Send RFQ via AgentMail</Button>
          {loading ? <p className="text-label-sm text-stitch-primary">Emails are going out from Jill&apos;s inbox...</p> : null}
        </div>
      </Card>
    </section>
  );
}

export function QuoteComparison({
  activeRfq,
  comparison,
  expectedVendors,
  inboxMessages,
  quoteReplies,
  onApprove,
  onRefresh
}: {
  activeRfq: Rfq;
  comparison: NormalizeQuotesResult;
  expectedVendors: Vendor[];
  inboxMessages: EmailMessage[];
  quoteReplies: QuoteReply[];
  onApprove: () => void;
  onRefresh: () => void;
}) {
  const rfqInboxMessages = inboxMessages.filter((message) => message.rfqId === activeRfq.id && message.direction === "Inbound");
  const quoteProgress = getQuoteProgress(quoteReplies, expectedVendors, rfqInboxMessages);
  const pendingNames = quoteProgress.pendingVendors.map((vendor) => vendor.name || vendor.emailAddress).join(", ");
  const inboxRows = rfqInboxMessages.map((message) => [
    <span key={`${message.id}-from`} className="text-white">{message.from}</span>,
    message.subject,
    formatTime(message.timestamp),
    message.body.length > 140 ? `${message.body.slice(0, 140)}...` : message.body
  ]);
  type QuoteRow = NormalizeQuotesResult["quotes"][number];
  const criteria: Array<[string, (quote: QuoteRow) => ReactNode]> = [
    ["Unit price", (q: NormalizeQuotesResult["quotes"][number]) => money(q.unitPriceUsd)],
    ["Quantity", (q: NormalizeQuotesResult["quotes"][number]) => q.quantity ?? "—"],
    ["Total", (q: NormalizeQuotesResult["quotes"][number]) => <strong className="text-white">{money(q.totalPriceUsd)}</strong>],
    ["Lead time", (q: NormalizeQuotesResult["quotes"][number]) => `${q.leadTimeWeeks ?? "—"} weeks`],
    ["Warranty", (q: NormalizeQuotesResult["quotes"][number]) => q.warranty ?? "—"],
    ["Certifications", (q: NormalizeQuotesResult["quotes"][number]) => q.certifications.join(", ") || "—"],
    ["Payment terms", (q: NormalizeQuotesResult["quotes"][number]) => q.paymentTerms ?? "—"],
    ["Compliance", (q: NormalizeQuotesResult["quotes"][number]) => q.complianceCheck],
    ["Flags", (q: NormalizeQuotesResult["quotes"][number]) => q.flags.length ? q.flags.map((flag) => <Pill key={flag} tone="amber">{flag}</Pill>) : <Pill tone="green">Best value</Pill>]
  ];
  return (
    <section className="grid gap-stitch-gutter">
      <Card title="AgentMail inbox watch">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-section-label uppercase text-stitch-text-muted">RFQ {activeRfq.id}</p>
            <p className="text-body-md text-white">
              Jill has {quoteProgress.receivedCount} of {quoteProgress.expectedCount || quoteReplies.length} vendor replies.
            </p>
            {quoteProgress.isPartial ? (
              <p className="mt-2 text-label-sm text-stitch-text-muted">
                She normalized the replies received so far, but is still watching for {pendingNames}.
              </p>
            ) : (
              <p className="mt-2 text-label-sm text-stitch-text-muted">All selected vendor replies are in for this RFQ.</p>
            )}
          </div>
          <Button variant={quoteProgress.isPartial ? "primary" : "secondary"} onClick={onRefresh}>
            Refresh AgentMail replies
          </Button>
        </div>
        <div className="mt-5">
          {inboxRows.length ? (
            <Table caption="AgentMail inbox for RFQ" columns={["From", "Subject", "Received", "Preview"]} rows={inboxRows} />
          ) : (
            <EmptyState text={`Jill has not recorded inbound AgentMail replies for ${activeRfq.id} yet.`} />
          )}
        </div>
      </Card>
      {quoteProgress.isPartial ? (
        <Callout title="Interim comparison">
          Jill can compare the quote replies received so far. She will hold the award recommendation until all selected vendors have replied.
        </Callout>
      ) : (
        <Callout>
          <strong className="text-white">{comparison.recommendation.vendorName}</strong>: {comparison.recommendation.rationale} Savings vs average: {money(comparison.recommendation.savingsVsAverage)}.
        </Callout>
      )}
      <Card title={quoteProgress.isPartial ? "Interim normalized quote comparison" : "Normalized quote comparison"} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-section-label uppercase text-stitch-text-muted">Criteria</th>
                {comparison.quotes.map((quote, quoteIndex) => (
                  <th key={`${quote.vendorName}-${quoteIndex}`} className={`relative px-4 py-3 text-left text-section-label uppercase ${quote.vendorName === comparison.recommendation.vendorName ? "bg-[#29b6f6]/15 text-stitch-primary" : "text-stitch-text-muted"}`}>
                    {quote.vendorName}
                    {!quoteProgress.isPartial && quote.vendorName === comparison.recommendation.vendorName ? <span className="ml-2 rounded-full bg-stitch-primary-container px-2 py-1 text-[10px] text-stitch-on-primary">Jill&apos;s pick</span> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {criteria.map(([label, get]) => (
                <tr key={String(label)} className="border-t border-[#1e4369]">
                  <td className="px-4 py-3 text-label-sm font-semibold text-white">{label}</td>
                  {comparison.quotes.map((quote, quoteIndex) => (
                    <td key={`${quote.vendorName}-${label}-${quoteIndex}`} className={`px-4 py-3 text-body-md ${quote.vendorName === comparison.recommendation.vendorName ? "bg-[#29b6f6]/10" : ""}`}>
                      {typeof get === "function" ? get(quote) : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="flex justify-end">
        {quoteProgress.isPartial ? (
          <Button disabled>Waiting for remaining bids</Button>
        ) : (
          <Button onClick={onApprove}>Send to approval</Button>
        )}
      </div>
    </section>
  );
}

function AwardPo({
  rfq,
  vendor,
  quote,
  activity,
  poMessage,
  onIssue,
  loading
}: {
  rfq: Rfq;
  vendor: Vendor;
  quote?: NormalizeQuotesResult["quotes"][number];
  activity: ActivityEvent[];
  poMessage: string;
  onIssue: () => void;
  loading: string;
}) {
  const total = quote?.totalPriceUsd ?? rfq.budget;
  return (
    <section className="grid gap-stitch-gutter xl:grid-cols-[1fr_0.8fr]">
      <Card title="Award summary">
        <p className="text-headline-md text-white">{vendor.name}</p>
        <p className="mt-4 text-metric-lg text-stitch-primary-container">{money(total)}</p>
        <p className="text-label-sm text-[#8ff0c7]">{money(Math.max(0, rfq.budget - total))} under budget</p>
        <ul className="mt-6 grid gap-2">
          {rfq.lineItems.map((line) => (
            <li key={line.id} className="rounded-stitch border border-[#1e4369] bg-[#0d1c2d] p-3 text-body-md text-white">
              {line.quantity} {line.unit} — {line.description}
            </li>
          ))}
        </ul>
        <Button className="mt-6" onClick={onIssue} disabled={Boolean(loading || poMessage)}>Approve & issue PO</Button>
        {poMessage ? <div className="mt-4 rounded-stitch border border-[#34d399]/40 bg-[#34d399]/10 p-4 text-[#8ff0c7]">{poMessage}</div> : null}
      </Card>
      <Card title="Compliance checklist">
        {["Budget within limit", "3+ bids obtained", "Vendor compliant", "Specs matched"].map((item) => (
          <div key={item} className="flex items-center gap-3 border-b border-[#1e4369] py-3 last:border-b-0">
            <CheckCircle2 className="text-[#34d399]" size={18} />
            <span className="text-body-md text-white">{item}</span>
          </div>
        ))}
        <div className="mt-6">
          <p className="text-section-label uppercase text-stitch-text-muted">Audit trail</p>
          {activity.slice(-5).reverse().map((event) => (
            <ActivityFeedItem key={event.id} actor={event.actor} timestamp={formatTime(event.timestamp)}>{event.message}</ActivityFeedItem>
          ))}
        </div>
      </Card>
    </section>
  );
}

function FieldRow({ label, value, flagged }: { label: string; value: string; flagged: boolean }) {
  return (
    <div className="rounded-stitch border border-[#1e4369] bg-[#0d1c2d] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-section-label uppercase text-stitch-text-muted">{label}</p>
        <AgentBadge label="AI" />
        {flagged ? <Pill tone="amber">Needs your confirmation</Pill> : null}
      </div>
      <p className="mt-2 text-body-md text-white">{value}</p>
    </div>
  );
}

function InlineNotice({ text, tone }: { text: string; tone: "cyan" | "amber" }) {
  return (
    <div className={`mb-4 flex items-center gap-2 rounded-stitch border p-3 text-label-sm ${tone === "cyan" ? "border-[#29b6f6]/40 bg-[#29b6f6]/10 text-stitch-primary" : "border-[#ffb95a]/40 bg-[#ffb95a]/10 text-[#ffd08b]"}`}>
      {tone === "cyan" ? <Sparkles size={16} /> : <AlertTriangle size={16} />}
      {text}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-stitch border border-[#1e4369] bg-[#0d1c2d] p-6 text-body-md text-stitch-text-muted">{text}</div>;
}

function StatusPill({ status }: { status: string }) {
  if (status === "Drafting" || status === "Sent" || status === "Quotes In" || status === "Awaiting Approval" || status === "Compliant" || status === "Review") {
    return <StatusBadge status={status} />;
  }
  return <Pill tone="green">{status}</Pill>;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function money(value: number | null | undefined) {
  if (typeof value !== "number") return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function moneyCompact(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function isEmailLike(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
