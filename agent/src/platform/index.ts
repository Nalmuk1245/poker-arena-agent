import { PlatformServer } from "./PlatformServer";
import logger from "../utils/logger";

/**
 * Standalone platform server entry point.
 * Runs the arena without a built-in agent — external agents connect via API.
 *
 * Usage: npx ts-node agent/src/platform/index.ts
 */
const platform = new PlatformServer();

const handleExit = () => {
  platform.shutdown();
  process.exit(0);
};
process.on("SIGINT", handleExit);
process.on("SIGTERM", handleExit);

platform.start().catch((err) => {
  logger.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
