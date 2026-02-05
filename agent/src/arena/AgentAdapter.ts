import { GameState, GamePhase, PlayerAction, Decision } from "../types/game";
import { Card, RANK_VALUES } from "../types/cards";
import { StrategyEngine } from "../strategy/StrategyEngine";
import { OpponentModel } from "../strategy/OpponentModel";
import { MultiOddsCalculator } from "./MultiOddsCalculator";
import { DashboardEventEmitter } from "../api/DashboardEventEmitter";
import { DashboardEvents } from "../types/dashboard";
import {
  PlayerView,
  ArenaGamePhase,
  SeatStatus,
  Position,
} from "./types/ArenaTypes";
import logger from "../utils/logger";

// ============ Position factors for preflop range width ============

const POSITION_FACTOR: Record<Position, number> = {
  [Position.UTG]:  0.70,  // ~15% hands - tightest
  [Position.UTG1]: 0.80,  // ~18%
  [Position.CO]:   1.00,  // ~22%
  [Position.BTN]:  1.30,  // ~28% - loosest
  [Position.SB]:   0.90,  // ~20%
  [Position.BB]:   1.10,  // ~25% defense
};

// ============ Hand classification ============

enum HandTier {
  TRASH = 1,
  MARGINAL = 2,
  PLAYABLE = 3,
  STRONG = 4,
  PREMIUM = 5,
}

enum PreflopState {
  FOLDED_TO = "folded_to",
  FACING_RAISE = "facing_raise",
  FACING_3BET = "facing_3bet",
  LIMPED_POT = "limped_pot",
}

/**
 * Adapts the existing StrategyEngine to work with multiway PlayerView.
 *
 * 6-max Pipeline:
 * 1. PREFLOP → decidePreflop6Max(view) with position-aware ranges
 * 2. POST-FLOP → strategy.decide(gameState) via existing StrategyEngine
 * 3. → applyMultiwayAdjustments(view, decision) using MultiOddsCalculator
 * 4. → applyPositionAggression(view, decision)
 * 5. → clampAction(view, decision)
 */
export class AgentAdapter {
  private strategy: StrategyEngine;
  private multiOdds: MultiOddsCalculator;
  private opponentModel: OpponentModel;

  constructor(strategy: StrategyEngine, opponentModel?: OpponentModel) {
    this.strategy = strategy;
    this.multiOdds = new MultiOddsCalculator();
    this.opponentModel = opponentModel || new OpponentModel();
  }

  /**
   * Make a decision for the agent given a PlayerView.
   *
   * 6-max Pipeline:
   * 1. PREFLOP → decidePreflop6Max (with light 3-bet vs LAG)
   * 2. POST-FLOP → strategy.decide(gameState) via existing StrategyEngine
   * 3. → applyCheckRaise (trap aggressive opponents)
   * 4. → applyMultiwayAdjustments (using MultiOddsCalculator)
   * 5. → applyPositionAggression
   * 6. → clampAction
   */
  decide(view: PlayerView): Decision {
    let decision: Decision;

    if (view.phase === ArenaGamePhase.PREFLOP) {
      // Step 1: Position-aware preflop for 6-max (includes light 3-bet)
      decision = this.decidePreflop6Max(view);
    } else {
      // Step 2: Existing StrategyEngine for post-flop
      const gameState = this.viewToGameState(view);
      decision = this.strategy.decide(gameState);
    }

    // Step 3: Check-raise trap against aggressive opponents
    decision = this.applyCheckRaise(view, decision);

    // Step 4: Multiway equity adjustments
    decision = this.applyMultiwayAdjustments(view, decision);

    // Step 5: Position-based post-flop aggression
    decision = this.applyPositionAggression(view, decision);

    // Step 6: Clamp to valid range
    decision = this.clampAction(view, decision);

    logger.info(
      `[Arena Agent] Hand #${view.handNumber} ${view.phase} Pos=${view.myPosition} ` +
        `Action: ${decision.action}${decision.amount ? ` (${decision.amount})` : ""} - ${decision.reasoning}`
    );

    // Emit agent intent for dashboard
    this.emitAgentIntent(view, decision);

    return decision;
  }

