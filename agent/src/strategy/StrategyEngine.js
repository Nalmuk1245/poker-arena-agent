"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrategyEngine = void 0;
const game_1 = require("../types/game");
const OddsCalculator_1 = require("../engine/OddsCalculator");
const GameRules_1 = require("../engine/GameRules");
const BluffEngine_1 = require("./BluffEngine");
const EVCalculator_1 = require("./EVCalculator");
class StrategyEngine {
    odds;
    rules;
    opponentModel;
    bankroll;
    bluffEngine;
    evCalc;
    simulations;
    constructor(opponentModel, bankrollManager, simulations = 5000) {
        this.odds = new OddsCalculator_1.OddsCalculator();
        this.rules = new GameRules_1.GameRules();
        this.opponentModel = opponentModel;
        this.bankroll = bankrollManager;
        this.bluffEngine = new BluffEngine_1.BluffEngine();
        this.evCalc = new EVCalculator_1.EVCalculator();
        this.simulations = simulations;
    }
    /**
     * Main decision function: analyze game state and return optimal action.
     */
    decide(gameState) {
        const validActions = this.rules.getValidActions(gameState);
        const profile = this.opponentModel.getProfile(gameState.opponentAddress);
        const adjustments = this.opponentModel.getAdjustments(profile);
        // Step 1: Calculate hand equity via Monte Carlo
        let equity = 0.5; // Default for preflop without community cards
        if (gameState.myHoleCards.length === 2) {
            const result = this.odds.calculateEquity(gameState.myHoleCards, gameState.communityCards, this.simulations);
            equity = result.equity;
        }
        // Step 2: Adjust equity for opponent tendencies
        const adjustedEquity = Math.min(1, Math.max(0, equity + adjustments.equityAdjust));
        // Step 3: Calculate EV for each action
        const callAmount = this.rules.getCallAmount(gameState);
        const raiseAmount = this.rules.calculateBetSize(gameState.potSize, 0.66, gameState.myStack);
        const ev = this.evCalc.calculate(adjustedEquity, gameState.potSize, callAmount, raiseAmount, profile.foldToRaise);
        // Step 4: Check bluffing opportunity
        const bluffDecision = this.bluffEngine.shouldBluff(gameState, profile, equity);
        // Step 5: Bankroll-aware max bet
        const maxBet = gameState.myStack * 0.3; // Don't risk more than 30% of stack per action
        // Step 6: Make final decision
        return this.makeFinalDecision(gameState, validActions, adjustedEquity, ev, bluffDecision, callAmount, raiseAmount, maxBet, profile);
    }
    makeFinalDecision(state, validActions, equity, ev, bluff, callAmount, raiseAmount, maxBet, profile) {
        // Premium hands (equity > 0.8): raise aggressively
        if (equity > 0.8 && validActions.includes(game_1.PlayerAction.RAISE)) {
            const bigRaise = Math.min(Math.floor(state.potSize * 1.0), state.myStack);
            return {
                action: game_1.PlayerAction.RAISE,
                amount: bigRaise,
                reasoning: `Premium hand (equity=${equity.toFixed(2)}), value raise`,
            };
        }
        // Bluff opportunity
        if (bluff.shouldBluff &&
            validActions.includes(game_1.PlayerAction.RAISE) &&
            bluff.raiseSize <= maxBet) {
            return {
                action: game_1.PlayerAction.RAISE,
                amount: bluff.raiseSize,
                reasoning: `Bluff: ${bluff.reasoning}`,
            };
        }
        // Strong hands (equity > 0.65): raise for value
        // Against passive/calling stations, value bet thinner (equity > 0.55)
        const valueBetThreshold = profile.archetype === "STATION" || profile.aggression < 0.3 ? 0.55 : 0.65;
        if (equity > valueBetThreshold &&
            ev.evRaise > ev.evCall &&
            validActions.includes(game_1.PlayerAction.RAISE) &&
            raiseAmount <= maxBet) {
            return {
                action: game_1.PlayerAction.RAISE,
                amount: Math.min(raiseAmount, maxBet),
                reasoning: `Strong hand (equity=${equity.toFixed(2)}), value raise (EV=${ev.evRaise.toFixed(1)})`,
            };
        }
        // Good hands (equity > 0.5) or profitable call: call
        // Against passive opponents, raise more often instead of just calling
        if ((equity > 0.5 || ev.evCall > 0) &&
            callAmount <= state.myStack) {
            // Against passive: raise with equity > 0.5 instead of calling
            if (profile.aggression < 0.3 &&
                equity > 0.5 &&
                validActions.includes(game_1.PlayerAction.RAISE) &&
                raiseAmount <= maxBet) {
                return {
                    action: game_1.PlayerAction.RAISE,
                    amount: Math.min(Math.floor(state.potSize * 0.5), maxBet),
                    reasoning: `Exploiting passive opponent (equity=${equity.toFixed(2)}), small value raise`,
                };
            }
            if (validActions.includes(game_1.PlayerAction.CALL)) {
                return {
                    action: game_1.PlayerAction.CALL,
                    amount: callAmount,
                    reasoning: `Good hand (equity=${equity.toFixed(2)}), profitable call (EV=${ev.evCall.toFixed(1)})`,
                };
            }
        }
        // Can check for free
        if (validActions.includes(game_1.PlayerAction.CHECK)) {
            return {
                action: game_1.PlayerAction.CHECK,
                amount: 0,
                reasoning: `Marginal hand (equity=${equity.toFixed(2)}), check`,
            };
        }
        // Marginal with good pot odds
        if (callAmount > 0 &&
            this.odds.isProfitableCall(equity, callAmount, state.potSize) &&
            validActions.includes(game_1.PlayerAction.CALL)) {
            return {
                action: game_1.PlayerAction.CALL,
                amount: callAmount,
                reasoning: `Pot odds favorable (equity=${equity.toFixed(2)})`,
            };
        }
        // Default: fold
        return {
            action: game_1.PlayerAction.FOLD,
            amount: 0,
            reasoning: `Weak hand (equity=${equity.toFixed(2)}), fold (EV negative)`,
        };
    }
    /**
     * Get a preflop decision based on hand strength categories.
     * Used when Monte Carlo is less meaningful (no community cards).
     */
    decidePreflopSimple(gameState) {
        if (gameState.myHoleCards.length < 2) {
            return { action: game_1.PlayerAction.CHECK, amount: 0, reasoning: "No cards" };
        }
        const [c1, c2] = gameState.myHoleCards;
        const isPair = c1.rank === c2.rank;
        const isSuited = c1.suit === c2.suit;
        const rankVal = {
            "A": 14, "K": 13, "Q": 12, "J": 11, "T": 10,
            "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2,
        };
        const high = Math.max(rankVal[c1.rank], rankVal[c2.rank]);
        const low = Math.min(rankVal[c1.rank], rankVal[c2.rank]);
        // Premium: AA, KK, QQ, AKs
        if (isPair && high >= 12) {
            return { action: game_1.PlayerAction.RAISE, amount: Math.floor(gameState.potSize * 3), reasoning: "Premium pair" };
        }
        if (high === 14 && low === 13 && isSuited) {
            return { action: game_1.PlayerAction.RAISE, amount: Math.floor(gameState.potSize * 3), reasoning: "AKs premium" };
        }
        // Strong: JJ, TT, AK, AQs
        if (isPair && high >= 10) {
            return { action: game_1.PlayerAction.RAISE, amount: Math.floor(gameState.potSize * 2.5), reasoning: "Strong pair" };
        }
        if (high === 14 && low >= 12) {
            return { action: game_1.PlayerAction.RAISE, amount: Math.floor(gameState.potSize * 2.5), reasoning: "Strong broadway" };
        }
        // Playable: 77-99, suited connectors, Ax suited
        if (isPair && high >= 7) {
            return { action: game_1.PlayerAction.CALL, amount: this.rules.getCallAmount(gameState), reasoning: "Medium pair" };
        }
        if (isSuited && high - low === 1 && low >= 6) {
            return { action: game_1.PlayerAction.CALL, amount: this.rules.getCallAmount(gameState), reasoning: "Suited connector" };
        }
        if (high === 14 && isSuited) {
            return { action: game_1.PlayerAction.CALL, amount: this.rules.getCallAmount(gameState), reasoning: "Ax suited" };
        }
        // Marginal or trash
        if (this.rules.getCallAmount(gameState) === 0) {
            return { action: game_1.PlayerAction.CHECK, amount: 0, reasoning: "Free check with weak hand" };
        }
        return { action: game_1.PlayerAction.FOLD, amount: 0, reasoning: "Weak preflop hand" };
    }
}
exports.StrategyEngine = StrategyEngine;
