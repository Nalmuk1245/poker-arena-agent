import { PlayerAction, GamePhase } from "../types/game";
import { handToFancy, cardToFancy } from "../types/cards";
import { OpponentModel } from "../strategy/OpponentModel";
import { BotPool, BotStyle } from "../strategy/BotPool";
import { DashboardEventEmitter } from "../api/DashboardEventEmitter";
import { DashboardEvents } from "../types/dashboard";
import { Table, TableEvents } from "./server/Table";
import { TableManager } from "./TableManager";
import { ExternalAgentRegistry } from "./ExternalAgentRegistry";
import {
  ArenaGamePhase,
  SeatStatus,
  HandResult,
  PlayerView,
  MultiActionRecord,
  phaseToNumber,
} from "./types/ArenaTypes";
import { LeaderboardService } from "./LeaderboardService";
import { BatchSettler } from "../blockchain/BatchSettler";
import logger from "../utils/logger";

interface ArenaConfig {
  botCount: number;
  maxHands: number;
  handDelayMs: number;
  actionDelayMs: number;
  phaseDelayMs: number;
  smallBlind: number;
  bigBlind: number;
  startingStack: number;
  actionTimeoutMs: number;
  tableCount: number;
}

/**
 * Arena runner: orchestrates automatic 6-max games.
 * Seats 1 built-in agent + external agents + bots (filling remaining seats).
 */
export class ArenaRunner {
  private opponentModel: OpponentModel;
  private botPool: BotPool;
  private dashboardEmitter: DashboardEventEmitter;
  private tableManager: TableManager;
  private arenaConfig: ArenaConfig;
  private leaderboard: LeaderboardService;
  private externalRegistry: ExternalAgentRegistry;

  // Stats — tracked for the "primary" registered agent (first internal agent)
  private handsPlayed: number = 0;
  private agentWins: number = 0;
  private agentLosses: number = 0;
  private totalProfit: number = 0;
  private running: boolean = false;
  private batchSettler: BatchSettler | null = null;

  // Bot seat mapping per table: tableId → (seatPlayerId → { address, style, name })
  private botSeatsByTable: Map<string, Map<string, { address: string; style: BotStyle; name: string }>> = new Map();
  // Flattened view for backward compat
  private get botSeats(): Map<string, { address: string; style: BotStyle; name: string }> {
    const merged = new Map<string, { address: string; style: BotStyle; name: string }>();
    for (const [, tableMap] of this.botSeatsByTable) {
      for (const [k, v] of tableMap) merged.set(k, v);
    }
    return merged;
  }
  // Per-table hand counters
  private handsPlayedPerTable: Map<string, number> = new Map();

  constructor(
    botPool: BotPool,
    dashboardEmitter: DashboardEventEmitter,
    arenaConfig?: Partial<ArenaConfig>,
    externalRegistry?: ExternalAgentRegistry
  ) {
    this.opponentModel = new OpponentModel();
    this.botPool = botPool;
    this.dashboardEmitter = dashboardEmitter;
    this.tableManager = new TableManager();
    this.leaderboard = new LeaderboardService();
    this.externalRegistry = externalRegistry || new ExternalAgentRegistry();

    this.arenaConfig = {
      botCount: arenaConfig?.botCount ?? 5,
      maxHands: arenaConfig?.maxHands ?? 100,
      handDelayMs: arenaConfig?.handDelayMs ?? 3000,
      actionDelayMs: arenaConfig?.actionDelayMs ?? 1500,
      phaseDelayMs: arenaConfig?.phaseDelayMs ?? 2000,
      smallBlind: arenaConfig?.smallBlind ?? 5,
      bigBlind: arenaConfig?.bigBlind ?? 10,
      startingStack: arenaConfig?.startingStack ?? 1000,
      actionTimeoutMs: arenaConfig?.actionTimeoutMs ?? 30000,
      tableCount: arenaConfig?.tableCount ?? 1,
    };
  }

