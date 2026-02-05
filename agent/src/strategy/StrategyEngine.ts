import { GameState, Decision, PlayerAction, GamePhase } from "../types/game";
import { OddsCalculator } from "../engine/OddsCalculator";
import { GameRules } from "../engine/GameRules";
import { OpponentModel } from "./OpponentModel";
import { BankrollManager } from "./BankrollManager";
import { BluffEngine } from "./BluffEngine";
import { EVCalculator } from "./EVCalculator";
import { StrategyEvolver, EvolutionParams } from "./StrategyEvolver";
import { OpponentProfile } from "../types/strategy";

export class StrategyEngine {
  private odds: OddsCalculator;
  private rules: GameRules;
  private opponentModel: OpponentModel;
  private bankroll: BankrollManager;
  private bluffEngine: BluffEngine;
  private evCalc: EVCalculator;
  private simulations: number;
  private evolver: StrategyEvolver | null = null;
  private evolvedParams: EvolutionParams | null = null;
  private _lastIntent: {
    equity: number;
    ev: { evFold: number; evCall: number; evRaise: number; bestAction: string };
    bluff: { shouldBluff: boolean; reasoning: string };
    profile: OpponentProfile;
  } | null = null;

  constructor(
    opponentModel: OpponentModel,
    bankrollManager: BankrollManager,
    simulations: number = 5000,
    enableEvolution: boolean = false
  ) {
    this.odds = new OddsCalculator();
    this.rules = new GameRules();
    this.opponentModel = opponentModel;
    this.bankroll = bankrollManager;
    this.bluffEngine = new BluffEngine();
    this.evCalc = new EVCalculator();

    if (enableEvolution) {
      this.evolver = new StrategyEvolver(10);
      this.evolvedParams = this.evolver.getParams();
      this.simulations = this.evolvedParams.simulations;
    } else {
      this.simulations = simulations;
    }
  }

  /**
   * Get the evolver instance (if enabled).
   */
  getEvolver(): StrategyEvolver | null {
    return this.evolver;
  }

  getLastIntent() {
    return this._lastIntent;
  }

  /**
   * Record a match result for the self-evolution system.
   * Returns evolution info if parameters changed.
   */
  recordMatchResult(won: boolean, profit: number, opponentArchetype: string): string | null {
    if (!this.evolver) return null;

    const result = this.evolver.recordMatch(won, profit, opponentArchetype);
    if (result.evolved) {
      this.evolvedParams = result.params;
      this.simulations = result.params.simulations;
      return result.reason;
    }
    return null;
  }

  /**
   * Main decision function: analyze game state and return optimal action.
   */
  decide(gameState: GameState): Decision {
    const validActions = this.rules.getValidActions(gameState);
    const profile = this.opponentModel.getProfile(gameState.opponentAddress);
    const adjustments = this.opponentModel.getAdjustments(profile);

    // Step 1: Calculate hand equity via Monte Carlo
    let equity = 0.5; // Default for preflop without community cards
    if (gameState.myHoleCards.length === 2) {
      const result = this.odds.calculateEquity(
        gameState.myHoleCards,
        gameState.communityCards,
        this.simulations
      );
      equity = result.equity;
    }

    // Step 2: Adjust equity for opponent tendencies
    const adjustedEquity = Math.min(
      1,
      Math.max(0, equity + adjustments.equityAdjust)
    );

    // Step 3: Calculate EV for each action
    const callAmount = this.rules.getCallAmount(gameState);

    // Dynamic raise sizing based on opponent tendencies and equity
    let raiseFraction = 0.66; // default 2/3 pot
    if (profile.aggression > 0.6) {
      // Against aggressive opponents: raise bigger to punish wide ranges
      raiseFraction = 1.0;
    } else if (profile.aggression < 0.3) {
      // Against passive opponents: value bet larger, they'll call
      raiseFraction = 0.85;
    }
    if (adjustedEquity > 0.75) {
      // With strong hands: size up for value
      raiseFraction = Math.min(raiseFraction * 1.5, 1.5);
    }
    const raiseAmount = this.rules.calculateBetSize(
      gameState.potSize,
      raiseFraction,
      gameState.myStack
    );

    const ev = this.evCalc.calculate(
      adjustedEquity,
      gameState.potSize,
      callAmount,
      raiseAmount,
      profile.foldToRaise
    );

    // Step 4: Check bluffing opportunity (evolved bluff multiplier applied)
    const bluffDecision = this.bluffEngine.shouldBluff(
      gameState,
      profile,
      equity,
      this.evolvedParams?.bluffMultiplier
    );

    // Step 5: Bankroll-aware max bet (evolved aggression factor applied)
    const aggFactor = this.evolvedParams?.aggressionFactor ?? 1.0;
    const maxBet = gameState.myStack * 0.6 * aggFactor;

    // Step 6: Save intent data for dashboard
    this._lastIntent = {
      equity: adjustedEquity,
      ev,
      bluff: { shouldBluff: bluffDecision.shouldBluff, reasoning: bluffDecision.reasoning },
      profile,
    };

    // Step 7: Make final decision
    return this.makeFinalDecision(
      gameState,
      validActions,
      adjustedEquity,
      ev,
      bluffDecision,
      callAmount,
      raiseAmount,
      maxBet,
      profile
    );
  }

