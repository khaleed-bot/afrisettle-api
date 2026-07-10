const crypto = require("crypto");
const prisma = require("../prisma");
const { getCircleConfig } = require("../config/circle");
const circleClient = require("./circleClient");
const { reconcileMerchantCirclePayments } = require("./circleReconciliationService");

const PUBLIC_KEY_CACHE = new Map();
let hasLoggedVerificationDisabled = false;

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isSignatureVerificationEnabled() {
  return getCircleConfig().webhookVerifySignature;
}

function parseJsonPayload(rawBody) {
  const text = Buffer.isBuffer(rawBody)
    ? rawBody.toString("utf8")
    : String(rawBody || "");

  return text ? JSON.parse(text) : {};
}

function getNestedValue(payload, paths) {
  for (const path of paths) {
    const value = path.split(".").reduce((current, key) => {
      if (!current || typeof current !== "object") {
        return undefined;
      }

      return current[key];
    }, payload);

    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return "";
}

function extractExternalEventId(payload, rawBody) {
  const id = getNestedValue(payload, [
    "id",
    "notificationId",
    "eventId",
    "data.id",
    "data.notificationId",
    "data.eventId",
  ]);

  if (id) {
    return id;
  }

  return crypto.createHash("sha256").update(rawBody).digest("hex");
}

function extractNotificationType(payload) {
  return (
    getNestedValue(payload, [
      "notificationType",
      "type",
      "eventType",
      "data.notificationType",
      "data.type",
      "data.eventType",
    ]) || "unknown"
  );
}

function findValuesByKey(value, targetKeys, results = []) {
  if (!value || typeof value !== "object") {
    return results;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => findValuesByKey(item, targetKeys, results));
    return results;
  }

  Object.entries(value).forEach(([key, nestedValue]) => {
    if (
      targetKeys.includes(key) &&
      typeof nestedValue === "string" &&
      nestedValue.trim()
    ) {
      results.push(nestedValue.trim());
    }

    findValuesByKey(nestedValue, targetKeys, results);
  });

  return results;
}

function decodeSignature(signature) {
  const normalized = normalizeString(signature);

  if (/^[0-9a-f]+$/i.test(normalized) && normalized.length % 2 === 0) {
    return Buffer.from(normalized, "hex");
  }

  return Buffer.from(normalized, "base64");
}

function getNodeVerifyAlgorithm(circleAlgorithm) {
  const normalized = normalizeString(circleAlgorithm).toUpperCase();

  if (normalized.includes("SHA512")) {
    return "SHA512";
  }

  if (normalized.includes("SHA384")) {
    return "SHA384";
  }

  return "SHA256";
}

async function getNotificationPublicKey(keyId) {
  if (PUBLIC_KEY_CACHE.has(keyId)) {
    return PUBLIC_KEY_CACHE.get(keyId);
  }

  const response = await circleClient.getNotificationSignature(keyId);
  const data = response && response.data ? response.data : response;
  const publicKey = data && data.publicKey;
  const algorithm = data && data.algorithm;

  if (!publicKey) {
    throw new Error("Circle notification public key was not returned");
  }

  const cached = { publicKey, algorithm };
  PUBLIC_KEY_CACHE.set(keyId, cached);
  return cached;
}

async function verifyCircleWebhookSignature({ headers, rawBody }) {
  if (!isSignatureVerificationEnabled()) {
    if (!hasLoggedVerificationDisabled) {
      console.warn("Circle webhook signature verification is disabled");
      hasLoggedVerificationDisabled = true;
    }

    return;
  }

  const signature = normalizeString(headers["x-circle-signature"]);
  const keyId = normalizeString(headers["x-circle-key-id"]);

  if (!signature || !keyId) {
    const error = new Error("Circle webhook signature headers are required");
    error.status = 401;
    throw error;
  }

  const { publicKey, algorithm } = await getNotificationPublicKey(keyId);
  const verifier = crypto.createVerify(getNodeVerifyAlgorithm(algorithm));
  verifier.update(rawBody);
  verifier.end();

  const isValid = verifier.verify(publicKey, decodeSignature(signature));

  if (!isValid) {
    const error = new Error("Invalid Circle webhook signature");
    error.status = 401;
    throw error;
  }
}

async function storeCircleWebhookEvent({ payload, rawBody }) {
  const externalEventId = extractExternalEventId(payload, rawBody);
  const notificationType = extractNotificationType(payload);

  try {
    const event = await prisma.webhookEvent.create({
      data: {
        provider: "CIRCLE",
        externalEventId,
        notificationType,
        payload,
        status: "RECEIVED",
      },
    });

    return { event, duplicate: false };
  } catch (error) {
    if (error && error.code === "P2002") {
      const event = await prisma.webhookEvent.findUnique({
        where: { externalEventId },
      });

      return { event, duplicate: true };
    }

    throw error;
  }
}

async function reconcileForWebhookPayload(payload) {
  const walletIds = Array.from(
    new Set(findValuesByKey(payload, ["walletId", "walletID"]))
  );
  const where =
    walletIds.length > 0
      ? { circleMerchantWalletId: { in: walletIds } }
      : { circleMerchantWalletId: { not: null } };

  const merchants = await prisma.merchant.findMany({ where });
  let reconciledMerchants = 0;

  for (const merchant of merchants) {
    try {
      await reconcileMerchantCirclePayments({ merchant, limit: 20 });
      reconciledMerchants += 1;
    } catch (error) {
      console.error("Circle webhook merchant reconciliation failed", {
        merchantId: merchant.id,
        error: error && error.message ? error.message : "Unknown error",
      });
    }
  }

  return reconciledMerchants;
}

async function processStoredCircleWebhookEvent(event) {
  if (!event || event.status === "PROCESSED") {
    return;
  }

  await prisma.webhookEvent.update({
    where: { id: event.id },
    data: {
      status: "PROCESSING",
      attempts: { increment: 1 },
      error: null,
    },
  });

  try {
    const reconciledMerchants = await reconcileForWebhookPayload(event.payload);

    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: "PROCESSED",
        processedAt: new Date(),
        error: null,
      },
    });

    console.log("Circle webhook processed", {
      eventId: event.id,
      externalEventId: event.externalEventId,
      notificationType: event.notificationType,
      reconciledMerchants,
    });
  } catch (error) {
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: "FAILED",
        error: error && error.message ? error.message : "Unknown error",
      },
    });

    console.error("Circle webhook processing failed", {
      eventId: event.id,
      externalEventId: event.externalEventId,
      error: error && error.message ? error.message : "Unknown error",
    });
  }
}

function triggerCircleWebhookProcessing(event) {
  setImmediate(() => {
    processStoredCircleWebhookEvent(event).catch((error) => {
      console.error("Circle webhook async processing crashed", {
        eventId: event && event.id,
        error: error && error.message ? error.message : "Unknown error",
      });
    });
  });
}

async function receiveCircleWebhook({ headers, rawBody }) {
  await verifyCircleWebhookSignature({ headers, rawBody });

  const payload = parseJsonPayload(rawBody);
  const { event, duplicate } = await storeCircleWebhookEvent({
    payload,
    rawBody,
  });

  if (!duplicate) {
    triggerCircleWebhookProcessing(event);
  }

  return {
    duplicate,
    eventId: event && event.id,
    externalEventId: event && event.externalEventId,
    notificationType: event && event.notificationType,
  };
}

module.exports = {
  receiveCircleWebhook,
};
