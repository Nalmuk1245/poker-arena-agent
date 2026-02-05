import { EventEmitter } from "events";
import {
  DashboardEvents,
  DashboardEventName,
  ActionLogEntry,
  AgentStatsPayload,
  BotStatsPayload,
  BotStatsEntry,
  WinHistoryEntry,
  InitialStatePayload,
  SettlementProgressPayload,
  SettlementCompletePayload,
  AgentIntentPayload,
  WalletInfoPayload,
} from "../types/dashboard";
import logger from "../utils/logger";

const MAX_LOG_ENTRIES = 200;
const MAX_WIN_HISTORY = 500;

let idCounter = 0;

/**
 * Format a dashboard event into a human-readable log message.
 */
function formatMessage(eventName: string, payload: any): string {
  switch (eventName) {
    case DashboardEvents.GAME_CREATED:
      return `Game #${payload.gameId} created`;
    case DashboardEvents.GAME_JOINED:
      return `Joined game #${payload.gameId}${payload.opponent ? ` vs ${payload.opponent}` : ""}`;
    case DashboardEvents.GAME_RESULT:
      return payload.won
        ? `Game #${payload.gameId}: WIN (+${payload.payout})`
        : `Game #${payload.gameId}: LOSS`;
    case DashboardEvents.PHASE_CHANGE:
      return `Game #${payload.gameId}: ${payload.phase}`;
    case DashboardEvents.HOLE_CARDS:
      return `Game #${payload.gameId} hole cards: ${payload.display}`;
    case DashboardEvents.COMMUNITY_CARDS:
      return `Game #${payload.gameId} ${payload.phase}: ${payload.display}`;
    case DashboardEvents.HAND_STRENGTH:
      return `Game #${payload.gameId} hand: ${payload.handName}`;
    case DashboardEvents.AGENT_ACTION:
      return `Game #${payload.gameId}: ${payload.action}${payload.amount ? ` (${payload.amount})` : ""} - ${payload.reasoning}`;
    case DashboardEvents.OPPONENT_ACTION:
      return `Game #${payload.gameId}: Opponent acted (${payload.phase})`;
    case DashboardEvents.VIRTUAL_CHIPS:
      return `Game #${payload.gameId} chips: me=${payload.myStack} opp=${payload.opponentStack} pot=${payload.pot}`;
    case DashboardEvents.SHOWDOWN:
      return `Game #${payload.gameId} showdown: ${payload.result}`;
    case DashboardEvents.BOT_MATCH:
      return `Bot match #${payload.gameId} vs ${payload.botLabel}`;
    default:
      return `${eventName}: ${JSON.stringify(payload)}`;
  }
}

/**
 * Singleton event bus for dashboard real-time updates.
 * Buffers action log entries and caches latest stats for new client connections.
 */
export class DashboardEventEmitter extends EventEmitter {
  private static instance: DashboardEventEmitter;

  private actionLog: ActionLogEntry[] = [];
  private cachedAgentStats: AgentStatsPayload | null = null;
  private cachedBotStats: BotStatsPayload | null = null;
  private winHistory: WinHistoryEntry[] = [];
  private cachedSettlement: SettlementProgressPayload | null = null;
  private settlementLog: SettlementCompletePayload[] = [];
  private cachedAgentIntent: AgentIntentPayload | null = null;
  private cachedWalletInfo: WalletInfoPayload | null = null;

  private constructor() {
    super();
    this.setMaxListeners(50);
  }

  static getInstance(): DashboardEventEmitter {
    if (!DashboardEventEmitter.instance) {
      DashboardEventEmitter.instance = new DashboardEventEmitter();
    }
    return DashboardEventEmitter.instance;
  }

  /**
   * Emit a dashboard event. Adds to action log buffer and emits on the bus.
   */
  emitDashboard(eventName: DashboardEventName, payload: any): void {
    const entry: ActionLogEntry = {
      id: `log-${++idCounter}`,
      event: eventName,
      message: formatMessage(eventName, payload),
      timestamp: payload.timestamp || Date.now(),
    };

    this.actionLog.push(entry);
    if (this.actionLog.length > MAX_LOG_ENTRIES) {
      this.actionLog = this.actionLog.slice(-MAX_LOG_ENTRIES);
    }

    // Cache settlement / intent for new client initial state
    if (eventName === DashboardEvents.SETTLEMENT_PROGRESS) {
      this.cachedSettlement = payload;
    } else if (eventName === DashboardEvents.SETTLEMENT_COMPLETE) {
      this.settlementLog.unshift(payload);
      if (this.settlementLog.length > 10) this.settlementLog.length = 10;
      this.cachedSettlement = null; // batch flushed, reset progress
    } else if (eventName === DashboardEvents.SETTLEMENT_ERROR) {
      this.cachedSettlement = null;
    } else if (eventName === DashboardEvents.AGENT_INTENT) {
      this.cachedAgentIntent = payload;
    }

    this.emit(eventName, payload);
    this.emit("log", entry);
  }

  /**
   * Update and cache agent stats, then emit.
   */
  updateAgentStats(stats: AgentStatsPayload): void {
    this.cachedAgentStats = stats;
    this.emit(DashboardEvents.STATS_AGENT_UPDATE, stats);
  }

  /**
   * Update and cache bot stats, then emit.
   */
  updateBotStats(stats: BotStatsPayload): void {
    this.cachedBotStats = stats;
    this.emit(DashboardEvents.STATS_BOT_UPDATE, stats);
  }

  /**
   * Append a win history entry for the chart.
   */
  appendWinHistory(matchNumber: number, winRate: number): void {
    this.winHistory.push({
      matchNumber,
      winRate,
      timestamp: Date.now(),
    });
    if (this.winHistory.length > MAX_WIN_HISTORY) {
      this.winHistory = this.winHistory.slice(-MAX_WIN_HISTORY);
    }
  }

  /**
   * Get recent log entries for initial state.
   */
  getRecentLog(): ActionLogEntry[] {
    return this.actionLog.slice(-50);
  }

  /**
   * Get the latest cached agent stats.
   */
  getLatestAgentStats(): AgentStatsPayload | null {
    return this.cachedAgentStats;
  }

  /**
   * Get the latest cached bot stats.
   */
  getLatestBotStats(): BotStatsPayload | null {
    return this.cachedBotStats;
  }

  /**
   * Get win history for chart.
   */
  getWinHistory(): WinHistoryEntry[] {
    return [...this.winHistory];
  }

  /**
   * Update and cache wallet info, then emit.
   */
  updateWalletInfo(info: WalletInfoPayload): void {
    this.cachedWalletInfo = info;
    this.emit(DashboardEvents.WALLET_INFO, info);
  }

  /**
   * Build initial state payload for a newly connected client.
   */
  getInitialState(): InitialStatePayload {
    return {
      agentStats: this.cachedAgentStats,
      botStats: this.cachedBotStats,
      recentLog: this.getRecentLog(),
      winHistory: this.getWinHistory(),
      walletInfo: this.cachedWalletInfo,
      timestamp: Date.now(),
    };
  }
}