  setBatchSettler(settler: BatchSettler): void {
    this.batchSettler = settler;
  }

  /**
   * Start the arena: create table, seat players, run game loop.
   */
  async start(): Promise<void> {
    if (this.running) {
      logger.warn("[Arena] Already running");
      return;
    }

    this.running = true;
    const tableCount = Math.max(1, Math.min(this.arenaConfig.tableCount, 4));
    logger.info("=".repeat(60));
    logger.info("[Arena] 6-Max Multiplayer Poker Arena starting!");
    logger.info(`[Arena] Configuration: ${this.arenaConfig.botCount} bots, ${this.arenaConfig.maxHands} max hands, ${tableCount} table(s)`);
    logger.info(`[Arena] Blinds: ${this.arenaConfig.smallBlind}/${this.arenaConfig.bigBlind}, Stack: ${this.arenaConfig.startingStack}`);
    logger.info("=".repeat(60));

    // Create tables
    const tables: Table[] = [];
    for (let t = 0; t < tableCount; t++) {
      const registeredCount = this.externalRegistry.listRegisteredAgents().length;
      const table = this.tableManager.createPracticeTable({
        maxPlayers: Math.min(this.arenaConfig.botCount + registeredCount, 6),
        smallBlind: this.arenaConfig.smallBlind,
        bigBlind: this.arenaConfig.bigBlind,
        startingStack: this.arenaConfig.startingStack,
        actionTimeoutMs: this.arenaConfig.actionTimeoutMs,
      });

      // Seat all registered agents (internal + external), then fill with bots
      const agentsSeated = this.seatRegisteredAgents(table);
      this.seatBots(table, t, agentsSeated);
      this.setupTableEvents(table);
      this.handsPlayedPerTable.set(table.getTableState().config.tableId, 0);
      tables.push(table);
    }

    // Emit table list for dashboard
    this.emitTableList();

    // Run all game loops in parallel
    await Promise.all(tables.map((t) => this.gameLoop(t)));

    // Cleanup
    this.tableManager.removeAllTables();
    this.running = false;
    this.leaderboard.save();

    logger.info("=".repeat(60));
    logger.info("[Arena] Session complete!");
    logger.info(`[Arena] Hands: ${this.handsPlayed}, Agent W/L: ${this.agentWins}/${this.agentLosses}, Profit: ${this.totalProfit}`);
    logger.info("=".repeat(60));
  }

  /**
   * Stop the arena.
   */
  stop(): void {
    this.running = false;
    logger.info("[Arena] Stopping...");
  }

  isRunning(): boolean {
    return this.running;
  }

  getHandsPlayed(): number {
    return this.handsPlayed;
  }

  getAgentWins(): number {
    return this.agentWins;
  }

  getAgentLosses(): number {
    return this.agentLosses;
  }

  getTotalProfit(): number {
    return this.totalProfit;
  }

  getConfig(): ArenaConfig {
    return { ...this.arenaConfig };
  }

  getLeaderboard(sortBy?: "winRate" | "profit" | "hands") {
    return this.leaderboard.getLeaderboard(sortBy);
  }

  // ============ Game Loop ============

  private async gameLoop(table: Table): Promise<void> {
    const tableId = table.getTableState().config.tableId;
    const maxPerTable = Math.ceil(this.arenaConfig.maxHands / Math.max(1, this.arenaConfig.tableCount));
    while (this.running && (this.handsPlayedPerTable.get(tableId) ?? 0) < maxPerTable) {
      // Check if enough players to continue
      if (!table.canStartHand()) {
        logger.info("[Arena] Not enough players, ending session");
        break;
      }

      // Set up listeners BEFORE dealing to avoid race condition
      const handPromise = this.waitForHandComplete(table);

      // Deal new hand
      const started = table.dealNewHand();
      if (!started) {
        logger.warn("[Arena] Failed to start hand, retrying...");
        // Clean up the listeners we just attached
        table.removeAllListeners(TableEvents.HAND_COMPLETE);
        table.removeAllListeners(TableEvents.PLAYER_TURN);
        await this.delay(1000);
        continue;
      }

      // Wait for hand to complete
      await handPromise;

      // Delay between hands
      await this.delay(this.arenaConfig.handDelayMs);
    }
  }

