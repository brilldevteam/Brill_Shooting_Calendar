# Delivery and integration contracts

Accounts, sessions, PostgreSQL and private files run locally. Super Admin creates users and shares a one-time temporary password privately; users must change it at first sign-in. No cloud authentication service is required.

## Email

The built-in adapter uses the Resend-compatible HTTP contract:

```
POST EMAIL_API_URL
Authorization: Bearer EMAIL_API_KEY
Idempotency-Key: <notification UUID>
{"from":"...","to":["..."],"subject":"...","text":"..."}
```

Success must return JSON containing `id`. Configure a verified sender. Approval creates a mandatory email outbox entry inside the same transaction as confirmation. Failure to deliver never rolls back an approved booking; failed delivery is visible and retryable. Disabled customized templates fall back to the mandatory default message.

## WhatsApp

Point `WHATSAPP_WEBHOOK_URL` at your provider adapter. This keeps booking logic independent of Meta, Twilio or another provider.

```
POST WHATSAPP_WEBHOOK_URL
Authorization: Bearer WHATSAPP_WEBHOOK_TOKEN
Idempotency-Key: <notification UUID>
{"to":"international phone","subject":"event title","body":"rendered text"}
```

The adapter must return `{"id":"provider-message-id"}` on successful acceptance, honor idempotency keys, and handle any provider template/opt-in requirements. Unavailable WhatsApp falls back to email; the fallback is recorded. Phone numbers and destinations never come from arbitrary client form fields in a booking command.

## Background worker

The persistent Node server runs an outbox worker every minute by default. Set ENABLE_NOTIFICATION_WORKER=false to disable it. Alternatively, configure a scheduler to POST `/api/jobs` every minute using `Authorization: Bearer <CRON_SECRET>`. Use a random secret of at least 32 characters. The endpoint rejects missing/invalid credentials. `scripts/run-jobs.mjs` reads environment configuration and invokes it without placing secrets in command history.

Notifications are claimed with `FOR UPDATE SKIP LOCKED`. Processing leases become recoverable after 10 minutes. Each batch contains up to 25 notifications and 25 Shooting Log records; providers must honor idempotency keys so retries after a network timeout cannot duplicate delivery. Configure hosting request timeout to accommodate sequential provider requests, or run smaller, frequent batches on a long-running Node host. Failed messages require an admin retry from Notifications; queued messages resume automatically.

## Shooting Log

Completion always creates one local `shooting_logs` record with a unique source booking. External delivery is optional and never simulated.

```
POST SHOOTING_LOG_WEBHOOK_URL
Authorization: Bearer SHOOTING_LOG_WEBHOOK_TOKEN
Idempotency-Key: <local shooting log UUID>
```

JSON includes source booking reference, client account, shoot date, approval timestamp, planned start/end, location, subject, script/content-plan received timestamps, standard/urgent shoot type, private supporting-document references, actual start/end, production notes and post-shoot confirmation. Success must return `{"id":"external-log-id"}`. Treat repeated keys as an upsert so admin production-detail updates refresh the external record. Storage references are private paths, not public URLs; use an independently authorized server integration for file access.

Unconfigured or failed delivery remains visibly `failed`, with a reason. Use Update / retry in Shooting Log after configuring the adapter. The remote API and credentials were not supplied and external interoperability must be verified against the real target.
