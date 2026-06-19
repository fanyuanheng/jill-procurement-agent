import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ActivityFeedItem,
  AgentBadge,
  AppShell,
  Button,
  Callout,
  Card,
  JillStatus,
  MetricCard,
  Pill,
  StatusBadge,
  Table,
  WorkflowStepper
} from "../../components";

describe("shared shell", () => {
  it("renders the persistent navigation, top bar, search, avatar, and Jill status", () => {
    render(
      <AppShell
        activeNav="Dashboard"
        activeStep="Select Vendors"
        approvalsCount={3}
        emailActionsCount={12}
        inboxAddress="jill@agentmail.to"
        llmStatus={{ provider: "local", model: "qwen3.6:27b-64k", baseUrl: "http://100.121.222.58:8082/v1" }}
      >
        <h2>Dashboard content</h2>
      </AppShell>
    );

    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Dashboard" })[0]).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: /Active RFQs 3/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quote Comparisons" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approvals/ })).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search Jill workspace" })).toBeInTheDocument();
    expect(screen.getByLabelText("Buyer avatar")).toBeInTheDocument();
    expect(screen.getByLabelText("Active LLM model")).toHaveTextContent("local qwen3.6:27b-64k");
    expect(screen.getByText("jill@agentmail.to")).toBeInTheDocument();
    expect(screen.getByText("12 email actions")).toBeInTheDocument();
    expect(screen.getAllByText("qwen3.6:27b-64k").length).toBeGreaterThan(0);
    expect(screen.getByText("local model")).toBeInTheDocument();
    expect(screen.getByText("Dashboard content")).toBeInTheDocument();
  });

  it("can hide the workflow stepper on workspace-level pages", () => {
    render(
      <AppShell activeNav="Dashboard" activeStep="Draft RFQ" showWorkflowStepper={false}>
        <h2>Dashboard content</h2>
      </AppShell>
    );

    expect(screen.queryByRole("list", { name: "Procurement workflow" })).not.toBeInTheDocument();
  });
});

describe("WorkflowStepper", () => {
  it("marks previous steps done, current step active, and later steps upcoming", () => {
    render(<WorkflowStepper activeStep="Compare" />);

    expect(screen.getByRole("list", { name: "Procurement workflow" })).toBeInTheDocument();
    expect(screen.getByText("Draft RFQ").closest("li")).toHaveAttribute("data-state", "done");
    expect(screen.getByText("Select Vendors").closest("li")).toHaveAttribute("data-state", "done");
    expect(screen.getByText("Send").closest("li")).toHaveAttribute("data-state", "done");
    expect(screen.getByText("Compare").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Award").closest("li")).toHaveAttribute("data-state", "upcoming");
  });
});

describe("Stitch primitives", () => {
  it("renders metrics, status badges, tables, callouts, feed items, and the agent badge", () => {
    render(
      <div>
        <MetricCard value="18" label="Active RFQs" trend="+4 this week" />
        <Pill tone="cyan">Drafting</Pill>
        <StatusBadge status="Awaiting Approval" />
        <Card title="Supplier shortlist">Three vendors selected.</Card>
        <Table
          caption="Quote comparison"
          columns={["Vendor", "Price"]}
          rows={[
            ["Acme Industrial", "$12,400"],
            ["Northstar Supply", "$12,980"]
          ]}
        />
        <Callout title="Jill's recommendation">Award Acme Industrial.</Callout>
        <ActivityFeedItem actor="Jill" timestamp="2 min ago">
          Sent RFQ to three vendors.
        </ActivityFeedItem>
        <AgentBadge label="AgentMail active" />
        <JillStatus inboxAddress="jill@agentmail.to" emailActionsCount={5} llmStatus={{ provider: "local", model: "qwen3.6:27b-64k", baseUrl: "http://100.121.222.58:8082/v1" }} />
        <Button>New Request</Button>
        <Button variant="secondary">Review Draft</Button>
      </div>
    );

    expect(screen.getByText("18")).toHaveClass("text-metric-lg");
    expect(screen.getByText("+4 this week")).toBeInTheDocument();
    expect(screen.getByText("Awaiting Approval")).toHaveAttribute("data-status", "awaiting-approval");
    expect(screen.getByRole("table", { name: "Quote comparison" })).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("Acme Industrial")).toBeInTheDocument();
    expect(screen.getByText("Jill's recommendation")).toBeInTheDocument();
    expect(screen.getByText("2 min ago")).toBeInTheDocument();
    expect(screen.getByText("AgentMail active")).toBeInTheDocument();
    expect(screen.getAllByText("qwen3.6:27b-64k").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "New Request" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review Draft" })).toBeInTheDocument();
  });
});
