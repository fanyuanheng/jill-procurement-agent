import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import {
  Activity,
  Bot,
  Check,
  Circle,
  ClipboardList,
  FilePlus2,
  LayoutDashboard,
  Mail,
  Search,
  Send,
  Sparkles,
  Users
} from "lucide-react";
import clsx from "clsx";

type NavItem = {
  label: string;
  href: string;
  icon: ReactNode;
  badge?: number;
};

export type NavLabel =
  | "Dashboard"
  | "New Request"
  | "Active RFQs"
  | "Quote Comparisons"
  | "Approvals"
  | "Vendors"
  | "Activity Log";

const navItems = (approvalsCount: number): NavItem[] => [
  { label: "Dashboard", href: "#dashboard", icon: <LayoutDashboard aria-hidden="true" size={18} /> },
  { label: "New Request", href: "#new-request", icon: <FilePlus2 aria-hidden="true" size={18} /> },
  { label: "Active RFQs", href: "#active-rfqs", icon: <ClipboardList aria-hidden="true" size={18} />, badge: approvalsCount },
  { label: "Vendors", href: "#vendors", icon: <Users aria-hidden="true" size={18} /> },
  { label: "Activity Log", href: "#activity-log", icon: <Activity aria-hidden="true" size={18} /> }
];

export type WorkflowStep = "Draft RFQ" | "Select Vendors" | "Send" | "Compare" | "Award";

const workflowSteps: WorkflowStep[] = ["Draft RFQ", "Select Vendors", "Send", "Compare", "Award"];

export type Status =
  | "Drafting"
  | "Sent"
  | "Quotes In"
  | "Awaiting Approval"
  | "Compliant"
  | "Review";

type Tone = "cyan" | "green" | "amber" | "red" | "slate";

const toneClasses: Record<Tone, string> = {
  cyan: "border-[#29b6f6]/35 bg-[#29b6f6]/12 text-[#81cfff]",
  green: "border-[#34d399]/35 bg-[#34d399]/12 text-[#8ff0c7]",
  amber: "border-[#ffb95a]/40 bg-[#ffb95a]/12 text-[#ffd08b]",
  red: "border-[#ffb4ab]/40 bg-[#93000a]/25 text-[#ffb4ab]",
  slate: "border-[#87929b]/35 bg-[#273647]/60 text-[#d4e4fa]"
};

const statusTone: Record<Status, Tone> = {
  Drafting: "cyan",
  Sent: "slate",
  "Quotes In": "green",
  "Awaiting Approval": "amber",
  Compliant: "green",
  Review: "red"
};

const statusSlugs: Record<Status, string> = {
  Drafting: "drafting",
  Sent: "sent",
  "Quotes In": "quotes-in",
  "Awaiting Approval": "awaiting-approval",
  Compliant: "compliant",
  Review: "review"
};