  // ============ Position-aware preflop ============

  /**
   * 6-max preflop decisions based on position and hand tier.
   */
  private decidePreflop6Max(view: PlayerView): Decision {
    if (view.myHoleCards.length < 2) {
      return { action: PlayerAction.CHECK, amount: 0, reasoning: "No cards" };
    }

    const [c1, c2] = view.myHoleCards;
    const tier = this.classifyPreflopHand(c1, c2);
    const position = view.myPosition;
    const posFactor = POSITION_FACTOR[position] ?? 1.0;
    const preflopState = this.analyzePreflopAction(view);

    // Effective tier: position factor widens/narrows playable range
    const effectiveTier = tier + (posFactor - 1.0) * 2;

    logger.info(
      `[Arena Preflop] ${c1.rank}${c1.suit}${c2.rank}${c2.suit} tier=${HandTier[tier]} pos=${position} ` +
        `factor=${posFactor} state=${preflopState} effectiveTier=${effectiveTier.toFixed(1)}`
    );

    // --- Premium: always raise, 4-bet vs 3-bet ---
    if (tier >= HandTier.PREMIUM) {
      if (preflopState === PreflopState.FACING_3BET) {
        return {
          action: PlayerAction.RAISE,
          amount: Math.floor(view.totalPot * 2.5),
          reasoning: `Premium hand 4-bet from ${position}`,
        };
      }
      return {
        action: PlayerAction.RAISE,
        amount: Math.floor(view.totalPot * 3),
        reasoning: `Premium hand open-raise from ${position}`,
      };
    }

    // --- Strong: raise, call vs 3-bet ---
    if (tier >= HandTier.STRONG) {
      if (preflopState === PreflopState.FACING_3BET) {
        if (view.validActions.includes(PlayerAction.CALL)) {
          return {
            action: PlayerAction.CALL,
            amount: view.callAmount,
            reasoning: `Strong hand call 3-bet from ${position}`,
          };
        }
      }
      return {
        action: PlayerAction.RAISE,
        amount: Math.floor(view.totalPot * 2.5),
        reasoning: `Strong hand raise from ${position}`,
      };
    }

    // --- Playable: position-dependent, fold vs 3-bet ---
    if (tier >= HandTier.PLAYABLE) {
      if (preflopState === PreflopState.FACING_3BET) {
        return {
          action: PlayerAction.FOLD,
          amount: 0,
          reasoning: `Playable hand fold vs 3-bet from ${position}`,
        };
      }

      if (effectiveTier >= HandTier.PLAYABLE) {
        if (preflopState === PreflopState.FOLDED_TO) {
          return {
            action: PlayerAction.RAISE,
            amount: Math.floor(view.totalPot * 2.2),
            reasoning: `Playable hand steal from ${position}`,
          };
        }
        if (preflopState === PreflopState.FACING_RAISE) {
          // Light 3-bet from BTN/CO against aggressive open-raisers
          if (
            (position === Position.BTN || position === Position.CO) &&
            view.validActions.includes(PlayerAction.RAISE) &&
            this.isRaiserAggressive(view)
          ) {
            // 30% frequency light 3-bet to exploit wide open-raise ranges
            if (Math.random() < 0.30) {
              return {
                action: PlayerAction.RAISE,
                amount: Math.floor(view.totalPot * 3),
                reasoning: `Light 3-bet vs LAG from ${position}`,
              };
            }
          }
          if (view.validActions.includes(PlayerAction.CALL)) {
            return {
              action: PlayerAction.CALL,
              amount: view.callAmount,
              reasoning: `Playable hand call raise from ${position}`,
            };
          }
        }
        if (preflopState === PreflopState.LIMPED_POT) {
          if (posFactor >= 1.0) {
            return {
              action: PlayerAction.RAISE,
              amount: Math.floor(view.totalPot * 2),
              reasoning: `Playable hand iso-raise over limpers from ${position}`,
            };
          }
          if (view.validActions.includes(PlayerAction.CALL)) {
            return {
              action: PlayerAction.CALL,
              amount: view.callAmount,
              reasoning: `Playable hand limp-along from ${position}`,
            };
          }
        }
      }

      // Bad position — free check or fold
      if (view.callAmount === 0 && view.validActions.includes(PlayerAction.CHECK)) {
        return { action: PlayerAction.CHECK, amount: 0, reasoning: `Playable hand free check from ${position}` };
      }
      return {
        action: PlayerAction.FOLD,
        amount: 0,
        reasoning: `Playable hand fold, bad position ${position}`,
      };
    }

    // --- Marginal: only BTN/CO open when folded to ---
    if (tier >= HandTier.MARGINAL) {
      if (preflopState === PreflopState.FOLDED_TO && posFactor >= 1.0) {
        return {
          action: PlayerAction.RAISE,
          amount: Math.floor(view.totalPot * 2),
          reasoning: `Marginal hand steal from late position ${position}`,
        };
      }
      if (view.callAmount === 0 && view.validActions.includes(PlayerAction.CHECK)) {
        return { action: PlayerAction.CHECK, amount: 0, reasoning: `Marginal hand free check from ${position}` };
      }
      return {
        action: PlayerAction.FOLD,
        amount: 0,
        reasoning: `Marginal hand fold from ${position}`,
      };
    }

    // --- Trash: fold (BB free check allowed) ---
    if (view.callAmount === 0 && view.validActions.includes(PlayerAction.CHECK)) {
      return { action: PlayerAction.CHECK, amount: 0, reasoning: `Trash hand free check in BB` };
    }
    return {
      action: PlayerAction.FOLD,
      amount: 0,
      reasoning: `Trash hand fold from ${position}`,
    };
  }

