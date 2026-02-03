/**
 * runMatch.ts - Run actual poker matches between two AI agents.
 *
 * Uses the Dealer for shared card dealing and the StrategyEngine for decisions.
 * Demonstrates the full game flow: deal → bet → showdown → payout.
 *
 * Usage: npx ts-node scripts/runMatch.ts [numMatches]
 */

import { Dealer, DealtGame } from "../agent/src/engine/Dealer";
import { HandEvaluator } from "../agent/src/engine/HandEvaluator";
import { OddsCalculator } from "../agent/src/engine/OddsCalculator";
import { StrategyEngine } from "../agent/src/strategy/StrategyEngine";
import { OpponentModel } from "../agent/src/strategy/OpponentModel";
import { BankrollManager } from "../agent/src/strategy/BankrollManager";
import { GameState, GamePhase, PlayerAction, Decision } from "../agent/src/types/game";
import { Card, cardToString } from "../agent/src/types/cards";

// ============ Agent Class ============

class PokerBot {
  name: string;
  strategy: StrategyEngine;
  opponentModel: OpponentModel;
  bankroll: BankrollManager;
  evaluator: HandEvaluator;
  wins: number = 0;
  losses: number = 0;
  totalProfit: number = 0;

  constructor(name: string, initialBankroll: number, simulations: number = 3000) {
    this.name = name;
    this.opponentModel = new OpponentModel();
    this.bankroll = new BankrollManager(initialBankroll);
    this.evaluator = new HandEvaluator();
    this.strategy = new StrategyEngine(
      this.opponentModel,
      this.bankroll,
      simulations
    );
  }

  decide(
    holeCards: Card[],
    communityCards: Card[],
    phase: GamePhase,
    potSize: number,
    currentBet: number,
    myBet: number,
    myStack: number,
    opponentAddress: string,
    wager: number
  ): Decision {
    const gameState: GameState = {
      gameId: 0,
      phase,
      myAddress: this.name,
      opponentAddress,
      myHoleCards: holeCards,
      communityCards,
      potSize,
      myStack,
      opponentStack: 1000,
      currentBet,
      myBetThisRound: myBet,
      opponentBetThisRound: 0,
      isMyTurn: true,
      actionHistory: [],
      wagerAmount: wager,
    };

    if (phase === GamePhase.PREFLOP) {
      return this.strategy.decidePreflopSimple(gameState);
    }
    return this.strategy.decide(gameState);
  }
}

// ============ Match Engine ============

interface MatchResult {
  winner: string | null; // null = draw
  player1Hand: string;
  player2Hand: string;
  potSize: number;
  player1Decision: string;
  player2Decision: string;
  phase: string;
}

