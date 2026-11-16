# QueueEase system documentation

## Purpose

QueueEase is a hospital appointment and queue-management application. Patients request appointments and monitor queue progress; clinic administrators review requests and operate schedules and the queue.

## Architecture

- React application built with Vite and Tailwind CSS.
- Supabase Auth handles email/password sign-up, email confirmation, sign-in, sign-out, and authenticated sessions.
- Supabase PostgreSQL stores QueueEase profiles and operational data.
- Row Level Security (RLS) controls table access. Database RPC functions enforce ownership and admin authorization for sensitive operations.
- GitHub Actions builds the static site and publishes it to GitHub Pages.

The PHP/MySQL/XAMPP files in `backend/` are legacy/reference material. They are not on the active application request path.

## Roles and account lifecycle

Supabase Auth owns the login identity. A database trigger creates a QueueEase profile when a normal Auth account is registered, using the submitted full name and contact number. Email changes are synchronized to the profile.

The database role for a normal patient is `user`; the frontend maps it to UI role `patient`. An administrator requires both `users.role = 'admin'` and an active matching row in `administrators`. Normal public sign-up does not assign admin privileges. The first administrator is provisioned by a project owner after email confirmation; later admin changes require an authenticated admin RPC.

Users may update their profile through an RPC and change their password after re-entering their current password. A password-reset page/flow is not implemented.

## Database model

The applied migration sequence creates these application tables:

| Table | Purpose and relationships |
|---|---|
| `users` | QueueEase profile keyed by the Auth UUID; contains name, email, contact number, role, and active state. |
| `administrators` | Active administrator marker linked to a profile. Admin authorization checks both this row and the profile role/state. |
| `schedules` | Service date, time slot, capacity, and availability. A date/slot pair is unique. |
| `appointments` | Patient request and status snapshot; linked to a profile and schedule. |
| `queue_records` | Queue number and state for an appointment; one record per appointment, with unique daily numbers per service. |
| `activity_logs` | Database-side record of user/admin actions. |
| `notifications` | In-app appointment, queue, announcement, and system messages, optionally linked to a user. |
| `system_settings` | Key/value table; current settings RPC allowlist is empty. |

## Database security

RLS is enabled on all eight application tables. Policies restrict profile and appointment access to the owner or an authorized admin, queue rows to the associated user or admin, and notifications to their recipient/admin rules. Anonymous reads are limited to available schedules. Public queue information is exposed through `public_queue_snapshot()`, which returns queue numbers/status and a signed-in active user’s own queue summary rather than appointment identifiers or profile details.

Sensitive writes use database RPCs such as `book_appointment`, `cancel_appointment`, `admin_decide_appointment`, `admin_set_queue_status`, and `admin_upsert_schedule`. These perform their own session, ownership, state, capacity, or administrator checks. Frontend checks improve the UI but are not a replacement for database authorization.

The browser uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never put a database password, service-role key, or secret key in the frontend bundle.

## Appointment workflow

1. A patient signs up with email, password, name, and contact number. The Auth trigger validates profile metadata and creates the app profile.
2. The patient chooses an available schedule and submits purpose/notes through `book_appointment`. The database checks active account, schedule availability, date, and capacity.
3. The request appears as pending for administrator review. An administrator confirms or rejects it through `admin_decide_appointment`.
4. Confirmation creates a queue record and a notification. Patients can view history/status and cancel only when the database permits it.
5. Updates are reflected by subsequent frontend data loads; the app polls queue status and account data rather than using a documented SMS/email/push channel.

## Queue workflow

The database assigns a queue number when an appointment is confirmed. Administrators can set allowed queue statuses, skip the serving number, or advance the queue. Queue operations lock the day/service and write notification/activity records. Public queue monitoring reveals queue status/number only; signed-in active users can receive their own queue summary.

## Notifications

Notifications are rows in `public.notifications`, written by database operations for events such as appointment requests/decisions, queue updates, schedule updates, and announcements. Users see them in the app and can mark them read. These are **in-app database notifications only**. SMS, email, and push notification delivery are not implemented.

## Administrator functions

The current database and frontend support:

- Appointment list, review, confirmation/rejection, and reports/summary data.
- Schedule creation/update, capacity, and availability management.
- Queue status changes, skip, and advance.
- Application-level user activation/deactivation.
- Announcement publishing.
- Activity-log viewing and patient-list/dashboard data.

Although the admin UI includes system-settings controls, the applied RPCs use an empty allowlist and currently reject all setting changes.

## Deployment

GitHub Actions installs from the lockfile, requires the two Supabase Actions variables, builds Vite in `github-pages` mode, and deploys the static `dist/` site. GitHub Pages does not host the database or PHP backend. Auth Site URL and redirect URLs must include the local and Pages origins used by sign-up confirmation.

See [Supabase operations](../supabase/OPERATIONS.md) for project setup, migrations, first-admin provisioning, local commands, and current limitations.

## Known limitations

- The applied profile-update function’s phone regex is malformed PostgreSQL regex syntax (`^(+63|63|0)?9[0-9]{9}$`). A read-only PostgreSQL check returned “quantifier operand invalid.” Treat profile updates as affected until a separate reviewed migration fixes it.
- The patient-terminology migration is not applied; the live slot RPC retains “student” wording.
- System-settings read/update RPCs have an empty allowlist and do not enable setting changes.
- Notifications are in-app only; no SMS/email/push notifications are implemented.
- Password change is implemented after current-password verification; there is no password-reset page.
- The patient schedules loader checks for UI role `user`, while normal database role `user` is mapped to UI role `patient`. The dedicated patient schedules view does not load schedules under the current condition.
- SQL uses `Asia/Taipei`; frontend date handling uses `Asia/Manila`.
- The legacy PHP/MySQL/XAMPP backend is retained but inactive.
