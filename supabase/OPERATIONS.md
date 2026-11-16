# QueueEase Supabase operations

This guide documents a separate instructor/development Supabase project for the React/Vite application. Do not use these instructions to modify the existing production project.

## Requirements

- A new Supabase project with PostgreSQL and Supabase Auth.
- Node.js/npm for the frontend.
- Supabase CLI and Docker Desktop if using the local Supabase stack. The repository contains migration files but does not currently include a `supabase/config.toml`.
- A separate GitHub repository checkout/branch for instructor work.

The SQL relies on Supabase-provided objects such as `auth.users`, the `auth.uid()` helper, and the `anon` and `authenticated` database roles. The migrations define the QueueEase application schema, functions, policies, triggers, and grants.

## Auth configuration

In the new Supabase project, configure:

1. Enable email/password sign-up in **Authentication → Providers → Email**.
2. Require email confirmation. The frontend reports that the user should confirm their email before logging in.
3. Set **Authentication → URL Configuration → Site URL** to the deployed site URL, normally `https://shanietmyst.github.io/QueueEase/`.
4. Add redirect URLs for local development and Pages, such as:
   - `http://localhost:5173/**`
   - `http://127.0.0.1:5173/**`
   - `https://shanietmyst.github.io/QueueEase/**`
5. Configure an SMTP provider if the project needs dependable confirmation email delivery outside Supabase’s default email service limits.

The app’s sign-up call sends `full_name` and `contact_number` as Auth user metadata and sets `emailRedirectTo` from the current Vite base URL. A database Auth trigger validates those fields and creates the QueueEase profile. Confirm that the selected site/redirect URLs cover the local and deployed paths.

## Frontend environment and GitHub Actions

For local development, create an untracked `.env.local` in the repository root:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Do not commit real values. The publishable key is intended for browser use; a Supabase service-role/secret key and database password are privileged and must never be placed in frontend code or Vite variables.

For GitHub Pages, add the same two names as **Actions repository variables** under **Settings → Secrets and variables → Actions → Variables**. The workflow reads them from `vars.VITE_SUPABASE_URL` and `vars.VITE_SUPABASE_PUBLISHABLE_KEY` and fails the build if either is missing. Set **Pages → Source** to **GitHub Actions**.

Local frontend commands:

```sh
npm ci
npm run dev
npm run lint
npm run build
npm run build -- --mode github-pages
```

The Pages build uses `/QueueEase/` as its base path. GitHub Actions uses Node.js 22, `npm ci`, and `npm run build -- --mode github-pages`.

## Database migration sequence

The three files in `supabase/migrations/` are exact SQL copies of the three applied statements stored in the live `supabase_migrations.schema_migrations` history, in version order:

1. [Initial schema](migrations/20261115163846_queueease_initial_schema_20261115154936.sql)
2. [Phase B user operations](migrations/20261115174955_queueease_phase_b_user_operations_20261116013759.sql)
3. [Administrator operations](migrations/20261116011513_queueease_admin_operations_20261116085254.sql)

The historical SQL statements contain comments that say the first and second migrations were not applied and the third is a local draft. Those comments are preserved in these exact-source copies. They are stale: the live migration history records all three versions as applied. Use the history/version list above as the source for application state, not those comment lines.

The local patient-terminology file is unapplied and is intentionally excluded. It changes the available-slots error message from “student” to “patient”; production still has the “student” message.

### Apply to a separate new project

Only apply this sequence to a newly created, separate project intended for instructor reproduction. Do not link the CLI to the existing QueueEase production project.

From the repository root, initialize the CLI configuration if needed, authenticate, link the new project, preview, then apply:

```sh
npx supabase init
npx supabase login
npx supabase link --project-ref YOUR_NEW_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

Review the dry-run target and pending migration order before applying. The database password may be requested interactively; do not save it in the repository. For local-only database testing, use `npx supabase start` and `npx supabase db reset` only with the local stack. A linked/remote reset is destructive and is not part of this setup guide.

No seed SQL or administrator account is included. The first administrator is provisioned manually after creating a normal Auth account, as described below. The migration files have not been replay-tested as part of this documentation task.

## First administrator provisioning

1. Register a normal QueueEase account through the frontend and confirm its email.
2. In **Authentication → Users**, verify the intended account and copy its exact UUID.
3. In the new project’s SQL Editor, replace the all-zero placeholder below with that UUID and run the complete block once as the project owner. It fails if the account is absent, anonymous, unconfirmed, banned, missing an active normal QueueEase profile, or if an active administrator already exists.

```sql
begin;
select pg_advisory_xact_lock(hashtextextended('queueease:first-admin-provisioning', 0));
do $provision_first_admin$
declare
  target_id constant uuid := '00000000-0000-0000-0000-000000000000'; -- replace with the verified Auth UUID
  auth_row auth.users%rowtype;
  profile public.users%rowtype;
