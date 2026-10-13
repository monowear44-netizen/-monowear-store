# MONOWEAR store

Node.js + Express + SQLite storefront and admin Studio, with Paystack payments and Resend emails.

- Storefront: `/`
- Studio (admin): `/studio`

## Project layout

```
server.js            API, checkout, payments, emails, database
package.json
.env.example         names of the environment variables (no secrets)
public/
  index.html, store.js, styles.css        storefront
  collection.html, account.html           collection and account pages
  policies.html                           shipping and returns (text comes from Studio)
  studio.html, studio.js                  Studio
  studio.css, studio-extra.css            Studio styles
```

## Environment variables (set in Render → Environment)

| Variable | Purpose |
|---|---|
| `BASE_URL` | Public address, no trailing slash. Used for Paystack redirects and the email logo. |
| `PAYSTACK_SECRET_KEY` | Paystack secret key (test or live). Never put it in code. |
| `RESEND_API_KEY` | Resend API key. |
| `EMAIL_FROM` | Sender, default `MONOWEAR <orders@monowears.com>`. The domain must be verified in Resend. |
| `CONTACT_EMAIL` | Contact address shown in store settings. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Creates the first admin on first start only. |
| `SESSION_SECRET` | Long random string. If missing, logins reset on every restart. |
| `RENDER_DISK_PATH` | Persistent disk folder (default `/var/data`). Holds the database and uploads. |
| `NODE_ENV` | `production` |
| `PORT` | Set by Render. |

## Paystack setup

Paystack → Settings → API Keys & Webhooks. Set the webhook URL (test and live are separate fields) to:

`https://YOUR-SITE/api/paystack/webhook`

(`/api/payments/paystack-webhook` is also accepted, because an earlier version of this README listed it.)

Revenue and "paid" status only come from payments Paystack has verified (amount, currency, reference and customer email must match the order).

## Studio

- **Products**: search, stock badges, display order, collections.
- **Collections**: create, edit, upload a cover image, publish, archive/restore, assign products.
- **Orders**: items with sizes, filters and search, payment and email status, resend confirmation.
- **Payments**: verified revenue (today / month / all time), fees and net, payment history, **payouts and balance read live from Paystack**, and "Check unpaid orders with Paystack" to recover paid orders that were missed.
- **Store editor**: site text, hero/waitlist images, **email logo**, shipping, policies, email/payment check, test email, database backup download.

## Database

SQLite file at `RENDER_DISK_PATH/data/monowear.db`. New columns are added automatically at startup and existing data is kept. The Studio can download a backup copy (it contains customer data, so keep it private).

## Before deploying a change

1. Download a database backup from Studio → Store editor.
2. Note the current Render deploy so you can roll back (Render → Events → Rollback).
3. Test with Paystack test keys before using live keys.
