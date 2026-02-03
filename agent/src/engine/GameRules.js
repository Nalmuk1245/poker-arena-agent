"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameRules = void 0;
const game_1 = require("../types/game");
class GameRules {
    /**
     * Get valid actions for the current game state.
     */
    getValidActions(state) {
        const actions = [game_1.PlayerAction.FOLD];
        const toCall = state.currentBet - state.myBetThisRound;
        if (toCall <= 0) {
            // No bet to match - can check
            actions.push(game_1.PlayerAction.CHECK);
        }
        else {
            // Must call, raise, or fold
            if (toCall <= state.myStack) {
                actions.push(game_1.PlayerAction.CALL);
            }
        }
        // Can raise if we have enough chips
        const minRaise = Math.max(state.currentBet * 2, state.wagerAmount * 0.02);
        if (state.myStack > toCall + minRaise) {
            actions.push(game_1.PlayerAction.RAISE);
        }
        // Can always go all-in if we have chips
        if (state.myStack > 0) {
            actions.push(game_1.PlayerAction.ALL_IN);
        }
        return actions;
    }
    /**
     * Calculate the minimum raise amount.
     */
    getMinRaise(state) {
        // Min raise = current bet * 2 (standard Texas Hold'em)
        return Math.max(state.currentBet * 2, state.wagerAmount * 0.02);
    }
    /**
     * Calculate amount needed to call.
     */
    getCallAmount(state) {
        return Math.max(0, state.currentBet - state.myBetThisRound);
    }
    /**
     * Get the next phase after the current one.
     */
    getNextPhase(current) {
        const order = [
            game_1.GamePhase.WAITING,
            game_1.GamePhase.PREFLOP,
            game_1.GamePhase.FLOP,
            game_1.GamePhase.TURN,
            game_1.GamePhase.RIVER,
            game_1.GamePhase.SHOWDOWN,
            game_1.GamePhase.COMPLETE,
        ];
        const idx = order.indexOf(current);
        if (idx < 0 || idx >= order.length - 1)
            return game_1.GamePhase.COMPLETE;
        return order[idx + 1];
    }
    /**
     * Calculate max bet as fraction of pot (for raise sizing).
     */
    calculateBetSize(potSize, fraction, myStack) {
        const bet = Math.floor(potSize * fraction);
        return Math.min(bet, myStack);
    }
}
exports.GameRules = GameRules;