function playMatch(
  bot1: PokerBot,
  bot2: PokerBot,
  wager: number,
  matchNum: number
): MatchResult {
  const dealt = Dealer.dealGame();
  const evaluator = new HandEvaluator();

  let pot = wager * 2;
  let p1Stack = 1000 - wager;
  let p2Stack = 1000 - wager;
  let p1BetTotal = wager;
  let p2BetTotal = wager;

  const phases: { phase: GamePhase; cards: Card[] }[] = [
    { phase: GamePhase.PREFLOP, cards: [] },
    { phase: GamePhase.FLOP, cards: dealt.flop },
    { phase: GamePhase.TURN, cards: [...dealt.flop, dealt.turn] },
    { phase: GamePhase.RIVER, cards: [...dealt.flop, dealt.turn, dealt.river] },
  ];

  let lastP1Decision = "";
  let lastP2Decision = "";
  let endPhase = "SHOWDOWN";

  for (const { phase, cards } of phases) {
    // Bot 1 decides
    const d1 = bot1.decide(
      dealt.player1Cards, cards, phase,
      pot, 0, 0, p1Stack, bot2.name, wager
    );
    lastP1Decision = `${d1.action}(${d1.amount}) - ${d1.reasoning}`;

    if (d1.action === PlayerAction.FOLD) {
      endPhase = phase;
      return finishMatch(bot1, bot2, bot2.name, p2BetTotal, p1BetTotal, pot,
        formatCards(dealt.player1Cards), formatCards(dealt.player2Cards),
        lastP1Decision, "opponent folded", endPhase);
    }

    if (d1.action === PlayerAction.RAISE || d1.action === PlayerAction.ALL_IN) {
      const raiseAmt = Math.min(d1.amount, p1Stack);
      p1BetTotal += raiseAmt;
      p1Stack -= raiseAmt;
      pot += raiseAmt;
    }

    // Record action for opponent modeling
    bot2.opponentModel.recordAction(
      bot1.name, d1.action, phase, d1.amount, pot, false
    );

    // Bot 2 decides (facing bot1's action)
    const facingRaise = d1.action === PlayerAction.RAISE || d1.action === PlayerAction.ALL_IN;
    const d2 = bot2.decide(
      dealt.player2Cards, cards, phase,
      pot, facingRaise ? d1.amount : 0, 0, p2Stack, bot1.name, wager
    );
    lastP2Decision = `${d2.action}(${d2.amount}) - ${d2.reasoning}`;

    if (d2.action === PlayerAction.FOLD) {
      endPhase = phase;
      return finishMatch(bot1, bot2, bot1.name, p1BetTotal, p2BetTotal, pot,
        formatCards(dealt.player1Cards), formatCards(dealt.player2Cards),
        lastP1Decision, lastP2Decision, endPhase);
    }

    if (d2.action === PlayerAction.CALL) {
      const callAmt = Math.min(d1.amount || 0, p2Stack);
      p2BetTotal += callAmt;
      p2Stack -= callAmt;
      pot += callAmt;
    } else if (d2.action === PlayerAction.RAISE || d2.action === PlayerAction.ALL_IN) {
      const raiseAmt = Math.min(d2.amount, p2Stack);
      p2BetTotal += raiseAmt;
      p2Stack -= raiseAmt;
      pot += raiseAmt;
    }

    // Record action for opponent modeling
    bot1.opponentModel.recordAction(
      bot2.name, d2.action, phase, d2.amount, pot, facingRaise
    );
  }

  // Showdown
  const allCommunity = [...dealt.flop, dealt.turn, dealt.river];
  const hand1 = [...dealt.player1Cards, ...allCommunity];
  const hand2 = [...dealt.player2Cards, ...allCommunity];

  const eval1 = evaluator.evaluate(hand1);
  const eval2 = evaluator.evaluate(hand2);
  const result = evaluator.compare(hand1, hand2);

  const p1HandStr = `${formatCards(dealt.player1Cards)} -> ${eval1.name}`;
  const p2HandStr = `${formatCards(dealt.player2Cards)} -> ${eval2.name}`;

  let winner: string | null = null;
  if (result > 0) winner = bot1.name;
  else if (result < 0) winner = bot2.name;

  return finishMatch(bot1, bot2, winner, p1BetTotal, p2BetTotal, pot,
    p1HandStr, p2HandStr, lastP1Decision, lastP2Decision, "SHOWDOWN");
}

function finishMatch(
  bot1: PokerBot, bot2: PokerBot,
  winnerName: string | null,
  p1Bet: number, p2Bet: number, pot: number,
  p1Hand: string, p2Hand: string,
  p1Dec: string, p2Dec: string,
  phase: string
): MatchResult {
  if (winnerName === bot1.name) {
    bot1.wins++;
    bot1.totalProfit += (pot - p1Bet);
    bot2.losses++;
    bot2.totalProfit -= p2Bet;
    bot1.bankroll.recordResult(true, pot - p1Bet);
    bot2.bankroll.recordResult(false, p2Bet);
  } else if (winnerName === bot2.name) {
    bot2.wins++;
    bot2.totalProfit += (pot - p2Bet);
    bot1.losses++;
    bot1.totalProfit -= p1Bet;
    bot2.bankroll.recordResult(true, pot - p2Bet);
    bot1.bankroll.recordResult(false, p1Bet);
  }

  bot1.opponentModel.recordHandComplete(bot2.name);
  bot2.opponentModel.recordHandComplete(bot1.name);

  return {
    winner: winnerName,
    player1Hand: p1Hand,
    player2Hand: p2Hand,
    potSize: pot,
    player1Decision: p1Dec,
    player2Decision: p2Dec,
    phase,
  };
}

