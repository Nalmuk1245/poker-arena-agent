import { StrategyEngine } from "../strategy/StrategyEngine";
import { OpponentModel } from "../strategy/OpponentModel";
import { BankrollManager } from "../strategy/BankrollManager";
import { AgentAdapter } from "../arena/AgentAdapter";
import { ExternalAgentRegistry } from "../arena/ExternalAgentRegistry";
import { config } from "../config";
import logger from "../utils/logger";

/**
 * Internal AI agent that registers itself with the ExternalAgentRegistry
 * using the "internal" mode — same interface as external agents, zero latency.
 */
export class InternalAgent {
  private strategy: StrategyEngine;
  private opponentModel: OpponentModel;
  private agentAdapter: AgentAdapter;
  private agentId: string;
  private agentName: string;
  private walletAddress?: string;

  constructor(opts?: {
    agentId?: string;
    agentName?: string;
    walletAddress?: string;
  }) {
    this.agentId = opts?.agentId ?? "agent";
    this.agentName = opts?.agentName ?? "PokerAgent";
    this.walletAddress = opts?.walletAddress;

    this.opponentModel = new OpponentModel();

    const bankroll = new BankrollManager(1000, {
      kellyFraction: config.strategy.kellyFraction,
      maxRisk: config.strategy.maxBankrollRisk,
      minRisk: config.strategy.minBankrollRisk,
      stopLoss: config.strategy.stopLossThreshold,
    });

    this.strategy = new StrategyEngine(
      this.opponentModel,
      bankroll,
      config.strategy.monteCarloSimulations,
      true
    );

    this.agentAdapter = new AgentAdapter(this.strategy, this.opponentModel);
  }

  register(registry: ExternalAgentRegistry): void {
    registry.registerInternalAgent(
      this.agentId,
      this.agentName,
      (view) => this.agentAdapter.decide(view),
      this.walletAddress
    );
    logger.info(`[InternalAgent] "${this.agentName}" registered as internal agent`);
  }

  getStrategy(): StrategyEngine {
    return this.strategy;
  }

  getOpponentModel(): OpponentModel {
    return this.opponentModel;
  }

  getAgentId(): string {
    return this.agentId;
  }

  getAgentName(): string {
    return this.agentName;
  }
}
