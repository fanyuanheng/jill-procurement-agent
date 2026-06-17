import { readFileSync, writeFileSync } from "node:fs";

const publicBaseUrl = process.argv[2];
if (!publicBaseUrl) {
  console.error("Usage: npm run setup:agentmail-webhook -- https://your-public-domain.example");
  process.exit(1);
}

const envPath = ".env.local";
const envText = readFileSync(envPath, "utf8");
const env = Object.fromEntries(
  envText
    .split(/\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    })
);

const apiKey = env.AGENTMAIL_API_KEY;
if (!apiKey) {
  console.error("Missing AGENTMAIL_API_KEY in .env.local");
  process.exit(1);
}

const endpoint = new URL("/api/webhooks/agentmail", publicBaseUrl).toString();
const response = await fetch("https://api.agentmail.to/v0/webhooks", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    url: endpoint,
    event_types: ["message.received"],
    client_id: "jill-procurement-agent"
  })
});

const rawBody = await response.text();
let body = {};
try {
  body = JSON.parse(rawBody);
} catch {
  body = { rawBody };
}

if (!response.ok) {
  console.error(JSON.stringify({ ok: false, status: response.status, body }, null, 2));
  process.exit(1);
}

const secret = body.secret;
if (!secret) {
  console.error("AgentMail created the webhook, but no signing secret was returned. Fetch the webhook in AgentMail and set AGENTMAIL_WEBHOOK_SECRET manually.");
  console.log(JSON.stringify({ ok: true, webhook_id: body.webhook_id ?? body.id, endpoint }, null, 2));
  process.exit(0);
}

const nextEnv = envText.includes("AGENTMAIL_WEBHOOK_SECRET=")
  ? envText.replace(/^#?\s*AGENTMAIL_WEBHOOK_SECRET=.*$/m, `AGENTMAIL_WEBHOOK_SECRET=${secret}`)
  : `${envText.trimEnd()}\nAGENTMAIL_WEBHOOK_SECRET=${secret}\n`;

writeFileSync(envPath, nextEnv, { mode: 0o600 });
console.log(JSON.stringify({ ok: true, webhook_id: body.webhook_id ?? body.id, endpoint, secret_written: true }, null, 2));