export function AppShell({
  activeNav = "Dashboard",
  activeStep = "Draft RFQ",
  approvalsCount = 0,
  emailActionsCount = 0,
  inboxAddress = "bsl-procurement@agentmail.to",
  llmStatus,
  showWorkflowStepper = true,
  onNavigate,
  children
}: {
  activeNav?: NavLabel;
  activeStep?: WorkflowStep;
  approvalsCount?: number;
  emailActionsCount?: number;
  inboxAddress?: string;
  llmStatus?: {
    provider: string;
    model: string;
    baseUrl: string;
  };
  showWorkflowStepper?: boolean;
  onNavigate?: (label: NavLabel) => void;
  children: ReactNode;
}) {
  const navigation = navItems(approvalsCount);

  return (
    <div className="min-h-screen bg-stitch-background text-stitch-text-dim">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-stitch-sidebar border-r border-[#1e4369] bg-[#051424] px-4 py-5 lg:block">
        <div className="mb-8 flex items-center gap-3 px-2 text-white">
          <span className="flex h-9 w-9 items-center justify-center rounded-stitch-control bg-stitch-primary-container text-stitch-on-primary">
            <Bot aria-hidden="true" size={20} />
          </span>
          <div>
            <p className="text-label-sm font-semibold leading-4">Jill</p>
            <p className="text-[11px] uppercase text-stitch-text-muted">Procurement agent</p>
          </div>
        </div>

        <nav aria-label="Primary" className="space-y-1">
          {navigation.map((item) => {
            const active = item.label === activeNav;
            return (
              <button
                key={item.label}
                aria-current={active ? "page" : undefined}
                aria-label={typeof item.badge === "number" && item.badge > 0 ? `${item.label} ${item.badge}` : undefined}
                className={clsx(
                  "group relative flex min-h-10 w-full items-center gap-3 rounded-stitch-control px-3 py-2 text-left text-label-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stitch-primary-container",
                  active
                    ? "bg-[#0d1c2d] text-stitch-primary"
                    : "text-stitch-text-muted hover:bg-[#0d1c2d] hover:text-stitch-text-dim"
                )}
                onClick={() => onNavigate?.(item.label as NavLabel)}
                type="button"
              >
                {active ? <span aria-hidden="true" className="absolute left-0 h-6 w-1 rounded-full bg-stitch-primary-container" /> : null}
                {item.icon}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {typeof item.badge === "number" && item.badge > 0 ? (
                  <span className="rounded-full bg-stitch-primary-container px-2 py-0.5 text-[11px] font-semibold text-stitch-on-primary">
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

      </aside>

      <div className="lg:pl-stitch-sidebar">
        <header className="sticky top-0 z-20 border-b border-[#1e4369] bg-[#051424]/95 bg-stitch-grid bg-[length:24px_24px] backdrop-blur">
          <div className="flex min-h-stitch-topbar flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
            <div className="flex items-center gap-3 text-white">
              <AgentBadge label="Jill" />
              <span className="hidden text-label-sm text-stitch-text-muted sm:inline">AI Procurement Agent</span>
            </div>
            <div className="flex flex-1 items-center gap-3 md:max-w-xl">
              <label className="relative flex-1">
                <span className="sr-only">Search Jill workspace</span>
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stitch-text-muted" size={17} />
                <input
                  aria-label="Search Jill workspace"
                  className="h-10 w-full rounded-stitch-control border border-[#1e4369] bg-[#081b2e] pl-10 pr-3 text-label-sm text-white placeholder:text-stitch-text-muted focus:border-stitch-primary-container focus:outline-none focus:ring-2 focus:ring-stitch-primary-container/40"
                  placeholder="Search RFQs, vendors, approvals"
                  type="search"
                />
              </label>
              <div
                aria-label="Buyer avatar"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#1e4369] bg-[#122131] text-label-sm font-semibold text-white"
                role="img"
              >
                JB
              </div>
            </div>
          </div>
          {showWorkflowStepper ? (
            <div className="border-t border-[#1e4369]/70 px-4 py-3 md:px-6">
              <WorkflowStepper activeStep={activeStep} />
            </div>
          ) : null}
          <nav aria-label="Mobile primary" className="flex gap-2 overflow-x-auto border-t border-[#1e4369]/70 px-4 py-3 lg:hidden">
            {navigation.map((item) => {
              const active = item.label === activeNav;
              return (
                <button
                  key={item.label}
                  className={clsx(
                    "inline-flex shrink-0 items-center gap-2 rounded-stitch-control border px-3 py-2 text-label-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stitch-primary-container",
                    active ? "border-stitch-primary-container bg-[#29b6f6]/12 text-stitch-primary" : "border-[#1e4369] bg-[#0d1c2d] text-stitch-text-muted"
                  )}
                  onClick={() => onNavigate?.(item.label as NavLabel)}
                  type="button"
                >
                  {item.icon}
                  {item.label}
                  {typeof item.badge === "number" && item.badge > 0 ? (
                    <span className="rounded-full bg-stitch-primary-container px-2 py-0.5 text-[11px] font-semibold text-stitch-on-primary">{item.badge}</span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </header>

        <main className="px-4 py-5 md:px-6">{children}</main>

        <div className="sticky bottom-0 z-20 border-t border-[#1e4369] bg-[#051424]/95 px-4 py-3 lg:fixed lg:bottom-5 lg:left-4 lg:w-[calc(var(--sidebar-width)-32px)] lg:border-0 lg:bg-transparent lg:p-0">
          <JillStatus inboxAddress={inboxAddress} emailActionsCount={emailActionsCount} llmStatus={llmStatus} />
        </div>
      </div>
    </div>
  );
}

export function WorkflowStepper({ activeStep }: { activeStep: WorkflowStep }) {
  const activeIndex = workflowSteps.indexOf(activeStep);

  return (
    <ol aria-label="Procurement workflow" className="grid gap-2 sm:grid-cols-5">
      {workflowSteps.map((step, index) => {
        const state = index < activeIndex ? "done" : index === activeIndex ? "active" : "upcoming";
        return (
          <li
            key={step}
            aria-current={state === "active" ? "step" : undefined}
            className={clsx(
              "flex items-center gap-2 rounded-stitch-control border px-3 py-2 text-label-sm",
              state === "active" && "border-stitch-primary-container bg-[#29b6f6]/12 text-stitch-primary",
              state === "done" && "border-[#34d399]/25 bg-[#34d399]/10 text-[#8ff0c7]",
              state === "upcoming" && "border-[#1e4369] bg-[#0d1c2d] text-stitch-text-muted"
            )}
            data-state={state}
          >
            <span
              className={clsx(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                state === "active" && "border-stitch-primary-container bg-stitch-primary-container text-stitch-on-primary",
                state === "done" && "border-[#34d399] bg-[#34d399] text-[#05291b]",
                state === "upcoming" && "border-[#87929b] text-[#87929b]"
              )}
            >
              {state === "done" ? <Check aria-hidden="true" size={13} /> : <Circle aria-hidden="true" size={9} fill="currentColor" />}
            </span>
            <span className="truncate">{step}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function JillStatus({
  inboxAddress = "bsl-procurement@agentmail.to",
  emailActionsCount = 0,
  llmStatus
}: {
  inboxAddress?: string;
  emailActionsCount?: number;
  llmStatus?: {
    provider: string;
    model: string;
    baseUrl: string;
  };
}) {
  return (
    <section aria-label="Jill email status" className="rounded-stitch border border-[#1e4369] bg-[#0d1c2d] p-3">
      <div className="flex items-center gap-2 text-label-sm text-white">
        <Mail aria-hidden="true" className="text-stitch-primary" size={16} />
        <span className="truncate">{inboxAddress}</span>
      </div>
      <p className="mt-1 text-[12px] leading-4 text-stitch-text-muted">{emailActionsCount} email actions</p>
      {llmStatus ? (
        <div className="mt-3 border-t border-[#1e4369] pt-3 text-[12px] leading-4">
          <div className="flex items-center gap-2 text-white">
            <Bot aria-hidden="true" className="text-stitch-primary" size={16} />
            <span className="truncate">{llmStatus.model}</span>
          </div>
          <p className="mt-1 truncate text-stitch-text-muted">{llmStatus.provider} model</p>
          <p className="mt-1 truncate text-stitch-text-muted" title={llmStatus.baseUrl}>{llmStatus.baseUrl}</p>
        </div>
      ) : null}
    </section>
  );
}

export function AgentBadge({ label = "Jill" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-stitch-primary-container/40 bg-[#29b6f6]/12 px-3 py-1 text-label-sm font-semibold text-stitch-primary">
      <Sparkles aria-hidden="true" size={15} />
      {label}
    </span>
  );
}

export function Card({ title, children, className, ...props }: HTMLAttributes<HTMLElement> & { title?: string; children: ReactNode }) {
  return (
    <section className={clsx("rounded-stitch border border-[#1e4369] bg-[#12314e] p-stitch-card shadow-stitch-soft", className)} {...props}>
      {title ? (
        <>
          <p className="text-section-label uppercase text-stitch-text-muted">{title}</p>
          <div className="mt-1 mb-4 h-0.5 w-4 rounded-full bg-stitch-primary-container" />
        </>
      ) : null}
      {children}
    </section>
  );
}

export function MetricCard({ value, label, trend }: { value: string; label: string; trend?: string }) {
  return (
    <Card className="relative min-h-36">
      <p className="text-metric-lg text-stitch-primary-container">{value}</p>
      <p className="mt-2 text-section-label uppercase text-stitch-text-muted">{label}</p>
      {trend ? <p className="absolute bottom-5 right-5 text-label-sm text-[#8ff0c7]">{trend}</p> : null}
    </Card>
  );
}

export function Pill({ tone = "slate", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={clsx("inline-flex rounded-full border px-2.5 py-1 text-label-sm font-medium", toneClasses[tone])}>{children}</span>;
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={clsx("inline-flex rounded-full border px-2.5 py-1 text-label-sm font-medium", toneClasses[statusTone[status]])} data-status={statusSlugs[status]}>
      {status}
    </span>
  );
}

export function Button({ variant = "primary", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" }) {
  return (
    <button
      className={clsx(
        "inline-flex min-h-10 items-center justify-center rounded-stitch-control px-4 py-2 text-label-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stitch-primary-container disabled:cursor-not-allowed disabled:opacity-55",
        variant === "primary" && "bg-stitch-primary-container text-stitch-on-primary hover:bg-[#81cfff]",
        variant === "secondary" && "border border-stitch-primary-container bg-transparent text-stitch-primary hover:bg-[#29b6f6]/12",
        className
      )}
      type="button"
      {...props}
    />
  );
}

export function Table({ caption, columns, rows }: { caption: string; columns: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-stitch border border-[#1e4369]">
      <table className="w-full min-w-[520px] border-collapse bg-[#122131] text-left" aria-label={caption}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-[#1e4369]">
            {columns.map((column) => (
              <th key={column} className="px-4 py-3 text-section-label uppercase text-stitch-text-muted">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-[#1e4369] last:border-b-0">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-3 text-body-md text-stitch-text-dim">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Callout({ title = "Jill's recommendation", children }: { title?: string; children: ReactNode }) {
  return (
    <aside className="rounded-stitch border border-stitch-primary-container/40 bg-[#29b6f6]/10 p-stitch-card">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-stitch-control bg-stitch-primary-container text-stitch-on-primary">
          <Bot aria-hidden="true" size={17} />
        </span>
        <div>
          <p className="text-section-label uppercase text-stitch-primary">{title}</p>
          <div className="mt-1 mb-3 h-0.5 w-4 rounded-full bg-stitch-primary-container" />
          <div className="text-body-md text-stitch-text-dim">{children}</div>
        </div>
      </div>
    </aside>
  );
}

export function ActivityFeedItem({ actor = "Jill", timestamp, children }: { actor?: string; timestamp: string; children: ReactNode }) {
  return (
    <article className="flex gap-3 border-b border-[#1e4369] py-3 last:border-b-0">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stitch-primary-container text-stitch-on-primary">
        <Bot aria-hidden="true" size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="text-label-sm font-semibold text-white">{actor}</p>
          <time className="text-[12px] leading-4 text-stitch-text-muted">{timestamp}</time>
        </div>
        <div className="mt-1 text-body-md text-stitch-text-dim">{children}</div>
      </div>
    </article>
  );
}

export function SendIcon() {
  return <Send aria-hidden="true" size={16} />;
}