  /**
   * Set up listeners and wait for a hand to complete.
   * Listeners must be registered BEFORE dealNewHand() to catch the first PLAYER_TURN.
   */
  private waitForHandComplete(table: Table): Promise<void> {
    return new Promise<void>((resolve) => {
      const onComplete = (result: HandResult) => {
        table.removeListener(TableEvents.HAND_COMPLETE, onComplete);
        table.removeListener(TableEvents.PLAYER_TURN, onTurn);
        this.handleHandComplete(result, table);
        resolve();
      };

      const onTurn = (turnInfo: { playerId: string; seatIndex: number; validActions: PlayerAction[] }) => {
        // Human-watchable delay before each action
        setTimeout(() => {
          this.handlePlayerTurn(table, turnInfo.playerId);
        }, this.arenaConfig.actionDelayMs);
      };

      table.on(TableEvents.HAND_COMPLETE, onComplete);
      table.on(TableEvents.PLAYER_TURN, onTurn);
    });
  }

  /**
   * Handle a player's turn: decide and submit action.
   * Supports built-in agent, external agents (async), and bots.
   */
  private async handlePlayerTurn(table: Table, playerId: string): Promise<void> {
    if (!this.running) return;

    // Verify it's still this player's turn
    if (table.getActivePlayerId() !== playerId) return;

    const view = table.getPlayerView(playerId);
    if (!view || !view.isMyTurn) return;

    let action: PlayerAction;
    let amount: number;

    if (this.externalRegistry.isExternalAgent(playerId)) {
      // All registered agents (internal + external) → same requestDecision() path
      const agent = this.externalRegistry.getAgentByPlayerId(playerId);
      if (!agent) {
        action = this.randomBotAction(view);
        amount = 0;
      } else {
        try {
          const decision = await this.externalRegistry.requestDecision(
            agent.agentId,
            playerId,
            view.tableId,
            view
          );
          action = decision.action;
          amount = decision.amount;

          // Validate the action is still valid (turn may not have changed)
          if (table.getActivePlayerId() !== playerId) return;
          if (!view.validActions.includes(action)) {
            action = view.validActions.includes(PlayerAction.CHECK)
              ? PlayerAction.CHECK : PlayerAction.FOLD;
            amount = 0;
          }

          // Emit dashboard event for agent actions
          this.dashboardEmitter.emitDashboard(DashboardEvents.AGENT_ACTION, {
            gameId: view.handNumber,
            action: action,
            amount: amount,
            reasoning: decision.reasoning,
            timestamp: Date.now(),
          });

          logger.info(
            `[Arena] Agent "${agent.agentName}" action: ${action}` +
              `${amount ? ` (${amount})` : ""}`
          );
        } catch (err: any) {
          logger.warn(`[Arena] Agent "${agent.agentName}" error: ${err.message}`);
          action = view.validActions.includes(PlayerAction.CHECK)
            ? PlayerAction.CHECK : PlayerAction.FOLD;
          amount = 0;
        }
      }
    } else {
      // Bot decision
      const tableId = table.getTableState().config.tableId;
      const botInfo = this.botSeatsByTable.get(tableId)?.get(playerId);
      if (!botInfo) {
        // Fallback: random action
        action = this.randomBotAction(view);
        amount = 0;
      } else {
        const result = this.botDecide(botInfo.style, botInfo.address, view);
        action = result.action;
        amount = result.amount;
      }
    }

    // Submit action to table
    table.processAction(playerId, action, amount);
  }

