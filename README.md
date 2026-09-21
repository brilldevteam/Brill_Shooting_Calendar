# Brill Creations Shooting Booking Calendar

A complete local Next.js application with embedded PostgreSQL (PGlite), password authentication, private files, client isolation and an immutable session ledger. Docker and Supabase are not required.

## Start locally

Requires Node.js 22.22+ and npm.

```powershell
npm.cmd install
npm.cmd run dev
```

Open http://localhost:3000. A fresh database opens first-administrator setup. Create the first administrator locally before exposing the server. Super Admin can then add organizations, contracts, resources and users. New users receive a temporary password displayed once to the administrator and must change it when signing in. Share temporary passwords privately.

For fictional demonstration data, run `npm.cmd run seed` **before starting the server**, against an empty database. It refuses to overwrite existing accounts. Random demo credentials are stored in the Git-ignored `.env.seed-accounts` file.

## Included workflows

- Role-aware dashboards; responsive month/week/day calendars; search and filters.
- Draft and standard requests, four full working-day lead time, urgent admin overrides, approval/rejection and alternative slots.
- Cancellations, reschedule approval, late deductions, justified exceptions, completion and no-show handling.
- Organizations, users, contracts, monthly allocations, future borrowing, carry-forward with expiry, adjustments and CSV ledger export.
- Resource and global availability blocks, transactional conflict checks and configurable pending-slot locking.
- Private categorized attachments with type/signature, size and count validation; authenticated downloads.
- Booking timelines, immutable audit history, notification templates/outbox/retries and local Shooting Logs.
- Configurable email, WhatsApp and external Shooting Log adapters. External delivery requires provider credentials.

Approval deducts a reservation immediately. Completion classifies that deduction without charging again. On-time cancellation restores it. Exactly the cancellation deadline counts as on time. Rescheduling retains the original confirmed slot until approval; late approval consumes the old session and reserves an additional one unless an administrator records an exception. Original allocations never change.

## Data and security

The application stores PostgreSQL under `.data/postgres` and uploads under `.data/uploads`. Set `APP_DATA_DIR` to an absolute persistent folder to relocate both. Migrations in `db/migrations` apply automatically and are checksum-verified. Do not edit an applied migration; add a new one.

Run **one Node application process** per data directory. An exclusive process lock prevents simultaneous seed/app processes. This deployment uses embedded PostgreSQL and is not designed for serverless hosting, replicas or PM2 cluster mode. Stop the application before copying the entire data directory for a consistent backup; restore the complete directory with the application stopped. Keep backups private.

Passwords use salted scrypt. Opaque session tokens are hashed in the database and sent in HttpOnly cookies. PostgreSQL row-level security scopes client data; authenticated transactions cannot directly modify protected tables. Server commands enforce roles and accounting rules. Files are served only after session and tenant checks.

## Configuration and deployment

Optional settings are documented in `.env.example`; copy it to `.env.local` when needed. Keep all secrets server-side. For production, build with `npm.cmd run build`, run `npm.cmd start` as one persistent Node process, and reverse proxy HTTPS to its port. Set `APP_URL` to the public origin and preserve the data folder between releases. Secure cookies are enabled in production; for local HTTP production testing only, set `ALLOW_HTTP_LOCAL=true`.

An in-process worker checks the outbox every minute. See [integration instructions](docs/INTEGRATIONS.md) for providers and the optional authenticated job endpoint. Missing credentials produce visible delivery failures rather than fake success. No public deployment or real external message delivery has been performed.

## Validation

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
```

Browser tests require Playwright Chromium: `npm.cmd exec playwright -- install chromium`. Tests cover business date boundaries, actual PostgreSQL commands/RLS/accounting, password hashing, private paths and notification fallback. See [validation record](docs/VALIDATION.md).

The development-only `/preview` and `/preview?role=client` routes provide labelled fictional interface fixtures and return 404 in production. Normal `/` uses the real persistent database.

The default business timezone is Asia/Riyadh.
