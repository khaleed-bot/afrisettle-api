const DEFAULT_BASE_URL = "https://api.circle.com";
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BLOCKCHAIN = "BASE-SEPOLIA";
const DEFAULT_WEBHOOK_VERIFY_SIGNATURE = true;
const DEFAULT_RECONCILE_ENABLED = false;
const DEFAULT_RECONCILE_INTERVAL_MS = 30000;

function parseNonNegativeInteger(value, fallback) {
  const normalized = String(value ?? "").trim();

  if (!/^\d+$/.test(normalized)) {
    return fallback;
  }

  return Number(normalized);
}

function parsePositiveInteger(value, fallback) {
  const normalized = String(value ?? "").trim();

  if (!/^\d+$/.test(normalized)) {
    return fallback;
  }

  const parsed = Number(normalized);
  return parsed > 0 ? parsed : fallback;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value)
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .toLowerCase();

  if (["false", "0", "no", "off", "disabled"].includes(normalized)) {
    return false;
  }

  if (["true", "1", "yes", "on", "enabled"].includes(normalized)) {
    return true;
  }

  return fallback;
}

function parseBooleanStrict(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalized = String(value)
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .toLowerCase();

  if (["false", "0", "no", "off", "disabled"].includes(normalized)) {
    return false;
  }

  if (["true", "1", "yes", "on", "enabled"].includes(normalized)) {
    return true;
  }

  return null;
}

function getCircleConfig() {
  return {
    apiKey: String(process.env.CIRCLE_API_KEY || "").trim(),
    entitySecret: String(process.env.CIRCLE_ENTITY_SECRET || "").trim(),
    baseUrl:
      String(process.env.CIRCLE_BASE_URL || DEFAULT_BASE_URL)
        .trim()
        .replace(/\/+$/, "") || DEFAULT_BASE_URL,
    timeoutMs: parseNonNegativeInteger(
      process.env.CIRCLE_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS
    ),
    maxRetries: parseNonNegativeInteger(
      process.env.CIRCLE_MAX_RETRIES,
      DEFAULT_MAX_RETRIES
    ),
    defaultBlockchain:
      String(process.env.CIRCLE_DEFAULT_BLOCKCHAIN || DEFAULT_BLOCKCHAIN)
        .trim()
        .toUpperCase() || DEFAULT_BLOCKCHAIN,
    webhookVerifySignature: parseBoolean(
      process.env.CIRCLE_WEBHOOK_VERIFY_SIGNATURE,
      DEFAULT_WEBHOOK_VERIFY_SIGNATURE
    ),
  };
}

function getCircleSchedulerConfig() {
  return {
    enabled: parseBoolean(
      process.env.CIRCLE_RECONCILE_ENABLED,
      DEFAULT_RECONCILE_ENABLED
    ),
    intervalMs: parsePositiveInteger(
      process.env.CIRCLE_RECONCILE_INTERVAL_MS,
      DEFAULT_RECONCILE_INTERVAL_MS
    ),
  };
}

function getCircleWebhookConfig() {
  return {
    verifySignature: parseBoolean(
      process.env.CIRCLE_WEBHOOK_VERIFY_SIGNATURE,
      DEFAULT_WEBHOOK_VERIFY_SIGNATURE
    ),
  };
}

function isCircleConfigured() {
  const config = getCircleConfig();
  return Boolean(config.apiKey && config.entitySecret);
}

module.exports = {
  getCircleConfig,
  getCircleSchedulerConfig,
  getCircleWebhookConfig,
  isCircleConfigured,
  parseBoolean,
  parseBooleanStrict,
  parsePositiveInteger,
};
