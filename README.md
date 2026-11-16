# QueueEase

QueueEase is a hospital appointment and queue-management application. Patients can request appointments, follow approval status, and monitor their queue. Clinic administrators manage appointments, schedules, queue operations, and user access.

## Architecture

- **Frontend:** React, Vite, and Tailwind CSS.
- **Backend:** Supabase Auth and PostgreSQL.
- **Database security:** Row Level Security (RLS) protects table access. Database RPC functions check ownership and administrator permissions for operations.
- **Hosting:** GitHub Pages serves the static frontend. GitHub Actions builds and deploys it from `main`.

The PHP/MySQL/XAMPP files in `backend/` are retained as legacy/reference material. They are not the active backend for the current application.

## Requirements

- Node.js 22 (the Pages workflow uses Node.js 22)
- npm
- A Supabase project for application authentication and database access

## Local development

Create a local `.env.local` in the repository root. The URL and publishable key below are placeholders; use the values for your own Supabase project.

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Then install dependencies and start Vite:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173/`. Configure that origin in the Supabase Auth redirect URL allowlist. The app uses the Supabase project named by the environment variables; without both variables, online sign-in is unavailable.

Useful project commands:

```sh
npm run lint
npm run build
npm run build -- --mode github-pages
```

The GitHub Pages build mode sets the repository base path to `/QueueEase/`.

## Supabase setup

For Auth configuration, database migration order, first administrator provisioning, and security/known-issue details, see [Supabase operations](supabase/OPERATIONS.md). The [system documentation](docs/QUEUEEASE_SYSTEM_DOCUMENTATION.md) describes the application flows and database model.

The production-equivalent database migration sequence is:

1. `20261115163846_queueease_initial_schema_20261115154936`
2. `20261115174955_queueease_phase_b_user_operations_20261116013759`
3. `20261116011513_queueease_admin_operations_20261116085254`

These migration files are recovered from the live Supabase migration history. Their historical comments include stale “not applied” or “draft” wording; the database history confirms these three entries were applied. The patient-terminology migration is not included because it has no applied history entry.

## GitHub Pages deployment

The workflow at `.github/workflows/deploy-pages.yml` builds the site in GitHub Pages mode and deploys the `dist/` output. In the repository settings:

1. Set **Pages → Build and deployment → Source** to **GitHub Actions**.
2. Under **Settings → Secrets and variables → Actions → Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Push the documentation/application change to `main`, or use the workflow’s manual dispatch.

The workflow checks that both variables are set before building. They are bundled into the static frontend. Use only the Supabase publishable key here; never place a service-role key, database password, or other privileged credential in a Vite variable or browser code.

The deployed site is served at [QueueEase on GitHub Pages](https://shanietmyst.github.io/QueueEase/). Configure the same URL as the Supabase Auth Site URL and allow the site’s redirect path.

## Implemented features

- Email/password account registration, email confirmation flow, sign-in, and sign-out through Supabase Auth.
- Appointment booking, appointment history/status, cancellation where allowed, and profile/password changes.
- Public queue monitoring and the signed-in user’s queue summary.
- Administrator appointment decisions, schedule management, queue status/call/skip/advance operations, announcements, activity viewing, and application-level user activation.
- In-app database notifications for appointment, queue, and announcement updates.

See the system documentation for current limitations. In particular, the live profile-update function has a malformed phone-number regex, the patient schedules page has a role-condition mismatch, and system-settings changes are disabled by an empty allowlist.
