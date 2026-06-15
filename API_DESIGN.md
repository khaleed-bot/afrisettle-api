# AfriSettle MVP API Design

This document defines the API contract for the initial AfriSettle MVP endpoints.

## POST /api/merchants

### Purpose

Create a merchant account that can issue invoices.

### Request Body

```json
{
  "name": "Afri Traders Ltd",
  "email": "billing@afritraders.com"
}
```

### Response Body

```json
{
  "id": "merchant_uuid",
  "name": "Afri Traders Ltd",
  "email": "billing@afritraders.com",
  "createdAt": "2026-06-08T12:00:00.000Z",
  "updatedAt": "2026-06-08T12:00:00.000Z"
}
```

### Validation Rules

- `name` is required.
- `name` must be a non-empty string.
- `email` is required.
- `email` must be a valid email address.
- `email` must be unique across merchants.

### Possible Errors

- `400 Bad Request`: Missing or invalid request body fields.
- `409 Conflict`: A merchant with the same email already exists.
- `500 Internal Server Error`: Unexpected server error.

## POST /api/invoices

### Purpose

Create an invoice for an existing merchant.

### Request Body

```json
{
  "merchantId": "merchant_uuid",
  "invoiceNumber": "INV-0001",
  "amount": "2500.00",
  "currency": "USD",
  "dueDate": "2026-06-30T23:59:59.000Z"
}
```

### Response Body

```json
{
  "id": "invoice_uuid",
  "merchantId": "merchant_uuid",
  "invoiceNumber": "INV-0001",
  "amount": "2500.00",
  "currency": "USD",
  "status": "DRAFT",
  "dueDate": "2026-06-30T23:59:59.000Z",
  "createdAt": "2026-06-08T12:00:00.000Z",
  "updatedAt": "2026-06-08T12:00:00.000Z"
}
```

### Validation Rules

- `merchantId` is required.
- `merchantId` must reference an existing merchant.
- `invoiceNumber` is required.
- `invoiceNumber` must be unique.
- `amount` is required.
- `amount` must be a positive decimal value.
- `currency` is required.
- `currency` must be a valid uppercase 3-letter currency code.
- `dueDate` is optional.
- `dueDate`, when provided, must be a valid ISO 8601 date string.
- New invoices are created with `DRAFT` status by default.

### Possible Errors

- `400 Bad Request`: Missing or invalid request body fields.
- `404 Not Found`: Merchant does not exist.
- `409 Conflict`: An invoice with the same invoice number already exists.
- `500 Internal Server Error`: Unexpected server error.

## GET /api/invoices

### Purpose

List invoices, optionally filtered by merchant or status.

### Request Body

No request body.

Optional query parameters:

```text
merchantId=merchant_uuid
status=DRAFT
limit=20
offset=0
```

### Response Body

```json
{
  "data": [
    {
      "id": "invoice_uuid",
      "merchantId": "merchant_uuid",
      "invoiceNumber": "INV-0001",
      "amount": "2500.00",
      "currency": "USD",
      "status": "DRAFT",
      "dueDate": "2026-06-30T23:59:59.000Z",
      "createdAt": "2026-06-08T12:00:00.000Z",
      "updatedAt": "2026-06-08T12:00:00.000Z"
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 1
  }
}
```

### Validation Rules

- `merchantId` is optional.
- `merchantId`, when provided, must be a valid merchant identifier.
- `status` is optional.
- `status`, when provided, must be one of `DRAFT`, `UNPAID`, `PENDING`, or `PAID`.
- `limit` is optional and defaults to `20`.
- `limit` must be a positive integer.
- `offset` is optional and defaults to `0`.
- `offset` must be a non-negative integer.

### Possible Errors

- `400 Bad Request`: Invalid query parameter.
- `500 Internal Server Error`: Unexpected server error.

## GET /api/invoices/:id

### Purpose

Retrieve a single invoice by ID, including its payments and transaction logs.

### Request Body

No request body.

### Response Body

```json
{
  "id": "invoice_uuid",
  "merchantId": "merchant_uuid",
  "invoiceNumber": "INV-0001",
  "amount": "2500.00",
  "currency": "USD",
  "status": "DRAFT",
  "dueDate": "2026-06-30T23:59:59.000Z",
  "payments": [
    {
      "id": "payment_uuid",
      "invoiceId": "invoice_uuid",
      "amount": "2500.00",
      "currency": "USD",
      "status": "DETECTED",
      "reference": "payment_reference",
      "detectedAt": "2026-06-08T12:05:00.000Z",
      "confirmedAt": null,
      "createdAt": "2026-06-08T12:05:00.000Z",
      "updatedAt": "2026-06-08T12:05:00.000Z"
    }
  ],
  "transactionLogs": [
    {
      "id": "transaction_log_uuid",
      "invoiceId": "invoice_uuid",
      "event": "INVOICE_CREATED",
      "metadata": {
        "source": "api"
      },
      "createdAt": "2026-06-08T12:00:00.000Z"
    }
  ],
  "createdAt": "2026-06-08T12:00:00.000Z",
  "updatedAt": "2026-06-08T12:00:00.000Z"
}
```

### Validation Rules

- `id` path parameter is required.
- `id` must be a valid invoice identifier.

### Possible Errors

- `400 Bad Request`: Invalid invoice ID.
- `404 Not Found`: Invoice does not exist.
- `500 Internal Server Error`: Unexpected server error.

## PATCH /api/invoices/:id/status

### Purpose

Update the status of an invoice.

### Request Body

```json
{
  "status": "UNPAID"
}
```

### Response Body

```json
{
  "id": "invoice_uuid",
  "merchantId": "merchant_uuid",
  "invoiceNumber": "INV-0001",
  "amount": "2500.00",
  "currency": "USD",
  "status": "UNPAID",
  "dueDate": "2026-06-30T23:59:59.000Z",
  "createdAt": "2026-06-08T12:00:00.000Z",
  "updatedAt": "2026-06-08T12:10:00.000Z"
}
```

### Validation Rules

- `id` path parameter is required.
- `id` must be a valid invoice identifier.
- `status` is required.
- `status` must be one of `DRAFT`, `UNPAID`, `PENDING`, or `PAID`.
- Status updates must follow the MVP invoice flow:
  - `DRAFT` can move to `UNPAID`.
  - `UNPAID` can move to `PENDING`.
  - `PENDING` can move to `PAID`.
  - `UNPAID` cannot move directly to `PAID`.
  - `PENDING` cannot move back to `UNPAID`.
  - `PAID` is final and cannot move to another status.

### Possible Errors

- `400 Bad Request`: Invalid invoice ID, missing status, invalid status, or invalid status transition.
- `404 Not Found`: Invoice does not exist.
- `500 Internal Server Error`: Unexpected server error.