  /**
   * Bot decision using existing BotPool.botDecide().
   */
  private botDecide(
    style: BotStyle,
    botAddress: string,
    view: PlayerView
  ): { action: PlayerAction; amount: number } {
    const phaseNum = phaseToNumber(view.phase);
    const isNewPhase = view.actionHistory.filter((a) => a.phase === view.phase).length === 0;

    // Use evolved weights if available
    let action = this.botPool.botDecide(style, phaseNum, isNewPhase, botAddress);

    // Validate and adjust action
    if (!view.validActions.includes(action)) {
      // Map invalid actions to valid ones
      if (action === PlayerAction.CHECK && !view.validActions.includes(PlayerAction.CHECK)) {
        action = view.validActions.includes(PlayerAction.CALL) ? PlayerAction.CALL : PlayerAction.FOLD;
      } else if (action === PlayerAction.CALL && !view.validActions.includes(PlayerAction.CALL)) {
        action = view.validActions.includes(PlayerAction.CHECK) ? PlayerAction.CHECK : PlayerAction.FOLD;
      } else if (action === PlayerAction.RAISE && !view.validActions.includes(PlayerAction.RAISE)) {
        action = view.validActions.includes(PlayerAction.CALL) ? PlayerAction.CALL :
          view.validActions.includes(PlayerAction.CHECK) ? PlayerAction.CHECK : PlayerAction.FOLD;
      } else if (!view.validActions.includes(action)) {
        // Last resort: fold or check
        action = view.validActions.includes(PlayerAction.CHECK) ? PlayerAction.CHECK : PlayerAction.FOLD;
      }
    }

    // Calculate raise amount based on style
    let amount = 0;
    if (action === PlayerAction.RAISE) {
      amount = this.calculateBotRaise(style, view);
    } else if (action === PlayerAction.CALL) {
      amount = view.callAmount;
    } else if (action === PlayerAction.ALL_IN) {
      amount = view.myStack;
    }

    return { action, amount };
  }

  /**
   * Calculate bot raise amount based on style.
   */
  private calculateBotRaise(style: BotStyle, view: PlayerView): number {
    const minRaise = view.minRaiseAmount;
    const maxRaise = view.maxRaiseAmount;
    const pot = view.totalPot;

    let raiseAmount: number;

    switch (style) {
      case BotStyle.TIGHT_AGGRESSIVE:
        // TAG: pot-sized raises
        raiseAmount = Math.max(minRaise, view.currentBet + pot);
        break;
      case BotStyle.LOOSE_AGGRESSIVE:
        // LAG: 2-3x pot raises
        raiseAmount = Math.max(minRaise, view.currentBet + Math.floor(pot * (1.5 + Math.random() * 1.5)));
        break;
      case BotStyle.TIGHT_PASSIVE:
        // Rock: minimum raises
        raiseAmount = minRaise;
        break;
      case BotStyle.LOOSE_PASSIVE:
        // Calling station: small raises
        raiseAmount = Math.max(minRaise, view.currentBet + Math.floor(pot * 0.5));
        break;
      case BotStyle.RANDOM:
      default:
        // Random size between min and 2x pot
        raiseAmount = Math.max(minRaise, view.currentBet + Math.floor(pot * (0.5 + Math.random() * 1.5)));
        break;
    }

    return Math.min(Math.max(raiseAmount, minRaise), maxRaise);
  }

  /**
   * Fallback random bot action.
   */
  private randomBotAction(view: PlayerView): PlayerAction {
    const r = Math.random();
    if (r < 0.1) return view.validActions.includes(PlayerAction.FOLD) ? PlayerAction.FOLD : PlayerAction.CHECK;
    if (r < 0.5) return view.validActions.includes(PlayerAction.CHECK) ? PlayerAction.CHECK :
      view.validActions.includes(PlayerAction.CALL) ? PlayerAction.CALL : PlayerAction.FOLD;
    if (r < 0.8) return view.validActions.includes(PlayerAction.CALL) ? PlayerAction.CALL :
      view.validActions.includes(PlayerAction.CHECK) ? PlayerAction.CHECK : PlayerAction.FOLD;
    return view.validActions.includes(PlayerAction.RAISE) ? PlayerAction.RAISE : PlayerAction.CALL;
  }

