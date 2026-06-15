# AfriSettle API Testing Guide

Base URL:

```text
http://localhost:3000
```

## Recommended Testing Order

1. `POST /api/merchants`
2. `POST /api/invoices`
3. `GET /api/invoices`
4. `GET /api/invoices/:id`
5. `PATCH /api/invoices/:id/wallet`
6. `PATCH /api/invoices/:id/status`
7. `POST /api/payments`
8. `GET /api/payments/:id`
9. `GET /api/invoices/:id/payments`
10. `PATCH /api/payments/:id/status`
11. `GET /api/invoices/:id/timeline`
12. `GET /api/circle/health`

Save returned `merchantId`, `invoiceId`, and `paymentId` values as you test.

## POST /api/merchants

### Purpose

Create a merchant.

### Method + URL

```text
POST /api/merchants
```

### Example Request Body

```json
{
  "businessName": "Afri Traders Ltd",
  "email": "billing@afritraders.com",
  "country": "NG"
}
```

### Example Response

```json
{
  "id": "merchant_uuid",
  "businessName": "Afri Traders Ltd",
  "email": "billing@afritraders.com",
  "country": "NG",
  "createdAt": "2026-06-14T12:00:00.000Z",
  "updatedAt": "2026-06-14T12:00:00.000Z"
}
```

### Common Errors

- `400`: `businessName` is missing.
- `400`: `email` is missing or invalid.
- `409`: Merchant email already exists.
- `500`: Unexpected server error.

## POST /api/invoices

### Purpose

Create an invoice for an existing merchant.

### Method + URL

```text
POST /api/invoices
```

### Example Request Body

```json
{
  "merchantId": "merchant_uuid",
  "invoiceNumber": "INV-0001",
  "customerName": "Ada Okafor",
  "customerEmail": "ada@example.com",
  "amount": "2500.00",
  "currency": "USD",
  "dueDate": "2026-06-30T23:59:59.000Z"
}
```

### Example Response

```json
{
  "id": "invoice_uuid",
  "merchantId": "merchant_uuid",
  "invoiceNumber": "INV-0001",
  "customerName": "Ada Okafor",
  "customerEmail": "ada@example.com",
  "amount": "2500.00",
  "currency": "USD",
  "stablecoin": "USDC",
  "walletAddress": null,
  "status": "DRAFT",
  "description": null,
  "dueDate": "2026-06-30T23:59:59.000Z",
  "paidAt": null,
  "createdAt": "2026-06-14T12:00:00.000Z",
  "updatedAt": "2026-06-14T12:00:00.000Z"
}
```

### Common Errors

- `400`: Missing required field.
- `400`: Invalid amount, currency, customer email, or due date.
- `404`: Merchant does not exist.
- `409`: Invoice number already exists.
- `500`: Unexpected server error.

## GET /api/invoices

### Purpose

List invoices with optional filters and pagination.

### Method + URL

```text
GET /api/invoices
GET /api/invoices?merchantId=merchant_uuid&status=DRAFT&limit=20&offset=0
```

### Example Request Body

No request body.

### Example Response

```json
{
  "data": [
    {
      "id": "invoice_uuid",
      "merchantId": "merchant_uuid",
      "invoiceNumber": "INV-0001",
      "customerName": "Ada Okafor",
      "customerEmail": "ada@example.com",
      "amount": "2500.00",
      "currency": "USD",
      "stablecoin": "USDC",
      "walletAddress": null,
      "status": "DRAFT",
      "description": null,
      "dueDate": "2026-06-30T23:59:59.000Z",
      "paidAt": null,
      "createdAt": "2026-06-14T12:00:00.000Z",
      "updatedAt": "2026-06-14T12:00:00.000Z"
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 1
  }
}
```

### Common Errors

- `400`: Invalid `merchantId`, `status`, `limit`, or `offset`.
- `500`: Unexpected server error.

## GET /api/invoices/:id

### Purpose

Retrieve one invoice with merchant, payments, and transaction logs.

### Method + URL

```text
GET /api/invoices/invoice_uuid
```

### Example Request Body

No request body.

### Example Response

```json
{
  "id": "invoice_uuid",
  "merchantId": "merchant_uuid",
  "invoiceNumber": "INV-0001",
  "status": "DRAFT",
  "merchant": {
    "id": "merchant_uuid",
    "businessName": "Afri Traders Ltd",
    "email": "billing@afritraders.com"
  },
  "payments": [],
  "transactionLogs": []
}
```

### Common Errors

- `400`: Invalid invoice id.
- `404`: Invoice does not exist.
- `500`: Unexpected server error.

## PATCH /api/invoices/:id/status

### Purpose

Move invoice status through the MVP status flow.

### Method + URL

```text
PATCH /api/invoices/invoice_uuid/status
```

### Example Request Body

```json
{
  "status": "UNPAID"
}
```

### Example Response

```json
{
  "id": "invoice_uuid",
  "status": "UNPAID",
  "paidAt": null
}
```

### Common Errors

- `400`: Invalid invoice id.
- `400`: Invalid status value.
- `400`: Invalid status transition.
- `404`: Invoice does not exist.
- `500`: Unexpected server error.

## PATCH /api/invoices/:id/wallet

### Purpose

Assign or update an invoice wallet address.

### Method + URL

```text
PATCH /api/invoices/invoice_uuid/wallet
```

### Example Request Body

```json
{
  "walletAddress": "0xabc123"
}
```

### Example Response

