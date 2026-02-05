import { PlayerAction, Decision } from "../types/game";
import { PlayerView } from "./types/ArenaTypes";
import { config } from "../config";
import logger from "../utils/logger";

// ============ Types ============

export interface ExternalAgentRegistration {
  agentId: string;
  agentName: string;
  callbackUrl?: string;
  walletAddress?: string;
  mode: "callback" | "polling" | "internal";
  decideFunction?: (view: PlayerView) => Decision;
  metadata?: Record<string, any>;
  registeredAt: number;
  lastSeen: number;
  status: "registered" | "seated" | "playing" | "disconnected";
  // Assigned when seated at a table
  playerId?: string;
  tableId?: string;
  // Latency tracking
  latencyHistory: number[];
  avgLatency: number;
}

export interface PendingTurn {
  agentId: string;
  tableId: string;
  playerId: string;
  playerView: PlayerView;
  resolveAction: (decision: Decision) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
  createdAt: number;
}

// ============ Registry ============

/**
 * Manages registration, communication, and lifecycle of external AI agents.
 *
 * Supports two modes:
 * - **Callback (push):** Server POSTs PlayerView to agent's URL, agent responds with Decision.
 * - **Polling (pull):** Agent polls GET /turn, then POSTs /action.
 */
export class ExternalAgentRegistry {
  private agents: Map<string, ExternalAgentRegistration> = new Map();
  private pendingTurns: Map<string, PendingTurn> = new Map(); // keyed by agentId
  private agentIdCounter = 0;

  private get actionTimeoutMs(): number {
    return config.externalAgents?.actionTimeoutMs ?? 25000;
  }
  private get callbackTimeoutMs(): number {
    return config.externalAgents?.callbackTimeoutMs ?? 10000;
  }
  private get callbackRetries(): number {
    return config.externalAgents?.callbackRetries ?? 2;
  }
  private get maxAgents(): number {
    return config.externalAgents?.maxAgents ?? 20;
  }

  // ============ Registration ============

  registerAgent(
    agentName: string,
    callbackUrl?: string,
    mode?: "callback" | "polling",
    metadata?: Record<string, any>,
    walletAddress?: string
  ): ExternalAgentRegistration {
    if (this.agents.size >= this.maxAgents) {
      throw new Error(`Max agents reached (${this.maxAgents})`);
    }

    // Determine mode
    const agentMode = mode ?? (callbackUrl ? "callback" : "polling");

    if (agentMode === "callback" && !callbackUrl) {
      throw new Error("Callback mode requires a callbackUrl");
    }

    const agentId = `ext-${++this.agentIdCounter}-${Date.now().toString(36)}`;
    const registration: ExternalAgentRegistration = {
      agentId,
      agentName,
      callbackUrl,
      walletAddress,
      mode: agentMode,
      metadata,
      registeredAt: Date.now(),
      lastSeen: Date.now(),
      status: "registered",
      latencyHistory: [],
      avgLatency: 0,
    };

    this.agents.set(agentId, registration);
    logger.info(`[ExtAgent] Registered: "${agentName}" (${agentId}, mode=${agentMode})`);
    return registration;
  }

  registerInternalAgent(
    agentId: string,
    agentName: string,
    decideFunction: (view: PlayerView) => Decision,
    walletAddress?: string
  ): ExternalAgentRegistration {
    const registration: ExternalAgentRegistration = {
      agentId,
      agentName,
      walletAddress,
      mode: "internal",
      decideFunction,
      registeredAt: Date.now(),
      lastSeen: Date.now(),
      status: "registered",
      latencyHistory: [],
      avgLatency: 0,
    };
    this.agents.set(agentId, registration);
    logger.info(`[ExtAgent] Internal agent registered: "${agentName}" (${agentId})`);
    return registration;
  }

  unregisterAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    // Cancel any pending turn
    this.cancelPendingTurn(agentId);