  // ============ Check-Raise trap against aggressive opponents ============

  /**
   * OOP with strong+ hands vs aggressive opponents: check to induce a bet,
   * then raise on the same street or plan to raise next action.
   *
   * Triggers when:
   * - Post-flop only
   * - Out of position (UTG, UTG1, SB, BB)
   * - The main threat opponent has aggression > 0.5
   * - We have a RAISE decision with strong reasoning (equity-based)
   * - Convert RAISE → CHECK to trap, marking reasoning for the next action
   */
  private applyCheckRaise(view: PlayerView, decision: Decision): Decision {
    // Only post-flop
    if (view.phase === ArenaGamePhase.PREFLOP) return decision;

    const position = view.myPosition;
    const isOOP = position === Position.UTG || position === Position.UTG1 ||
                  position === Position.SB || position === Position.BB;
    if (!isOOP) return decision;

    // Only convert raises to check-raises (not bluffs)
    if (decision.action !== PlayerAction.RAISE) return decision;
    if (decision.reasoning.toLowerCase().includes("bluff")) return decision;

    // Check if we can actually check (no bet to face)
    if (!view.validActions.includes(PlayerAction.CHECK)) return decision;

    // Get aggregate opponent aggression from the opponent model
    const opponents = view.players.filter(
      (p) => p.playerId !== view.myPlayerId &&
             p.status !== SeatStatus.FOLDED &&
             p.status !== SeatStatus.EMPTY &&
             p.status !== SeatStatus.SITTING_OUT
    );

    let maxAggression = 0;
    for (const opp of opponents) {
      const profile = this.opponentModel.getProfile(opp.playerId);
      if (profile.aggression > maxAggression) {
        maxAggression = profile.aggression;
      }
    }

    // Only trap if there's an aggressive opponent likely to bet
    if (maxAggression < 0.45) return decision;

    // 40% frequency check-raise to stay unpredictable
    if (Math.random() > 0.40) return decision;

    logger.info(
      `[Arena Agent] Check-raise trap: converting RAISE → CHECK (opp aggression=${maxAggression.toFixed(2)})`
    );

    return {
      action: PlayerAction.CHECK,
      amount: 0,
      reasoning: `Check-raise trap OOP vs aggressive opponent (agg=${maxAggression.toFixed(2)})`,
    };
  }

  // ============ Multiway adjustments using MultiOddsCalculator ============

