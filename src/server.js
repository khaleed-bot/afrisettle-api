require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const path = require("path");
const prisma = require("./prisma");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/health", (req, res) => {
  return res.status(200).json({
    status: "ok",
    service: "AfriSettle API",
    version: "1.0.0",
  });
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        scriptSrc: ["'self'", "https://cdn.tailwindcss.com"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  })
);
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
  })
);
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/dashboard", (req, res) => {
  return res.sendFile(path.join(__dirname, "..", "public", "dashboard.html"));
});

function generateApiKey() {
  return `as_live_${crypto.randomBytes(32).toString("hex")}`;
}

function hashApiKey(apiKey) {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeRequiredString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalString(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || undefined;
}

function normalizePositiveDecimal(value) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const normalized = String(value).trim();

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  if (Number(normalized) <= 0) {
    return null;
  }

  return normalized;
}

function normalizeCurrency(value) {
  if (value === undefined || value === null || value === "") {
    return "USD";
  }

  const normalized = typeof value === "string" ? value.trim() : "";

  if (!/^[A-Z]{3}$/.test(normalized)) {
    return null;
  }

  return normalized;
}

function normalizeStablecoin(value) {
  if (value === undefined || value === null || value === "") {
    return "USDC";
  }

  return normalizeRequiredString(value);
}

function normalizeDueDate(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const dueDate = new Date(value);

  if (Number.isNaN(dueDate.getTime())) {
    return null;
  }

  return dueDate;
}

function isValidUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function normalizePositiveInteger(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const normalized = String(value).trim();

  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);

  return parsed > 0 ? parsed : null;
}

function normalizeNonNegativeInteger(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const normalized = String(value).trim();

  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  return Number(normalized);
}

async function authenticateMerchant(req, res, next) {
  try {
    const apiKey = normalizeRequiredString(req.header("x-api-key"));

    if (!apiKey) {
      return res.status(401).json({
        error: "x-api-key header is required",
      });
    }

    const apiKeyHash = hashApiKey(apiKey);
    const merchant = await prisma.merchant.findUnique({
      where: { apiKeyHash },
    });

    if (!merchant) {
      return res.status(403).json({
        error: "Invalid API key",
      });
    }

    req.merchant = merchant;
    return next();
  } catch (error) {
    console.error("Failed to authenticate merchant", error);

    return res.status(500).json({
      error: "Unexpected server error",
    });
  }
}

app.post("/api/merchants", async (req, res) => {
  try {
    const { businessName, email, country } = req.body || {};
    const trimmedBusinessName =
      typeof businessName === "string" ? businessName.trim() : "";
    const trimmedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const trimmedCountry = typeof country === "string" ? country.trim() : undefined;

    if (!trimmedBusinessName) {
      return res.status(400).json({
        error: "businessName is required",
      });
    }

    if (!trimmedEmail || !isValidEmail(trimmedEmail)) {
      return res.status(400).json({
        error: "A valid email is required",
      });
    }

    const existingMerchant = await prisma.merchant.findUnique({
      where: { email: trimmedEmail },
    });

    if (existingMerchant) {
      return res.status(409).json({
        error: "A merchant with this email already exists",
      });
    }

    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);

    const merchant = await prisma.merchant.create({
      data: {
        businessName: trimmedBusinessName,
        email: trimmedEmail,
        apiKeyHash,
        ...(trimmedCountry ? { country: trimmedCountry } : {}),
      },
    });

    const { apiKeyHash: _apiKeyHash, ...merchantResponse } = merchant;

    return res.status(201).json({
      ...merchantResponse,
      apiKey,
    });
  } catch (error) {
    if (error && error.code === "P2002") {
      return res.status(409).json({
        error: "A merchant with this email already exists",
      });
    }

    console.error("Failed to create merchant", error);

    return res.status(500).json({
      error: "Unexpected server error",
    });
  }
});