    this.agents.delete(agentId);
    logger.info(`[ExtAgent] Unregistered: "${agent.agentName}" (${agentId})`);
    return true;
  }

  // ============ Lookup ============

  getAgent(agentId: string): ExternalAgentRegistration | null {
    const agent = this.agents.get(agentId) ?? null;
    if (agent) agent.lastSeen = Date.now();
    return agent;
  }

  getAgentByPlayerId(playerId: string): ExternalAgentRegistration | null {
    for (const agent of this.agents.values()) {
      if (agent.playerId === playerId) return agent;
    }
    return null;
  }

  listAgents(): ExternalAgentRegistration[] {
    return Array.from(this.agents.values());
  }

  listRegisteredAgents(): ExternalAgentRegistration[] {
    return this.listAgents().filter((a) => a.status === "registered");
  }

  isExternalAgent(playerId: string): boolean {
    return this.getAgentByPlayerId(playerId) !== null;
  }

  getSeatedCount(): number {
    return this.listAgents().filter((a) => a.status === "seated" || a.status === "playing").length;
  }

  // ============ Seating ============

  seatAgent(agentId: string, playerId: string, tableId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    agent.playerId = playerId;
    agent.tableId = tableId;
    agent.status = "seated";
    logger.info(`[ExtAgent] "${agent.agentName}" seated as ${playerId} at table ${tableId}`);
  }

  unseatAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    agent.playerId = undefined;
    agent.tableId = undefined;
    agent.status = "registered";
  }

  // ============ Decision Request ============

  /**
   * Request a decision from an external agent.
   * Returns a Promise that resolves with the agent's Decision.
   *
   * - Callback mode: POST playerView to agent's callback URL.
   * - Polling mode: Store a PendingTurn; agent calls submitAction() via API.
   * - Timeout: auto-fold/check after actionTimeoutMs.
   */
  requestDecision(
    agentId: string,
    playerId: string,
    tableId: string,
    playerView: PlayerView
  ): Promise<Decision> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return Promise.resolve(this.defaultAction(playerView));
    }

    // Internal mode: direct function call, no timeout/pending needed
    if (agent.mode === "internal" && agent.decideFunction) {
      try {
        agent.status = "playing";
        const startMs = Date.now();
        const decision = agent.decideFunction(playerView);
        this.recordLatency(agent, Date.now() - startMs);
        agent.status = "seated";
        return Promise.resolve(decision);
      } catch (err: any) {
        logger.warn(`[ExtAgent] Internal agent "${agent.agentName}" error: ${err.message}`);
        return Promise.resolve(this.defaultAction(playerView));
      }
    }

    agent.status = "playing";

    return new Promise<Decision>((resolve) => {
      // Timeout: auto-fold/check
      const timeoutHandle = setTimeout(() => {
        this.pendingTurns.delete(agentId);
        const defaultDecision = this.defaultAction(playerView);
        logger.warn(
          `[ExtAgent] "${agent.agentName}" timed out (${this.actionTimeoutMs}ms), auto-${defaultDecision.action}`
        );
        resolve(defaultDecision);
      }, this.actionTimeoutMs);

      const pending: PendingTurn = {
        agentId,
        tableId,
        playerId,
        playerView,
        resolveAction: (decision: Decision) => {
          clearTimeout(timeoutHandle);
          this.pendingTurns.delete(agentId);
          agent.status = "seated";
          resolve(decision);
        },
        timeoutHandle,
        createdAt: Date.now(),
      };

      this.pendingTurns.set(agentId, pending);

      // Callback mode: push to agent
      if (agent.mode === "callback" && agent.callbackUrl) {
        this.pushToCallback(agent, playerView, pending);
      }
      // Polling mode: just wait for submitAction()
    });
  }

  // ============ Polling API ============

  getPendingTurn(agentId: string): PendingTurn | null {
    const agent = this.agents.get(agentId);
    if (agent) agent.lastSeen = Date.now();
    return this.pendingTurns.get(agentId) ?? null;
  }

  submitAction(agentId: string, action: string, amount: number, reasoning?: string): boolean {
    const pending = this.pendingTurns.get(agentId);
    if (!pending) return false;

    const agent = this.agents.get(agentId);
    if (agent) agent.lastSeen = Date.now();

    // Track latency from turn creation to action submission
    this.recordLatency(agent!, Date.now() - pending.createdAt);

    // Validate and map action
    const decision = this.parseDecision(action, amount, reasoning ?? "", pending.playerView);
    pending.resolveAction(decision);

    logger.info(
      `[ExtAgent] "${agent?.agentName}" action: ${decision.action}` +
        `${decision.amount ? ` (${decision.amount})` : ""}`
    );
    return true;
  }

  // ============ Internal ============

  /**
   * POST PlayerView to the agent's callback URL and resolve on response.
   */
  private async pushToCallback(
    agent: ExternalAgentRegistration,
    playerView: PlayerView,
    pending: PendingTurn
  ): Promise<void> {
    const payload = {
      type: "action_request",
      agentId: agent.agentId,
      tableId: pending.tableId,
      handNumber: playerView.handNumber,
      playerView: this.sanitizePlayerView(playerView),
      timeoutMs: this.actionTimeoutMs,
    };

    for (let attempt = 0; attempt <= this.callbackRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.callbackTimeoutMs);
        const callStartMs = Date.now();

        const response = await fetch(agent.callbackUrl!, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
          logger.warn(
            `[ExtAgent] Callback to "${agent.agentName}" returned ${response.status} (attempt ${attempt + 1})`
          );
          if (attempt < this.callbackRetries) {
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }
          break;
        }

        const body = await response.json() as { action?: string; amount?: number; reasoning?: string };
        this.recordLatency(agent, Date.now() - callStartMs);
        const decision = this.parseDecision(
          body.action ?? "",
          body.amount ?? 0,
          body.reasoning ?? "",
          playerView
        );

        // Only resolve if this pending turn is still active (not timed out)
        if (this.pendingTurns.has(agent.agentId)) {
          pending.resolveAction(decision);
        }
        return;
      } catch (err: any) {
        const msg = err?.name === "AbortError" ? "timeout" : err?.message;
        logger.warn(
          `[ExtAgent] Callback to "${agent.agentName}" failed: ${msg} (attempt ${attempt + 1})`
        );
        if (attempt < this.callbackRetries) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }

    // All retries failed — the timeout handler will resolve with default action
    logger.warn(`[ExtAgent] All callback retries failed for "${agent.agentName}"`);
  }

  /**
   * Parse and validate an external decision, mapping to valid PlayerAction.
   */
  private parseDecision(
    action: string,
    amount: number,
    reasoning: string,
    view: PlayerView
  ): Decision {
    const actionMap: Record<string, PlayerAction> = {
      FOLD: PlayerAction.FOLD,
      CHECK: PlayerAction.CHECK,
      CALL: PlayerAction.CALL,
      RAISE: PlayerAction.RAISE,
      ALL_IN: PlayerAction.ALL_IN,
    };

    let playerAction = actionMap[action?.toUpperCase()];
    if (!playerAction) {
      logger.warn(`[ExtAgent] Invalid action "${action}", defaulting`);
      return this.defaultAction(view);
    }

    // Validate action is available
    if (!view.validActions.includes(playerAction)) {
      playerAction = this.fallbackAction(playerAction, view);
    }

    // Clamp raise amount
    if (playerAction === PlayerAction.RAISE) {
      amount = Math.max(view.minRaiseAmount, Math.min(amount, view.maxRaiseAmount));
    } else if (playerAction === PlayerAction.CALL) {
      amount = view.callAmount;
    } else if (playerAction === PlayerAction.ALL_IN) {
      amount = view.myStack;
    } else {
      amount = 0;
    }

    return { action: playerAction, amount, reasoning };
  }

  private fallbackAction(action: PlayerAction, view: PlayerView): PlayerAction {
    if (action === PlayerAction.CHECK && !view.validActions.includes(PlayerAction.CHECK)) {
      return view.validActions.includes(PlayerAction.CALL) ? PlayerAction.CALL : PlayerAction.FOLD;
    }
    if (action === PlayerAction.RAISE && !view.validActions.includes(PlayerAction.RAISE)) {
      return view.validActions.includes(PlayerAction.CALL) ? PlayerAction.CALL :
        view.validActions.includes(PlayerAction.CHECK) ? PlayerAction.CHECK : PlayerAction.FOLD;
    }
    if (action === PlayerAction.CALL && !view.validActions.includes(PlayerAction.CALL)) {
      return view.validActions.includes(PlayerAction.CHECK) ? PlayerAction.CHECK : PlayerAction.FOLD;
    }
    return view.validActions.includes(PlayerAction.CHECK) ? PlayerAction.CHECK : PlayerAction.FOLD;
  }

  private defaultAction(view: PlayerView): Decision {
    const action = view.validActions.includes(PlayerAction.CHECK)
      ? PlayerAction.CHECK
      : PlayerAction.FOLD;
    return { action, amount: 0, reasoning: "Auto-action (timeout/error)" };
  }

  private recordLatency(agent: ExternalAgentRegistration, ms: number): void {
    agent.latencyHistory.push(ms);
    if (agent.latencyHistory.length > 50) {
      agent.latencyHistory = agent.latencyHistory.slice(-50);
    }
    agent.avgLatency = Math.round(
      agent.latencyHistory.reduce((a, b) => a + b, 0) / agent.latencyHistory.length
    );
  }

  private cancelPendingTurn(agentId: string): void {
    const pending = this.pendingTurns.get(agentId);
    if (pending) {
      clearTimeout(pending.timeoutHandle);
      this.pendingTurns.delete(agentId);
    }
  }

  /**
   * Strip internal fields from PlayerView for external consumption.
   * Cards are already serializable { rank, suit }.
   */
  private sanitizePlayerView(view: PlayerView): any {
    return {
      tableId: view.tableId,
      handNumber: view.handNumber,
      phase: view.phase,
      myPlayerId: view.myPlayerId,
      myPosition: view.myPosition,
      myHoleCards: view.myHoleCards.map((c) => ({ rank: c.rank, suit: c.suit })),
      myStack: view.myStack,
      myBetThisRound: view.myBetThisRound,
      communityCards: view.communityCards.map((c) => ({ rank: c.rank, suit: c.suit })),
      totalPot: view.totalPot,
      currentBet: view.currentBet,
      players: view.players.map((p) => ({
        playerId: p.playerId,
        playerName: p.playerName,
        seatIndex: p.seatIndex,
        position: p.position,
        stack: p.stack,
        status: p.status,
        betThisRound: p.betThisRound,
        isDealer: p.isDealer,
      })),
      isMyTurn: view.isMyTurn,
      validActions: view.validActions,
      callAmount: view.callAmount,
      minRaiseAmount: view.minRaiseAmount,
      maxRaiseAmount: view.maxRaiseAmount,
      actionHistory: view.actionHistory.map((a) => ({
        playerId: a.playerId,
        playerName: a.playerName,
        action: a.action,
        amount: a.amount,
        phase: a.phase,
      })),
    };
  }
}
