# Jill Procurement Agent Design

## Goal

Build Jill as a working AI-first procurement product for the "3 Bids and a Buy" workflow. The product should let a buyer move from a free-form procurement need to an approved supplier award and generated PO, while Jill automates RFQ drafting, supplier selection, vendor follow-up, quote normalization, compliance checks, recommendation, and audit history.

## Product Shape

Jill is an email-first buyer workspace with a browser UI and a workflow API. The first release runs fully in local mock mode so the complete product can be demonstrated and tested without live credentials. A real AgentMail provider is included behind the same interface so live sending and inbound quote handling can be enabled later with `AGENTMAIL_API_KEY`.

## Core Workflow

1. Buyer enters a procurement request with title, category, needed-by date, budget, shipping location, and free-form technical requirements.
2. Jill converts the request into a structured RFQ package with scope, technical specifications, commercial terms, evaluation criteria, and response deadline.
3. Jill recommends suppliers from a seeded vendor master and highlights compliance issues such as missing diversity status, low reliability, or blocked regions.
4. Buyer approves outreach. Jill sends RFQs through a mock email provider by default, or AgentMail when configured.
5. Vendor responses enter the quote inbox. Mock mode can simulate vendor replies; AgentMail mode receives `message.received` events through webhook or polling/WebSocket integration.
6. Jill normalizes messy quote content into a comparable table with price, lead time, payment terms, warranty, exceptions, confidence score, and risk notes.
7. Jill recommends an award based on weighted price, delivery, supplier reliability, and compliance.
8. Buyer approves the award. Jill generates a PO and records the audit trail.

## Architecture

The app uses Next.js with TypeScript. The frontend is a dense operational command center rather than a marketing page. The backend exposes route handlers for RFQ creation, outreach, quote simulation, quote receipt, award approval, and state retrieval. Persistence uses a local JSON database file for this build because the product must run immediately in an empty workspace without external database setup. The domain logic is isolated in focused modules so SQLite or Postgres can replace the store later.

## Components

- `src/lib/types.ts`: domain types for RFQs, vendors, quotes, decisions, emails, and audit events.
- `src/lib/seed.ts`: seeded supplier, item, and quote data for a realistic demo.
- `src/lib/store.ts`: JSON-backed persistence with reset and mutation helpers.
- `src/lib/rfq.ts`: RFQ drafting, supplier matching, compliance checks, quote normalization, scoring, recommendation, and PO generation.
- `src/lib/email/mockProvider.ts`: local email ledger and quote simulation.
- `src/lib/email/agentmailProvider.ts`: AgentMail-ready adapter using documented send and webhook concepts.
- `src/app/api/*`: route handlers that operate the workflow.
- `src/app/page.tsx`: buyer workspace UI.
- `src/app/globals.css`: visual system and responsive layout.

## AI-First Behavior

Jill should feel like an agent doing procurement work, not a form wrapper. The UI shows an agent activity stream, explains recommendations, extracts structured specs from rough text, makes next-best-action suggestions, and carries forward evidence into the audit trail. Generated outputs are deterministic in this build so tests are stable, but the code leaves clear integration points for LLM-backed extraction and quote parsing.

## AgentMail Integration

AgentMail is optional in the first release. The app reads `EMAIL_PROVIDER=mock|agentmail`, `AGENTMAIL_API_KEY`, and `AGENTMAIL_INBOX_ID`. In AgentMail mode, outbound RFQs use the AgentMail inbox message send endpoint pattern. Inbound email events are accepted by `/api/webhooks/agentmail`, which handles `message.received` payloads and routes replies into the quote normalizer. Webhook signature verification is documented as a production hardening step and the route preserves raw payload handling boundaries for adding Svix verification.

## Error Handling

The UI must surface operational errors as buyer-readable status messages. The backend validates required fields, returns stable JSON errors, and records important failed attempts in the audit trail. Quote parsing should tolerate incomplete vendor content and mark confidence/risk rather than dropping responses.

## Testing

Unit tests cover RFQ drafting, supplier matching, quote normalization, scoring, recommendation, and store mutations. API tests cover the main workflow endpoints. Browser tests cover the buyer journey from RFQ creation to PO generation. Build and lint checks must pass before completion.

## Scope Boundary

This release does not implement live ERP authentication, production database migrations, real PO posting, domain DNS setup, or LLM API calls. It implements the full product workflow locally with realistic seams for those systems.