  // ============ Hand Completion ============

  private handleHandComplete(result: HandResult, table: Table): void {
    this.handsPlayed++;
    const tableId = table.getTableState().config.tableId;
    this.handsPlayedPerTable.set(tableId, (this.handsPlayedPerTable.get(tableId) ?? 0) + 1);
    const tableBots = this.botSeatsByTable.get(tableId) ?? new Map();

    // Determine primary agent (first registered agent for stats tracking)
    const primaryAgent = this.externalRegistry.listAgents().find(a => a.tableId === tableId);
    const primaryPlayerId = primaryAgent?.playerId;

    // Check if primary agent won
    const agentWon = primaryPlayerId ? result.winners.some((w) => w.playerId === primaryPlayerId) : false;
    const agentWinAmount = primaryPlayerId ? result.winners
      .filter((w) => w.playerId === primaryPlayerId)
      .reduce((sum, w) => sum + w.amount, 0) : 0;

    // Get agent's total bet this hand
    const agentSeat = primaryPlayerId ? table.getSeats().find((s) => s.playerId === primaryPlayerId) : null;
    const agentBet = result.winners.length > 0 ? 0 : (agentSeat?.betThisHand || 0);

    if (agentWon) {
      this.agentWins++;
      this.totalProfit += agentWinAmount;
      logger.info(
        `[Arena] Hand #${result.handNumber}: AGENT WIN +${agentWinAmount} ` +
          `(${result.winners.find((w) => w.playerId === primaryPlayerId)?.handDescription || "fold win"})`
      );
    } else {
      this.agentLosses++;
    }

    // Log all winners
    for (const winner of result.winners) {
      const handDesc = winner.handDescription;
      const cards = winner.holeCards.length > 0 ? ` ${handToFancy(winner.holeCards)}` : "";
      logger.info(
        `[Arena] Hand #${result.handNumber}: Winner ${winner.playerId}${cards} - ${handDesc} (+${winner.amount})`
      );
    }

    // Log showdown hands
    if (result.showdownPlayers.length > 0) {
      for (const sp of result.showdownPlayers) {
        logger.info(
          `[Arena] Showdown: ${sp.playerId} ${handToFancy(sp.holeCards)} - ${sp.handDescription}`
        );
      }
    }

    // Log board
    if (result.boardCards.length > 0) {
      logger.info(
        `[Arena] Board: ${result.boardCards.map(cardToFancy).join(" ")}`
      );
    }

    // Record hand complete for opponent modeling
    this.recordHandCompleteForOpponents(tableBots);

    // Record bot results for evolution
    for (const winner of result.winners) {
      const botInfo = tableBots.get(winner.playerId);
      if (botInfo) {
        this.botPool.recordBotGameResult(botInfo.address, true);
      }
    }
    // Record losses for bots that didn't win
    for (const [playerId, botInfo] of tableBots) {
      if (!result.winners.some((w) => w.playerId === playerId)) {
        this.botPool.recordBotGameResult(botInfo.address, false);
      }
    }

    // Record leaderboard stats for all registered agents
    for (const agent of this.externalRegistry.listAgents()) {
      if (!agent.playerId || agent.tableId !== tableId) continue;
      const extWon = result.winners.some((w) => w.playerId === agent.playerId);
      const extWinAmount = result.winners
        .filter((w) => w.playerId === agent.playerId)
        .reduce((sum, w) => sum + w.amount, 0);
      const extSeat = table.getSeats().find((s) => s.playerId === agent.playerId);
      const extBet = extSeat?.betThisHand || 0;
      const agentType = agent.mode === "internal" ? "agent" : "external";
      this.leaderboard.recordResult(
        agent.playerId!, agent.agentName, agentType, "AI",
        extWon, extWon ? extWinAmount : extBet
      );
      this.opponentModel.recordHandComplete(agent.playerId!);
    }

    for (const [playerId, botInfo] of tableBots) {
      const botWon = result.winners.some((w) => w.playerId === playerId);
      const botWinAmount = result.winners
        .filter((w) => w.playerId === playerId)
        .reduce((sum, w) => sum + w.amount, 0);
      const botSeat = table.getSeats().find((s) => s.playerId === playerId);
      const botBet = botSeat?.betThisHand || 0;
      this.leaderboard.recordResult(
        playerId, botInfo.name, "bot", botInfo.style,
        botWon, botWon ? botWinAmount : botBet
      );
    }

    // Emit leaderboard update
    this.dashboardEmitter.emit("leaderboard:update", this.leaderboard.getLeaderboard());

    // Save leaderboard periodically
    if (this.handsPlayed % 10 === 0) {
      this.leaderboard.save();
    }

    // Emit arena hand result for dashboard
    this.dashboardEmitter.emitDashboard(DashboardEvents.ARENA_HAND_RESULT, {
      handNumber: result.handNumber,
      winners: result.winners.map((w) => ({
        playerId: w.playerId,
        amount: w.amount,
        handDescription: w.handDescription,
        holeCards: w.holeCards.map((c) => ({ rank: c.rank, suit: c.suit })),
      })),
      boardCards: result.boardCards.map((c) => ({ rank: c.rank, suit: c.suit })),
      showdownPlayers: result.showdownPlayers.map((sp) => ({
        playerId: sp.playerId,
        holeCards: sp.holeCards.map((c) => ({ rank: c.rank, suit: c.suit })),
        handDescription: sp.handDescription,
      })),
      timestamp: Date.now(),
    });

    // Emit dashboard events
    this.dashboardEmitter.emitDashboard(DashboardEvents.GAME_RESULT, {
      gameId: result.handNumber,
      won: agentWon,
      payout: agentWon ? agentWinAmount : 0,
      timestamp: Date.now(),
    });

    const winRate = this.handsPlayed > 0 ? this.agentWins / this.handsPlayed : 0;
    this.dashboardEmitter.updateAgentStats({
      matchesPlayed: this.handsPlayed,
      wins: this.agentWins,
      losses: this.agentLosses,
      winRate,
      bankroll: this.totalProfit,
      riskLevel: "LOW",
      consecutiveLosses: 0,
      isFreePlay: true,
      timestamp: Date.now(),
    });

    this.dashboardEmitter.appendWinHistory(this.handsPlayed, winRate);

    // Push to batch settler for on-chain recording
    if (this.batchSettler) {
      const actionHistory = table.getTableState().actionHistory;
      this.batchSettler.pushHandResult(tableId, result, actionHistory);
    }

    // Log running stats
    if (this.handsPlayed % 10 === 0) {
      logger.info(
        `[Arena] === Stats after ${this.handsPlayed} hands: ` +
          `W/L ${this.agentWins}/${this.agentLosses} (${(winRate * 100).toFixed(1)}%), ` +
          `Profit: ${this.totalProfit} ===`
      );
    }
  }