app.post("/api/invoices", authenticateMerchant, async (req, res) => {
  try {
    const body = req.body || {};
    const {
      invoiceNumber,
      customerName,
      customerEmail,
      amount,
      currency,
      dueDate,
    } = body;

    const normalizedInvoiceNumber = normalizeRequiredString(invoiceNumber);
    const normalizedCustomerName = normalizeRequiredString(customerName);
    const normalizedCustomerEmail = normalizeRequiredString(customerEmail);
    const normalizedAmount = normalizePositiveDecimal(amount);
    const normalizedCurrency = normalizeCurrency(currency);
    const normalizedDueDate = normalizeDueDate(dueDate);
    const normalizedDescription = normalizeOptionalString(body.description);
    const normalizedWalletAddress = normalizeOptionalString(body.walletAddress);

    if (!normalizedInvoiceNumber) {
      return res.status(400).json({
        error: "invoiceNumber is required",
      });
    }

    if (!normalizedCustomerName) {
      return res.status(400).json({
        error: "customerName is required",
      });
    }

    if (!normalizedCustomerEmail || !isValidEmail(normalizedCustomerEmail)) {
      return res.status(400).json({
        error: "A valid customerEmail is required",
      });
    }

    if (!normalizedAmount) {
      return res.status(400).json({
        error: "amount must be a positive decimal",
      });
    }

    if (!normalizedCurrency) {
      return res.status(400).json({
        error: "currency must be an uppercase 3-letter code",
      });
    }

    if (normalizedDueDate === null) {
      return res.status(400).json({
        error: "dueDate must be a valid date",
      });
    }

    const existingInvoice = await prisma.invoice.findUnique({
      where: { invoiceNumber: normalizedInvoiceNumber },
    });

    if (existingInvoice) {
      return res.status(409).json({
        error: "An invoice with this invoiceNumber already exists",
      });
    }

    const invoice = await prisma.invoice.create({
      data: {
        merchantId: req.merchant.id,
        invoiceNumber: normalizedInvoiceNumber,
        customerName: normalizedCustomerName,
        customerEmail: normalizedCustomerEmail,
        amount: normalizedAmount,
        currency: normalizedCurrency,
        status: "DRAFT",
        ...(normalizedDueDate ? { dueDate: normalizedDueDate } : {}),
        ...(normalizedDescription ? { description: normalizedDescription } : {}),
        ...(normalizedWalletAddress ? { walletAddress: normalizedWalletAddress } : {}),
      },
    });

    return res.status(201).json(invoice);
  } catch (error) {
    if (error && error.code === "P2002") {
      return res.status(409).json({
        error: "An invoice with this invoiceNumber already exists",
      });
    }

    console.error("Failed to create invoice", error);

    return res.status(500).json({
      error: "Unexpected server error",
    });
  }
});

app.post("/api/payments", authenticateMerchant, async (req, res) => {
  try {
    const body = req.body || {};
    const invoiceId = normalizeRequiredString(body.invoiceId);
    const amountExpected = normalizePositiveDecimal(body.amountExpected);
    const amountReceived =
      body.amountReceived === undefined || body.amountReceived === null || body.amountReceived === ""
        ? undefined
        : normalizePositiveDecimal(body.amountReceived);
    const stablecoin = normalizeStablecoin(body.stablecoin);
    const walletAddress = normalizeOptionalString(body.walletAddress);
    const txHash = normalizeOptionalString(body.txHash);
    const status = normalizeRequiredString(body.status) || "DETECTED";
    const allowedStatuses = ["DETECTED", "CONFIRMED", "FAILED"];

    if (!invoiceId || !isValidUuid(invoiceId)) {
      return res.status(400).json({
        error: "A valid invoiceId is required",
      });
    }

    if (!amountExpected) {
      return res.status(400).json({
        error: "amountExpected must be a positive decimal",
      });
    }

    if (amountReceived === null) {
      return res.status(400).json({
        error: "amountReceived must be a positive decimal",
      });
    }

    if (!stablecoin) {
      return res.status(400).json({
        error: "stablecoin must be a non-empty string",
      });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: "status must be one of DETECTED, CONFIRMED, FAILED",
      });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      return res.status(404).json({
        error: "Invoice does not exist",
      });
    }

    if (invoice.merchantId !== req.merchant.id) {
      return res.status(403).json({
        error: "Forbidden",
      });
    }

    if (txHash) {
      const existingPayment = await prisma.payment.findUnique({
        where: { txHash },
      });

      if (existingPayment) {
        return res.status(409).json({
          error: "A payment with this txHash already exists",
        });
      }
    }

    const payment = await prisma.payment.create({
      data: {
        invoiceId,
        amountExpected,
        ...(amountReceived ? { amountReceived } : {}),
        stablecoin,
        ...(walletAddress ? { walletAddress } : {}),
        ...(txHash ? { txHash } : {}),
        status,
      },
    });

    return res.status(201).json(payment);
  } catch (error) {
    if (error && error.code === "P2002") {
      return res.status(409).json({
        error: "A payment with this txHash already exists",
      });
    }

    console.error("Failed to create payment", error);

    return res.status(500).json({
      error: "Unexpected server error",
    });
  }
});

