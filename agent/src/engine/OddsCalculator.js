"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OddsCalculator = void 0;
const Deck_1 = require("./Deck");
const HandEvaluator_1 = require("./HandEvaluator");
class OddsCalculator {
    evaluator;
    constructor() {
        this.evaluator = new HandEvaluator_1.HandEvaluator();
    }
    /**
     * Monte Carlo simulation to estimate hand equity.
     * Runs `simulations` random rollouts to calculate win probability.
     *
     * @param holeCards - Our 2 hole cards
     * @param communityCards - Known community cards (0-5)
     * @param simulations - Number of Monte Carlo iterations (default 5000)
     */
    calculateEquity(holeCards, communityCards, simulations = 5000) {
        const knownCards = [...holeCards, ...communityCards];
        const remainingNeeded = 5 - communityCards.length;
        let wins = 0;
        let ties = 0;
        let losses = 0;
        for (let i = 0; i < simulations; i++) {
            // Get available cards (exclude known)
            const available = Deck_1.Deck.fullDeckExcluding(knownCards);
            // Shuffle available cards
            this.shuffleArray(available);
            // Deal remaining community cards
            const simCommunity = [
                ...communityCards,
                ...available.slice(0, remainingNeeded),
            ];
            // Deal opponent hole cards
            const oppHole = available.slice(remainingNeeded, remainingNeeded + 2);
            // Evaluate both hands (hole cards + community)
            const myHand = [...holeCards, ...simCommunity];
            const oppHand = [...oppHole, ...simCommunity];
            const result = this.evaluator.compare(myHand, oppHand);
            if (result > 0)
                wins++;
            else if (result < 0)
                losses++;
            else
                ties++;
        }
        return {
            equity: (wins + ties * 0.5) / simulations,
            wins,
            ties,
            losses,
            simulations,
        };
    }
    /**
     * Calculate pot odds: the ratio of call amount to potential win.
     */
    calculatePotOdds(callAmount, potSize) {
        if (callAmount <= 0)
            return Infinity;
        return potSize / callAmount;
    }
    /**
     * Check if calling is profitable based on equity vs pot odds.
     */
    isProfitableCall(equity, callAmount, potSize) {
        const potOdds = callAmount / (potSize + callAmount);
        return equity > potOdds;
    }
    shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }
}
exports.OddsCalculator = OddsCalculator;
