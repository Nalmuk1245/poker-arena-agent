import { Deck } from "../agent/src/engine/Deck";
import { HandEvaluator } from "../agent/src/engine/HandEvaluator";
import { OddsCalculator } from "../agent/src/engine/OddsCalculator";
import { StrategyEngine } from "../agent/src/strategy/StrategyEngine";
import { OpponentModel } from "../agent/src/strategy/OpponentModel";
import { BankrollManager } from "../agent/src/strategy/BankrollManager";
import { GameState, GamePhase, PlayerAction, Decision } from "../agent/src/types/game";
import { Card } from "../agent/src/types/cards";

/**
 * Simulate games between our AI agent and different bot archetypes.
 * Runs offline (no blockchain) to validate strategy.
 */

// Simple bot that plays a fixed strategy
function botDecision(
  archetype: "tight" | "loose" | "aggressive" | "passive",
  equity: number,
  callAmount: number,
  potSize: number
): { action: PlayerAction; amount: number } {
  switch (archetype) {
    case "tight":
      if (equity > 0.6) return { action: PlayerAction.RAISE, amount: Math.floor(potSize * 0.5) };
      if (equity > 0.45) return { action: PlayerAction.CALL, amount: callAmount };
      return { action: PlayerAction.FOLD, amount: 0 };

    case "loose":
      if (equity > 0.3) return { action: PlayerAction.CALL, amount: callAmount };
      if (Math.random() > 0.7) return { action: PlayerAction.CALL, amount: callAmount };
      return { action: PlayerAction.FOLD, amount: 0 };

    case "aggressive":
      if (equity > 0.5) return { action: PlayerAction.RAISE, amount: Math.floor(potSize * 0.8) };
      if (equity > 0.3) return { action: PlayerAction.RAISE, amount: Math.floor(potSize * 0.5) };
      if (Math.random() > 0.5) return { action: PlayerAction.RAISE, amount: Math.floor(potSize * 0.4) };
      return { action: PlayerAction.FOLD, amount: 0 };

    case "passive":
      if (equity > 0.7) return { action: PlayerAction.RAISE, amount: Math.floor(potSize * 0.3) };
      if (equity > 0.3) return { action: PlayerAction.CALL, amount: callAmount };
      if (callAmount === 0) return { action: PlayerAction.CHECK, amount: 0 };
      return { action: PlayerAction.FOLD, amount: 0 };
  }
}

async function simulateMatch(
  archetype: "tight" | "loose" | "aggressive" | "passive"
): Promise<{ won: boolean; profit: number }> {
  const evaluator = new HandEvaluator();
  const oddsCalc = new OddsCalculator();
  const opponentModel = new OpponentModel();
  const bankroll = new BankrollManager(1000);
  const strategy = new StrategyEngine(opponentModel, bankroll, 2000);
  const deck = new Deck();

  const wager = 10;
  let pot = wager * 2;

  // Deal cards
  const myCards = deck.deal(2);
  const botCards = deck.deal(2);

  // Simulate through phases
  const phases: GamePhase[] = [
    GamePhase.PREFLOP,
    GamePhase.FLOP,
    GamePhase.TURN,
    GamePhase.RIVER,
  ];

  let communityCards: Card[] = [];
  let myBetTotal = wager;
  let botBetTotal = wager;
  let folded = false;
  let winner: "me" | "bot" | "draw" = "draw";

  for (const phase of phases) {
    // Deal community cards
    if (phase === GamePhase.FLOP) communityCards = deck.deal(3);
    if (phase === GamePhase.TURN) communityCards.push(deck.dealOne());
    if (phase === GamePhase.RIVER) communityCards.push(deck.dealOne());

    // Our agent's decision
    const gameState: GameState = {
      gameId: 0,
      phase,
      myAddress: "0xAgent",
      opponentAddress: "0xBot",
      myHoleCards: myCards,
      communityCards: [...communityCards],
      potSize: pot,
      myStack: 1000 - myBetTotal,
      opponentStack: 1000 - botBetTotal,
      currentBet: 0,
      myBetThisRound: 0,
      opponentBetThisRound: 0,
      isMyTurn: true,
      actionHistory: [],
      wagerAmount: wager,
    };

    let decision: Decision;
    if (phase === GamePhase.PREFLOP) {
      decision = strategy.decidePreflopSimple(gameState);
    } else {
      decision = strategy.decide(gameState);
    }

    if (decision.action === PlayerAction.FOLD) {
      folded = true;
      winner = "bot";
      break;
    }

    if (decision.action === PlayerAction.RAISE) {
      myBetTotal += decision.amount;
      pot += decision.amount;
    }

    // Bot's decision
    const botEquity = communityCards.length >= 3
      ? oddsCalc.calculateEquity(botCards, communityCards, 1000).equity
      : 0.5;

    const botDec = botDecision(archetype, botEquity, 0, pot);

    if (botDec.action === PlayerAction.FOLD) {
      folded = true;
      winner = "me";
      break;
    }

    if (botDec.action === PlayerAction.RAISE) {
      botBetTotal += botDec.amount;
      pot += botDec.amount;
    }
  }

  // Showdown if nobody folded
  if (!folded) {
    const allMyCards = [...myCards, ...communityCards];
    const allBotCards = [...botCards, ...communityCards];

    if (allMyCards.length >= 5 && allBotCards.length >= 5) {
      const result = evaluator.compare(allMyCards, allBotCards);
      if (result > 0) winner = "me";
      else if (result < 0) winner = "bot";
      else winner = "draw";
    }
  }

  const profit = winner === "me" ? pot - myBetTotal : winner === "draw" ? 0 : -myBetTotal;

  return { won: winner === "me", profit };
}

async function main() {
  const archetypes: Array<"tight" | "loose" | "aggressive" | "passive"> = [
    "tight",
    "loose",
    "aggressive",
    "passive",
  ];

  const gamesPerArchetype = 50;

  console.log("=== Poker Arena Agent - Strategy Simulation ===\n");

  for (const archetype of archetypes) {
    let wins = 0;
    let totalProfit = 0;

    for (let i = 0; i < gamesPerArchetype; i++) {
      const result = await simulateMatch(archetype);
      if (result.won) wins++;
      totalProfit += result.profit;
    }

    const winRate = ((wins / gamesPerArchetype) * 100).toFixed(1);
    const avgProfit = (totalProfit / gamesPerArchetype).toFixed(2);

    console.log(`vs ${archetype.toUpperCase().padEnd(12)} | Win Rate: ${winRate}% | Avg Profit: ${avgProfit} | Total: ${totalProfit.toFixed(0)}`);
  }

  console.log("\n=== Simulation Complete ===");
}

main().catch(console.error);