app.get("/api/circle/health", async (req, res) => {
  const circleApiKey = normalizeRequiredString(process.env.CIRCLE_API_KEY);
  const circleBaseUrl =
    normalizeOptionalString(process.env.CIRCLE_BASE_URL) ||
    "https://api-sandbox.circle.com";

  if (!circleApiKey) {
    return res.status(500).json({
      provider: "Circle",
      status: "not_configured",
    });
  }

  if (typeof fetch !== "function") {
    return res.status(500).json({
      provider: "Circle",
      status: "error",
      message: "fetch is not available in this Node.js runtime",
    });
  }

  try {
    const response = await fetch(`${circleBaseUrl}/v1/configuration`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${circleApiKey}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return res.status(500).json({
        provider: "Circle",
        status: "error",
        message: `Circle responded with status ${response.status}`,
      });
    }

    return res.status(200).json({
      provider: "Circle",
      status: "connected",
    });
  } catch (error) {
    return res.status(500).json({
      provider: "Circle",
      status: "error",
      message: error.message || "Circle health check failed",
    });
  }
});

app.get("/api/invoices", authenticateMerchant, async (req, res) => {
  try {
    const allowedStatuses = ["DRAFT", "UNPAID", "PENDING", "PAID"];
    const merchantId = normalizeOptionalString(req.query.merchantId);
    const status = normalizeOptionalString(req.query.status);
    const limit = normalizePositiveInteger(req.query.limit, 20);
    const offset = normalizeNonNegativeInteger(req.query.offset, 0);

    if (req.query.merchantId !== undefined && !merchantId) {
      return res.status(400).json({
        error: "merchantId must be a non-empty string",
      });
    }

    if (merchantId && merchantId !== req.merchant.id) {
      return res.status(403).json({
        error: "Forbidden",
      });
    }

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: "status must be one of DRAFT, UNPAID, PENDING, PAID",
      });
    }

    if (limit === null) {
      return res.status(400).json({
        error: "limit must be a positive integer",
      });
    }

    if (offset === null) {
      return res.status(400).json({
        error: "offset must be a non-negative integer",
      });
    }

    const where = {
      merchantId: req.merchant.id,
      ...(status ? { status } : {}),
    };

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.invoice.count({ where }),
    ]);

    return res.status(200).json({
      data: invoices,
      pagination: {
        limit,
        offset,
        total,
      },
    });
  } catch (error) {
    console.error("Failed to list invoices", error);

    return res.status(500).json({
      error: "Unexpected server error",
    });
  }
});