  // ============ Setup ============

  /**
   * Seat all registered agents (internal + external) at the table.
   * Returns the number of agents seated.
   */
  private seatRegisteredAgents(table: Table): number {
    const registered = this.externalRegistry.listRegisteredAgents();
    if (registered.length === 0) return 0;

    const tableId = table.getTableState().config.tableId;
    const maxSeats = table.getTableState().config.maxPlayers;
    let seated = 0;

    for (const agent of registered.slice(0, maxSeats)) {
      // Internal agents keep their agentId as playerId, external get prefixed
      const playerId = agent.mode === "internal"
        ? agent.agentId
        : `ext-${agent.agentId.slice(0, 12)}`;
      const seatIndex = table.seatPlayer(playerId, agent.agentName);
      if (seatIndex >= 0) {
        this.externalRegistry.seatAgent(agent.agentId, playerId, tableId);
        if (this.batchSettler && agent.walletAddress) {
          this.batchSettler.registerPlayerAddress(playerId, agent.walletAddress);
        }
        seated++;
        logger.info(
          `[Arena] Agent seated: "${agent.agentName}" (${playerId}, ${agent.mode})` +
          (agent.walletAddress ? ` wallet: ${agent.walletAddress.slice(0, 8)}...` : "")
        );
      }
    }

    return seated;
  }

