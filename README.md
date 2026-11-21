# Daniel Burden — Portfolio CMS

A portfolio website and private content dashboard built for Cloudflare Pages, Pages Functions and D1. The public site is `/`; the admin dashboard is `/admin`.

## What changed in this version

- The first administrator is created automatically from `ADMIN_EMAIL` and the Cloudflare secret `ADMIN_PASSWORD`.
- `ADMIN_EMAIL` is set in `wrangler.toml`, so you can edit the email in GitHub.
- The password is kept as a Cloudflare secret and must never be committed to GitHub.
- The old browser-based setup form and `SETUP_TOKEN` flow have been removed.
- Existing portfolio content, projects, login sessions and dashboard features are retained.
- The API logs unexpected errors to Cloudflare Workers Logs.

## Deploy this update to your existing Cloudflare Pages project

This ZIP is an updated source project, not a deployment to your account. It is designed to replace the files in your existing GitHub repository and use your existing Pages project and D1 binding.

### 1. Replace the files in GitHub

1. Extract this ZIP.
2. Open your existing GitHub repository.
3. Upload the contents of the `daniel-burden-portfolio` folder, replacing the existing files when GitHub asks.
4. Commit the changes to your default branch.
5. Wait for Cloudflare Pages to finish deploying the new commit.

Keep the `functions` folder and `wrangler.toml` at the repository root. Do not upload the outer folder as an extra nested directory.

### 2. Set the admin email in GitHub

Open `wrangler.toml` and find:

```toml
[vars]
ADMIN_EMAIL = "change-this@example.com"
```

Replace the example address with the email address you want to use to sign in, then commit the change. This value is not a password.

### 3. Set the admin password in Cloudflare

1. Open Cloudflare Dashboard → **Workers & Pages** → `danielburden-portfolio`.
2. Open **Settings → Variables and Secrets** (the wording may appear as **Environment variables**).
3. Under **Production**, add a secret named exactly `ADMIN_PASSWORD`.
4. Enter a new, unique password of 12–200 characters. Do not put this password in GitHub or send it in chat.
5. Save the secret and trigger a new deployment if Cloudflare asks you to.

The code expects `ADMIN_PASSWORD` to be a secret, not a plain-text GitHub variable. If you use Preview deployments, configure a separate secret there too.

### 4. Check the existing D1 binding

In the Pages project settings, confirm the Production D1 binding is still:

- Variable name: `DB`
- Database: `daniel-burden-db`

The database should already contain the tables from `schema.sql` (`admins`, `sessions`, `login_attempts`, `site_settings`, `projects`). Do not delete the database or rerun the schema just to deploy this update; doing so could affect existing portfolio content.

### 5. Sign in

1. Open `https://danielburden-portfolio.pages.dev/admin` (or your own domain followed by `/admin`).
2. The first visit to `/admin` checks the configuration. If the `admins` table is empty, it creates the administrator from `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
3. Sign in using those credentials.

If configuration is missing or invalid, the page will show an explanatory error. Check Cloudflare Workers Logs for unexpected server errors.

## Changing the administrator credentials later

- **Email:** edit `ADMIN_EMAIL` in `wrangler.toml` and deploy.
- **Password:** replace the `ADMIN_PASSWORD` secret in Cloudflare and deploy.

For security, the app only bootstraps the configured account when the `admins` table is empty. It does not silently overwrite an existing administrator's password on every request. To apply new configured credentials to an already-created account, first back up your D1 database, then in the D1 SQL console run:

```sql
DELETE FROM sessions;
DELETE FROM admins;
```

Then deploy the updated configuration and visit `/admin` once. The app will create the configured administrator again. This removes existing admin accounts and signs out all sessions, so only do it when you intend to reset admin access.

## Features

- Responsive portfolio homepage with About, selected work and contact sections.
- `/admin` dashboard with sign-in, site settings and project management.
- D1-backed content; changes appear on the public site after saving.
- Optional R2 image uploads (requires an R2 bucket binding named `MEDIA`).
- PBKDF2 password hashing, random salts, opaque server-side sessions, HttpOnly/Secure/SameSite cookies, seven-day expiry, login throttling, authorization checks, same-origin checks and server-side validation.
- No frontend credentials or default password.

## Optional image uploads

1. Create an R2 bucket in Cloudflare.
2. In the Pages project settings, add an R2 bucket binding named `MEDIA` and select the bucket.
3. Redeploy.

Without this binding, the rest of the site works; projects can still use externally hosted image URLs.

## How to use the dashboard

- **Site content:** edit the homepage heading, introduction, biography, contact details and social links.
- **Projects:** add, edit, delete and reorder projects, set an image URL, or upload an image if R2 is configured.
- Save each section to publish changes. The public website fetches current content from D1.

## Security notes

- Never commit `ADMIN_PASSWORD`, session cookies, API keys or other secrets to GitHub.
- Use a unique password and keep the GitHub repository private if it contains personal project material.
- Sessions are stored as SHA-256 hashes in D1 and expire after seven days.
- Login attempts are throttled by hashed client IP. This is a basic application-level throttle, not a replacement for Cloudflare rate limiting.
- Back up D1 content periodically using Cloudflare's export tools.

## Project structure

```text
public/                    Public pages, styles and browser JavaScript
functions/api/[[path]].js  API, authentication, content management and uploads
schema.sql                 D1 schema and initial placeholder content
wrangler.toml              Cloudflare project configuration
```