app.get("/api/invoices/:id/payments", authenticateMerchant, async (req, res) => {
  try {
    const id = normalizeRequiredString(req.params.id);

    if (!id || !isValidUuid(id)) {
      return res.status(400).json({
        error: "A valid invoice id is required",
      });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
    });

    if (!invoice) {
      return res.status(404).json({
        error: "Invoice does not exist",
      });
    }

    if (invoice.merchantId !== req.merchant.id) {
      return res.status(403).json({
        error: "Forbidden",
      });
    }

    const payments = await prisma.payment.findMany({
      where: { invoiceId: id },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json(payments);
  } catch (error) {
    console.error("Failed to list invoice payments", error);

    return res.status(500).json({
      error: "Unexpected server error",
    });
  }
});

app.get("/api/invoices/:id/timeline", authenticateMerchant, async (req, res) => {
  try {
    const id = normalizeRequiredString(req.params.id);

    if (!id || !isValidUuid(id)) {
      return res.status(400).json({
        error: "A valid invoice id is required",
      });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
    });

    if (!invoice) {
      return res.status(404).json({
        error: "Invoice does not exist",
      });
    }

    if (invoice.merchantId !== req.merchant.id) {
      return res.status(403).json({
        error: "Forbidden",
      });
    }

    const timeline = await prisma.transactionLog.findMany({
      where: { invoiceId: id },
      orderBy: { createdAt: "asc" },
      select: {
        action: true,
        message: true,
        createdAt: true,
      },
    });

    return res.status(200).json({
      invoiceId: id,
      timeline,
    });
  } catch (error) {
    console.error("Failed to retrieve invoice timeline", error);

    return res.status(500).json({
      error: "Unexpected server error",
    });
  }
});

app.get("/api/invoices/:id", authenticateMerchant, async (req, res) => {
  try {
    const id = normalizeRequiredString(req.params.id);

    if (!id || !isValidUuid(id)) {
      return res.status(400).json({
        error: "A valid invoice id is required",
      });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
    });

    if (!invoice) {
      return res.status(404).json({
        error: "Invoice does not exist",
      });
    }

    if (invoice.merchantId !== req.merchant.id) {
      return res.status(403).json({
        error: "Forbidden",
      });
    }

    const invoiceWithRelations = await prisma.invoice.findUnique({
      where: { id },
      include: {
        merchant: true,
        payments: true,
        transactionLogs: true,
      },
    });

    return res.status(200).json(invoiceWithRelations);
  } catch (error) {
    console.error("Failed to retrieve invoice", error);

    return res.status(500).json({
      error: "Unexpected server error",
    });
  }
});

app.get("/api/payments/:id", authenticateMerchant, async (req, res) => {
  try {
    const id = normalizeRequiredString(req.params.id);

    if (!id || !isValidUuid(id)) {
      return res.status(400).json({
        error: "A valid payment id is required",
      });
    }

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        invoice: true,
      },
    });

    if (!payment) {
      return res.status(404).json({
        error: "Payment does not exist",
      });
    }

    if (payment.invoice.merchantId !== req.merchant.id) {
      return res.status(403).json({
        error: "Forbidden",
      });
    }

    return res.status(200).json(payment);
  } catch (error) {
    console.error("Failed to retrieve payment", error);

    return res.status(500).json({
      error: "Unexpected server error",
    });
  }
});

app.patch("/api/invoices/:id/wallet", authenticateMerchant, async (req, res) => {
  try {
    const id = normalizeRequiredString(req.params.id);
    const walletAddress = normalizeRequiredString(req.body && req.body.walletAddress);

    if (!id || !isValidUuid(id)) {
      return res.status(400).json({
        error: "A valid invoice id is required",
      });
    }

    if (!walletAddress) {
      return res.status(400).json({
        error: "walletAddress is required",
      });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
    });

    if (!invoice) {
      return res.status(404).json({
        error: "Invoice does not exist",
      });
    }

    if (invoice.merchantId !== req.merchant.id) {
      return res.status(403).json({
        error: "Forbidden",
      });
    }

    const [updatedInvoice] = await prisma.$transaction([
      prisma.invoice.update({
        where: { id },
        data: { walletAddress },
      }),
      prisma.transactionLog.create({
        data: {
          invoiceId: id,
          action: "WALLET_ASSIGNED",
          message: "Wallet assigned to invoice",
        },
      }),
    ]);

    return res.status(200).json(updatedInvoice);
  } catch (error) {
    console.error("Failed to assign invoice wallet", error);

    return res.status(500).json({
      error: "Unexpected server error",
    });
  }
});

