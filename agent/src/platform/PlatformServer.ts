import { ethers } from "ethers";
import { config } from "../config";
import { ContractManager } from "../blockchain/ContractManager";
import { BatchSettler } from "../blockchain/BatchSettler";
import { BotPool } from "../strategy/BotPool";
import { GameAPI } from "../api/GameAPI";
import { DashboardEventEmitter } from "../api/DashboardEventEmitter";
import { ExternalAgentRegistry } from "../arena/ExternalAgentRegistry";
import { ArenaRunner } from "../arena/ArenaRunner";
import { WalletInfoPayload } from "../types/dashboard";
import logger from "../utils/logger";

/**
 * Platform server — owns all game infrastructure.
 * Can run independently (no built-in agent) or with InternalAgent registered.
 */
export class PlatformServer {
  private externalRegistry: ExternalAgentRegistry;
  private botPool: BotPool;
  private dashboardEmitter: DashboardEventEmitter;
  private gameAPI: GameAPI | null = null;
  private arenaRunner: ArenaRunner | null = null;
  private batchSettler: BatchSettler | null = null;
  private walletPollTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.externalRegistry = new ExternalAgentRegistry();
    this.botPool = new BotPool();
    this.dashboardEmitter = DashboardEventEmitter.getInstance();
  }

  getExternalRegistry(): ExternalAgentRegistry {
    return this.externalRegistry;
  }

  async start(): Promise<void> {
    logger.info("Starting Platform Server (Arena mode)");

    // Initialize BatchSettler if settlement is enabled
    if (config.settlement.enabled && config.settlement.contractAddress) {
      try {
        const cm = new ContractManager(config.rpcUrl, config.privateKey);
        await cm.initializeSettlement(config.settlement.contractAddress);
        this.batchSettler = new BatchSettler(cm, {
          batchSize: config.settlement.batchSize,
          flushIntervalMs: config.settlement.flushIntervalMs,
          retryCount: config.settlement.retryCount,
          retryDelayMs: config.settlement.retryDelayMs,
        }, this.dashboardEmitter);
        logger.info(`[BatchSettler] Initialized (batch size: ${config.settlement.batchSize})`);
      } catch (err: any) {
        logger.warn(`[BatchSettler] Failed to initialize: ${err.message}. Settlement disabled.`);
        this.batchSettler = null;
      }
    }

    // Register wallet addresses for internal agents if BatchSettler is active
    if (this.batchSettler && config.privateKey) {
      try {
        const cm = new ContractManager(config.rpcUrl, config.privateKey);
        const agentAddress = cm.getSigner().address;
        // Register all internal agents
        for (const agent of this.externalRegistry.listAgents()) {
          if (agent.mode === "internal") {
            this.batchSettler.registerPlayerAddress(agent.agentId, agent.walletAddress ?? agentAddress);
          }
        }
      } catch {}
    }

    const createRunner = (cfg?: any) => {
      const runner = new ArenaRunner(
        this.botPool,
        this.dashboardEmitter,
        {
          botCount: cfg?.botCount ?? config.arena.botCount,
          maxHands: cfg?.maxHands ?? config.arena.maxHands,
          handDelayMs: cfg?.handDelayMs ?? config.arena.handDelayMs,
          actionDelayMs: cfg?.actionDelayMs ?? config.arena.actionDelayMs,
          phaseDelayMs: cfg?.phaseDelayMs ?? config.arena.phaseDelayMs,
          smallBlind: cfg?.smallBlind ?? config.arena.smallBlind,
          bigBlind: cfg?.bigBlind ?? config.arena.bigBlind,
          startingStack: cfg?.startingStack ?? config.arena.startingStack,
          actionTimeoutMs: cfg?.actionTimeoutMs ?? config.arena.actionTimeoutMs,
          tableCount: cfg?.tableCount ?? config.arena.tableCount ?? 1,
        },
        this.externalRegistry
      );
      if (this.batchSettler) {
        runner.setBatchSettler(this.batchSettler);
      }
      return runner;
    };

    // Start API/dashboard if enabled
    if (config.api.enabled) {
      this.gameAPI = new GameAPI(this.externalRegistry);

      this.gameAPI.setArenaControl({
        start: async (cfg: any) => {
          if (this.arenaRunner && this.arenaRunner.isRunning()) {
            return { error: "Arena already running" };
          }
          this.arenaRunner = createRunner(cfg);
          this.arenaRunner.start().then(() => {
            logger.info("[Arena] Session ended via dashboard control");
            if (this.gameAPI) this.gameAPI.emitArenaStatus();
          });
          await new Promise(r => setTimeout(r, 100));
          if (this.gameAPI) this.gameAPI.emitArenaStatus();
          return { status: "started" };
        },
        stop: () => {
          if (this.arenaRunner) {
            this.arenaRunner.stop();
          }
        },
        getStatus: () => ({
          running: this.arenaRunner?.isRunning() ?? false,
          handsPlayed: this.arenaRunner?.getHandsPlayed() ?? 0,
          agentWins: this.arenaRunner?.getAgentWins() ?? 0,
          agentLosses: this.arenaRunner?.getAgentLosses() ?? 0,
          totalProfit: this.arenaRunner?.getTotalProfit() ?? 0,
          config: this.arenaRunner?.getConfig() ?? {
            botCount: config.arena.botCount,
            maxHands: config.arena.maxHands,
            smallBlind: config.arena.smallBlind,
            bigBlind: config.arena.bigBlind,
            startingStack: config.arena.startingStack,
          },
        }),
        getLeaderboard: (sortBy?: string) => {
          return this.arenaRunner?.getLeaderboard(sortBy as any) ?? [];
        },
      });

      // Wire wallet auth to BatchSettler
      this.gameAPI.setWalletAuthHandler((address: string) => {
        if (this.batchSettler) {
          // Register the user wallet for all internal agents
          for (const agent of this.externalRegistry.listAgents()) {
            if (agent.mode === "internal") {
              this.batchSettler.registerPlayerAddress(agent.agentId, address);
              logger.info(`[WalletAuth] Registered ${address} for agent ${agent.agentId}`);
            }
          }
        }
      });

      await this.gameAPI.start(config.api.port);
    }

    // Start wallet info polling for dashboard
    this.startWalletPolling();

    // Auto-start initial arena session
    this.arenaRunner = createRunner();
    await this.arenaRunner.start();

    logger.info("[Platform] Initial session complete. Server running for dashboard control.");
  }

  private async pollWalletInfo(): Promise<void> {
    // Use authenticated user wallet if available, otherwise fall back to server wallet
    const userWallet = this.gameAPI?.getAuthenticatedWallet();

    if (userWallet) {
      try {
        const provider = new ethers.JsonRpcProvider(config.rpcUrl);
        const balance = await provider.getBalance(userWallet);
        const info: WalletInfoPayload = {
          address: userWallet,
          balance: ethers.formatEther(balance),
          chainName: "Monad Testnet",
          settlementEnabled: config.settlement.enabled,
          settlementAddress: config.settlement.contractAddress,
          timestamp: Date.now(),
        };
        this.dashboardEmitter.updateWalletInfo(info);
      } catch (err: any) {
        logger.warn(`[WalletInfo] Failed to poll user wallet: ${err.message}`);
      }
      return;
    }

    if (!config.privateKey) return;
    try {
      const cm = new ContractManager(config.rpcUrl, config.privateKey);
      const address = cm.getSigner().address;
      const balance = await cm.getBalance();
      const info: WalletInfoPayload = {
        address,
        balance: ethers.formatEther(balance),
        chainName: "Monad Testnet",
        settlementEnabled: config.settlement.enabled,
        settlementAddress: config.settlement.contractAddress,
        timestamp: Date.now(),
      };
      this.dashboardEmitter.updateWalletInfo(info);
    } catch (err: any) {
      logger.warn(`[WalletInfo] Failed to poll: ${err.message}`);
    }
  }

  private startWalletPolling(): void {
    // Initial fetch
    this.pollWalletInfo();
    // Poll every 30 seconds
    this.walletPollTimer = setInterval(() => this.pollWalletInfo(), 30_000);
  }

  shutdown(): void {
    if (this.walletPollTimer) {
      clearInterval(this.walletPollTimer);
    }
    if (this.arenaRunner) {
      this.arenaRunner.stop();
    }
    logger.info("[Platform] Shutdown.");
  }
}
