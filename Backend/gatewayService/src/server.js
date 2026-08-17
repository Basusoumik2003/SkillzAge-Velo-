import app from "./app.js";
import { config } from "./config.js";
import { pool } from "./db.js";
import { createLogger } from "../../shared/nodeLogger.js";

const logger = createLogger("gatewayService");

process.on("unhandledRejection", (reason) => {
  logger.error("process:unhandledRejection", { message: reason?.message || String(reason), stack: reason?.stack });
});

process.on("uncaughtException", (error) => {
  logger.error("process:uncaughtException", { message: error.message, stack: error.stack });
  process.exit(1);
});

async function start() {
  try {
    await pool.query("SELECT 1");
    app.listen(config.port, () => {
      logger.info("service:started", { url: `http://localhost:${config.port}` });
    });
  } catch (error) {
    logger.error("service:start_failed", { message: error.message, stack: error.stack });
    process.exit(1);
  }
}

start();

