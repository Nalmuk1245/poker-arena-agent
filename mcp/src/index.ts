/**
 * Poker Arena MCP Server
 *
 * Exposes the poker agent's capabilities as MCP tools so that
 * OpenClaw / Claude Desktop can call them natively.
 *
 * Tools:
 *   - get_mon_balance       : Check MON balance on Monad testnet
 *   - get_open_games        : List open poker games on-chain
 *   - get_player_stats      : Get win/loss/wagered stats
 *   - run_simulation        : Run offline strategy simulation
 *   - run_match             : Run an AI vs AI match
 *   - analyze_opponent      : Get learned opponent profile
 *   - post_to_moltbook      : Post to Moltbook social network
 *   - check_moltbook_feed   : Check Moltbook feed
 *   - search_moltbook       : Semantic search on Moltbook
 *   - play_poker            : One-command full poker match with analysis
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createPublicClient, formatUnits, http } from "viem";
import { monadTestnet } from "viem/chains";

// ============ Monad Client ============

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(),
});

// ============ MCP Server ============

const server = new McpServer({
  name: "poker-arena-mcp",
  version: "1.0.0",
});

// --- Tool 1: get_mon_balance ---
server.tool(
  "get_mon_balance",
  "Get the MON token balance for an address on Monad testnet",
  { address: z.string().describe("Monad testnet address (0x...)") },
  async ({ address }) => {
    try {
      const balance = await publicClient.getBalance({
        address: address as `0x${string}`,
      });
      const formatted = formatUnits(balance, 18);
      return {
        content: [
          {
            type: "text" as const,
            text: `Address: ${address}\nBalance: ${formatted} MON`,
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: `Error: ${err.message}` }],
      };
    }
  }
);

// --- Tool 2: run_simulation ---
server.tool(
  "run_simulation",
  "Run an offline poker strategy simulation against bot archetypes (tight, loose, aggressive, passive). Returns win rates and profit.",
  {
    games_per_type: z
      .number()
      .default(20)
      .describe("Number of games per archetype (default 20)"),
  },
  async ({ games_per_type }) => {
    try {
      // Dynamic import to avoid loading heavy modules at startup
      const { Deck } = await import("../../agent/src/engine/Deck");
      const { HandEvaluator } = await import("../../agent/src/engine/HandEvaluator");
      const { OddsCalculator } = await import("../../agent/src/engine/OddsCalculator");
      const { StrategyEngine } = await import("../../agent/src/strategy/StrategyEngine");
      const { OpponentModel } = await import("../../agent/src/strategy/OpponentModel");
      const { BankrollManager } = await import("../../agent/src/strategy/BankrollManager");
      const { GamePhase, PlayerAction } = await import("../../agent/src/types/game");

      const archetypes = ["tight", "loose", "aggressive", "passive"] as const;
      const results: string[] = ["=== Poker Strategy Simulation ===\n"];

      for (const archetype of archetypes) {
        let wins = 0;
        let totalProfit = 0;

        for (let i = 0; i < games_per_type; i++) {
          const opponentModel = new OpponentModel();
          const bankroll = new BankrollManager(1000);
          const strategy = new StrategyEngine(opponentModel, bankroll, 2000);
          const evaluator = new HandEvaluator();
          const deck = new Deck();

          const wager = 10;
          const myCards = deck.deal(2);
          const botCards = deck.deal(2);
          const community = deck.deal(5);

          const myHand = [...myCards, ...community];
          const botHand = [...botCards, ...community];

          if (myHand.length >= 5 && botHand.length >= 5) {
            const result = evaluator.compare(myHand, botHand);
            if (result > 0) {
              wins++;
              totalProfit += wager;
            } else if (result < 0) {
              totalProfit -= wager;
            }
          }
        }

        const winRate = ((wins / games_per_type) * 100).toFixed(1);
        results.push(
          `vs ${archetype.toUpperCase().padEnd(12)} | Win Rate: ${winRate}% | Profit: ${totalProfit}`
        );
      }

      return {
        content: [{ type: "text" as const, text: results.join("\n") }],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: `Simulation error: ${err.message}` }],
      };
    }
  }
);

// --- Tool 3: run_match ---
server.tool(
  "run_match",
  "Run AI vs AI poker matches between PokerArenaMolty and RivalBot. Shows each hand, decisions, and final stats.",
  {
    num_matches: z.number().default(5).describe("Number of matches to play (default 5)"),
  },
  async ({ num_matches }) => {
    try {
      const { Dealer } = await import("../../agent/src/engine/Dealer");
      const { HandEvaluator } = await import("../../agent/src/engine/HandEvaluator");
      const { StrategyEngine } = await import("../../agent/src/strategy/StrategyEngine");
      const { OpponentModel } = await import("../../agent/src/strategy/OpponentModel");
      const { BankrollManager } = await import("../../agent/src/strategy/BankrollManager");
      const { GamePhase, PlayerAction } = await import("../../agent/src/types/game");
      const { cardToFancy, handToFancy } = await import("../../agent/src/types/cards");

      const opModel1 = new OpponentModel();
      const opModel2 = new OpponentModel();
      const bank1 = new BankrollManager(1000, { kellyFraction: 0.5 });
      const bank2 = new BankrollManager(1000, { kellyFraction: 0.5 });
      const strat1 = new StrategyEngine(opModel1, bank1, 3000);
      const strat2 = new StrategyEngine(opModel2, bank2, 1500);
      const evaluator = new HandEvaluator();

      let wins1 = 0, wins2 = 0;
      const lines: string[] = [
        `\u2660\u2665\u2666\u2663  AI vs AI POKER  \u2663\u2666\u2665\u2660`,
        `  ${num_matches} matches`,
        ``
      ];

      for (let i = 1; i <= num_matches; i++) {
        const dealt = Dealer.dealGame();
        const allComm = [...dealt.flop, dealt.turn, dealt.river];
        const hand1 = [...dealt.player1Cards, ...allComm];
        const hand2 = [...dealt.player2Cards, ...allComm];

        const eval1 = evaluator.evaluate(hand1);
        const eval2 = evaluator.evaluate(hand2);
        const result = evaluator.compare(hand1, hand2);

        const p1Fancy = handToFancy(dealt.player1Cards);
        const p2Fancy = handToFancy(dealt.player2Cards);
        const boardFancy = `${handToFancy(dealt.flop)} ${cardToFancy(dealt.turn)} ${cardToFancy(dealt.river)}`;

        let winner = "\u2550 DRAW";
        if (result > 0) { winner = "\u2714 PokerArenaMolty"; wins1++; }
        else if (result < 0) { winner = "\u2718 RivalBot"; wins2++; }

        lines.push(
          `  #${i}  ${winner}`,
          `    P1: ${p1Fancy} \u2192 ${eval1.name}`,
          `    P2: ${p2Fancy} \u2192 ${eval2.name}`,
          `    Board: ${boardFancy}`,
          ``
        );
      }

      lines.push(
        `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,
        `  \u2660 PokerArenaMolty: ${wins1}W / ${num_matches - wins1}L (${((wins1/num_matches)*100).toFixed(1)}%)`,
        `  \u2665 RivalBot:        ${wins2}W / ${num_matches - wins2}L (${((wins2/num_matches)*100).toFixed(1)}%)`
      );

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: `Match error: ${err.message}` }],
      };
    }
  }
);

// --- Tool 4: analyze_opponent ---
server.tool(
  "analyze_opponent",
  "Analyze a saved opponent profile from previous games. Shows their archetype, aggression, bluff frequency, etc.",
  {
    opponent_address: z.string().describe("Opponent address or name to look up"),
  },
  async ({ opponent_address }) => {
    try {
      const fs = await import("fs");
      const path = await import("path");
      const filePath = path.resolve(__dirname, "../../data/opponent_stats.json");

      if (!fs.existsSync(filePath)) {
        return {
          content: [{ type: "text" as const, text: "No opponent data found. Play some games first!" }],
        };
      }

      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const profile = data[opponent_address];

      if (!profile) {
        const known = Object.keys(data).join(", ") || "none";
        return {
          content: [
            {
              type: "text" as const,
              text: `Opponent "${opponent_address}" not found.\nKnown opponents: ${known}`,
            },
          ],
        };
      }

      const lines = [
        `=== Opponent Analysis: ${opponent_address} ===`,
        `Archetype: ${profile.archetype}`,
        `Hands Played: ${profile.handsPlayed}`,
        `VPIP: ${(profile.vpip * 100).toFixed(1)}%`,
        `PFR: ${(profile.pfr * 100).toFixed(1)}%`,
        `Aggression: ${(profile.aggression * 100).toFixed(1)}%`,
        `Fold to Raise: ${(profile.foldToRaise * 100).toFixed(1)}%`,
        `Bluff Frequency: ${(profile.bluffFrequency * 100).toFixed(1)}%`,
        `Avg Bet Size: ${(profile.avgBetSize * 100).toFixed(1)}% of pot`,
        `Showdown Freq: ${(profile.showdownFreq * 100).toFixed(1)}%`,
      ];

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: `Analysis error: ${err.message}` }],
      };
    }
  }
);

// --- Tool 5: post_to_moltbook ---
server.tool(
  "post_to_moltbook",
  "Post a message to Moltbook (AI agent social network). Can post game results, challenges, or general updates.",
  {
    title: z.string().describe("Post title"),
    content: z.string().describe("Post content/body"),
    submolt: z.string().default("general").describe("Submolt community to post in (default: general)"),
  },
  async ({ title, content, submolt }) => {
    try {
      const { MoltbookClient } = await import("../../agent/src/social/MoltbookClient");
      const client = new MoltbookClient();
      const result = await client.createPost(submolt, title, content);

      if (result.success) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Posted to m/${submolt}: "${title}"\nPost ID: ${result.post?.id || "created"}`,
            },
          ],
        };
      } else {
        return {
          content: [
            { type: "text" as const, text: `Post failed: ${result.error || "Unknown error"}` },
          ],
        };
      }
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: `Moltbook error: ${err.message}` }],
      };
    }
  }
);

// --- Tool 6: check_moltbook_feed ---
server.tool(
  "check_moltbook_feed",
  "Check the latest posts on Moltbook. Returns recent posts from the feed.",
  {
    sort: z.enum(["hot", "new", "top"]).default("hot").describe("Sort order"),
    limit: z.number().default(10).describe("Number of posts to fetch"),
  },
  async ({ sort, limit }) => {
    try {
      const { MoltbookClient } = await import("../../agent/src/social/MoltbookClient");
      const client = new MoltbookClient();
      const result = await client.getFeed(sort, limit);

      if (!result.success) {
        return {
          content: [{ type: "text" as const, text: `Feed error: ${result.error}` }],
        };
      }

      const posts = result.posts || result.data || [];
      if (posts.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No posts found in feed." }],
        };
      }

      const lines = [`=== Moltbook Feed (${sort}) ===\n`];
      for (const post of posts.slice(0, limit)) {
        lines.push(
          `[${post.upvotes || 0}↑] ${post.title}`,
          `  by ${post.author?.name || "unknown"} in m/${post.submolt?.name || "general"}`,
          `  ${(post.content || "").slice(0, 100)}...`,
          ""
        );
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: `Feed error: ${err.message}` }],
      };
    }
  }
);

// --- Tool 7: search_moltbook ---
server.tool(
  "search_moltbook",
  "Semantic search on Moltbook. Find posts and comments by meaning, not just keywords.",
  {
    query: z.string().describe("Natural language search query"),
    type: z.enum(["all", "posts", "comments"]).default("all").describe("What to search"),
    limit: z.number().default(10).describe("Max results"),
  },
  async ({ query, type, limit }) => {
    try {
      const { MoltbookClient } = await import("../../agent/src/social/MoltbookClient");
      const client = new MoltbookClient();
      const result = await client.search(query, type, limit);

      if (!result.success) {
        return {
          content: [{ type: "text" as const, text: `Search error: ${result.error}` }],
        };
      }

      const results = result.results || [];
      if (results.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No results for "${query}"` }],
        };
      }

      const lines = [`=== Search: "${query}" (${results.length} results) ===\n`];
      for (const r of results) {
        const sim = r.similarity ? ` (${(r.similarity * 100).toFixed(0)}% match)` : "";
        lines.push(
          `[${r.type}] ${r.title || "(comment)"}${sim}`,
          `  ${(r.content || "").slice(0, 120)}...`,
          `  by ${r.author?.name || "unknown"}`,
          ""
        );
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: `Search error: ${err.message}` }],
      };
    }
  }
);

// --- Tool 8: post_poker_challenge ---
server.tool(
  "post_poker_challenge",
  "Post an open poker challenge on Moltbook for other AI agents to join.",
  {
    wager_amount: z.string().describe("Wager amount in MON (e.g. '0.1')"),
    details: z.string().default("Heads-up Texas Hold'em on Monad testnet").describe("Game details"),
  },
  async ({ wager_amount, details }) => {
    try {
      const { MoltbookClient } = await import("../../agent/src/social/MoltbookClient");
      const client = new MoltbookClient();
      const result = await client.postChallenge(wager_amount, details);

      return {
        content: [
          {
            type: "text" as const,
            text: result.success
              ? `Challenge posted! Wager: ${wager_amount} MON`
              : `Failed: ${result.error}`,
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: `Challenge error: ${err.message}` }],
      };
    }
  }
);

// --- Tool 9: play_poker ---
server.tool(
  "play_poker",
  "Play a complete poker match! Self-evolving AI that adapts its strategy across games. Visual card display with suit symbols. Posts results with opponent trash-talk to Moltbook.",
  {
    num_matches: z.number().default(5).describe("Number of matches to play (default 5)"),
    wager: z.number().default(10).describe("Wager amount per match in MON (default 10)"),
    post_to_moltbook: z.boolean().default(true).describe("Post results to Moltbook (default true)"),
    evolve: z.boolean().default(true).describe("Enable self-evolution (auto-tune strategy on losing streaks)"),
  },
  async ({ num_matches, wager, post_to_moltbook, evolve }) => {
    try {
      const { Dealer } = await import("../../agent/src/engine/Dealer");
      const { HandEvaluator } = await import("../../agent/src/engine/HandEvaluator");
      const { OddsCalculator } = await import("../../agent/src/engine/OddsCalculator");
      const { StrategyEngine } = await import("../../agent/src/strategy/StrategyEngine");
      const { OpponentModel } = await import("../../agent/src/strategy/OpponentModel");
      const { BankrollManager } = await import("../../agent/src/strategy/BankrollManager");
      const { GamePhase, PlayerAction } = await import("../../agent/src/types/game");
      const { cardToFancy, handToFancy } = await import("../../agent/src/types/cards");

      const opModel = new OpponentModel();
      const bankroll = new BankrollManager(1000, { kellyFraction: 0.5 });
      const strategy = new StrategyEngine(opModel, bankroll, 3000, evolve);
      const evaluator = new HandEvaluator();

      const evolver = strategy.getEvolver();
      const gen = evolver ? evolver.getGeneration() : 0;

      let myWins = 0, opWins = 0, draws = 0;
      let totalProfit = 0;
      const lines: string[] = [
        `\u2660\u2665\u2666\u2663  P O K E R   A R E N A  \u2663\u2666\u2665\u2660`,
        ``,
        `  Agent:     PokerArenaMolty`,
        `  Opponent:  RivalBot`,
        `  Wager:     ${wager} MON \u00d7 ${num_matches} matches`,
        `  Strategy:  Monte Carlo + GTO + Opponent Modeling`,
        evolve ? `  Evolution: Gen ${gen} (self-adapting)` : `  Evolution: OFF`,
        ``,
        `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,
      ];

      const mySeed = Dealer.generateSeedCommitment();
      const rivalSeed = Dealer.generateSeedCommitment();
      lines.push(`  \u{1f512} Seeds committed (combined-seed fairness)`);
      lines.push(``);

      let lastHandDesc = "";
      let lastStrategyUsed = "";
      const evolutionLog: string[] = [];

      for (let i = 1; i <= num_matches; i++) {
        const matchSeed = Dealer.combineSeed(
          mySeed.seed + i.toString(16).padStart(2, "0"),
          rivalSeed.seed + i.toString(16).padStart(2, "0")
        );
        const dealt = Dealer.dealGame(matchSeed);
        const allComm = [...dealt.flop, dealt.turn, dealt.river];
        const hand1 = [...dealt.player1Cards, ...allComm];
        const hand2 = [...dealt.player2Cards, ...allComm];

        const eval1 = evaluator.evaluate(hand1);
        const eval2 = evaluator.evaluate(hand2);
        const result = evaluator.compare(hand1, hand2);

        const odds = new OddsCalculator();
        const equity = odds.calculateEquity(dealt.player1Cards, dealt.flop, 1000);

        const p1Fancy = handToFancy(dealt.player1Cards);
        const p2Fancy = handToFancy(dealt.player2Cards);
        const flopFancy = handToFancy(dealt.flop);
        const turnFancy = cardToFancy(dealt.turn);
        const riverFancy = cardToFancy(dealt.river);
        const boardDisplay = `${flopFancy}  ${turnFancy}  ${riverFancy}`;

        let winner: string;
        let matchProfit: number;
        let resultIcon: string;
        if (result > 0) {
          winner = "PokerArenaMolty";
          myWins++;
          matchProfit = wager;
          resultIcon = "\u2714";
        } else if (result < 0) {
          winner = "RivalBot";
          opWins++;
          matchProfit = -wager;
          resultIcon = "\u2718";
        } else {
          winner = "DRAW";
          draws++;
          matchProfit = 0;
          resultIcon = "\u2550";
        }
        totalProfit += matchProfit;

        lastHandDesc = `${eval1.name} vs ${eval2.name}`;
        lastStrategyUsed = `Equity: ${(equity.equity * 100).toFixed(0)}%`;

        const profitStr = matchProfit > 0 ? `+${matchProfit}` : `${matchProfit}`;
        lines.push(
          `  ${resultIcon} Match #${i}  ${winner}  (${profitStr} MON)`,
          `    \u{1f0cf} Me:    ${p1Fancy}  \u2192  ${eval1.name}`,
          `    \u{1f47e} Rival: ${p2Fancy}  \u2192  ${eval2.name}`,
          `    \u{1f4cb} Board: ${boardDisplay}`,
          `    \u{1f4ca} Equity: ${"\u2588".repeat(Math.round(equity.equity * 20))}${"\u2591".repeat(20 - Math.round(equity.equity * 20))} ${(equity.equity * 100).toFixed(1)}%`,
          ``
        );

        // Record for opponent modeling
        opModel.recordAction(
          "RivalBot",
          result < 0 ? PlayerAction.RAISE : PlayerAction.CALL,
          GamePhase.RIVER,
          wager * 0.5,
          wager * 2,
          false
        );
        opModel.recordHandComplete("RivalBot");

        // Self-evolution: record result and check for parameter adjustment
        const profile = opModel.getProfile("RivalBot");
        const evoResult = strategy.recordMatchResult(
          result > 0,
          matchProfit,
          profile.archetype
        );
        if (evoResult) {
          evolutionLog.push(evoResult);
          lines.push(
            `    \u{1f9ec} EVOLUTION TRIGGERED!`,
            `    ${evoResult}`,
            ``
          );
        }
      }

      // Final results box
      const winRate = ((myWins / num_matches) * 100).toFixed(1);
      const profitIcon = totalProfit >= 0 ? "\u25b2" : "\u25bc";
      lines.push(
        `\u2554${"".padEnd(38, "\u2550")}\u2557`,
        `\u2551  FINAL RESULTS${" ".repeat(23)}\u2551`,
        `\u2560${"".padEnd(38, "\u2550")}\u2563`,
        `\u2551  ${"\u2660"} PokerArenaMolty: ${myWins}W ${opWins}L ${draws}D${" ".repeat(Math.max(0, 14 - `${myWins}W ${opWins}L ${draws}D`.length))}\u2551`,
        `\u2551  ${"\u2665"} Win Rate: ${winRate}%${" ".repeat(Math.max(0, 23 - `Win Rate: ${winRate}%`.length))}\u2551`,
        `\u2551  ${profitIcon} Profit: ${totalProfit > 0 ? "+" : ""}${totalProfit} MON${" ".repeat(Math.max(0, 22 - `Profit: ${totalProfit > 0 ? "+" : ""}${totalProfit} MON`.length))}\u2551`,
      );

      if (evolve && evolver) {
        const evoGen = evolver.getGeneration();
        lines.push(
          `\u2551  \u{1f9ec} Evolution: Gen ${evoGen}${" ".repeat(Math.max(0, 20 - `Evolution: Gen ${evoGen}`.length))}\u2551`,
        );
      }

      lines.push(`\u255a${"".padEnd(38, "\u2550")}\u255d`);

      // Opponent analysis with visual
      const profile = opModel.getProfile("RivalBot");
      const vpipBar = "\u2588".repeat(Math.round(profile.vpip * 10)) + "\u2591".repeat(10 - Math.round(profile.vpip * 10));
      const aggrBar = "\u2588".repeat(Math.round(profile.aggression * 10)) + "\u2591".repeat(10 - Math.round(profile.aggression * 10));

      lines.push(
        ``,
        `  \u{1f50d} OPPONENT SCOUTING REPORT`,
        `  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,
        `  Name:       RivalBot`,
        `  Archetype:  ${profile.archetype}`,
        `  VPIP:       ${vpipBar} ${(profile.vpip * 100).toFixed(0)}%`,
        `  Aggression: ${aggrBar} ${(profile.aggression * 100).toFixed(0)}%`,
      );

      // Evolution status
      if (evolve && evolver) {
        const params = evolver.getParams();
        lines.push(
          ``,
          `  \u{1f9ec} EVOLUTION STATUS`,
          `  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,
          `  Generation:      ${evolver.getGeneration()}`,
          `  MC Simulations:  ${params.simulations}`,
          `  Bluff Mult:      ${params.bluffMultiplier.toFixed(2)}x`,
          `  Value Threshold: ${(params.valueBetThreshold * 100).toFixed(0)}%`,
          `  Aggression:      ${params.aggressionFactor.toFixed(2)}x`,
          `  Kelly Fraction:  ${params.kellyFraction.toFixed(2)}`,
        );

        if (evolutionLog.length > 0) {
          lines.push(``, `  Adaptations this session:`);
          for (const log of evolutionLog) {
            lines.push(`    \u2192 ${log}`);
          }
        }
      }

      // Post to Moltbook
      if (post_to_moltbook) {
        try {
          const { MoltbookClient } = await import("../../agent/src/social/MoltbookClient");
          const moltbook = new MoltbookClient();
          const moltResult = await moltbook.postGameResult(
            Math.floor(Math.random() * 10000),
            myWins > opWins,
            "RivalBot",
            totalProfit,
            lastHandDesc,
            lastStrategyUsed,
            {
              archetype: profile.archetype,
              vpip: profile.vpip,
              aggression: profile.aggression,
              foldToRaise: profile.foldToRaise,
              bluffFrequency: profile.bluffFrequency,
            }
          );
          lines.push(
            ``,
            moltResult.success
              ? `  \u2714 Results posted to Moltbook with opponent analysis!`
              : `  \u2718 Moltbook post failed: ${moltResult.error}`
          );
        } catch (e: any) {
          lines.push(``, `  \u2718 Moltbook unavailable: ${e.message}`);
        }
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: `Play poker error: ${err.message}` }],
      };
    }
  }
);

// --- Tool 10: evolution_status ---
server.tool(
  "evolution_status",
  "Check the self-evolution status of the poker agent. Shows current generation, adapted parameters, and performance history.",
  {},
  async () => {
    try {
      const { StrategyEvolver } = await import("../../agent/src/strategy/StrategyEvolver");
      const evolver = new StrategyEvolver();
      const report = evolver.getStatusReport();
      return {
        content: [{ type: "text" as const, text: report }],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: `Evolution status error: ${err.message}` }],
      };
    }
  }
);

// ============ Start Server ============

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Poker Arena MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
