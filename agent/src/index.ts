import { config } from "./config";
import { ContractManager } from "./blockchain/ContractManager";
import { BotPool } from "./strategy/BotPool";
import { TelegramBot } from "./social/TelegramBot";
import { DashboardEventEmitter } from "./api/DashboardEventEmitter";
import logger from "./utils/logger";

export class PokerAgent {
  private botPool: BotPool;
  private telegramBot: TelegramBot;
  private dashboardEmitter: DashboardEventEmitter;
  private platform: any = null;
  private paused: boolean = false;

  constructor() {
    this.botPool = new BotPool();
    this.dashboardEmitter = DashboardEventEmitter.getInstance();

    this.telegramBot = new TelegramBot({
      getState: () => ({
        isRunning: true,
        isPaused: this.paused,
        isFreePlay: config.freePlay,
        currentGameId: -1,
        currentPhase: "ARENA",
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        bankroll: 0,
        riskLevel: "LOW",
        consecutiveLosses: 0,
        myAddress: "",
        opponentCount: 0,
      }),
      onPause: () => {
        this.paused = true;
        logger.info("Agent paused via Telegram");
      },
      onResume: () => {
        this.paused = false;
        logger.info("Agent resumed via Telegram");
      },
      getBotPoolStatus: async () => {
        const summary = await this.botPool.getBotSummary();
        if (summary.length === 0) return "No bots configured.";
        return summary
          .map((b) => `${b.label} (${b.style}): ${b.balance} MON`)
          .join("\n");
      },
      getQueueStatus: () => "Queue disabled — using arena mode",
      getOpponentsSummary: () => "Use arena leaderboard for opponent stats",
    });
  }

  async start(): Promise<void> {
    logger.info("Starting Poker Arena Agent (Platform mode)");

    const { PlatformServer } = require("./platform/PlatformServer");
    const { InternalAgent } = require("./platform/InternalAgent");

    this.platform = new PlatformServer();

    // Register built-in agent as an internal agent
    const agent = new InternalAgent({
      agentId: "agent",
      agentName: "PokerAgent",
      walletAddress: config.privateKey
        ? new ContractManager(config.rpcUrl, config.privateKey).getSigner().address
        : undefined,
    });
    agent.register(this.platform.getExternalRegistry());

    await this.telegramBot.start();
    await this.platform.start();

    logger.info("[Arena] Initial session complete. Server running for dashboard control.");
  }

  shutdown(): void {
    logger.info("Shutting down gracefully...");
    this.telegramBot.stop();
    if (this.platform) {
      this.platform.shutdown();
    }
    logger.info("Goodbye.");
  }
}

// Run if executed directly
if (require.main === module) {
  const agent = new PokerAgent();

  const handleExit = () => {
    agent.shutdown();
    process.exit(0);
  };
  process.on("SIGINT", handleExit);
  process.on("SIGTERM", handleExit);

  agent.start().catch((err) => {
    logger.error(`Fatal error: ${err.message}`);
    process.exit(1);
  });
}