  private seatBots(table: Table, tableIndex: number = 0, agentsSeated: number = 0): void {
    const styles = Object.values(BotStyle);
    // Reduce bot count by the number of agents already seated
    const maxBotSlots = Math.max(0, table.getTableState().config.maxPlayers - agentsSeated);
    const botCount = Math.min(this.arenaConfig.botCount, maxBotSlots);
    if (botCount <= 0) return;
    const tableId = table.getTableState().config.tableId;
    const tableBots = new Map<string, { address: string; style: BotStyle; name: string }>();

    for (let i = 0; i < botCount; i++) {
      const style = styles[i % styles.length];
      // Unique bot IDs per table for multi-table
      const botId = tableIndex === 0 ? `bot-${i}` : `bot-t${tableIndex}-${i}`;
      const botName = `${style.replace(/_/g, " ")} Bot ${i + 1}`;

      // Get bot address from pool for evolution tracking
      const botAddresses = this.botPool.getBotAddresses();
      const address = botAddresses[i % botAddresses.length] || `virtual-bot-${i}`;

      table.seatPlayer(botId, botName);
      tableBots.set(botId, { address, style, name: botName });

      logger.info(`[Arena] Bot seated: ${botName} (${style}) at seat ${i + 1}`);
    }

    this.botSeatsByTable.set(tableId, tableBots);
  }

  private getPrimaryPlayerId(tableId: string): string | undefined {
    const agent = this.externalRegistry.listAgents().find(a => a.tableId === tableId);
    return agent?.playerId;
  }

  private emitArenaTableState(table: Table): void {
    const state = table.getTableState();
    const primaryPlayerId = this.getPrimaryPlayerId(state.config.tableId);

    this.dashboardEmitter.emitDashboard(DashboardEvents.ARENA_TABLE_STATE, {
      tableId: state.config.tableId,
      handNumber: state.handNumber,
      phase: state.phase,
      seats: state.seats.map((s) => ({
        index: s.index,
        playerId: s.playerId,
        playerName: s.playerName,
        stack: s.stack,
        status: s.status,
        position: s.position,
        betThisRound: s.betThisRound,
        isDealer: s.index === state.dealerButtonIndex,
        // Agent hole cards always visible; others hidden unless showdown
        holeCards: s.playerId === primaryPlayerId && s.holeCards.length > 0
          ? s.holeCards.map((c) => ({ rank: c.rank, suit: c.suit }))
          : undefined,
      })),
      communityCards: state.communityCards.map((c) => ({ rank: c.rank, suit: c.suit })),
      pots: state.pots.map((p) => ({ amount: p.amount, eligiblePlayerIds: p.eligiblePlayerIds })),
      currentBet: state.currentBet,
      activePlayerId: state.activePlayerIndex >= 0
        ? state.seats[state.activePlayerIndex]?.playerId ?? null
        : null,
      timestamp: Date.now(),
    });
  }

