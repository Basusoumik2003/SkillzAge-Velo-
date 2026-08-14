function serializeValue(value) {
  if (value instanceof Error) {
    return {
      message: value.message,
      stack: value.stack,
      name: value.name,
    };
  }
  if (typeof value === "object" && value !== null) {
    return value;
  }
  return value;
}

function formatPayload(payload) {
  if (!payload || typeof payload !== "object") return "";
  try {
    return ` ${JSON.stringify(payload, (_, value) => serializeValue(value))}`;
  } catch {
    return "";
  }
}

export function createLogger(scope = "app") {
  const prefix = `[${scope}]`;
  return {
    info(message, payload) {
      console.log(`${prefix} ${message}${formatPayload(payload)}`);
    },
    warn(message, payload) {
      console.warn(`${prefix} ${message}${formatPayload(payload)}`);
    },
    error(message, payload) {
      console.error(`${prefix} ${message}${formatPayload(payload)}`);
    },
  };
}

export function requestLogger(scope = "app") {
  return (req, _res, next) => {
    const logger = createLogger(scope);
    logger.info("request", {
      method: req.method,
      path: req.originalUrl || req.url,
    });
    next();
  };
}

export function logError(logger, err, req) {
  const targetLogger = logger || createLogger("app");
  targetLogger.error("error", {
    method: req?.method,
    path: req?.originalUrl || req?.url,
    statusCode: Number(err?.statusCode) || Number(err?.status) || 500,
    message: err?.message || "Internal server error.",
    stack: err?.stack,
  });
}