begin
  select * into auth_row from auth.users where id = target_id for update;
  if not found or auth_row.is_anonymous or auth_row.email is null
     or auth_row.email_confirmed_at is null
     or (auth_row.banned_until is not null and auth_row.banned_until > now()) then
    raise exception 'The specified Auth UUID must identify an existing, email-confirmed, non-anonymous, non-banned account.';
  end if;

  select * into profile from public.users where id = target_id for update;
  if not found or not profile.is_active or profile.role <> 'user' then
    raise exception 'The specified account must have an active normal QueueEase profile.';
  end if;
  if exists (
    select 1 from public.users u
    join public.administrators a on a.id = u.id
    where u.role = 'admin' and u.is_active and a.is_active
  ) then
    raise exception 'An active administrator already exists; use the authenticated admin management RPC for later admins.';
  end if;

  update public.users set role = 'admin' where id = target_id;
  insert into public.administrators (id, is_active) values (target_id, true);
end;
$provision_first_admin$;
commit;
```

Verify only the chosen account is active in both `public.users` and `public.administrators`, then test an admin-only action and confirm a normal account cannot perform one. Do not make a public role-assignment flow.

## Administrator activation and deactivation

- `admin_set_user_active(user_uuid, false)` sets `public.users.is_active` false and blocks QueueEase database access through the active-user helper and RPC checks.
- This does **not** ban the Supabase Auth identity, prevent Auth login, revoke refresh tokens, or invalidate an already-issued JWT. For a full disable, an authorized operator must separately use Supabase Auth user controls or a trusted server-side Admin API. Never expose service-role credentials to the browser.
- Reactivation through `admin_set_user_active(user_uuid, true)` restores application-level access only. Remove any Auth ban separately.
- `admin_set_administrator(user_uuid, enabled)` manages later administrators. The RPC requires an existing active administrator and disallows self-promotion/self-demotion and removal of the final active administrator.

## Security model

- RLS is enabled on all eight application tables: users, administrators, schedules, appointments, queue records, activity logs, notifications, and system settings.
- Table policies scope profile/appointment/queue/notification reads to the owner or an authorized administrator. Anonymous users can read available schedules; public queue status is provided by a limited RPC.
- The frontend calls database RPCs for booking, cancellation, admin operations, profile updates, and queue snapshots. Privileged RPCs check authorization in the database; client-side role checks are not the security boundary.
- Keep database owner credentials and service-role/secret keys server-side. The frontend uses only the project URL and publishable key.

## Known limitations

- **Profile update regex:** The applied `update_queueease_profile` function contains `^(+63|63|0)?9[0-9]{9}$`. PostgreSQL rejects it as an invalid regular expression (“quantifier operand invalid”). Valid profile updates may fail when phone validation runs. The escaped form in the old local Phase B file is not what production applied. Any fix must be a separate, reviewed migration; do not silently change the recovered historical source.
- **Patient terminology:** The patient-terminology migration is unapplied. The live available-slots RPC still uses “student” in its authorization error message.
- **System settings:** The list/update RPCs have an empty allowlist. They return no setting rows and reject all setting changes.
- **Notifications:** Notifications are stored in the application database and displayed in-app. No SMS, email, or push delivery is implemented.
- **Password recovery:** Users can change a password after entering their current password; there is no password-reset page/flow.
- **Patient schedules page:** The frontend maps database role `user` to UI role `patient`, but the schedule-loading effect checks for UI role `user`. The dedicated patient schedules page therefore does not load schedules under that condition.
- **Timezones:** SQL date helpers use `Asia/Taipei`; frontend date selection uses `Asia/Manila`. Both currently share UTC+8, but the names differ.
- **Legacy backend:** PHP/MySQL/XAMPP files under `backend/` are retained for reference only and are not the active application backend.