  private makeFinalDecision(
    state: GameState,
    validActions: PlayerAction[],
    equity: number,
    ev: { evFold: number; evCall: number; evRaise: number; bestAction: string },
    bluff: { shouldBluff: boolean; raiseSize: number; reasoning: string },
    callAmount: number,
    raiseAmount: number,
    maxBet: number,
    profile: OpponentProfile
  ): Decision {
    // Premium hands (equity > 0.8): raise aggressively
    if (equity > 0.8 && validActions.includes(PlayerAction.RAISE)) {
      const bigRaise = Math.min(
        Math.floor(state.potSize * 1.5),
        maxBet,
        state.myStack
      );
      return {
        action: PlayerAction.RAISE,
        amount: bigRaise,
        reasoning: `Premium hand (equity=${equity.toFixed(2)}), value raise`,
      };
    }

    // Bluff opportunity
    if (
      bluff.shouldBluff &&
      validActions.includes(PlayerAction.RAISE) &&
      bluff.raiseSize <= maxBet
    ) {
      return {
        action: PlayerAction.RAISE,
        amount: bluff.raiseSize,
        reasoning: `Bluff: ${bluff.reasoning}`,
      };
    }

    // Strong hands: raise for value (threshold adjusted by evolution)
    const baseThreshold = this.evolvedParams?.valueBetThreshold ?? 0.50;
    const valueBetThreshold = profile.archetype === "STATION" || profile.aggression < 0.3
      ? Math.min(baseThreshold, 0.45)
      : baseThreshold;
    if (
      equity > valueBetThreshold &&
      ev.evRaise > ev.evCall &&
      validActions.includes(PlayerAction.RAISE) &&
      raiseAmount <= maxBet
    ) {
      return {
        action: PlayerAction.RAISE,
        amount: Math.min(raiseAmount, maxBet),
        reasoning: `Strong hand (equity=${equity.toFixed(2)}), value raise (EV=${ev.evRaise.toFixed(1)})`,
      };
    }

    // Good hands (equity > 0.5) or profitable call: call
    // Against passive opponents, raise more often instead of just calling
    if (
      (equity > 0.5 || ev.evCall > 0) &&
      callAmount <= state.myStack
    ) {
      // Against passive: raise with equity > 0.5 instead of calling
      if (
        profile.aggression < 0.3 &&
        equity > 0.5 &&
        validActions.includes(PlayerAction.RAISE) &&
        raiseAmount <= maxBet
      ) {
        return {
          action: PlayerAction.RAISE,
          amount: Math.min(Math.floor(state.potSize * 0.5), maxBet),
          reasoning: `Exploiting passive opponent (equity=${equity.toFixed(2)}), small value raise`,
        };
      }
      if (validActions.includes(PlayerAction.CALL)) {
        return {
          action: PlayerAction.CALL,
          amount: callAmount,
          reasoning: `Good hand (equity=${equity.toFixed(2)}), profitable call (EV=${ev.evCall.toFixed(1)})`,
        };
      }
    }

    // Can check for free
    if (validActions.includes(PlayerAction.CHECK)) {
      return {
        action: PlayerAction.CHECK,
        amount: 0,
        reasoning: `Marginal hand (equity=${equity.toFixed(2)}), check`,
      };
    }

    // Marginal with good pot odds
    if (
      callAmount > 0 &&
      this.odds.isProfitableCall(equity, callAmount, state.potSize) &&
      validActions.includes(PlayerAction.CALL)
    ) {
      return {
        action: PlayerAction.CALL,
        amount: callAmount,
        reasoning: `Pot odds favorable (equity=${equity.toFixed(2)})`,
      };
    }

    // Default: fold
    return {
      action: PlayerAction.FOLD,
      amount: 0,
      reasoning: `Weak hand (equity=${equity.toFixed(2)}), fold (EV negative)`,
    };
  }

