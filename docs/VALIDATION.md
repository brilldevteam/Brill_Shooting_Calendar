# Validation record

Executed locally on 15 September 2026 with Node.js 22.22.3.

- 48 automated tests pass across five suites: business date rules, actual PostgreSQL migrations/commands/RLS, accounting boundaries, notification fallback, local authentication/private file paths and disk persistence.
- Production build passes on Next.js 16.3.5; TypeScript and ESLint pass.
- Playwright Chromium checks desktop and mobile layouts, client preview privacy, request review, real seeded admin/client sign-in, contracts display and sign-out. A real client draft is saved and checked after reload.
- Admin and client screenshots were inspected. Browser testing found and fixed sidebar overflow and PostgreSQL DATE serialization; the latter now has a regression assertion.
- Persistence verification closes and reopens a disk database and checks saved data. A second simultaneous owner is rejected.

The local application runs at http://127.0.0.1:3000. Development credentials are in the Git-ignored `.env.seed-accounts`. Browser mutation checks leave clearly named `DEMO browser draft` records with no reservation or notification impact.

The database tests verify authorization, conflicts, future-month limits, carry-forward, exact cancellation deadline, rescheduling, no-show/completion, immutable history and notification creation. They execute the actual local migrations; no cloud authentication stand-in is used.

Not performed: public server deployment, actual email or WhatsApp delivery, external Shooting Log interoperability, production load testing or disaster-recovery drills. Provider credentials and the external API were not supplied. Missing integrations remain visibly failed and can be retried after configuration. Browser testing uses Chromium desktop/mobile emulation; Safari and Firefox were not tested.

Run one Node process per persistent data directory. See README.md for startup, backup and deployment guidance. The separate DRS referenced in the source specification was not supplied.