  /**
   * Apply multiway adjustments using actual equity calculation.
   */
  private applyMultiwayAdjustments(view: PlayerView, decision: Decision): Decision {
    const activeOpponents = this.countActiveOpponents(view);

    // No adjustments for heads-up
    if (activeOpponents <= 1) return decision;

    // Bluff suppression: use opponent foldToRaise to allow selective bluffs
    if (
      decision.action === PlayerAction.RAISE &&
      decision.reasoning.toLowerCase().includes("bluff")
    ) {
      // Check if opponents are likely to fold — allow bluff if avg foldToRaise > 0.45
      const opponents = view.players.filter(
        (p) => p.playerId !== view.myPlayerId &&
               p.status !== SeatStatus.FOLDED &&
               p.status !== SeatStatus.EMPTY &&
               p.status !== SeatStatus.SITTING_OUT
      );
      let avgFoldToRaise = 0.4; // default
      if (opponents.length > 0) {
        const totalFTR = opponents.reduce((sum, opp) => {
          const profile = this.opponentModel.getProfile(opp.playerId);
          return sum + profile.foldToRaise;
        }, 0);
        avgFoldToRaise = totalFTR / opponents.length;
      }

      // Suppress bluff based on opponent tendencies and player count
      const suppressThreshold = activeOpponents >= 3
        ? (avgFoldToRaise > 0.5 ? 0.40 : 0.80)  // 3+: allow if opponents fold often
        : (avgFoldToRaise > 0.5 ? 0.20 : 0.50);  // 2: lighter suppression
      if (Math.random() < suppressThreshold) {
        if (view.validActions.includes(PlayerAction.CHECK)) {
          return {
            action: PlayerAction.CHECK,
            amount: 0,
            reasoning: `Bluff suppressed multiway (${activeOpponents + 1}p, avgFTR=${avgFoldToRaise.toFixed(2)})`,
          };
        }
        return {
          action: PlayerAction.FOLD,
          amount: 0,
          reasoning: `Bluff suppressed multiway (${activeOpponents + 1}p, avgFTR=${avgFoldToRaise.toFixed(2)})`,
        };
      }
    }

    // Post-flop multiway equity check using MultiOddsCalculator
    if (
      view.phase !== ArenaGamePhase.PREFLOP &&
      decision.action === PlayerAction.RAISE &&
      view.myHoleCards.length === 2 &&
      view.communityCards.length >= 3
    ) {
      const equityResult = this.multiOdds.calculateEquityMultiway(
        view.myHoleCards,
        view.communityCards,
        activeOpponents,
        2000
      );
      const equity = equityResult.equity;

      // Low equity non-premium raise → downgrade (lowered from 0.30 to 0.25)
      if (equity < 0.25 && !decision.reasoning.toLowerCase().includes("premium")) {
        if (view.validActions.includes(PlayerAction.CHECK)) {
          return {
            action: PlayerAction.CHECK,
            amount: 0,
            reasoning: `Multiway equity too low (${(equity * 100).toFixed(0)}%), check`,
          };
        }
        if (
          view.validActions.includes(PlayerAction.CALL) &&
          this.multiOdds.isProfitableCall(equity, view.callAmount, view.totalPot)
        ) {
          return {
            action: PlayerAction.CALL,
            amount: view.callAmount,
            reasoning: `Multiway equity low (${(equity * 100).toFixed(0)}%), pot odds call`,
          };
        }
        return {
          action: PlayerAction.FOLD,
          amount: 0,
          reasoning: `Multiway equity too low (${(equity * 100).toFixed(0)}%), fold`,
        };
      }

      // Keep raise but softer sizing reduction: 2 opp x0.90, 3 opp x0.80, 4+ opp x0.70
      const sizingFactor = activeOpponents >= 4 ? 0.70 : activeOpponents >= 3 ? 0.80 : 0.90;
      const adjustedAmount = Math.floor(decision.amount * sizingFactor);
      return {
        ...decision,
        amount: adjustedAmount,
        reasoning: decision.reasoning + ` (multiway ${activeOpponents + 1}p, eq=${(equity * 100).toFixed(0)}%, x${sizingFactor})`,
      };
    }

    // Preflop raise sizing: softer reduction
    if (decision.action === PlayerAction.RAISE) {
      const sizingFactor = activeOpponents >= 4 ? 0.70 : activeOpponents >= 3 ? 0.80 : 0.90;
      return {
        ...decision,
        amount: Math.floor(decision.amount * sizingFactor),
        reasoning: decision.reasoning + ` (multiway size x${sizingFactor})`,
      };
    }

    return decision;
  }