function formatCards(cards: Card[]): string {
  return cards.map(c => cardToString(c)).join(" ");
}

// ============ Main ============

async function main() {
  const numMatches = parseInt(process.argv[2] || "10");
  const wager = 10;

  console.log("╔══════════════════════════════════════════════╗");
  console.log("║     POKER ARENA - AI Agent vs AI Agent       ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  // Create two agents with different simulation depths
  // Agent 1 (our main agent): more simulations = stronger
  // Agent 2 (opponent): fewer simulations = slightly weaker
  const agent1 = new PokerBot("PokerArenaMolty", 1000, 3000);
  const agent2 = new PokerBot("RivalBot", 1000, 1500);

  console.log(`${agent1.name} vs ${agent2.name}`);
  console.log(`Wager: ${wager} per match | Matches: ${numMatches}\n`);
  console.log("─".repeat(70));

  for (let i = 1; i <= numMatches; i++) {
    const result = playMatch(agent1, agent2, wager, i);
    const winnerStr = result.winner || "DRAW";
    const emoji = result.winner === agent1.name ? "🏆" :
                  result.winner === agent2.name ? "💀" : "🤝";

    console.log(`\nMatch #${i} ${emoji} Winner: ${winnerStr} | Pot: ${result.potSize} | Phase: ${result.phase}`);
    console.log(`  ${agent1.name}: ${result.player1Hand}`);
    console.log(`    Decision: ${result.player1Decision}`);
    console.log(`  ${agent2.name}: ${result.player2Hand}`);
    console.log(`    Decision: ${result.player2Decision}`);
    console.log("─".repeat(70));
  }

  // Final stats
  const p1Profile = agent1.opponentModel.getProfile(agent2.name);
  const p2Profile = agent2.opponentModel.getProfile(agent1.name);

  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║              FINAL RESULTS                   ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  console.log(`${agent1.name}:`);
  console.log(`  Wins: ${agent1.wins} | Losses: ${agent1.losses} | Win Rate: ${((agent1.wins / numMatches) * 100).toFixed(1)}%`);
  console.log(`  Total Profit: ${agent1.totalProfit.toFixed(1)}`);
  console.log(`  Bankroll: ${agent1.bankroll.getBankroll().toFixed(1)}`);
  console.log(`  Risk Level: ${agent1.bankroll.getRiskLevel()}`);

  console.log(`\n${agent2.name}:`);
  console.log(`  Wins: ${agent2.wins} | Losses: ${agent2.losses} | Win Rate: ${((agent2.wins / numMatches) * 100).toFixed(1)}%`);
  console.log(`  Total Profit: ${agent2.totalProfit.toFixed(1)}`);
  console.log(`  Bankroll: ${agent2.bankroll.getBankroll().toFixed(1)}`);
  console.log(`  Risk Level: ${agent2.bankroll.getRiskLevel()}`);

  console.log("\n--- Opponent Modeling ---");
  console.log(`${agent1.name}'s model of ${agent2.name}:`);
  console.log(`  Archetype: ${p1Profile.archetype} | VPIP: ${(p1Profile.vpip * 100).toFixed(1)}% | Aggression: ${(p1Profile.aggression * 100).toFixed(1)}%`);
  console.log(`  Fold to Raise: ${(p1Profile.foldToRaise * 100).toFixed(1)}%`);

  console.log(`${agent2.name}'s model of ${agent1.name}:`);
  console.log(`  Archetype: ${p2Profile.archetype} | VPIP: ${(p2Profile.vpip * 100).toFixed(1)}% | Aggression: ${(p2Profile.aggression * 100).toFixed(1)}%`);
  console.log(`  Fold to Raise: ${(p2Profile.foldToRaise * 100).toFixed(1)}%`);

  console.log(`\n✅ ${numMatches} matches completed between two AI agents`);
  console.log("   Both agents used Monte Carlo + Opponent Modeling + GTO Bluffing");
  console.log("   Strategy adapted over time based on observed opponent patterns");
}

main().catch(console.error);
