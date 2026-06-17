# AgentMail Production Setup

Jill supports two email modes:

- `EMAIL_PROVIDER=mock`: local demo mode, no external email.
- `EMAIL_PROVIDER=agentmail`: live AgentMail outbound RFQs and signed inbound webhook processing.

## Required Environment

Create `.env.local` from `.env.example` and set:

```bash
EMAIL_PROVIDER=agentmail
AGENTMAIL_API_KEY=your_agentmail_api_key
AGENTMAIL_INBOX_ID=your_agentmail_inbox_id_or_address
AGENTMAIL_WEBHOOK_SECRET=whsec_your_svix_signing_secret
```

For first live setup, route all outbound RFQs to a controlled inbox:

```bash
AGENTMAIL_TEST_RECIPIENT=you@yourcompany.com
```

Remove `AGENTMAIL_TEST_RECIPIENT` only after vendor records contain approved real recipient addresses. Seeded supplier contacts are intentionally blank; enter them in the Supplier Directory before issuing live RFQs. Jill blocks missing supplier emails and seeded `example.test` vendor addresses in AgentMail mode unless this safe routing variable is set.

## Webhook

Configure AgentMail to send `message.received` events to:

```text
https://your-domain.example/api/webhooks/agentmail
```

The route reads the raw request body and verifies Svix headers with `AGENTMAIL_WEBHOOK_SECRET` before parsing a quote. Jill uses `X-Jill-RFQ-ID` and `X-Jill-Vendor-ID` headers from outbound RFQs to attach inbound replies to the right workflow.

For the current project, the AgentMail webhook should be configured as:

```text
URL: https://procure-bsl.aidigest.me/api/webhooks/agentmail
Event type: message.received
Client ID: jill-procurement-agent
```

`procure.bsl.aidigest.me` is routed through the same Cloudflare Tunnel, but Cloudflare Universal SSL does not cover this deeper hostname on the current zone setup. Use `https://procure-bsl.aidigest.me` for AgentMail unless Cloudflare Total TLS, Advanced Certificate Manager, or a custom edge certificate is enabled for `*.bsl.aidigest.me`.

If you are testing locally, start the app and expose port 3000 with a tunnel:

```bash
npm run dev
cloudflared tunnel --url http://localhost:3000
```

Use the public `https://...trycloudflare.com` URL from cloudflared:

```text
https://<cloudflared-host>/api/webhooks/agentmail
```

After you have a public base URL, this helper creates the AgentMail webhook and writes the returned signing secret into `.env.local`:

```bash
npm run setup:agentmail-webhook -- https://<your-public-app-domain>
```

For this setup, the command used was:

```bash
npm run setup:agentmail-webhook -- https://procure-bsl.aidigest.me
```

## Verification

After setting credentials:

```bash
npm run build
npm test
npm run dev
```

Then create an RFQ and click **Send RFQ**. In test-recipient mode, all outbound RFQs should arrive at `AGENTMAIL_TEST_RECIPIENT`. Reply with quote text including price, lead time, payment terms, and warranty to verify webhook ingestion.