  // ============ Post-flop position aggression ============

  /**
   * In-position (BTN/CO): add probe bets on marginal checks (35% frequency).
   * Out-of-position (UTG/UTG1/SB): downgrade non-premium raises to calls in multiway.
   */
  private applyPositionAggression(view: PlayerView, decision: Decision): Decision {
    // Only applies post-flop
    if (view.phase === ArenaGamePhase.PREFLOP) return decision;

    const activeOpponents = this.countActiveOpponents(view);
    const position = view.myPosition;
    const isInPosition = position === Position.BTN || position === Position.CO;
    const isOOP = position === Position.UTG || position === Position.UTG1 || position === Position.SB;

    // In-position probe bet: convert some checks to 1/3 pot bets
    if (
      isInPosition &&
      decision.action === PlayerAction.CHECK &&
      view.validActions.includes(PlayerAction.RAISE) &&
      activeOpponents <= 2
    ) {
      if (Math.random() < 0.35) {
        const probeSize = Math.floor(view.totalPot * 0.33);
        return {
          action: PlayerAction.RAISE,
          amount: probeSize,
          reasoning: `Position probe bet from ${position} (1/3 pot)`,
        };
      }
    }

    // OOP: downgrade non-premium/strong raises to calls in multiway
    if (
      isOOP &&
      activeOpponents >= 2 &&
      decision.action === PlayerAction.RAISE &&
      !decision.reasoning.toLowerCase().includes("premium") &&
      !decision.reasoning.toLowerCase().includes("strong")
    ) {
      if (view.validActions.includes(PlayerAction.CALL)) {
        return {
          action: PlayerAction.CALL,
          amount: view.callAmount,
          reasoning: decision.reasoning + ` (OOP multiway downgrade from ${position})`,
        };
      }
      if (view.validActions.includes(PlayerAction.CHECK)) {
        return {
          action: PlayerAction.CHECK,
          amount: 0,
          reasoning: decision.reasoning + ` (OOP multiway downgrade from ${position})`,
        };
      }
    }

    return decision;
  }

  // ============ Helper methods ============

  /**
   * Check if the preflop raiser is an aggressive player (LAG/TAG with high aggression).
   * Used to decide whether to light 3-bet.
   */
  private isRaiserAggressive(view: PlayerView): boolean {
    const preflopRaises = view.actionHistory.filter(
      (a) => a.phase === ArenaGamePhase.PREFLOP &&
             a.action === PlayerAction.RAISE &&
             a.playerId !== view.myPlayerId
    );
    if (preflopRaises.length === 0) return false;

    // Check the most recent raiser's profile
    const raiserId = preflopRaises[preflopRaises.length - 1].playerId;
    const profile = this.opponentModel.getProfile(raiserId);
    return profile.aggression > 0.45 || profile.pfr > 0.25;
  }

  /**
   * Count active opponents (not folded, empty, or sitting out).
   */
  private countActiveOpponents(view: PlayerView): number {
    return view.players.filter(
      (p) =>
        p.playerId !== view.myPlayerId &&
        p.status !== SeatStatus.FOLDED &&
        p.status !== SeatStatus.EMPTY &&
        p.status !== SeatStatus.SITTING_OUT
    ).length;
  }

