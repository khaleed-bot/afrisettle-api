# AfriSettle MVP

AfriSettle is an Express and Prisma backend for merchant invoice collection, Circle Developer-Controlled Wallet deposits, reconciliation, and a simple static dashboard.

## Stack

- Node.js + Express
- Prisma + PostgreSQL
- Circle Developer-Controlled Wallets SDK
- Static HTML dashboard served from `public/`

## Environment Variables

Core variables required for startup:

```env
DATABASE_URL=
PORT=3001
NODE_ENV=development
```

Circle variables are required when Circle features are enabled:

```env
CIRCLE_API_KEY=
CIRCLE_ENTITY_SECRET=
CIRCLE_BASE_URL=https://api.circle.com
CIRCLE_DEFAULT_BLOCKCHAIN=BASE-SEPOLIA
CIRCLE_TIMEOUT_MS=10000
CIRCLE_MAX_RETRIES=2
```

Background reconciliation:

```env
CIRCLE_RECONCILE_ENABLED=false
CIRCLE_RECONCILE_INTERVAL_MS=30000
```

Webhook verification:

```env
CIRCLE_WEBHOOK_VERIFY_SIGNATURE=false
```

Use `CIRCLE_WEBHOOK_VERIFY_SIGNATURE=true` in production. The server refuses to start in production when webhook verification is disabled.

## Local Development

Install dependencies:

```bash
npm install
```

Generate Prisma client:

```bash
npm run prisma:generate
```

Run database migrations with your normal Prisma workflow, for example:

```bash
npx prisma migrate dev
```

Start the server:

```bash
npm start
```

The API listens on `PORT`.

## Startup Validation

The server validates required environment variables on startup.

Startup fails immediately if:

- `DATABASE_URL` is missing.
- `PORT` is missing or invalid.
- Circle features are enabled but Circle credentials/config are incomplete.
- `NODE_ENV=production` and `CIRCLE_WEBHOOK_VERIFY_SIGNATURE=false`.

In local development, Circle can remain disabled and the app will still boot.

## Health Endpoints

Application health:

```http
GET /health
```

Returns app status, database connectivity, Circle config presence, scheduler status, and webhook verification status. Secrets are never returned.

Circle health:

```http
GET /api/circle/health
```

Checks Circle Wallets API access using the shared Circle client.

## Authentication

Merchants authenticate protected endpoints with:

```http
x-api-key: <merchant-api-key>
```

Merchant API keys are returned only once when creating a merchant. The database stores only the hashed API key.

## Circle Setup

1. Create a Circle Developer-Controlled Wallets account.
2. Create an API key.
3. Register the entity secret.
4. Set `CIRCLE_API_KEY` and `CIRCLE_ENTITY_SECRET`.
5. Set `CIRCLE_DEFAULT_BLOCKCHAIN`.
   - Use testnet chains such as `BASE-SEPOLIA` for `TEST_API_KEY` credentials.
6. Create a merchant wallet set:

```http
POST /api/circle/wallet-set
```

7. Create the merchant Circle wallet:

```http
POST /api/circle/wallet
```

The wallet ID is stored on the merchant as `circleMerchantWalletId`.

## Payment Lifecycle

1. Merchant creates an invoice:

```http
POST /api/invoices
```

2. Merchant assigns a Circle deposit address:

```http
POST /api/invoices/:id/circle-deposit-address
```

3. Customer sends USDC to the deposit address.

4. Reconciliation runs by manual API call, scheduler, or webhook:

```http
POST /api/circle/reconcile
```

5. Reconciliation scans Circle wallet transactions and matches inbound transfers by:

- merchant Circle wallet ID
- invoice deposit address
- chain when present
- stablecoin
- exact invoice amount

6. Non-complete matching transactions create or keep `DETECTED` payments and move the invoice to `PENDING`.

7. Complete matching transactions confirm the payment, set `confirmedAt`, mark the invoice `PAID`, set `paidAt`, and create a transaction log.

## Duplicate Protection

The system protects against duplicates using:

- unique `txHash`
- unique `circlePaymentId`
- unique webhook `externalEventId`
- reconciliation checks before creating payments
- Prisma unique constraint handling for concurrent reconcile races

Duplicate webhook events return success and do not trigger duplicate payment creation.

## Scheduler

Enable background reconciliation:

```env
CIRCLE_RECONCILE_ENABLED=true
CIRCLE_RECONCILE_INTERVAL_MS=30000
```

The scheduler:

- prevents overlapping runs
- continues when one merchant fails
- logs summary totals for scanned, matched, created, updated, confirmed, skipped, and failed merchants

## Webhooks

Circle webhook endpoint:

```http
GET /api/webhooks/circle
HEAD /api/webhooks/circle
POST /api/webhooks/circle
```

The webhook endpoint is public and does not use merchant API-key auth.

In production:

```env
CIRCLE_WEBHOOK_VERIFY_SIGNATURE=true
```

Circle must send:

- `X-Circle-Signature`
- `X-Circle-Key-Id`

After storing a new webhook event, AfriSettle triggers reconciliation asynchronously. The scheduler remains a fallback.

For local webhook testing only:

```env
CIRCLE_WEBHOOK_VERIFY_SIGNATURE=false
```

## Dashboard

Static dashboard pages are served by Express:

- `/dashboard`
- `/create-invoice`
- `/invoice-detail?id=<invoice-id>`
- `/wallets`
- `/settings`

The dashboard stores the merchant API key in `localStorage` and sends it as `x-api-key`.

## Production Deployment Checklist

1. Set `NODE_ENV=production`.
2. Set `DATABASE_URL`.
3. Set `PORT`.
4. Set Circle env variables if Circle features are enabled.
5. Set `CIRCLE_WEBHOOK_VERIFY_SIGNATURE=true`.
6. Run:

```bash
npm install
npm run prisma:generate
npx prisma migrate deploy
```

7. Start the server:

```bash
npm start
```

8. Verify:

```http
GET /health
GET /api/circle/health
```

9. Create a merchant, Circle wallet set, Circle wallet, invoice, and deposit address.
10. Send a small testnet USDC payment.
11. Confirm reconciliation creates a payment and marks the invoice `PAID`.

## Operational Notes

- Do not log API keys, entity secrets, or raw authorization headers.
- Keep webhook verification enabled in production.
- Use testnet blockchains for Circle test API keys.
- Review scheduler logs after deployment to confirm successful background reconciliation.
