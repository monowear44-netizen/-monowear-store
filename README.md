# MONOWEAR Commerce — Full-stack starter

This is a custom, independent Node.js storefront and admin studio. It is not hosted yet and does not plug directly into Bumpa or LabelD.

## Included
- Responsive storefront and product search/category filtering
- Shopping bag, server-side pricing, stock checks, configurable delivery fee/free-shipping threshold
- Paystack checkout initialization and verification, plus signature-verified webhook
- Customer registration/login and customer order history
- Admin studio with dashboard, product CRUD, stock, featured/published switches, image uploads, site copy/policy editor, order and fulfilment management
- SQLite database and persistent SQLite-backed sessions
- Password hashing, rate-limited login/checkout, secure session cookie settings, basic security headers

## Run locally
1. Install Node.js 20+.
2. Copy `.env.example` to `.env`.
3. Set a unique `SESSION_SECRET`, `ADMIN_EMAIL`, and strong `ADMIN_PASSWORD` (10+ characters).
4. Run `npm install` and `npm start`.
5. Visit `http://localhost:3000` and `http://localhost:3000/studio`.

The initial administrator is created when the database is first initialized. Changing `.env` later does not reset an existing admin password; change it by implementing a password-reset workflow or updating the database securely.

## Paystack setup
1. Create a Paystack account and use test keys first.
2. Set `PAYSTACK_SECRET_KEY` and `PAYSTACK_PUBLIC_KEY` in the hosting environment. Never put the secret key in browser code or commit it.
3. Set `BASE_URL` to the public HTTPS domain.
4. Configure your Paystack webhook URL to `https://YOUR-DOMAIN/api/payments/paystack-webhook`.
5. Run a full test transaction and verify payment success, failure, duplicate webhook delivery, and stock/order edge cases before launch.
6. Switch to live keys only after your Paystack business verification and production tests are complete.

Payment is optional in local development. Without a secret key, checkout records an order request and tells the customer that the owner must confirm payment manually.

## Before accepting real customers
This is a substantial starter implementation, not a guarantee of production readiness. Arrange a security review and test:
- Deploy on a Node.js host with persistent disk or migrate SQLite to a managed database.
- Use HTTPS and a strong secret. Set `NODE_ENV=production`.
- Set backups/restore, uptime monitoring, structured logs, and error alerts.
- Add a real password reset and email verification flow; account registration is included but email verification is not.
- Add email/SMS order confirmations and shipping notifications.
- Review privacy, cookie, refund, delivery, consumer protection, and tax obligations applicable to your business.
- Review CSRF protection, file-upload scanning, access controls, database migration strategy and payment reconciliation.
- Add product variants/SKU-level stock if stock must be managed separately for each size; this starter tracks stock per product, not per size.
- Add image optimization/CDN for larger catalogues.
- Confirm payment amounts/currency and delivery rules with your provider. Never rely on client-calculated prices.

## Domain
Deploy first, then set `monowears.com` and `www.monowears.com` DNS to the exact values supplied by your hosting provider. Do not reuse LabelD or Bumpa DNS values unless that platform is the actual host for this app.