app.patch("/api/payments/:id/status", authenticateMerchant, async (req, res) => {
  try {
    const id = normalizeRequiredString(req.params.id);
    const status = normalizeRequiredString(req.body && req.body.status);
    const allowedStatuses = ["DETECTED", "CONFIRMED", "FAILED"];

    if (!id || !isValidUuid(id)) {
      return res.status(400).json({
        error: "A valid payment id is required",
      });
    }

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: "status must be one of DETECTED, CONFIRMED, FAILED",
      });
    }

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: { invoice: true },
    });

    if (!payment) {
      return res.status(404).json({
        error: "Payment does not exist",
      });
    }

    if (payment.invoice.merchantId !== req.merchant.id) {
      return res.status(403).json({
        error: "Forbidden",
      });
    }

    if (payment.status === "CONFIRMED" || payment.status === "FAILED") {
      return res.status(400).json({
        error: `Payment status ${payment.status} is final`,
      });
    }

    if (payment.status !== "DETECTED" || status === "DETECTED") {
      return res.status(400).json({
        error: `Invalid payment status transition from ${payment.status} to ${status}`,
      });
    }

    const now = new Date();

    const updatedPayment =
      status === "CONFIRMED"
        ? await prisma.$transaction(async (tx) => {
            await tx.payment.update({
              where: { id },
              data: {
                status,
                confirmedAt: now,
              },
            });

            await tx.invoice.update({
              where: { id: payment.invoiceId },
              data: {
                status: "PAID",
                paidAt: now,
              },
            });

            await tx.transactionLog.create({
              data: {
                invoiceId: payment.invoiceId,
                action: "PAYMENT_CONFIRMED",
                message: "Payment confirmed and invoice settled",
              },
            });

            return tx.payment.findUnique({
              where: { id },
              include: { invoice: true },
            });
          })
        : await prisma.$transaction(async (tx) => {
            return tx.payment.update({
              where: { id },
              data: { status },
              include: { invoice: true },
            });
          });

    return res.status(200).json(updatedPayment);
  } catch (error) {
    console.error("Failed to update payment status", error);

    return res.status(500).json({
      error: "Unexpected server error",
    });
  }
});

app.patch("/api/invoices/:id/status", authenticateMerchant, async (req, res) => {
  try {
    const id = normalizeRequiredString(req.params.id);
    const status = normalizeRequiredString(req.body && req.body.status);
    const allowedStatuses = ["DRAFT", "UNPAID", "PENDING", "PAID"];
    const allowedTransitions = {
      DRAFT: "UNPAID",
      UNPAID: "PENDING",
      PENDING: "PAID",
    };

    if (!id || !isValidUuid(id)) {
      return res.status(400).json({
        error: "A valid invoice id is required",
      });
    }

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: "status must be one of DRAFT, UNPAID, PENDING, PAID",
      });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
    });

    if (!invoice) {
      return res.status(404).json({
        error: "Invoice does not exist",
      });
    }

    if (invoice.merchantId !== req.merchant.id) {
      return res.status(403).json({
        error: "Forbidden",
      });
    }

    if (allowedTransitions[invoice.status] !== status) {
      return res.status(400).json({
        error: `Invalid status transition from ${invoice.status} to ${status}`,
      });
    }

    const [updatedInvoice] = await prisma.$transaction([
      prisma.invoice.update({
        where: { id },
        data: {
          status,
          ...(status === "PAID" ? { paidAt: new Date() } : {}),
        },
      }),
      prisma.transactionLog.create({
        data: {
          invoiceId: id,
          action: "STATUS_CHANGED",
          oldStatus: invoice.status,
          newStatus: status,
          message: `Invoice status changed from ${invoice.status} to ${status}`,
        },
      }),
    ]);

    return res.status(200).json(updatedInvoice);
  } catch (error) {
    console.error("Failed to update invoice status", error);

    return res.status(500).json({
      error: "Unexpected server error",
    });
  }
});

app.listen(PORT, () => {
  console.log(`AfriSettle API listening on port ${PORT}`);
});
