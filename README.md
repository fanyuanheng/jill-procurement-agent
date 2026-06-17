# Jill - AI Procurement Agent

Jill is an email-first procurement agent for the "3 Bids and a Buy" workflow. A junior buyer starts with a messy request; Jill structures the RFQ, recommends suppliers, sends the RFQ through AgentMail, normalizes vendor quote replies, recommends an award, and issues a purchase order after buyer approval.

The app is a single Next.js App Router repo with frontend screens and backend route handlers together. State is intentionally lightweight: an in-memory server store plus React state in the client.

## 5-screen flow

1. **Buyer Dashboard** - Shows savings metrics, active RFQs, pending approval, Jill's activity feed, and Jill's AgentMail inbox status.
2. **Structured RFQ Draft** - Sends the buyer's free-form request to the server-side AI route and renders Jill-filled RFQ fields with confirmation flags.
3. **Supplier Selection** - Shows vendor cards from the store, preselects Jill's recommended three vendors, and sends the RFQ via AgentMail.
4. **Quote Comparison** - Reads quote replies, calls the server-side normalization route, and renders a vendor-by-vendor comparison with Jill's recommendation.
5. **Award & PO Issuance** - Shows the award summary, compliance checklist, audit trail, and emails the purchase order to the winning vendor.

## Setup

```bash
npm install
cp .env.example .env.local
```

`.env.example` includes:

```bash
LLM_PROVIDER=local
LLM_BASE_URL=http://100.121.222.58:8082/v1
LLM_MODEL=qwen3.6:27b-64k
AGENTMAIL_API_KEY=
AGENTMAIL_INBOX_ID=bsl-procurement@agentmail.to
AGENTMAIL_INBOX_ADDRESS=bsl-procurement@agentmail.to
AGENTMAIL_WEBHOOK_SECRET=
```

## Run locally

Jill's AI routes call the local OpenAI-compatible model by default:

```bash
http://100.121.222.58:8082/v1
model: qwen3.6:27b-64k
```

Start the app with:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## AgentMail

AgentMail runs live when `AGENTMAIL_API_KEY` is set. Jill sends RFQs from the configured inbox and reads supplier replies from AgentMail before normalizing quotes.

```bash
AGENTMAIL_API_KEY=... \
AGENTMAIL_INBOX_ID=bsl-procurement@agentmail.to \
npm run dev
```

For local automated tests, the Playwright config starts Next.js with `DEMO_MODE=simulation` so the test suite does not send external email.

```bash
DEMO_MODE=simulation npm run dev
```

If the local model or live email call fails, the UI keeps the buyer on the current step and shows the error instead of fabricating a successful send.

## Stitch design assets

The Stitch source project is `Jill AI Procurement Agent` (`13204685104123019449`).

- Retrieved HTML/CSS: `design/stitch/`
- Extracted design tokens: `design/stitch/design-system/tokens.json`
- Screen screenshots: `public/stitch/`
- Tailwind/CSS tokens: `tailwind.config.ts` and `app/globals.css`

## Useful commands

```bash
npm run dev        # start Next.js with your current environment
npm run lint       # eslint
npm test           # vitest unit/integration tests
npm run build      # production build
```

## 60-second walkthrough

**0-10 seconds: Buyer Dashboard**

Click **New Request**. Say: "Jill starts in the buyer's workspace. The dashboard shows active RFQs, savings impact, pending approvals, and a live email-action counter tied to Jill's AgentMail inbox."

**10-22 seconds: Structured RFQ Draft**

Click **Draft RFQ** if the draft is not already running, then wait for Jill's structured fields. Say: "The buyer gives Jill a messy request. Jill turns it into a structured RFQ with quantity, specs, delivery date, budget, compliance notes, and fields that need buyer confirmation."

Click **Approve & continue to vendors**.

**22-34 seconds: Supplier Selection**

Review the cyan-highlighted recommended vendors, optionally toggle a checkbox, then click **Send RFQ via AgentMail**. Say: "Jill recommends suppliers from the vendor directory. The RFQ is emailed from Jill's configured AgentMail inbox."

**34-48 seconds: Quote Comparison**

Wait for the normalized comparison table. Say: "Vendor replies arrive in inconsistent email formats. Jill normalizes them into one comparison: price, lead time, warranty, certifications, terms, compliance, and flags. Jill highlights the recommended award and expected savings."

Click **Send to approval**.

**48-60 seconds: Award & PO Issuance**

Review the award summary and compliance checklist, then click **Approve & issue PO**. Say: "The buyer makes the final approval. Jill issues the purchase order, emails the winning vendor, and leaves an audit trail of the workflow."
