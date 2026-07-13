const { getCircleConfig, isCircleConfigured } = require("../config/circle");
const CircleApiError = require("../errors/circleApiError");

let developerWalletsClientPromise;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function getRetryDelay(response, attempt) {
  const retryAfter = response && response.headers.get("retry-after");

  if (retryAfter) {
    const seconds = Number(retryAfter);

    if (Number.isFinite(seconds)) {
      return Math.max(0, seconds * 1000);
    }

    const date = Date.parse(retryAfter);

    if (Number.isFinite(date)) {
      return Math.max(0, date - Date.now());
    }
  }

  const baseDelay = attempt === 0 ? 250 : 750 * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * 150);
  return baseDelay + jitter;
}

function isRetryableStatus(status) {
  return status === 429 || status >= 500;
}

async function parseResponseBody(response) {
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getCircleErrorCode(body) {
  return (
    body &&
    (body.code ||
      (body.error && body.error.code) ||
      (body.data && body.data.code))
  );
}

async function request(path, options = {}) {
  const config = getCircleConfig();
  const {
    idempotencyKey,
    headers: optionHeaders,
    body: optionBody,
    ...fetchOptions
  } = options;

  if (!config.apiKey) {
    throw new CircleApiError("Circle is not configured", {
      code: "CIRCLE_NOT_CONFIGURED",
      retryable: false,
    });
  }

  if (typeof fetch !== "function") {
    throw new CircleApiError(
      "fetch is not available in this Node.js runtime",
      {
        code: "FETCH_UNAVAILABLE",
        retryable: false,
      }
    );
  }

  const method = options.method || "GET";
  const url = `${config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const canRetry =
    method === "GET" ||
    method === "HEAD" ||
    Boolean(idempotencyKey);

  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        method,
        body:
          optionBody === undefined || typeof optionBody === "string"
            ? optionBody
            : JSON.stringify(optionBody),
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          Accept: "application/json",
          ...(optionBody !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
          ...(optionHeaders || {}),
        },
        signal: controller.signal,
      });
      const body = await parseResponseBody(response);
      const retryable = isRetryableStatus(response.status);

      if (response.ok) {
        return {
          body,
          status: response.status,
          requestId:
            response.headers.get("x-request-id") ||
            response.headers.get("request-id") ||
            undefined,
        };
      }

      if (retryable && canRetry && attempt < config.maxRetries) {
        await delay(getRetryDelay(response, attempt));
        continue;
      }

      throw new CircleApiError(
        `Circle responded with status ${response.status}`,
        {
          status: response.status,
          code: getCircleErrorCode(body),
          details: {
            method,
            path,
            body,
          },
          retryable,
          requestId:
            response.headers.get("x-request-id") ||
            response.headers.get("request-id") ||
            undefined,
        }
      );
    } catch (error) {
      if (error instanceof CircleApiError) {
        throw error;
      }

      const timedOut = error && error.name === "AbortError";
      const circleError = new CircleApiError(
        timedOut ? "Circle request timed out" : "Circle request failed",
        {
          code: timedOut ? "CIRCLE_TIMEOUT" : "CIRCLE_NETWORK_ERROR",
          retryable: true,
          cause: error,
        }
      );

      if (canRetry && attempt < config.maxRetries) {
        await delay(getRetryDelay(null, attempt));
        continue;
      }

      throw circleError;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new CircleApiError("Circle request failed", {
    code: "CIRCLE_REQUEST_FAILED",
    retryable: false,
  });
}

async function checkConnection() {
  return checkWalletsAccess();
}

async function checkWalletsAccess() {
  return request("/v1/w3s/wallets");
}

async function listWallets() {
  return request("/v1/w3s/wallets");
}

async function getWallet(walletId) {
  return request(`/v1/w3s/wallets/${encodeURIComponent(walletId)}`);
}

async function getDeveloperWalletsClient() {
  const config = getCircleConfig();

  if (!config.apiKey || !config.entitySecret) {
    throw new CircleApiError("Circle is not configured", {
      code: "CIRCLE_NOT_CONFIGURED",
      retryable: false,
    });
  }

  if (!developerWalletsClientPromise) {
    developerWalletsClientPromise = import(
      "@circle-fin/developer-controlled-wallets"
    ).then(({ initiateDeveloperControlledWalletsClient }) =>
      initiateDeveloperControlledWalletsClient({
        apiKey: config.apiKey,
        entitySecret: config.entitySecret,
      })
    );
  }

  return developerWalletsClientPromise;
}

function getSdkResponseData(response) {
  return response && response.data ? response.data : response;
}

function getSdkErrorDetails(error) {
  return (
    error &&
    error.error &&
    error.error.response &&
    error.error.response.data
  );
}

function toCircleApiError(error, fallbackMessage) {
  if (error instanceof CircleApiError) {
    return error;
  }

  const status = error && error.status;
  const code = error && error.code;
  const details = getSdkErrorDetails(error);
  const message =
    (details && (details.message || details.error || details.description)) ||
    (error && error.message) ||
    fallbackMessage;

  return new CircleApiError(message, {
    status,
    code,
    details,
    retryable: status === 429 || status >= 500,
    cause: error,
  });
}

async function createWalletSet({ name }) {
  const client = await getDeveloperWalletsClient();
  const response = await client.createWalletSet({ name });
  return getSdkResponseData(response);
}

async function createWallet({ walletSetId, blockchain, accountType = "EOA" }) {
  const client = await getDeveloperWalletsClient();
  const response = await client.createWallets({
    walletSetId,
    blockchains: [blockchain],
    count: 1,
    accountType,
  });
  return getSdkResponseData(response);
}

async function listTransactions(input = {}) {
  const client = await getDeveloperWalletsClient();
  const query = {
    ...(input.pageSize ? { pageSize: input.pageSize } : {}),
    ...(input.order ? { order: input.order } : {}),
  };

  try {
    const response = await client.listTransactions(query);
    return getSdkResponseData(response);
  } catch (error) {
    throw toCircleApiError(error, "Circle transaction listing failed");
  }
}

async function getNotificationSignature(keyId) {
  const client = await getDeveloperWalletsClient();

  try {
    const response = await client.getNotificationSignature(keyId);
    return getSdkResponseData(response);
  } catch (error) {
    throw toCircleApiError(error, "Circle notification signature lookup failed");
  }
}

module.exports = {
  checkWalletsAccess,
  checkConnection,
  createWallet,
  createWalletSet,
  getWallet,
  getNotificationSignature,
  isConfigured: isCircleConfigured,
  listTransactions,
  listWallets,
  request,
};
