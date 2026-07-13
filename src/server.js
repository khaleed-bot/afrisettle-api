require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const path = require("path");
const prisma = require("./prisma");
const {
  getCircleConfig,
  getCircleSchedulerConfig,
  getCircleWebhookConfig,
  parseBooleanStrict,
  parsePositiveInteger,
} = require("./config/circle");
const circleClient = require("./services/circleClient");
const {
  reconcileMerchantCirclePayments,
} = require("./services/circleReconciliationService");
const {
  startCircleReconciliationScheduler,
} = require("./services/circleReconciliationScheduler");
const {
  receiveCircleWebhook,
} = require("./services/circleWebhookService");
const CircleApiError = require("./errors/circleApiError");

const SERVICE_VERSION = "1.0.0";

function redactConfigStatus(value) {
  return normalizeRequiredString(value) ? "present" : "missing";
}

function isValidCircleBlockchain(value) {
  return /^[A-Z0-9-]{2,40}$/.test(normalizeRequiredString(value).toUpperCase());
}

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function getCircleFeatureState() {
  const scheduler = getCircleSchedulerConfig();
  const webhook = getCircleWebhookConfig();
  const circleCredentialsPresent = [
    process.env.CIRCLE_API_KEY,
    process.env.CIRCLE_ENTITY_SECRET,
  ].some((value) => normalizeRequiredString(value));

  return {
    scheduler,
    webhook,
    circleCredentialsPresent,
    circleFeaturesEnabled:
      scheduler.enabled || webhook.verifySignature || circleCredentialsPresent,
  };
}

function validateStartupEnvironment() {
  const errors = [];
  const warnings = [];
  const databaseUrl = normalizeRequiredString(process.env.DATABASE_URL);
  const port = parsePositiveInteger(process.env.PORT, null);
  const nodeEnv = normalizeRequiredString(process.env.NODE_ENV) || "development";
  const { scheduler, webhook, circleFeaturesEnabled } = getCircleFeatureState();
  const circleConfig = getCircleConfig();

  if (!databaseUrl) {
    errors.push("DATABASE_URL is required");
  }

  if (!process.env.PORT || !port) {
    errors.push("PORT is required and must be a positive integer");
  }

  if (
    process.env.CIRCLE_RECONCILE_ENABLED !== undefined &&
    parseBooleanStrict(process.env.CIRCLE_RECONCILE_ENABLED) === null
  ) {
    errors.push("CIRCLE_RECONCILE_ENABLED must be true or false");
  }

  if (
    process.env.CIRCLE_RECONCILE_INTERVAL_MS !== undefined &&
    !parsePositiveInteger(process.env.CIRCLE_RECONCILE_INTERVAL_MS, null)
  ) {
    errors.push("CIRCLE_RECONCILE_INTERVAL_MS must be a positive integer");
  }

  if (
    process.env.CIRCLE_WEBHOOK_VERIFY_SIGNATURE !== undefined &&
    parseBooleanStrict(process.env.CIRCLE_WEBHOOK_VERIFY_SIGNATURE) === null
  ) {
    errors.push("CIRCLE_WEBHOOK_VERIFY_SIGNATURE must be true or false");
  }

  if (circleFeaturesEnabled) {
    if (!circleConfig.apiKey) {
      errors.push("CIRCLE_API_KEY is required when Circle features are enabled");
    }

    if (!circleConfig.entitySecret) {
      errors.push(
        "CIRCLE_ENTITY_SECRET is required when Circle features are enabled"
      );
    }

    if (!normalizeRequiredString(process.env.CIRCLE_BASE_URL)) {
      errors.push("CIRCLE_BASE_URL is required when Circle features are enabled");
    } else if (!isValidUrl(circleConfig.baseUrl)) {
      errors.push("CIRCLE_BASE_URL must be a valid URL");
    }

    if (!normalizeRequiredString(process.env.CIRCLE_DEFAULT_BLOCKCHAIN)) {
      errors.push(
        "CIRCLE_DEFAULT_BLOCKCHAIN is required when Circle features are enabled"
      );
    } else if (!isValidCircleBlockchain(circleConfig.defaultBlockchain)) {
      errors.push("CIRCLE_DEFAULT_BLOCKCHAIN is invalid");
    }
  } else {
    warnings.push("Circle features are disabled because Circle config is not enabled");
  }

  if (!scheduler.enabled) {
    warnings.push("Circle reconciliation scheduler is disabled");
  }

  if (!webhook.verifySignature) {
    if (nodeEnv === "production") {
      errors.push(
        "CIRCLE_WEBHOOK_VERIFY_SIGNATURE=false is not allowed in production"
      );
    } else {
      warnings.push("Circle webhook signature verification is disabled");
    }
  }

  if (errors.length > 0) {
    console.error("AfriSettle startup validation failed", { errors });
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn("AfriSettle startup warnings", { warnings });
  }

  return {
    nodeEnv,
    port,
    scheduler,
    webhook,
    circleFeaturesEnabled,
  };
}