  /**
   * Classify preflop hand into 5 tiers.
   *
   * PREMIUM: AA, KK, QQ, AKs
   * STRONG:  JJ, TT, AKo, AQs, KQs
   * PLAYABLE: 99-55, suited connectors 67s+, Axs, broadway suited
   * MARGINAL: 44-22, suited gappers, broadway offsuit, A8o-ATo
   * TRASH: everything else
   */
  private classifyPreflopHand(c1: Card, c2: Card): HandTier {
    const high = Math.max(RANK_VALUES[c1.rank], RANK_VALUES[c2.rank]);
    const low = Math.min(RANK_VALUES[c1.rank], RANK_VALUES[c2.rank]);
    const isPair = c1.rank === c2.rank;
    const isSuited = c1.suit === c2.suit;
    const gap = high - low;

    // Premium: AA, KK, QQ, AKs
    if (isPair && high >= 12) return HandTier.PREMIUM;
    if (high === 14 && low === 13 && isSuited) return HandTier.PREMIUM;

    // Strong: JJ, TT, AKo, AQs, KQs
    if (isPair && high >= 10) return HandTier.STRONG;
    if (high === 14 && low === 13) return HandTier.STRONG; // AKo
    if (high === 14 && low === 12 && isSuited) return HandTier.STRONG; // AQs
    if (high === 13 && low === 12 && isSuited) return HandTier.STRONG; // KQs

    // Playable: 99-55, suited connectors 67s+, Axs, broadway suited
    if (isPair && high >= 5) return HandTier.PLAYABLE;
    if (isSuited && gap === 1 && low >= 6) return HandTier.PLAYABLE; // 67s+
    if (high === 14 && isSuited) return HandTier.PLAYABLE; // Axs
    if (isSuited && high >= 11 && low >= 10) return HandTier.PLAYABLE; // KJs, QTs, KTs

    // Marginal: 44-22, suited gappers, broadway offsuit, A8o-ATo
    if (isPair) return HandTier.MARGINAL; // 22-44
    if (isSuited && gap <= 2 && low >= 5) return HandTier.MARGINAL; // suited gappers
    if (high >= 10 && low >= 10) return HandTier.MARGINAL; // broadway offsuit
    if (high === 14 && low >= 8 && !isSuited) return HandTier.MARGINAL; // A8o-ATo

    // Trash
    return HandTier.TRASH;
  }

  /**
   * Analyze preflop action state from action history.
   */
  private analyzePreflopAction(view: PlayerView): PreflopState {
    const preflopActions = view.actionHistory.filter(
      (a) => a.phase === ArenaGamePhase.PREFLOP && a.playerId !== view.myPlayerId
    );

    const raises = preflopActions.filter((a) => a.action === PlayerAction.RAISE);
    const calls = preflopActions.filter((a) => a.action === PlayerAction.CALL);

    if (raises.length >= 2) return PreflopState.FACING_3BET;
    if (raises.length === 1) return PreflopState.FACING_RAISE;
    if (calls.length > 0 && raises.length === 0) return PreflopState.LIMPED_POT;
    return PreflopState.FOLDED_TO;
  }

  // ============ Dashboard intent emission ============

  private emitAgentIntent(view: PlayerView, decision: Decision): void {
    const lastIntent = this.strategy.getLastIntent();
    const activeOpponents = this.countActiveOpponents(view);

    // Find primary opponent profile
    let opponentProfile: {
      playerId: string;
      archetype: string;
      aggression: number;
      foldToRaise: number;
      vpip: number;
    } | null = null;

    const opponents = view.players.filter(
      (p) =>
        p.playerId !== view.myPlayerId &&
        p.status !== SeatStatus.FOLDED &&
        p.status !== SeatStatus.EMPTY &&
        p.status !== SeatStatus.SITTING_OUT
    );
    if (opponents.length > 0) {
      const mainOpp = opponents.reduce((best, curr) =>
        curr.stack > best.stack ? curr : best
      );
      const profile = this.opponentModel.getProfile(mainOpp.playerId);
      opponentProfile = {
        playerId: mainOpp.playerId,
        archetype: profile.archetype,
        aggression: profile.aggression,
        foldToRaise: profile.foldToRaise,
        vpip: profile.vpip,
      };
    }

    DashboardEventEmitter.getInstance().emitDashboard(
      DashboardEvents.AGENT_INTENT,
      {
        gameId: view.handNumber,
        phase: view.phase,
        position: view.myPosition,
        equity: lastIntent?.equity ?? 0,
        evFold: lastIntent?.ev.evFold ?? 0,
        evCall: lastIntent?.ev.evCall ?? 0,
        evRaise: lastIntent?.ev.evRaise ?? 0,
        evBestAction: lastIntent?.ev.bestAction ?? "UNKNOWN",
        bluffDecision: lastIntent?.bluff ?? { shouldBluff: false, reasoning: "" },
        opponentProfile,
        multiwayCount: activeOpponents + 1,
        action: decision.action,
        amount: decision.amount,
        reasoning: decision.reasoning,
        timestamp: Date.now(),
      }
    );
  }