```json
{
  "id": "invoice_uuid",
  "walletAddress": "0xabc123",
  "status": "DRAFT"
}
```

### Common Errors

- `400`: Invalid invoice id.
- `400`: Missing or empty `walletAddress`.
- `404`: Invoice does not exist.
- `500`: Unexpected server error.

## POST /api/payments

### Purpose

Create a payment record for an existing invoice.

### Method + URL

```text
POST /api/payments
```

### Example Request Body

```json
{
  "invoiceId": "invoice_uuid",
  "amountExpected": "2500.00",
  "amountReceived": "2500.00",
  "stablecoin": "USDC",
  "walletAddress": "0xabc123",
  "txHash": "0xtxhash123",
  "status": "DETECTED"
}
```

### Example Response

```json
{
  "id": "payment_uuid",
  "invoiceId": "invoice_uuid",
  "amountExpected": "2500.00",
  "amountReceived": "2500.00",
  "stablecoin": "USDC",
  "walletAddress": "0xabc123",
  "txHash": "0xtxhash123",
  "status": "DETECTED",
  "detectedAt": "2026-06-14T12:00:00.000Z",
  "confirmedAt": null,
  "createdAt": "2026-06-14T12:00:00.000Z",
  "updatedAt": "2026-06-14T12:00:00.000Z"
}
```

### Common Errors

- `400`: Invalid invoice id.
- `400`: Invalid amount or payment status.
- `404`: Invoice does not exist.
- `409`: Duplicate `txHash`.
- `500`: Unexpected server error.

## GET /api/payments/:id

### Purpose

Retrieve one payment with its related invoice.

### Method + URL

```text
GET /api/payments/payment_uuid
```

### Example Request Body

No request body.

### Example Response

```json
{
  "id": "payment_uuid",
  "invoiceId": "invoice_uuid",
  "amountExpected": "2500.00",
  "amountReceived": "2500.00",
  "stablecoin": "USDC",
  "walletAddress": "0xabc123",
  "txHash": "0xtxhash123",
  "status": "DETECTED",
  "invoice": {
    "id": "invoice_uuid",
    "invoiceNumber": "INV-0001",
    "status": "DRAFT"
  }
}
```

### Common Errors

- `400`: Invalid payment id.
- `404`: Payment does not exist.
- `500`: Unexpected server error.

## GET /api/invoices/:id/payments

### Purpose

Retrieve all payments for an invoice, newest first.

### Method + URL

```text
GET /api/invoices/invoice_uuid/payments
```

### Example Request Body

No request body.

### Example Response

```json
[
  {
    "id": "payment_uuid",
    "invoiceId": "invoice_uuid",
    "amountExpected": "2500.00",
    "amountReceived": "2500.00",
    "stablecoin": "USDC",
    "walletAddress": "0xabc123",
    "txHash": "0xtxhash123",
    "status": "DETECTED",
    "detectedAt": "2026-06-14T12:00:00.000Z",
    "confirmedAt": null,
    "createdAt": "2026-06-14T12:00:00.000Z",
    "updatedAt": "2026-06-14T12:00:00.000Z"
  }
]
```

### Common Errors

- `400`: Invalid invoice id.
- `404`: Invoice does not exist.
- `500`: Unexpected server error.

## PATCH /api/payments/:id/status

### Purpose

Update payment status and settle the related invoice when payment is confirmed.

### Method + URL

```text
PATCH /api/payments/payment_uuid/status
```

### Example Request Body

```json
{
  "status": "CONFIRMED"
}
```

### Example Response

```json
{
  "id": "payment_uuid",
  "invoiceId": "invoice_uuid",
  "status": "CONFIRMED",
  "confirmedAt": "2026-06-14T12:10:00.000Z",
  "invoice": {
    "id": "invoice_uuid",
    "status": "PAID",
    "paidAt": "2026-06-14T12:10:00.000Z"
  }
}
```

### Common Errors

- `400`: Invalid payment id.
- `400`: Invalid payment status.
- `400`: Invalid transition or payment status is final.
- `404`: Payment does not exist.
- `500`: Unexpected server error.

## GET /api/invoices/:id/timeline

### Purpose

Retrieve invoice timeline entries from transaction logs.

### Method + URL

```text
GET /api/invoices/invoice_uuid/timeline
```

### Example Request Body

No request body.

### Example Response

```json
{
  "invoiceId": "invoice_uuid",
  "timeline": [
    {
      "action": "WALLET_ASSIGNED",
      "message": "Wallet assigned to invoice",
      "createdAt": "2026-06-14T12:00:00.000Z"
    },
    {
      "action": "PAYMENT_CONFIRMED",
      "message": "Payment confirmed and invoice settled",
      "createdAt": "2026-06-14T12:10:00.000Z"
    }
  ]
}
```

### Common Errors

- `400`: Invalid invoice id.
- `404`: Invoice does not exist.
- `500`: Unexpected server error.

## GET /api/circle/health

### Purpose

Check whether Circle API configuration can connect.

### Method + URL

```text
GET /api/circle/health
```

### Example Request Body

No request body.

### Example Response

```json
{
  "provider": "Circle",
  "status": "connected"
}
```

### Common Errors

- `500`: Circle API key is missing.
- `500`: Circle returned an error response.
- `500`: Network or runtime error during the health check.

Example not configured response:

```json
{
  "provider": "Circle",
  "status": "not_configured"
}
```

Example Circle error response:

```json
{
  "provider": "Circle",
  "status": "error",
  "message": "Circle responded with status 401"
}
```
