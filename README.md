# QueueEase

QueueEase is a React/Vite appointment and queue-management frontend backed by a PHP JSON API and MySQL. The workspace backend is the source of truth; XAMPP serves the copy at `C:\xampp\htdocs\queueease\backend`.

## Requirements

- Node.js 20.19+ or 22.12+
- XAMPP with PHP 8+, MySQL/MariaDB, PDO MySQL, JSON, and mbstring enabled
- A modern browser

## Database setup

The local `queueease` database's legacy schema has already been migrated. Do not import the migration there again. For another database still using the legacy schema, export a backup in phpMyAdmin first, then import [`backend/migrate_legacy.sql`](backend/migrate_legacy.sql) once. This migration adds and backfills columns without dropping tables or records.

For a brand-new database only, import [`backend/schema.sql`](backend/schema.sql) instead. Do not import both scripts into the same database. The legacy migration preserves `system_settings` and adds supporting admin/audit tables. Legacy plaintext passwords are not accepted as login credentials.

## Start QueueEase

1. In the XAMPP Control Panel, start **Apache** and **MySQL**.
2. From `C:\Users\ASUS\queueease`, run:

   ```powershell
   npm install
   npm run dev
   ```

3. Open the Vite URL shown in the terminal (normally `http://localhost:5173`). The frontend API defaults to `http://localhost/queueease/backend/api.php`.
4. The workspace backend should be copied to `C:\xampp\htdocs\queueease\backend` whenever backend files change. Keep both folders; use the workspace version as the source of truth. The local XAMPP MySQL defaults are host `127.0.0.1`, database `queueease`, user `root`, and an empty password. Configure other credentials in Apache's environment, never in the browser or Vite variables.
5. The API allows `http://localhost:5173` and `http://127.0.0.1:5173` by default. If Vite uses another origin, set `QUEUEEASE_FRONTEND_ORIGIN` for Apache and restart Apache.

To override the frontend API URL, create `.env.local` in the project root:

```env
VITE_API_URL=http://localhost/queueease/backend/api.php
```

Restart Vite after changing environment variables.

## Publish the frontend on GitHub Pages

The workflow in `.github/workflows/deploy-pages.yml` builds the Vite app and deploys it to `https://shanietmyst.github.io/QueueEase/` whenever changes are pushed to `main`. In the repository's **Settings → Pages**, set **Build and deployment → Source** to **GitHub Actions**. The first deployment may take a few minutes; check the **Actions** tab for its status.

GitHub Pages hosts only static frontend files; it cannot run this project's PHP API or MySQL database. The live page can display the app, but login, registration, appointments, and other database-backed features need the PHP backend hosted separately on a public HTTPS server. The current default API address points to `localhost` and is intended for local development; do not put database credentials in frontend environment variables.

## Administrator access

The first administrator has been created in the existing `users` table with `role='admin'` and a PHP `password_hash()`. Public registration creates user accounts only. Sign in through **Log in** with the administrator credentials provided separately. Admins open **Admin operations**; ordinary users open the User Dashboard.

The one-time CLI setup script was removed from both the workspace and XAMPP backend after setup. Removing the script does not delete the admin account. Do not copy a setup script back into `htdocs`. If another administrator is needed in the future, use a controlled private CLI/database procedure that hashes the password; do not enable public admin registration.

## Features and checks

- Registration, login, logout, and database-validated sessions
- User appointment booking, history, cancellation, and live queue status
- Admin appointment decisions, queue calling/status changes, schedules, user activation, and reports
- Prepared PDO statements, password hashing, server-side role checks, and activity logging

Run frontend checks from the workspace:

```powershell
npm run lint
npm run build
```

Check PHP syntax:

```powershell
C:\xampp\php\php.exe -l C:\Users\ASUS\queueease\backend\api.php
C:\xampp\php\php.exe -l C:\Users\ASUS\queueease\backend\config.php
```

Check that the API is reachable at `http://localhost/queueease/backend/api.php?action=me`; a signed-out request returns `{"user":null}`. Use HTTPS and secure MySQL credentials outside local development.