const app = express();
const startupConfig = validateStartupEnvironment();
const PORT = startupConfig.port;

app.get("/health", async (req, res) => {
  const circleConfig = getCircleConfig();
  const scheduler = getCircleSchedulerConfig();
  const webhook = getCircleWebhookConfig();
  let databaseStatus = "connected";
  let status = "ok";

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    databaseStatus = "error";
    status = "error";
  }

  return res.status(status === "ok" ? 200 : 503).json({
    status,
    service: "AfriSettle API",
    version: SERVICE_VERSION,
    database: {
      status: databaseStatus,
    },
    circle: {
      configured:
        Boolean(circleConfig.apiKey) &&
        Boolean(circleConfig.entitySecret) &&
        Boolean(circleConfig.baseUrl) &&
        Boolean(circleConfig.defaultBlockchain),
      apiKey: redactConfigStatus(circleConfig.apiKey),
      entitySecret: redactConfigStatus(circleConfig.entitySecret),
      baseUrl: redactConfigStatus(process.env.CIRCLE_BASE_URL),
      defaultBlockchain: redactConfigStatus(
        process.env.CIRCLE_DEFAULT_BLOCKCHAIN
      ),
    },
    scheduler: {
      enabled: scheduler.enabled,
      intervalMs: scheduler.intervalMs,
    },
    webhook: {
      signatureVerificationEnabled: webhook.verifySignature,
    },
  });
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        scriptSrc: ["'self'", "https://cdn.tailwindcss.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      },
    },
  })
);
const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

if (startupConfig.nodeEnv !== "development") {
  app.use("/api", apiRateLimiter);
} else {
  console.warn("API rate limiting is disabled in development");
}

app.head("/api/webhooks/circle", (req, res) => {
  return res.sendStatus(200);
});

app.get("/api/webhooks/circle", (req, res) => {
  return res.status(200).json({
    provider: "Circle",
    status: "ok",
  });
});

app.post(
  "/api/webhooks/circle",
  express.raw({ type: "*/*", limit: "1mb" }),
  async (req, res) => {
    try {
      const rawBody = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from("");
      const result = await receiveCircleWebhook({
        headers: req.headers,
        rawBody,
      });

      return res.status(result.duplicate ? 200 : 202).json({
        provider: "Circle",
        status: result.duplicate ? "duplicate" : "received",
        eventId: result.eventId,
        externalEventId: result.externalEventId,
        notificationType: result.notificationType,
      });
    } catch (error) {
      if (error instanceof SyntaxError) {
        return res.status(400).json({
          error: "Invalid webhook payload",
        });
      }

      if (error && error.status === 401) {
        return res.status(401).json({
          error: error.message,
        });
      }

      console.error("Failed to receive Circle webhook", {
        error: error && error.message ? error.message : "Unknown error",
      });

      return res.status(500).json({
        error: "Unable to receive Circle webhook",
      });
    }
  }
);

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/", (req, res) => {
  return res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.get("/dashboard", (req, res) => {
  return res.sendFile(path.join(__dirname, "..", "public", "dashboard.html"));
});

app.get("/invoices", (req, res) => {
  return res.sendFile(path.join(__dirname, "..", "public", "invoices.html"));
});

app.get("/payments", (req, res) => {
  return res.sendFile(path.join(__dirname, "..", "public", "payments.html"));
});

app.get("/analytics", (req, res) => {
  return res.sendFile(path.join(__dirname, "..", "public", "analytics.html"));
});

app.get("/create-invoice", (req, res) => {
  return res.sendFile(path.join(__dirname, "..", "public", "create-invoice.html"));
});

app.get("/invoice-detail", (req, res) => {
  return res.sendFile(path.join(__dirname, "..", "public", "invoice-detail.html"));
});

app.get("/pay-invoice", (req, res) => {
  return res.sendFile(path.join(__dirname, "..", "public", "pay-invoice.html"));
});

app.get("/wallets", (req, res) => {
  return res.sendFile(path.join(__dirname, "..", "public", "wallets.html"));
});

