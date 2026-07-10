class CircleApiError extends Error {
  constructor(message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "CircleApiError";
    this.status = options.status;
    this.code = options.code;
    this.retryable = Boolean(options.retryable);
    this.requestId = options.requestId;
    this.details = options.details;
  }
}

module.exports = CircleApiError;
