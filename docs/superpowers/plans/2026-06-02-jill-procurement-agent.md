# Jill Procurement Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working AI-first Jill Procurement Agent product for RFQ drafting, supplier outreach, quote normalization, award approval, and PO generation.

**Architecture:** Next.js TypeScript app with a dense procurement workspace UI, API route handlers, domain logic modules, JSON-backed local persistence, mock email mode, and an AgentMail-ready provider. The app runs end-to-end without credentials while preserving clear integration points for real email and ERP systems.

**Tech Stack:** Next.js, React, TypeScript, Vitest, Testing Library, Playwright, local JSON persistence, optional AgentMail REST integration.

---

## File Structure

- Create `package.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `.gitignore`.
- Create `src/lib/types.ts` for domain contracts.
- Create `src/lib/seed.ts` for demo vendors, default RFQ data, and mock quote payloads.
- Create `src/lib/rfq.ts` for deterministic agent behavior.
- Create `src/lib/store.ts` for JSON-backed state.
- Create `src/lib/email/mockProvider.ts` and `src/lib/email/agentmailProvider.ts` for email providers.
- Create `src/app/api/*/route.ts` endpoints for workflow operations.
- Create `src/app/page.tsx`, `src/app/layout.tsx`, and `src/app/globals.css` for the app UI.
- Create `tests/unit/rfq.test.ts`, `tests/unit/store.test.ts`, and `tests/e2e/jill.spec.ts`.

## Tasks

### Task 1: Scaffold and Test Harness

- [ ] Create project config and install dependencies.
- [ ] Add Vitest and Playwright configuration.
- [ ] Add scripts: `dev`, `build`, `test`, `test:e2e`, `lint`.
- [ ] Verify `npm test` runs with no tests.

### Task 2: Domain Model and RFQ Agent Logic

- [ ] Write failing tests for RFQ generation, supplier matching, quote normalization, and recommendation.
- [ ] Implement domain types, seed data, and RFQ logic.
- [ ] Run unit tests and keep them passing.

### Task 3: Local Store and Email Providers

- [ ] Write failing tests for store initialization, RFQ creation, outreach state, quote insertion, and award approval.
- [ ] Implement JSON store.
- [ ] Implement mock email provider and AgentMail provider interface.
- [ ] Run unit tests and keep them passing.

### Task 4: Workflow API

- [ ] Add route handlers for `GET /api/state`, `POST /api/rfqs`, `POST /api/rfqs/:id/send`, `POST /api/rfqs/:id/simulate-quotes`, `POST /api/rfqs/:id/award`, `POST /api/webhooks/agentmail`, and `POST /api/reset`.
- [ ] Add API validation and stable JSON error responses.
- [ ] Exercise routes through browser/e2e flow rather than overfitting unit tests to Next internals.

### Task 5: Buyer Workspace UI

- [ ] Build a polished operational UI with request intake, generated RFQ, supplier shortlist, activity stream, email ledger, quote comparison, recommendation, and PO panel.
- [ ] Use responsive layout and avoid marketing-page treatment.
- [ ] Make primary workflow controls obvious and stateful.

### Task 6: End-to-End Verification

- [ ] Add Playwright test covering reset, RFQ creation, outreach send, quote simulation, recommendation, award, and visible PO.
- [ ] Run unit tests, e2e tests, lint, and production build.
- [ ] Fix failures until verification is clean.

## Self-Review

The plan covers the spec workflow from intake through PO generation, includes AgentMail as an optional provider, and leaves external ERP/LLM integrations out of scope. There are no placeholder requirements; each task has a test or verification checkpoint. Type names and routes are consistent with the architecture section.