  /**
   * Get a preflop decision based on hand strength categories.
   * Used when Monte Carlo is less meaningful (no community cards).
   */
  decidePreflopSimple(
    gameState: GameState
  ): Decision {
    if (gameState.myHoleCards.length < 2) {
      return { action: PlayerAction.CHECK, amount: 0, reasoning: "No cards" };
    }

    const [c1, c2] = gameState.myHoleCards;
    const isPair = c1.rank === c2.rank;
    const isSuited = c1.suit === c2.suit;

    const rankVal: Record<string, number> = {
      "A": 14, "K": 13, "Q": 12, "J": 11, "T": 10,
      "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2,
    };
    const high = Math.max(rankVal[c1.rank], rankVal[c2.rank]);
    const low = Math.min(rankVal[c1.rank], rankVal[c2.rank]);

    // Premium: AA, KK, QQ, AKs
    if (isPair && high >= 12) {
      return { action: PlayerAction.RAISE, amount: Math.floor(gameState.potSize * 3), reasoning: "Premium pair" };
    }
    if (high === 14 && low === 13 && isSuited) {
      return { action: PlayerAction.RAISE, amount: Math.floor(gameState.potSize * 3), reasoning: "AKs premium" };
    }

    // Strong: JJ, TT, AK, AQs
    if (isPair && high >= 10) {
      return { action: PlayerAction.RAISE, amount: Math.floor(gameState.potSize * 2.5), reasoning: "Strong pair" };
    }
    if (high === 14 && low >= 12) {
      return { action: PlayerAction.RAISE, amount: Math.floor(gameState.potSize * 2.5), reasoning: "Strong broadway" };
    }

    // Playable: medium pairs, suited connectors, Ax suited
    // Thresholds adjusted by evolved preflopTightness (>1 = tighter, <1 = looser)
    const tightness = this.evolvedParams?.preflopTightness ?? 1.0;
    const pairThreshold = Math.max(2, Math.min(14, Math.ceil(7 * tightness)));     // default 7, range 2-14
    const suitedConnThreshold = Math.max(2, Math.min(14, Math.ceil(6 * tightness))); // default 6, range 2-14
    if (isPair && high >= pairThreshold) {
      return { action: PlayerAction.CALL, amount: this.rules.getCallAmount(gameState), reasoning: `Medium pair (tightness=${tightness.toFixed(2)})` };
    }
    if (isSuited && high - low === 1 && low >= suitedConnThreshold) {
      return { action: PlayerAction.CALL, amount: this.rules.getCallAmount(gameState), reasoning: `Suited connector (tightness=${tightness.toFixed(2)})` };
    }
    if (high === 14 && isSuited) {
      return { action: PlayerAction.CALL, amount: this.rules.getCallAmount(gameState), reasoning: "Ax suited" };
    }

    // Marginal or trash
    if (this.rules.getCallAmount(gameState) === 0) {
      return { action: PlayerAction.CHECK, amount: 0, reasoning: "Free check with weak hand" };
    }

    return { action: PlayerAction.FOLD, amount: 0, reasoning: "Weak preflop hand" };
  }
}
