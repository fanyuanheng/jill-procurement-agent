"use client";

import { Activity, AlertTriangle, Award, Bot, CheckCircle2, FileText, Mail, RotateCcw, Send, Settings, Sparkles, Table2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { AppState, ProcurementRequest, RfqRecord } from "@/lib/types";

const initialRequest: ProcurementRequest = {
  title: "Replacement high-pressure pump package",
  category: "Rotating Equipment",
  neededBy: "2026-07-15",
  budget: 185000,
  shipTo: "Basin Field Station 4",
  requirements:
    "Need API 610 compliant pump package, stainless wetted parts, VFD, commissioning support, and delivery before shutdown window."
};

const emptyState: AppState = { rfqs: [], vendors: [], emails: [], exceptions: [], audit: [] };

export default function Home() {
  const [state, setState] = useState<AppState>(emptyState);
  const [request, setRequest] = useState<ProcurementRequest>(initialRequest);
  const [activeId, setActiveId] = useState<string | undefined>();
  const [manualVendorId, setManualVendorId] = useState("vendor-cascade");
  const [manualQuote, setManualQuote] = useState("Manual entry: total $171,400, lead time 21 days, Net 30, warranty 36 months. No exceptions.");
  const [busy, setBusy] = useState<string | undefined>();
  const [notice, setNotice] = useState("Ready to convert a procurement request into an approved RFQ package.");

  const activeRfq = useMemo(
    () => state.rfqs.find((rfq) => rfq.id === (activeId ?? state.activeRfqId)) ?? state.rfqs[0],
    [activeId, state.activeRfqId, state.rfqs]
  );

  const refresh = useCallback(async () => {
    const response = await fetch("/api/state", { cache: "no-store" });
    const nextState = (await response.json()) as AppState;
    setState(nextState);
    setActiveId((current) => current ?? nextState.activeRfqId ?? nextState.rfqs[0]?.id);
    setManualVendorId(nextState.vendors[0]?.id ?? "vendor-cascade");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function run<T>(label: string, action: () => Promise<T>, success: string) {
    setBusy(label);
    setNotice(`Processing: ${label}.`);
    try {
      await action();
      await refresh();
      setNotice(success);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Workflow action could not be completed.");
    } finally {
      setBusy(undefined);
    }
  }

  async function createRfq(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(
      "generating RFQ package",
      async () => {
        const response = await post<RfqRecord>("/api/rfqs", { ...request, budget: Number(request.budget) });
        setActiveId(response.id);
      },
      "RFQ package generated and supplier shortlist prepared."
    );
  }

  async function post<T = unknown>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!response.ok) throw new Error((await response.json()).error);
    return response.json() as Promise<T>;
  }

  async function patch<T = unknown>(path: string, body: unknown): Promise<T> {
    const response = await fetch(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error((await response.json()).error);
    return response.json() as Promise<T>;
  }

  async function selectRfq(rfqId: string) {
    await run("loading RFQ workspace", async () => {
      await post(`/api/rfqs/${rfqId}/active`);
      setActiveId(rfqId);
    }, "RFQ workspace loaded.");
  }

  const openExceptions = state.exceptions.filter((item) => item.status === "open");
  const activeEmails = activeRfq ? state.emails.filter((email) => !email.vendorId || activeRfq.suppliers.some((supplier) => supplier.vendor.id === email.vendorId)) : state.emails;

  return (
    <main>
      <header className="topbar">
        <div>
          <div className="eyebrow"><Bot size={16} /> Jill Procurement Agent</div>
          <h1>Autonomous RFQ execution for tactical procurement</h1>
        </div>
        <button
          className="ghost"
          type="button"
          onClick={() => run("resetting demo workspace", () => post("/api/reset"), "Demo workspace reset.")}
          disabled={!!busy}
        >
          <RotateCcw size={16} /> Reset Demo
        </button>
      </header>

      <section className="status-strip" aria-live="polite">
        <Sparkles size={18} />
        <span>{notice}</span>
        {busy ? <strong>{busy}</strong> : <strong>{activeRfq?.status ?? "idle"}</strong>}
      </section>

      <section className="metrics-row">
        <Metric label="Active RFQs" value={state.rfqs.length} />
        <Metric label="Open exceptions" value={openExceptions.length} />
        <Metric label="Supplier contacts" value={state.vendors.length} />
        <Metric label="Email records" value={state.emails.length} />
      </section>

      <div className="ops-workspace">
        <aside className="panel queue">
          <PanelTitle icon={<FileText size={18} />} title="RFQ Queue" detail={`${state.rfqs.length} records`} />
          <form className="compact-form" onSubmit={createRfq}>
            <label>
              Title
              <input value={request.title} onChange={(event) => setRequest({ ...request, title: event.target.value })} />
            </label>
            <div className="two">
              <label>
                Category
                <input value={request.category} onChange={(event) => setRequest({ ...request, category: event.target.value })} />
              </label>
              <label>
                Required by
                <input type="date" value={request.neededBy} onChange={(event) => setRequest({ ...request, neededBy: event.target.value })} />
              </label>
            </div>
            <div className="two">
              <label>
                Budget
                <input type="number" value={request.budget} onChange={(event) => setRequest({ ...request, budget: Number(event.target.value) })} />
              </label>
              <label>
                Delivery location
                <input value={request.shipTo} onChange={(event) => setRequest({ ...request, shipTo: event.target.value })} />
              </label>
            </div>
            <label>
              Specifications and requirements
              <textarea value={request.requirements} onChange={(event) => setRequest({ ...request, requirements: event.target.value })} />
            </label>
            <button className="primary" type="submit" disabled={!!busy}>
              <Sparkles size={17} /> Generate RFQ Package
            </button>
          </form>

          <div className="queue-list">
            {state.rfqs.length ? state.rfqs.map((rfq) => (
              <button className={`queue-item ${activeRfq?.id === rfq.id ? "selected" : ""}`} key={rfq.id} type="button" onClick={() => selectRfq(rfq.id)}>
                <span>{rfq.request.title}</span>
                <small>{rfq.status.replaceAll("_", " ")} | {rfq.quotes.length} bids</small>
              </button>
            )) : <EmptyState text="Create an RFQ package to begin operational tracking." />}
          </div>
        </aside>

        <section className="detail-grid">
          <section className="panel rfq-detail">
            <PanelTitle icon={<Bot size={18} />} title="RFQ Work Package" detail={activeRfq ? `Response due ${activeRfq.draft.responseDeadline}` : "Awaiting request"} />
            {activeRfq ? (
              <div className="panel-body">
                <div className="record-header">
                  <div>
                    <h2>{activeRfq.draft.title}</h2>
                    <p>{activeRfq.draft.scope}</p>
                  </div>
                  <strong className="status-pill">{activeRfq.status.replaceAll("_", " ")}</strong>
                </div>
                <div className="spec-box">{activeRfq.draft.technicalSpecs}</div>
                <div className="criteria">
                  {activeRfq.draft.evaluationCriteria.map((item) => <span key={item}>{item}</span>)}
                </div>
                <div className="actions">
                  <button
                    type="button"
                    onClick={() => run("issuing RFQ to suppliers", () => post(`/api/rfqs/${activeRfq.id}/send`), "RFQ issued to shortlisted suppliers. Awaiting supplier responses.")}
                    disabled={!!busy || activeRfq.status !== "rfq_ready"}
                  >
                    <Send size={16} /> Issue RFQ to Suppliers
                  </button>
                  <button
                    type="button"
                    onClick={() => run("loading demo supplier quotes", () => post(`/api/rfqs/${activeRfq.id}/simulate-quotes`), "Supplier quotes normalized and recommendation prepared.")}
                    disabled={!!busy || activeRfq.status === "rfq_ready" || activeRfq.status === "po_issued"}
                  >
                    <Mail size={16} /> Load Demo Supplier Quotes
                  </button>
                </div>
              </div>
            ) : <EmptyState text="Select or create an RFQ to view the work package." />}
          </section>

          <section className="panel suppliers">
            <PanelTitle icon={<CheckCircle2 size={18} />} title="Recommended Suppliers" detail="Vendor master match" />
            {activeRfq ? (
              <div className="stack">
                {activeRfq.suppliers.map((supplier) => (
                  <article className="supplier" key={supplier.vendor.id}>
                    <div>
                      <strong>{supplier.vendor.name}</strong>
                      <small>{supplier.rationale}</small>
                    </div>
                    <b>{supplier.score}</b>
                    {supplier.complianceFlags.length ? <em>{supplier.complianceFlags.join(", ")}</em> : <em>Compliant</em>}
                  </article>
                ))}
              </div>
            ) : <EmptyState text="Recommended suppliers appear after the RFQ package is generated." />}
          </section>

          <section className="panel quotes">
            <PanelTitle icon={<Table2 size={18} />} title="Bid Comparison" detail={`${activeRfq?.quotes.length ?? 0} received`} />
            {activeRfq?.quotes.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Supplier</th>
                      <th>Price</th>
                      <th>Lead time</th>
                      <th>Terms</th>
                      <th>Warranty</th>
                      <th>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeRfq.quotes.map((quote) => (
                      <tr key={quote.vendorId}>
                        <td>{quote.vendorName}</td>
                        <td>${quote.totalPrice.toLocaleString("en-US")}</td>
                        <td>{quote.leadTimeDays}d</td>
                        <td>{quote.paymentTerms}</td>
                        <td>{quote.warrantyMonths}mo</td>
                        <td>{Math.round(quote.confidence * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState text="Supplier responses are normalized into comparable bid rows." />}
          </section>

          <section className="panel manual-quote">
            <PanelTitle icon={<Mail size={18} />} title="Manual Bid Capture" detail="Fallback intake" />
            {activeRfq ? (
              <form className="compact-form" onSubmit={(event) => {
                event.preventDefault();
                void run(
                  "capturing manual supplier bid",
                  () => post(`/api/rfqs/${activeRfq.id}/manual-quote`, { vendorId: manualVendorId, rawText: manualQuote }),
                  "Manual supplier bid captured and recommendation refreshed."
                );
              }}>
                <label>
                  Supplier
                  <select value={manualVendorId} onChange={(event) => setManualVendorId(event.target.value)}>
                    {state.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
                  </select>
                </label>
                <label>
                  Quote text
                  <textarea value={manualQuote} onChange={(event) => setManualQuote(event.target.value)} />
                </label>
                <button type="submit" disabled={!!busy}><Mail size={16} /> Capture Bid</button>
              </form>
            ) : <EmptyState text="Select an RFQ to capture an off-thread supplier bid." />}
          </section>

          <section className="panel decision">
            <PanelTitle icon={<Award size={18} />} title="Sourcing Recommendation" detail="Buyer approval" />
            {activeRfq?.recommendation ? (
              <div className="panel-body">
                <div className="score">{activeRfq.recommendation.score}</div>
                <h2>{activeRfq.recommendation.vendorName}</h2>
                <p>{activeRfq.recommendation.reason}</p>
                <ul>{activeRfq.recommendation.tradeoffs.map((tradeoff) => <li key={tradeoff}>{tradeoff}</li>)}</ul>
                <button
                  className="primary"
                  type="button"
                  disabled={!!busy || activeRfq.status === "po_issued"}
                  onClick={() => run("generating purchase order", () => post(`/api/rfqs/${activeRfq.id}/award`, { vendorId: activeRfq.recommendation?.vendorId }), "Award approved and purchase order generated.")}
                >
                  <Award size={16} /> Approve Supplier Award
                </button>
                {activeRfq.po ? (
                  <div className="po" data-testid="po-panel">
                    <strong>{activeRfq.po.id}</strong>
                    <span>{activeRfq.po.vendorName}</span>
                    <span>${activeRfq.po.amount.toLocaleString("en-US")} delivery by {activeRfq.po.deliveryDate}</span>
                  </div>
                ) : null}
              </div>
            ) : <EmptyState text="A sourcing recommendation appears after supplier bids are normalized." />}
          </section>
        </section>

        <aside className="panel operations">
          <PanelTitle icon={<Settings size={18} />} title="Operations Control" detail="Live readiness" />
          <div className="ops-section">
            <h3><AlertTriangle size={16} /> Exceptions</h3>
            {openExceptions.length ? openExceptions.map((item) => (
              <article className="exception" key={item.id}>
                <strong>{item.type}</strong>
                <span>{item.message}</span>
              </article>
            )) : <EmptyState text="No open operational exceptions." />}
          </div>

          <div className="ops-section">
            <h3><Mail size={16} /> Email Ledger</h3>
            {activeEmails.length ? activeEmails.slice().reverse().map((email) => (
              <article className="ledger-item" key={email.id}>
                <strong>{email.direction} | {email.status}</strong>
                <span>{email.subject}</span>
                <small>{email.to ?? email.from}</small>
              </article>
            )) : <EmptyState text="Email records appear after RFQ issue or quote receipt." />}
          </div>

          <div className="ops-section">
            <h3><Activity size={16} /> Workflow Audit Trail</h3>
            <div className="timeline">
              {state.audit.slice().reverse().map((event) => (
                <article key={event.id}>
                  <b>{event.actor}</b>
                  <span>{event.message}</span>
                </article>
              ))}
            </div>
          </div>

          <div className="ops-section">
            <h3><CheckCircle2 size={16} /> Supplier Directory</h3>
            <p className="section-note">Enter approved supplier contacts before issuing live RFQs.</p>
            {state.vendors.map((vendor) => (
              <form className="vendor-row" key={vendor.id} onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = new FormData(form);
                void run("updating supplier contact", () => patch(`/api/vendors/${vendor.id}`, { email: data.get("email") }), "Supplier contact updated.");
              }}>
                <strong>{vendor.name}</strong>
                <input name="email" type="email" defaultValue={vendor.email} placeholder="Enter supplier email" />
                <button type="submit" disabled={!!busy}>Save</button>
              </form>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <article className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function PanelTitle({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return (
    <div className="panel-title">
      <span>{icon}</span>
      <strong>{title}</strong>
      <small>{detail}</small>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}