  // ============ Existing methods (preserved) ============

  /**
   * Convert PlayerView to the existing GameState format.
   * Picks the "main threat" opponent (largest stack).
   */
  private viewToGameState(view: PlayerView): GameState {
    const opponents = view.players.filter(
      (p) =>
        p.playerId !== view.myPlayerId &&
        p.status !== SeatStatus.FOLDED &&
        p.status !== SeatStatus.EMPTY &&
        p.status !== SeatStatus.SITTING_OUT
    );

    let mainThreat = opponents[0];
    if (opponents.length > 1) {
      mainThreat = opponents.reduce((best, curr) =>
        curr.stack > best.stack ? curr : best
      );
    }

    const opponentAddress = mainThreat?.playerId || "unknown";
    const opponentStack = mainThreat?.stack || 0;
    const opponentBet = mainThreat?.betThisRound || 0;

    return {
      gameId: view.handNumber,
      phase: this.arenaPhaseToGamePhase(view.phase),
      myAddress: view.myPlayerId,
      opponentAddress,
      myHoleCards: view.myHoleCards,
      communityCards: view.communityCards,
      potSize: view.totalPot,
      myStack: view.myStack,
      opponentStack,
      currentBet: view.currentBet,
      myBetThisRound: view.myBetThisRound,
      opponentBetThisRound: opponentBet,
      isMyTurn: view.isMyTurn,
      actionHistory: [],
      wagerAmount: view.totalPot,
    };
  }

  /**
   * Clamp action to be within valid table parameters.
   */
  private clampAction(view: PlayerView, decision: Decision): Decision {
    if (!view.validActions.includes(decision.action)) {
      if (decision.action === PlayerAction.RAISE) {
        if (view.validActions.includes(PlayerAction.CALL)) {
          return { action: PlayerAction.CALL, amount: view.callAmount, reasoning: decision.reasoning + " (raise unavailable, calling)" };
        }
        if (view.validActions.includes(PlayerAction.CHECK)) {
          return { action: PlayerAction.CHECK, amount: 0, reasoning: decision.reasoning + " (raise unavailable, checking)" };
        }
      }
      if (decision.action === PlayerAction.CALL && !view.validActions.includes(PlayerAction.CALL)) {
        if (view.validActions.includes(PlayerAction.CHECK)) {
          return { action: PlayerAction.CHECK, amount: 0, reasoning: decision.reasoning + " (nothing to call, checking)" };
        }
        if (view.validActions.includes(PlayerAction.ALL_IN)) {
          return { action: PlayerAction.ALL_IN, amount: view.myStack, reasoning: decision.reasoning + " (must all-in to call)" };
        }
      }
      if (decision.action === PlayerAction.CHECK && !view.validActions.includes(PlayerAction.CHECK)) {
        if (view.validActions.includes(PlayerAction.CALL)) {
          return { action: PlayerAction.CALL, amount: view.callAmount, reasoning: decision.reasoning + " (can't check, calling)" };
        }
        return { action: PlayerAction.FOLD, amount: 0, reasoning: decision.reasoning + " (can't check, folding)" };
      }
    }

    if (decision.action === PlayerAction.RAISE) {
      const clamped = Math.max(view.minRaiseAmount, Math.min(decision.amount, view.maxRaiseAmount));
      return { ...decision, amount: clamped };
    }

    if (decision.action === PlayerAction.CALL) {
      return { ...decision, amount: view.callAmount };
    }

    return decision;
  }

  private arenaPhaseToGamePhase(phase: ArenaGamePhase): GamePhase {
    switch (phase) {
      case ArenaGamePhase.PREFLOP: return GamePhase.PREFLOP;
      case ArenaGamePhase.FLOP: return GamePhase.FLOP;
      case ArenaGamePhase.TURN: return GamePhase.TURN;
      case ArenaGamePhase.RIVER: return GamePhase.RIVER;
      case ArenaGamePhase.SHOWDOWN: return GamePhase.SHOWDOWN;
      default: return GamePhase.WAITING;
    }
  }
}
