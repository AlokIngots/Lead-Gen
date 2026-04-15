# Alok LMS — n8n workflows

This folder contains the n8n workflows that drive outbound drip and inbound reply tracking for the LMS.

| File | Purpose | Trigger |
|---|---|---|
| `drip_scheduler.json` | Hourly scheduler that fetches due leads and sends email / LinkedIn / WhatsApp / call alerts | Schedule (every 1h) |
| `ses_reply_webhook.json` | Inbound webhook that converts an AWS SES → SNS reply notification into a `replied` event + SC notification | Webhook `POST /webhook/ses-reply` |

Both workflows talk to the LMS API at `LMS_API_URL` (default `https://lms.alokindia.co.in/api`).

---

## 1 · Importing into n8n

1. Open n8n at `https://n8n.alokindia.co.in`.
2. Click **Workflows → Import from file** and pick `drip_scheduler.json`. Repeat for `ses_reply_webhook.json`.
3. Save each workflow (don't activate yet).
4. After configuring credentials and env vars (below), open each workflow and click **Active** in the top-right.

---

## 2 · Required credentials

Create these inside **n8n → Credentials → New** before activating the workflows:

| Credential name | Type | Used by | Configuration |
|---|---|---|---|
| `LMS Bearer` | Header Auth | All HTTP nodes that call the LMS API | Name: `Authorization`, Value: `Bearer <LMS_API_TOKEN>` |
| `AWS SES` | AWS | `AWS SES — Send email` node | Standard AWS keys with `ses:SendEmail` permission in the configured region |

Unipile and Interakt do not need n8n credential entries — they read API keys from environment variables (next section).

---

## 3 · Required environment variables

Set these in n8n's host environment (e.g. `.env` for the n8n container, or `Settings → Environments`):

| Var | Example | Notes |
|---|---|---|
| `LMS_API_URL` | `https://lms.alokindia.co.in/api` | Base URL of the FastAPI backend; no trailing slash |
| `LMS_API_TOKEN` | `eyJhbGciOi…` | Long-lived bearer token used by the `LMS Bearer` credential. Generate one via `POST /auth/login` for an admin user, or mint a service token. |
| `UNIPILE_API_KEY` | `xxxxxxxx` | Unipile X-API-KEY for the LinkedIn account `je2GwI0gQdeg_j1f-RjHTQ` |
| `INTERAKT_API_KEY` | `base64:xxxx==` | Interakt API key (already base64-encoded; the workflow prepends `Basic ` automatically) |

Restart n8n after changing env vars so the new values are picked up.

---

## 4 · Drip scheduler — what it does

Every hour the workflow runs:

1. **Schedule trigger** fires (interval = 1 hour).
2. **`GET /drip/due`** returns up to 200 lead-step rows whose `next_run_at <= NOW()` and whose campaign is `active`.
3. **Split out items** loops one row at a time.
4. **Switch by channel** routes each item to one of four branches based on `channel`:
   - `email` → AWS SES → `POST /drip/log` (event_type=sent)
   - `linkedin` → Unipile invitation → `POST /drip/log`
   - `whatsapp` → Score gate (≥ 30) → Interakt template → `POST /drip/log`
   - `call_alert` → Interakt text to the assigned SC's WhatsApp → `POST /drip/log`
5. After every branch the row is funnelled into **`POST /drip/advance`**, which:
   - increments `lead_drip_state.current_step`
   - computes `next_run_at` from the next step's `delay_days` / `delay_hours`
   - marks the drip `completed` if there is no next step

> **Template variable substitution** is done inline in each node using `template_subject` / `template_body` from the `/drip/due` payload — the placeholders `{{contact_name}}` and `{{company}}` are replaced with the lead's values.

---

## 5 · SES reply webhook — what it does

1. SES delivers an inbound reply to an SES rule.
2. The SES rule publishes an SNS notification to a topic.
3. SNS HTTPS subscription posts the notification to `https://n8n.alokindia.co.in/webhook/ses-reply`.
4. The workflow:
   - Parses the SNS-wrapped SES JSON to extract the sender's email address.
   - `GET /leads?q={email}` to find the matching lead (uses the existing search endpoint).
   - If a lead is found:
     - `POST /events` with `event_type=replied`, `score_delta=30`, notes "Email reply received via SES" — the events router will bump `lead.score`, mark `bounce/unsubscribed` flags as needed, and the score helper in `routers/drip.py` flips status to `engaged`.
     - `PATCH /leads/{id}` to set `status=engaged` (belt-and-braces in case the lead was already past `emailed`).
     - Looks up the assigned SC via `GET /users?role=sc` and sends a WhatsApp alert via Interakt with a follow-up link.
   - Always responds 200 to SES so the message is not retried.

> **Backup endpoint:** the FastAPI backend also exposes `POST /drip/webhook/reply` for direct posting (useful for manual curl tests or alternative inbound integrations). Same effect as the n8n flow but without the SC notification.

---

## 6 · AWS SES inbound setup

You only need to do this once per receiving address.

1. **Verify the receiving domain** in the SES console for `alokindia.com` and add the published MX record (`inbound-smtp.<region>.amazonaws.com`).
2. Create an **SNS topic**, e.g. `lms-ses-replies`. Set the topic's "Display name" to anything memorable.
3. Create an **HTTPS subscription** on that topic pointing at:
   `https://n8n.alokindia.co.in/webhook/ses-reply`
   Confirm the subscription from the n8n logs (the workflow returns 200 to the confirmation request automatically once activated).
4. In SES → **Email receiving → Rule sets**, create a rule for `exports@alokindia.com` (or whichever address replies should land on) with:
   - **Recipient:** `exports@alokindia.com`
   - **Action 1:** Publish to SNS topic → `lms-ses-replies`
   - (Optional) **Action 2:** Store the raw email in S3 for audit.
5. Activate the rule set.

Once active, every reply to the SES receiving address fires the workflow within seconds.

---

## 7 · Smoke test checklist

- [ ] `curl https://lms.alokindia.co.in/api/drip/due` returns `[]` or due rows with bearer.
- [ ] Manually run the drip workflow once (n8n → Execute Workflow). Confirm rows in `campaign_events` and that `lead_drip_state.current_step` advanced.
- [ ] `curl -X POST https://lms.alokindia.co.in/api/drip/webhook/reply -d '{"email":"test@example.com"}' -H "Content-Type: application/json"` returns `{"matched": false}` (or `true` if the lead exists).
- [ ] Send a real email to `exports@alokindia.com` from a known lead address — confirm a `replied` event appears in the LMS within 30 seconds and the SC receives a WhatsApp alert.