  private setupTableEvents(table: Table): void {
    const tableId = table.getTableState().config.tableId;

    table.on(TableEvents.HAND_START, (info) => {
      logger.info(`\n[Arena] ---- Hand #${info.handNumber} ----`);

      // Log positions
      const positions = info.seats
        .filter((s: any) => s.playerId !== null && s.position !== null)
        .map((s: any) => `${s.playerName}(${s.position})`)
        .join(", ");
      logger.info(`[Arena] Positions: ${positions}`);

      // Log primary agent hole cards
      const primaryPlayerId = this.getPrimaryPlayerId(tableId);
      const agentSeat = primaryPlayerId
        ? info.seats.find((s: any) => s.playerId === primaryPlayerId)
        : null;
      if (agentSeat && agentSeat.holeCards.length === 2) {
        logger.info(`[Arena] Agent cards: ${handToFancy(agentSeat.holeCards)}`);

        this.dashboardEmitter.emitDashboard(DashboardEvents.HOLE_CARDS, {
          gameId: info.handNumber,
          cards: agentSeat.holeCards.map((c: any) => ({ rank: c.rank, suit: c.suit })),
          display: handToFancy(agentSeat.holeCards),
          timestamp: Date.now(),
        });
      }

      // Emit arena table state for dashboard
      this.emitArenaTableState(table);
    });

    table.on(TableEvents.PHASE_CHANGE, (info) => {
      if (info.communityCards.length > 0) {
        logger.info(
          `[Arena] ${info.phase}: ${info.communityCards.map(cardToFancy).join(" ")}`
        );
      }

      // Delay phase transition so dashboard users can see the new cards
      setTimeout(() => {
        this.dashboardEmitter.emitDashboard(DashboardEvents.PHASE_CHANGE, {
          gameId: table.getHandNumber(),
          phase: info.phase,
          timestamp: Date.now(),
        });

        if (info.communityCards.length > 0) {
          this.dashboardEmitter.emitDashboard(DashboardEvents.COMMUNITY_CARDS, {
            gameId: table.getHandNumber(),
            cards: info.communityCards.map((c: any) => ({ rank: c.rank, suit: c.suit })),
            display: info.communityCards.map(cardToFancy).join(" "),
            phase: info.phase,
            timestamp: Date.now(),
          });
        }

        // Emit arena table state for dashboard
        this.emitArenaTableState(table);
      }, this.arenaConfig.phaseDelayMs);
    });

    table.on(TableEvents.PLAYER_ACTION, (record: MultiActionRecord) => {
      const amountStr = record.amount > 0 ? ` (${record.amount})` : "";
      logger.info(
        `[Arena] ${record.playerName} [${record.phase}]: ${record.action}${amountStr}`
      );

      // Record opponent actions for opponent modeling (skip registered agents)
      if (!this.externalRegistry.isExternalAgent(record.playerId)) {
        this.recordOpponentAction(record, table);
      }

      // Emit arena table state after each action
      this.emitArenaTableState(table);
    });
  }

  // ============ Opponent Modeling ============

  /**
   * Record an opponent's action for the opponent model.
   * Converts ArenaGamePhase → GamePhase and detects facingRaise from recent history.
   */
  private recordOpponentAction(record: MultiActionRecord, table: Table): void {
    const state = table.getTableState();
    const phase = record.phase as string as GamePhase;
    const potSize = state.pots.reduce((sum, p) => sum + p.amount, 0) || 1;

    // Detect if this player was facing a raise
    const prevActions = state.actionHistory.filter(
      (a) => a.phase === record.phase && a.timestamp < record.timestamp
    );
    const facingRaise = prevActions.some(
      (a) => a.action === PlayerAction.RAISE || a.action === PlayerAction.ALL_IN
    );

    this.opponentModel.recordAction(
      record.playerId,
      record.action,
      phase,
      record.amount,
      potSize,
      facingRaise
    );
  }

  /**
   * Mark hand complete for all opponent profiles so handsPlayed increments.
   */
  private recordHandCompleteForOpponents(
    tableBots: Map<string, { address: string; style: BotStyle; name: string }>
  ): void {
    for (const [playerId] of tableBots) {
      this.opponentModel.recordHandComplete(playerId);
    }
  }

  private emitTableList(): void {
    const tables = this.tableManager.listTables();
    this.dashboardEmitter.emit("arena:tableList", tables);
  }

  getTableList() {
    return this.tableManager.listTables();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