app.get("/settings", (req, res) => {
  return res.sendFile(path.join(__dirname, "..", "public", "settings.html"));
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

function unwrapCircleData(response) {
  const body = response && response.body;
  return body && body.data ? body.data : body;
}

function unwrapCircleWallet(response) {
  const data = unwrapCircleData(response);
  return data && data.wallet ? data.wallet : data;
}

function getCircleWalletId(wallet) {
  return wallet && (wallet.id || wallet.walletId);
}

function getCircleWalletAddress(wallet) {
  return (
    wallet &&
    (wallet.address ||
      (wallet.account && wallet.account.address) ||
      (Array.isArray(wallet.addresses) &&
        wallet.addresses[0] &&
        wallet.addresses[0].address))
  );
}

function getCircleWalletBlockchain(wallet) {
  return (
    wallet &&
    (wallet.blockchain ||
      wallet.chain ||
      wallet.network ||
      (Array.isArray(wallet.addresses) &&
        wallet.addresses[0] &&
        (wallet.addresses[0].blockchain ||
          wallet.addresses[0].chain ||
          wallet.addresses[0].network)))
  );
}

function getCircleWalletFields(wallet) {
  const address = getCircleWalletAddress(wallet);
  const blockchain = getCircleWalletBlockchain(wallet);

  return {
    paymentExpiresAt: null,
    depositAddressTag: null,
    ...(wallet && wallet.state
      ? { circleIntentStatus: String(wallet.state) }
      : wallet && wallet.status
        ? { circleIntentStatus: String(wallet.status) }
        : {}),
    ...(address ? { depositAddress: String(address) } : {}),
    ...(blockchain ? { paymentChain: String(blockchain) } : {}),
  };
}

function unwrapCircleWalletSet(data) {
  return data && data.walletSet ? data.walletSet : data;
}

function unwrapCircleCreatedWallet(data) {
  if (data && Array.isArray(data.wallets)) {
    return data.wallets[0];
  }

  if (data && data.wallet) {
    return data.wallet;
  }

  return data;
}

function serializeCircleWallet(wallet, walletSetId) {
  return {
    walletSetId: walletSetId || wallet.walletSetId || null,
    walletId: getCircleWalletId(wallet),
    address: getCircleWalletAddress(wallet) || null,
    blockchain: getCircleWalletBlockchain(wallet) || null,
    state: wallet.state || wallet.status || null,
  };
}

async function syncCircleWalletRecord(client, merchantId, wallet) {
  const address = getCircleWalletAddress(wallet);

  if (!address) {
    return null;
  }

  const blockchain = getCircleWalletBlockchain(wallet) || getCircleConfig().defaultBlockchain;
  const normalizedAddress = String(address);

  await client.wallet.updateMany({
    where: { merchantId },
    data: { isDefault: false },
  });

  return client.wallet.upsert({
    where: {
      merchantId_address: {
        merchantId,
        address: normalizedAddress,
      },
    },
    create: {
      merchantId,
      label: "Circle Merchant Wallet",
      address: normalizedAddress,
      network: String(blockchain).toUpperCase(),
      stablecoin: "USDC",
      isDefault: true,
    },
    update: {
      label: "Circle Merchant Wallet",
      network: String(blockchain).toUpperCase(),
      stablecoin: "USDC",
      isDefault: true,
    },
  });
}

async function getInvoicePaymentAddressData(merchant) {
  if (merchant.circleMerchantWalletId) {
    if (!circleClient.isConfigured()) {
      throw new CircleApiError("Circle is not configured", {
        code: "CIRCLE_NOT_CONFIGURED",
        retryable: false,
      });
    }

    const circleResponse = await circleClient.getWallet(
      merchant.circleMerchantWalletId
    );
    const circleWallet = unwrapCircleWallet(circleResponse);

    if (!circleWallet || !getCircleWalletId(circleWallet)) {
      throw new CircleApiError("Circle returned an invalid wallet response", {
        status: 502,
        retryable: false,
      });
    }

    const circleFields = getCircleWalletFields(circleWallet);

    if (!circleFields.depositAddress) {
      throw new CircleApiError("Circle wallet does not have a deposit address", {
        status: 502,
        retryable: false,
      });
    }

    return {
      data: {
        ...circleFields,
        walletAddress: circleFields.depositAddress,
        stablecoin: "USDC",
      },
      circleWallet,
      source: "CIRCLE",
    };
  }

  const defaultWallet = await prisma.wallet.findFirst({
    where: { merchantId: merchant.id },
    orderBy: [
      { isDefault: "desc" },
      { createdAt: "desc" },
    ],
  });

  if (!defaultWallet) {
    return {
      data: {},
      circleWallet: null,
      source: null,
    };
  }

  return {
    data: {
      walletAddress: defaultWallet.address,
      depositAddress: defaultWallet.address,
      paymentChain: defaultWallet.network,
      stablecoin: defaultWallet.stablecoin || "USDC",
    },
    circleWallet: null,
    source: "WALLET",
  };
}

function normalizeCircleBlockchain(value, defaultValue) {
  const normalized =
    value === undefined || value === null || value === ""
      ? defaultValue
      : normalizeRequiredString(value).toUpperCase();

  return /^[A-Z0-9-]{2,40}$/.test(normalized) ? normalized : null;
}

function isCircleTestApiKey(apiKey) {
  return normalizeRequiredString(apiKey).startsWith("TEST_API_KEY:");
}

function isCircleMainnetBlockchain(blockchain) {
  return !normalizeRequiredString(blockchain).includes("TESTNET") &&
    !normalizeRequiredString(blockchain).includes("SEPOLIA") &&
    !normalizeRequiredString(blockchain).includes("AMOY");
}

function serializeCircleDepositAddress(invoice, circleWalletId) {
  return {
    invoiceId: invoice.id,
    circleWalletId,
    status: invoice.circleIntentStatus,
    stablecoin: invoice.stablecoin,
    chain: invoice.paymentChain,
    depositAddress: invoice.depositAddress,
    depositAddressTag: invoice.depositAddressTag,
    expiresAt: invoice.paymentExpiresAt,
  };
}

function getCircleErrorResponse(error) {
  if (!error || error.name !== "CircleApiError") {
    return {
      status: 500,
      body: {
        error: "Unexpected server error",
      },
    };
  }

  if (error && error.code === "CIRCLE_NOT_CONFIGURED") {
    return {
      status: 500,
      body: {
        error: "Circle is not configured",
      },
    };
  }

  if (error && error.status === 400) {
    return {
      status: 400,
      body: {
        error: "Circle rejected the wallet request",
      },
    };
  }

  if (error && error.status === 401) {
    return {
      status: 502,
      body: {
        error: "Circle authentication failed",
      },
    };
  }

  if (error && error.status === 404) {
    return {
      status: 502,
      body: {
        error: "Circle wallet was not found",
      },
    };
  }

  return {
    status: error && error.retryable ? 503 : 502,
    body: {
      error: "Circle wallet request failed",
    },
  };
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

app.get("/api/merchant/me", authenticateMerchant, async (req, res) => {
  try {
    const merchant = await prisma.merchant.findUnique({
      where: { id: req.merchant.id },
      select: {
        id: true,
        businessName: true,
        email: true,
        country: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!merchant) {
      return res.status(404).json({
        error: "Merchant does not exist",
      });
    }

    return res.status(200).json(merchant);
  } catch (error) {
    console.error("Failed to retrieve merchant profile", error);

    return res.status(500).json({
      error: "Unexpected server error",
    });
  }
});

app.patch("/api/merchant/me", authenticateMerchant, async (req, res) => {
  try {
    const body = req.body || {};
    const allowedFields = ["businessName", "email", "country"];
    const suppliedFields = allowedFields.filter((field) =>
      Object.prototype.hasOwnProperty.call(body, field)
    );

    if (suppliedFields.length === 0) {
      return res.status(400).json({
        error: "At least one profile field is required",
      });
    }

    const data = {};

    if (Object.prototype.hasOwnProperty.call(body, "businessName")) {
      const businessName = normalizeRequiredString(body.businessName);

      if (!businessName) {
        return res.status(400).json({
          error: "businessName must be a non-empty string",
        });
      }

      data.businessName = businessName;
    }

    if (Object.prototype.hasOwnProperty.call(body, "email")) {
      const email = normalizeRequiredString(body.email).toLowerCase();

      if (!email || !isValidEmail(email)) {
        return res.status(400).json({
          error: "A valid email is required",
        });
      }

      const existingMerchant = await prisma.merchant.findUnique({
        where: { email },
      });

      if (existingMerchant && existingMerchant.id !== req.merchant.id) {
        return res.status(409).json({
          error: "A merchant with this email already exists",
        });
      }

      data.email = email;
    }

    if (Object.prototype.hasOwnProperty.call(body, "country")) {
      data.country = normalizeOptionalString(body.country) || null;
    }

    const merchant = await prisma.merchant.update({
      where: { id: req.merchant.id },
      data,
      select: {
        id: true,
        businessName: true,
        email: true,
        country: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(200).json(merchant);
  } catch (error) {
    if (error && error.code === "P2002") {
      return res.status(409).json({
        error: "A merchant with this email already exists",
      });
    }

    console.error("Failed to update merchant profile", error);

    return res.status(500).json({
      error: "Unexpected server error",
    });
  }
});

app.post("/api/wallets", authenticateMerchant, async (req, res) => {
  try {
    const body = req.body || {};
    const label = normalizeRequiredString(body.label);
    const address = normalizeRequiredString(body.address);
    const network =
      body.network === undefined
        ? "ETHEREUM"
        : normalizeRequiredString(body.network).toUpperCase();
    const stablecoin =
      body.stablecoin === undefined
        ? "USDC"
        : normalizeRequiredString(body.stablecoin).toUpperCase();
    const isDefault = body.isDefault === undefined ? false : body.isDefault;

    if (!label) {
      return res.status(400).json({
        error: "label is required",
      });
    }

    if (!address) {
      return res.status(400).json({
        error: "address is required",
      });
    }

    if (!network) {
      return res.status(400).json({
        error: "network must be a non-empty string",
      });
    }

    if (!stablecoin) {
      return res.status(400).json({
        error: "stablecoin must be a non-empty string",
      });
    }

    if (typeof isDefault !== "boolean") {
      return res.status(400).json({
        error: "isDefault must be a boolean",
      });
    }

    const existingWallet = await prisma.wallet.findUnique({
      where: {
        merchantId_address: {
          merchantId: req.merchant.id,
          address,
        },
      },
    });

    if (existingWallet) {
      return res.status(409).json({
        error: "A wallet with this address already exists",
      });
    }

    const wallet = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.wallet.updateMany({
          where: { merchantId: req.merchant.id },
          data: { isDefault: false },
        });
      }

      return tx.wallet.create({
        data: {
          merchantId: req.merchant.id,
          label,
          address,
          network,
          stablecoin,
          isDefault,
        },
      });
    });

    return res.status(201).json(wallet);
  } catch (error) {
    if (error && error.code === "P2002") {
      return res.status(409).json({
        error: "A wallet with this address already exists",
      });
    }

    console.error("Failed to create wallet", error);

    return res.status(500).json({
      error: "Unexpected server error",
    });
  }
});

app.get("/api/wallets", authenticateMerchant, async (req, res) => {
  try {
    const wallets = await prisma.wallet.findMany({
      where: { merchantId: req.merchant.id },
      orderBy: [
        { isDefault: "desc" },
        { createdAt: "desc" },
      ],
    });

    return res.status(200).json({
      data: wallets,
      pagination: {
        total: wallets.length,
      },
    });
  } catch (error) {
    console.error("Failed to list wallets", error);

    return res.status(500).json({
      error: "Unexpected server error",
    });
  }
});

app.patch("/api/wallets/:id", authenticateMerchant, async (req, res) => {
  try {
    const id = normalizeRequiredString(req.params.id);
    const body = req.body || {};
    const allowedFields = ["label", "address", "network", "stablecoin", "isDefault"];
    const suppliedFields = allowedFields.filter((field) =>
      Object.prototype.hasOwnProperty.call(body, field)
    );

    if (!id || !isValidUuid(id)) {
      return res.status(400).json({
        error: "A valid wallet id is required",
      });
    }

    if (suppliedFields.length === 0) {
      return res.status(400).json({
        error: "At least one wallet field is required",
      });
    }

    const wallet = await prisma.wallet.findUnique({
      where: { id },
    });

    if (!wallet) {
      return res.status(404).json({
        error: "Wallet does not exist",
      });
    }

    if (wallet.merchantId !== req.merchant.id) {
      return res.status(403).json({
        error: "Forbidden",
      });
    }

    const data = {};

    for (const field of ["label", "address", "network", "stablecoin"]) {
      if (!Object.prototype.hasOwnProperty.call(body, field)) {
        continue;
      }

      const value = normalizeRequiredString(body[field]);

      if (!value) {
        return res.status(400).json({
          error: `${field} must be a non-empty string`,
        });
      }

      data[field] =
        field === "network" || field === "stablecoin"
          ? value.toUpperCase()
          : value;
    }

    if (Object.prototype.hasOwnProperty.call(body, "isDefault")) {
      if (typeof body.isDefault !== "boolean") {
        return res.status(400).json({
          error: "isDefault must be a boolean",
        });
      }

      data.isDefault = body.isDefault;
    }

    if (data.address && data.address !== wallet.address) {
      const duplicateWallet = await prisma.wallet.findUnique({
        where: {
          merchantId_address: {
            merchantId: req.merchant.id,
            address: data.address,
          },
        },
      });

      if (duplicateWallet) {
        return res.status(409).json({
          error: "A wallet with this address already exists",
        });
      }
    }

    const updatedWallet = await prisma.$transaction(async (tx) => {
      if (data.isDefault === true) {
        await tx.wallet.updateMany({
          where: {
            merchantId: req.merchant.id,
            id: { not: id },
          },
          data: { isDefault: false },
        });
      }

      return tx.wallet.update({
        where: { id },
        data,
      });
    });

    return res.status(200).json(updatedWallet);
  } catch (error) {
    if (error && error.code === "P2002") {
      return res.status(409).json({
        error: "A wallet with this address already exists",
      });
    }

    console.error("Failed to update wallet", error);

    return res.status(500).json({
      error: "Unexpected server error",
    });
  }
});

app.delete("/api/wallets/:id", authenticateMerchant, async (req, res) => {
  try {
    const id = normalizeRequiredString(req.params.id);

    if (!id || !isValidUuid(id)) {
      return res.status(400).json({
        error: "A valid wallet id is required",
      });
    }

    const wallet = await prisma.wallet.findUnique({
      where: { id },
    });

    if (!wallet) {
      return res.status(404).json({
        error: "Wallet does not exist",
      });
    }

    if (wallet.merchantId !== req.merchant.id) {
      return res.status(403).json({
        error: "Forbidden",
      });
    }

    await prisma.wallet.delete({
      where: { id },
    });

    return res.status(200).json({
      message: "Wallet deleted",
    });
  } catch (error) {
    console.error("Failed to delete wallet", error);

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

    const paymentAddress = await getInvoicePaymentAddressData(req.merchant);
    const invoice = await prisma.$transaction(async (tx) => {
      if (paymentAddress.circleWallet) {
        await syncCircleWalletRecord(
          tx,
          req.merchant.id,
          paymentAddress.circleWallet
        );
      }

      const createdInvoice = await tx.invoice.create({
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
          ...paymentAddress.data,
          ...(normalizedWalletAddress
            ? { walletAddress: normalizedWalletAddress }
            : {}),
        },
      });

      if (paymentAddress.source) {
        await tx.transactionLog.create({
          data: {
            invoiceId: createdInvoice.id,
            action:
              paymentAddress.source === "CIRCLE"
                ? "CIRCLE_DEPOSIT_ADDRESS_ASSIGNED"
                : "WALLET_ASSIGNED",
            message:
              paymentAddress.source === "CIRCLE"
                ? "Circle deposit address assigned to invoice"
                : "Wallet assigned to invoice",
            metadata: {
              source: paymentAddress.source,
              chain: createdInvoice.paymentChain || null,
            },
          },
        });
      }

      return createdInvoice;
    });

    return res.status(201).json(invoice);
  } catch (error) {
    if (error && error.code === "P2002") {
      return res.status(409).json({
        error: "An invoice with this invoiceNumber already exists",
      });
    }

    if (error && error.name === "CircleApiError") {
      const circleError = getCircleErrorResponse(error);

      return res.status(circleError.status).json(circleError.body);
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

app.get("/api/public/invoices/:id/payment", async (req, res) => {
  try {
    const id = normalizeRequiredString(req.params.id);

    if (!id || !isValidUuid(id)) {
      return res.status(400).json({
        error: "A valid invoice id is required",
      });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: {
        invoiceNumber: true,
        amount: true,
        stablecoin: true,
        dueDate: true,
        paidAt: true,
        status: true,
        paymentChain: true,
        depositAddress: true,
        depositAddressTag: true,
        walletAddress: true,
        merchant: {
          select: {
            businessName: true,
          },
        },
        payments: {
          orderBy: { createdAt: "desc" },
          select: {
            status: true,
            txHash: true,
            confirmedAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!invoice) {
      return res.status(404).json({
        error: "Invoice does not exist",
      });
    }

    const confirmedPayment = invoice.payments.find(
      (payment) => payment.status === "CONFIRMED"
    );
    const detectedPayment = invoice.payments.find(
      (payment) => payment.status === "DETECTED"
    );
    const paymentStatus =
      invoice.status === "PAID" || confirmedPayment
        ? "Paid"
        : detectedPayment || invoice.status === "PENDING"
          ? "Payment Detected"
          : "Awaiting Payment";

    const paymentAddress = invoice.depositAddress || invoice.walletAddress || null;

    return res.status(200).json({
      invoiceNumber: invoice.invoiceNumber,
      merchant: {
        businessName: invoice.merchant.businessName,
      },
      amount: invoice.amount,
      stablecoin: invoice.stablecoin,
      dueDate: invoice.dueDate,
      paymentStatus,
      chain: invoice.paymentChain,
      depositAddress: paymentAddress,
      depositAddressTag: invoice.depositAddressTag,
      txHash:
        confirmedPayment && confirmedPayment.txHash ? confirmedPayment.txHash : null,
      paidAt: invoice.paidAt,
      confirmedAt:
        confirmedPayment && confirmedPayment.confirmedAt
          ? confirmedPayment.confirmedAt
          : null,
    });
  } catch (error) {
    console.error("Failed to retrieve public invoice payment page", error);

    return res.status(500).json({
      error: "Unexpected server error",
    });
  }
});

app.get("/api/circle/health", async (req, res) => {
  if (!circleClient.isConfigured()) {
    return res.status(500).json({
      provider: "Circle",
      status: "not_configured",
    });
  }

  try {
    await circleClient.checkConnection();

    return res.status(200).json({
      provider: "Circle",
      status: "connected",
    });
  } catch (error) {
    if (error && error.name === "CircleApiError") {
      return res.status(500).json({
        provider: "Circle",
        status: "error",
        httpStatus: error.status || null,
        code: error.code || null,
        message: error.message || "Circle health check failed",
      });
    }

    return res.status(500).json({
      provider: "Circle",
      status: "error",
      message: error.message || "Circle health check failed",
    });
  }
});

app.post("/api/circle/wallet-set", authenticateMerchant, async (req, res) => {
  try {
    if (!circleClient.isConfigured()) {
      return res.status(500).json({
        error: "Circle is not configured",
      });
    }

    if (req.merchant.circleWalletSetId) {
      return res.status(200).json({
        walletSetId: req.merchant.circleWalletSetId,
        created: false,
      });
    }

    const walletSetData = await circleClient.createWalletSet({
      name: `AfriSettle ${req.merchant.businessName}`,
    });
    const walletSet = unwrapCircleWalletSet(walletSetData);

    if (!walletSet || !walletSet.id) {
      return res.status(502).json({
        error: "Circle returned an invalid wallet set response",
      });
    }

    const merchant = await prisma.merchant.update({
      where: { id: req.merchant.id },
      data: {
        circleWalletSetId: walletSet.id,
        circleIntegrationStatus: "WALLET_SET_CREATED",
      },
    });

    return res.status(201).json({
      walletSetId: merchant.circleWalletSetId,
      created: true,
    });
  } catch (error) {
    console.error("Failed to create Circle wallet set", error);
    const circleError = getCircleErrorResponse(error);

    return res.status(circleError.status).json(circleError.body);
  }
});

app.post("/api/circle/wallet", authenticateMerchant, async (req, res) => {
  try {
    if (!circleClient.isConfigured()) {
      return res.status(500).json({
        error: "Circle is not configured",
      });
    }

    const circleConfig = getCircleConfig();
    const blockchain = normalizeCircleBlockchain(
      req.body && req.body.blockchain,
      circleConfig.defaultBlockchain
    );

    if (!blockchain) {
      return res.status(400).json({
        error: "blockchain must be a valid Circle blockchain name",
      });
    }

    if (
      isCircleTestApiKey(circleConfig.apiKey) &&
      isCircleMainnetBlockchain(blockchain)
    ) {
      return res.status(400).json({
        error:
          "TEST_API_KEY credentials can only create testnet wallets. Use a testnet blockchain such as BASE-SEPOLIA.",
      });
    }

    if (req.merchant.circleMerchantWalletId) {
      const circleResponse = await circleClient.getWallet(
        req.merchant.circleMerchantWalletId
      );
      const wallet = unwrapCircleWallet(circleResponse);

      if (!wallet || !getCircleWalletId(wallet)) {
        return res.status(502).json({
          error: "Circle returned an invalid wallet response",
        });
      }

      await syncCircleWalletRecord(prisma, req.merchant.id, wallet);

      return res.status(200).json({
        ...serializeCircleWallet(wallet, req.merchant.circleWalletSetId),
        created: false,
      });
    }

    let merchant = req.merchant;
    let walletSetId = merchant.circleWalletSetId;

    if (!walletSetId) {
      const walletSetData = await circleClient.createWalletSet({
        name: `AfriSettle ${merchant.businessName}`,
      });
      const walletSet = unwrapCircleWalletSet(walletSetData);

      if (!walletSet || !walletSet.id) {
        return res.status(502).json({
          error: "Circle returned an invalid wallet set response",
        });
      }

      merchant = await prisma.merchant.update({
        where: { id: merchant.id },
        data: {
          circleWalletSetId: walletSet.id,
          circleIntegrationStatus: "WALLET_SET_CREATED",
        },
      });
      walletSetId = merchant.circleWalletSetId;
    }

    const walletData = await circleClient.createWallet({
      walletSetId,
      blockchain,
      accountType: "EOA",
    });
    const wallet = unwrapCircleCreatedWallet(walletData);
    const walletId = getCircleWalletId(wallet);

    if (!wallet || !walletId) {
      return res.status(502).json({
        error: "Circle returned an invalid wallet response",
      });
    }

    await prisma.merchant.update({
      where: { id: merchant.id },
      data: {
        circleMerchantWalletId: walletId,
        circleIntegrationStatus: "WALLET_CREATED",
      },
    });
    await syncCircleWalletRecord(prisma, merchant.id, wallet);

    return res.status(201).json({
      ...serializeCircleWallet(wallet, walletSetId),
      created: true,
    });
  } catch (error) {
    console.error("Failed to create Circle wallet", error);
    const circleError = getCircleErrorResponse(error);

    return res.status(circleError.status).json(circleError.body);
  }
});

app.post("/api/circle/reconcile", authenticateMerchant, async (req, res) => {
  try {
    if (!circleClient.isConfigured()) {
      return res.status(500).json({
        error: "Circle is not configured",
      });
    }

    if (!req.merchant.circleMerchantWalletId) {
      return res.status(400).json({
        error: "Merchant Circle wallet is not configured",
      });
    }

    const limit = normalizePositiveInteger(req.body && req.body.limit, 20);

    if (!limit) {
      return res.status(400).json({
        error: "limit must be a positive integer",
      });
    }

    if (limit > 50) {
      return res.status(400).json({
        error: "limit must be between 1 and 50",
      });
    }

    const result = await reconcileMerchantCirclePayments({
      merchant: req.merchant,
      limit,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error && error.code === "P2002") {
      return res.status(409).json({
        error: "A matching Circle payment already exists",
      });
    }

    if (error && error.name === "CircleApiError") {
      return res.status(error.status || 502).json({
        provider: "Circle",
        status: "error",
        httpStatus: error.status || null,
        code: error.code || null,
        message: error.message || "Circle transaction listing failed",
        ...(error.details ? { circleResponse: error.details } : {}),
      });
    }

    console.error("Failed to reconcile Circle transactions", error);
    const circleError = getCircleErrorResponse(error);

    return res.status(circleError.status).json(circleError.body);
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

app.post(
  "/api/invoices/:id/circle-deposit-address",
  authenticateMerchant,
  async (req, res) => {
    try {
      const id = normalizeRequiredString(req.params.id);

      if (!id || !isValidUuid(id)) {
        return res.status(400).json({
          error: "A valid invoice id is required",
        });
      }

      let invoice = await prisma.invoice.findUnique({
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

      if (invoice.status === "PAID") {
        return res.status(409).json({
          error: "A Circle deposit address cannot be assigned to a paid invoice",
        });
      }

      if (!req.merchant.circleMerchantWalletId) {
        return res.status(400).json({
          error: "Merchant Circle wallet is not configured",
        });
      }

      if (!circleClient.isConfigured()) {
        return res.status(500).json({
          error: "Circle is not configured",
        });
      }

      if (!invoice.circleIdempotencyKey) {
        const candidateKey = crypto.randomUUID();

        await prisma.invoice.updateMany({
          where: {
            id,
            circleIdempotencyKey: null,
          },
          data: {
            circleIdempotencyKey: candidateKey,
          },
        });

        invoice = await prisma.invoice.findUnique({
          where: { id },
        });
      }

      const circleResponse = await circleClient.getWallet(
        req.merchant.circleMerchantWalletId
      );
      const circleWallet = unwrapCircleWallet(circleResponse);

      if (!circleWallet || !getCircleWalletId(circleWallet)) {
        return res.status(502).json({
          error: "Circle returned an invalid wallet response",
        });
      }

      const circleFields = getCircleWalletFields(circleWallet);

      invoice = await prisma.$transaction(async (tx) => {
        const claimedDepositAddress = await tx.invoice.updateMany({
          where: {
            id,
            depositAddress: null,
          },
          data: circleFields,
        });

        if (claimedDepositAddress.count === 1) {
          await tx.transactionLog.create({
            data: {
              invoiceId: id,
              action: "CIRCLE_DEPOSIT_ADDRESS_ASSIGNED",
              message: "Circle deposit address assigned to invoice",
              metadata: {
                circleWalletId: String(getCircleWalletId(circleWallet)),
                chain: circleFields.paymentChain || null,
              },
            },
          });
        } else {
          await tx.invoice.update({
            where: { id },
            data: circleFields,
          });
        }

        return tx.invoice.findUnique({
          where: { id },
        });
      });

      return res
        .status(201)
        .json(
          serializeCircleDepositAddress(
            invoice,
            req.merchant.circleMerchantWalletId
          )
        );
    } catch (error) {
      console.error("Failed to assign Circle deposit address", error);
      const circleError = getCircleErrorResponse(error);

      return res.status(circleError.status).json(circleError.body);
    }
  }
);

app.get(
  "/api/invoices/:id/circle-deposit-address",
  authenticateMerchant,
  async (req, res) => {
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

      if (!invoice.depositAddress) {
        return res.status(404).json({
          error: "Circle deposit address does not exist for this invoice",
        });
      }

      if (!req.merchant.circleMerchantWalletId) {
        return res.status(400).json({
          error: "Merchant Circle wallet is not configured",
        });
      }

      const circleResponse = await circleClient.getWallet(
        req.merchant.circleMerchantWalletId
      );
      const circleWallet = unwrapCircleWallet(circleResponse);

      if (!circleWallet || !getCircleWalletId(circleWallet)) {
        return res.status(502).json({
          error: "Circle returned an invalid wallet response",
        });
      }

      const updatedInvoice = await prisma.invoice.update({
        where: { id },
        data: getCircleWalletFields(circleWallet),
      });

      return res
        .status(200)
        .json(
          serializeCircleDepositAddress(
            updatedInvoice,
            req.merchant.circleMerchantWalletId
          )
        );
    } catch (error) {
      console.error("Failed to synchronize Circle deposit address", error);
      const circleError = getCircleErrorResponse(error);

      return res.status(circleError.status).json(circleError.body);
    }
  }
);

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
        merchant: {
          select: {
            id: true,
            businessName: true,
            email: true,
            country: true,
            createdAt: true,
            updatedAt: true,
            circleIntegrationStatus: true,
            circleMerchantWalletId: true,
            circleWalletSetId: true,
          },
        },
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

app.get("/api/payments", authenticateMerchant, async (req, res) => {
  try {
    const limit = normalizePositiveInteger(req.query.limit, 20);
    const offset = normalizeNonNegativeInteger(req.query.offset, 0);

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
      invoice: {
        merchantId: req.merchant.id,
      },
    };

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              customerName: true,
            },
          },
        },
      }),
      prisma.payment.count({ where }),
    ]);

    return res.status(200).json({
      data: payments,
      pagination: {
        total,
      },
    });
  } catch (error) {
    console.error("Failed to list payments", error);

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
  startCircleReconciliationScheduler();
});
