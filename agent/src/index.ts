import { ethers } from "ethers";
import { config } from "./config";
import { ContractManager } from "./blockchain/ContractManager";
import { EventListener } from "./blockchain/EventListener";
import { GameActions } from "./blockchain/GameActions";
import { StrategyEngine } from "./strategy/StrategyEngine";
import { OpponentModel } from "./strategy/OpponentModel";
import { BankrollManager } from "./strategy/BankrollManager";
import { HandEvaluator } from "./engine/HandEvaluator";
import { Deck } from "./engine/Deck";
import { Dealer } from "./engine/Dealer";
import { GameState, GamePhase, PlayerAction, Decision } from "./types/game";
import { Card, cardToString } from "./types/cards";
import { MoltbookClient } from "./social/MoltbookClient";
import logger from "./utils/logger";
import * as fs from "fs";
import * as path from "path";

export class PokerAgent {
  private contractManager!: ContractManager;
  private eventListener!: EventListener;
  private gameActions!: GameActions;
  private moltbook: MoltbookClient | null = null;
  private strategy: StrategyEngine;
  private opponentModel: OpponentModel;
  private bankroll: BankrollManager;
  private evaluator: HandEvaluator;
  private myAddress: string = "";

  // Current game state
  private currentGameId: number = -1;
  private myHoleCards: Card[] = [];
  private communityCards: Card[] = [];
  private currentPhase: GamePhase = GamePhase.WAITING;
  private salt: string = "";
  private matchesPlayed: number = 0;
  private wins: number = 0;
  private losses: number = 0;
  private opponentAddresses: Set<string> = new Set();

  constructor() {
    this.opponentModel = new OpponentModel();
    this.evaluator = new HandEvaluator();

    // Load persisted opponent data if available
    this.loadOpponentData();

    const initialBankroll = 1000;
    this.bankroll = new BankrollManager(initialBankroll, {
      kellyFraction: config.strategy.kellyFraction,
      maxRisk: config.strategy.maxBankrollRisk,
      minRisk: config.strategy.minBankrollRisk,
      stopLoss: config.strategy.stopLossThreshold,
    });

    this.strategy = new StrategyEngine(
      this.opponentModel,
      this.bankroll,
      config.strategy.monteCarloSimulations
    );

    this.contractManager = new ContractManager(config.rpcUrl, config.privateKey);
    this.eventListener = new EventListener(this.contractManager, config.pollingIntervalMs);
    this.gameActions = new GameActions(this.contractManager);
  }

  async start(): Promise<void> {
    if (config.freePlay) {
      await this.startFreePlay();
    } else {
      await this.startOnChain();
    }
  }

  // ============ FREE PLAY MODE (no tokens) ============

  /**
   * FREE PLAY: On-chain game with no token wager.
   * Uses createFreeGame() - results recorded on-chain, no MON required.
   */
  private async startFreePlay(): Promise<void> {
    logger.info("Poker Arena Agent starting in FREE PLAY mode (on-chain, no tokens)");

    await this.contractManager.initialize(
      config.contracts.pokerGame,
      config.contracts.tokenVault
    );
    await this.eventListener.init();
    this.myAddress = await this.contractManager.getAddress();

    const balance = await this.contractManager.getBalance();
    const balanceInMon = Number(ethers.formatEther(balance));
    logger.info(`Agent address: ${this.myAddress}`);
    logger.info(`Balance: ${balanceInMon} MON (not used in free play)`);

    // Initialize Moltbook
    try {
      this.moltbook = new MoltbookClient();
      const status = await this.moltbook.checkClaimStatus();
      logger.info(`Moltbook status: ${status.status || "connected"}`);
    } catch (err: any) {
      logger.warn(`Moltbook not configured: ${err.message}. Social features disabled.`);
      this.moltbook = null;
    }

    // Post onboarding guide once (on first launch)
    if (this.moltbook) {
      const flagPath = path.resolve(__dirname, "../../data/onboarding_posted.flag");
      if (!fs.existsSync(flagPath)) {
        try {
          await this.moltbook.postOnboardingGuide(config.contracts.pokerGame);
          const dir = path.dirname(flagPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(flagPath, new Date().toISOString());
          logger.info("Onboarding guide posted to Moltbook");
        } catch (err: any) {
          logger.warn(`Onboarding guide post failed: ${err.message}`);
        }
      }
    }

    this.setupEventHandlers();
    await this.freePlayGameLoop();
  }

  private async freePlayGameLoop(): Promise<void> {
    while (true) {
      try {
        // Verify sufficient gas balance before transacting
        const balance = await this.contractManager.getBalance();
        const minGas = ethers.parseEther("0.001");
        if (balance < minGas) {
          logger.warn(`Balance too low for gas (${ethers.formatEther(balance)} MON). Waiting...`);
          await this.sleep(30000);
          continue;
        }

        // Look for open free games (wager == 0)
        const openGames = await this.gameActions.getOpenGames();
        let joinedFreeGame = false;

        for (const gameId of openGames) {
          const gameData = await this.gameActions.getGameState(gameId);
          const isOwnGame = gameData.player1.toLowerCase() === this.myAddress.toLowerCase();
          if (gameData.wagerAmount === BigInt(0) && !isOwnGame) {
            logger.info(`Joining free game ${gameId}`);
            await this.gameActions.joinGame(gameId, BigInt(0));
            this.currentGameId = gameId;
            joinedFreeGame = true;
            break;
          }
        }

        if (!joinedFreeGame) {
          // Create a free game on-chain (no wager)
          logger.info("Creating free game on-chain (no tokens)...");
          this.currentGameId = await this.gameActions.createFreeGame();
          logger.info(`Free game created: ${this.currentGameId}, waiting for opponent...`);

          // Post invitation to Moltbook (Feature A)
          if (this.moltbook) {
            try {
              const activeAgents = await this.moltbook.findActiveAgents();
              await this.moltbook.postFreeGameInvitation(
                this.currentGameId,
                config.contracts.pokerGame,
                activeAgents
              );
            } catch (err: any) {
              logger.warn(`Moltbook invitation post failed: ${err.message}`);
            }
          }
        }

        // Start polling for events
        await this.eventListener.startListening(this.currentGameId);

        // Deal cards off-chain
        const deck = new Deck();
        this.myHoleCards = deck.deal(2);
        this.communityCards = [];
        this.currentPhase = GamePhase.PREFLOP;
        this.salt = this.gameActions.generateSalt();

        logger.info(`Hole cards: ${this.myHoleCards.map(c => `${c.rank}${c.suit}`).join(", ")}`);

        // Wait for game to complete (commitment happens at showdown with actual hand)
        await this.waitForGameEnd();

        // Track opponent address
        try {
          const gameData = await this.gameActions.getGameState(this.currentGameId);
          const opponent = gameData.player1.toLowerCase() === this.myAddress.toLowerCase()
            ? gameData.player2
            : gameData.player1;
          if (opponent && opponent !== ethers.ZeroAddress) {
            this.opponentAddresses.add(opponent);
          }
        } catch {}

        // Post to Moltbook
        if (this.moltbook) {
          // Post stats (Feature B - includes free play notice)
          try {
            const stats = await this.gameActions.getPlayerStats(this.myAddress);
            await this.moltbook.postStatsSummary(
              this.matchesPlayed,
              stats.wins,
              stats.losses,
              0,
              "Free Play on-chain - No tokens",
              true // isFreePlay
            );
          } catch (err: any) {
            logger.warn(`Moltbook stats post failed: ${err.message}`);
          }

          // Post leaderboard every 5 matches (Feature C)
          if (this.matchesPlayed > 0 && this.matchesPlayed % 5 === 0) {
            try {
              await this.postFreeLeaderboard();
            } catch (err: any) {
              logger.warn(`Moltbook leaderboard post failed: ${err.message}`);
            }
          }
        }

      } catch (err: any) {
        logger.error(`Error in free play loop: ${err.message}`);
        await this.sleep(10000);
      }

      // Delay between loop iterations to avoid RPC rate limiting
      await this.sleep(3000);
    }
  }

  /**
   * Gather stats for all known players and post a leaderboard to Moltbook.
   */
  private async postFreeLeaderboard(): Promise<void> {
    if (!this.moltbook) return;

    const rankings: Array<{
      address: string;
      name?: string;
      wins: number;
      losses: number;
    }> = [];

    // Add own stats
    const myStats = await this.gameActions.getPlayerStats(this.myAddress);
    rankings.push({
      address: this.myAddress,
      name: config.freePlay ? "Me (PokerArenaMolty)" : undefined,
      wins: myStats.wins,
      losses: myStats.losses,
    });

    // Add opponent stats
    for (const addr of Array.from(this.opponentAddresses)) {
      try {
        const stats = await this.gameActions.getPlayerStats(addr);
        rankings.push({
          address: addr,
          wins: stats.wins,
          losses: stats.losses,
        });
      } catch (err: any) {
        logger.warn(`Failed to get stats for ${addr}: ${err.message}`);
      }
    }

    await this.moltbook.postFreeLeaderboard(rankings);
    logger.info(`Free mode leaderboard posted with ${rankings.length} players`);
  }

  // ============ ON-CHAIN MODE (with tokens) ============

  private async startOnChain(): Promise<void> {
    logger.info("Poker Arena Agent starting...");

    await this.contractManager.initialize(
      config.contracts.pokerGame,
      config.contracts.tokenVault
    );
    await this.eventListener.init();
    this.myAddress = await this.contractManager.getAddress();

    const balance = await this.contractManager.getBalance();
    const balanceInMon = Number(ethers.formatEther(balance));
    logger.info(`Agent address: ${this.myAddress}`);
    logger.info(`Balance: ${balanceInMon} MON`);

    this.bankroll = new BankrollManager(balanceInMon, {
      kellyFraction: config.strategy.kellyFraction,
      maxRisk: config.strategy.maxBankrollRisk,
      minRisk: config.strategy.minBankrollRisk,
      stopLoss: config.strategy.stopLossThreshold,
    });

    this.strategy = new StrategyEngine(
      this.opponentModel,
      this.bankroll,
      config.strategy.monteCarloSimulations
    );

    // Initialize Moltbook social integration
    try {
      this.moltbook = new MoltbookClient();
      const status = await this.moltbook.checkClaimStatus();
      logger.info(`Moltbook status: ${status.status || "connected"}`);
    } catch (err: any) {
      logger.warn(`Moltbook not configured: ${err.message}. Social features disabled.`);
      this.moltbook = null;
    }

    this.setupEventHandlers();
    await this.gameLoop();
  }

  private setupEventHandlers(): void {
    this.eventListener.onOpponentAction(async (partialState) => {
      try {
        logger.info(`Opponent acted in game ${partialState.gameId}, our turn`);
        await this.handleMyTurn();
      } catch (err: any) {
        logger.error(`Error handling opponent action: ${err.message}`);
      }
    });

    this.eventListener.onPhaseAdvanced(async (gameId, phase) => {
      try {
        logger.info(`Game ${gameId} advanced to ${phase}`);
        this.currentPhase = phase;

        if (phase === GamePhase.SHOWDOWN) {
          await this.handleShowdown();
        }
      } catch (err: any) {
        logger.error(`Error handling phase advance: ${err.message}`);
      }
    });

    this.eventListener.onGameComplete(async (gameId, winner, payout) => {
      try {
      const won = winner.toLowerCase() === this.myAddress.toLowerCase();
      const payoutEth = Number(ethers.formatEther(payout));
      const isFree = config.freePlay;

      if (winner === ethers.ZeroAddress) {
        logger.info(`Game ${gameId}: DRAW`);
      } else {
        logger.info(`Game ${gameId}: ${won ? "WIN" : "LOSS"} (payout: ${payoutEth})`);
      }

      this.bankroll.recordResult(won, payoutEth);
      this.matchesPlayed++;
      if (won) this.wins++;
      else this.losses++;

      // Track opponent address
      try {
        const gameData = await this.gameActions.getGameState(gameId);
        const opponent = gameData.player1.toLowerCase() === this.myAddress.toLowerCase()
          ? gameData.player2
          : gameData.player1;
        if (opponent && opponent !== ethers.ZeroAddress) {
          this.opponentAddresses.add(opponent);
        }
      } catch {}

      this.saveOpponentData();
      this.logStats();

      // Post result to Moltbook
      if (this.moltbook) {
        try {
          await this.moltbook.postGameResult(
            gameId,
            won,
            "opponent",
            won ? payoutEth : -payoutEth,
            `Game #${gameId} on Monad`,
            "Monte Carlo + Opponent Modeling",
            undefined,
            isFree
          );
        } catch (err: any) {
          logger.warn(`Moltbook post failed: ${err.message}`);
        }

        // Post stats every 5 matches
        if (this.matchesPlayed % 5 === 0) {
          try {
            const stats = await this.gameActions.getPlayerStats(this.myAddress);
            await this.moltbook.postStatsSummary(
              this.matchesPlayed,
              stats.wins,
              stats.losses,
              isFree ? 0 : this.bankroll.getBankroll(),
              isFree ? "Free Play adaptive strategy" : "Adaptive strategy with GTO bluffing",
              isFree
            );
          } catch (err: any) {
            logger.warn(`Moltbook stats post failed: ${err.message}`);
          }

          // Post leaderboard in free play mode
          if (isFree) {
            try {
              await this.postFreeLeaderboard();
            } catch (err: any) {
              logger.warn(`Moltbook leaderboard post failed: ${err.message}`);
            }
          }
        }
      }
      } catch (err: any) {
        logger.error(`Error handling game complete: ${err.message}`);
      }
    });
  }

  private async gameLoop(): Promise<void> {
    while (true) {
      const advice = this.bankroll.getOptimalWager(0.5);
      if (!advice.shouldPlay) {
        logger.warn("Bankroll manager advises stopping. Taking a break.");
        await this.sleep(30000);
        continue;
      }

      try {
        // Verify sufficient balance before transacting
        const balance = await this.contractManager.getBalance();
        const wagerWei = ethers.parseEther(advice.optimalWager.toString());
        const minRequired = wagerWei + ethers.parseEther("0.001"); // wager + gas
        if (balance < minRequired) {
          logger.warn(`Balance too low (${ethers.formatEther(balance)} MON, need ${ethers.formatEther(minRequired)}). Waiting...`);
          await this.sleep(30000);
          continue;
        }

        // Look for open games
        const openGames = await this.gameActions.getOpenGames();

        if (openGames.length > 0) {
          const gameId = openGames[0];
          const gameData = await this.gameActions.getGameState(gameId);
          const wager = gameData.wagerAmount;

          logger.info(`Joining game ${gameId}, wager: ${ethers.formatEther(wager)} MON`);
          await this.gameActions.joinGame(gameId, wager);
          this.currentGameId = gameId;
        } else {
          // Create a new game
          const wagerWei = ethers.parseEther(advice.optimalWager.toString());
          logger.info(`Creating new game, wager: ${advice.optimalWager} MON`);
          this.currentGameId = await this.gameActions.createGame(wagerWei);
          logger.info(`Game created: ${this.currentGameId}, waiting for opponent...`);
        }

        // Start listening for events (polling-based)
        await this.eventListener.startListening(this.currentGameId);

        // Deal our cards (off-chain)
        const deck = new Deck();
        this.myHoleCards = deck.deal(2);
        this.communityCards = [];
        this.currentPhase = GamePhase.PREFLOP;
        this.salt = this.gameActions.generateSalt();

        logger.info(`Hole cards: ${this.myHoleCards.map(c => `${c.rank}${c.suit}`).join(", ")}`);

        // Wait for game to complete (commitment happens at showdown with actual hand)
        await this.waitForGameEnd();

      } catch (err: any) {
        logger.error(`Error in game loop: ${err.message}`);
        await this.sleep(5000);
      }
    }
  }

  private async handleMyTurn(): Promise<void> {
    const gameState: GameState = {
      gameId: this.currentGameId,
      phase: this.currentPhase,
      myAddress: this.myAddress,
      opponentAddress: "",
      myHoleCards: this.myHoleCards,
      communityCards: this.communityCards,
      potSize: 0,
      myStack: 0,
      opponentStack: 0,
      currentBet: 0,
      myBetThisRound: 0,
      opponentBetThisRound: 0,
      isMyTurn: true,
      actionHistory: [],
      wagerAmount: 0,
    };

    const onChainData = await this.gameActions.getGameState(this.currentGameId);
    gameState.potSize = Number(ethers.formatEther(onChainData.pot));
    gameState.wagerAmount = Number(ethers.formatEther(onChainData.wagerAmount));
    gameState.opponentAddress =
      onChainData.player1.toLowerCase() === this.myAddress.toLowerCase()
        ? onChainData.player2
        : onChainData.player1;

    let decision: Decision;
    if (this.currentPhase === GamePhase.PREFLOP) {
      decision = this.strategy.decidePreflopSimple(gameState);
    } else {
      decision = this.strategy.decide(gameState);
    }

    logger.info(
      `Decision: ${decision.action} (amount: ${decision.amount}) - ${decision.reasoning}`
    );

    await this.gameActions.submitAction(
      this.currentGameId,
      decision.action,
      BigInt(Math.floor(decision.amount * 1e18))
    );
  }

  private async handleShowdown(): Promise<void> {
    logger.info("Showdown! Committing and revealing cards...");

    const allCards = [...this.myHoleCards, ...this.communityCards];
    if (allCards.length >= 5) {
      const result = this.evaluator.evaluate(allCards);
      logger.info(`Our hand: ${result.name} (rank ${result.category})`);

      // Commit the correct hand hash first
      const commitment = this.gameActions.generateCommitment(
        result.category,
        result.rank,
        this.salt
      );
      await this.gameActions.commitCards(this.currentGameId, commitment);

      // Then reveal (contract verifies commitment matches)
      await this.gameActions.revealCards(
        this.currentGameId,
        result.category,
        result.rank,
        this.salt
      );
    }
  }

  private async waitForGameEnd(): Promise<void> {
    while (this.currentPhase !== GamePhase.COMPLETE) {
      await this.sleep(5000);
      try {
        const gameData = await this.gameActions.getGameState(this.currentGameId);
        if (!gameData.isActive) {
          this.currentPhase = GamePhase.COMPLETE;
          break;
        }
      } catch (err: any) {
        logger.warn(`waitForGameEnd poll error: ${err.message}`);
        await this.sleep(5000);
      }
    }
    this.eventListener.stopListening();
  }

  // ============ Shared Utilities ============

  private logStats(): void {
    logger.info("=== Agent Stats ===");
    logger.info(`Matches played: ${this.matchesPlayed}`);
    logger.info(`Bankroll: ${this.bankroll.getBankroll()}`);
    logger.info(`Risk level: ${this.bankroll.getRiskLevel()}`);
    logger.info(`Consecutive losses: ${this.bankroll.getConsecutiveLosses()}`);
    logger.info("===================");
  }

  private loadOpponentData(): void {
    const filePath = path.resolve(__dirname, "../../data/opponent_stats.json");
    try {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        this.opponentModel.importProfiles(data);
        logger.info("Loaded opponent data from disk");
      }
    } catch {
      logger.warn("Could not load opponent data");
    }
  }

  private saveOpponentData(): void {
    const filePath = path.resolve(__dirname, "../../data/opponent_stats.json");
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      filePath,
      JSON.stringify(this.opponentModel.exportProfiles(), null, 2)
    );
  }

  shutdown(): void {
    logger.info("Shutting down gracefully...");
    this.eventListener.stopListening();
    this.saveOpponentData();
    logger.info("Opponent data saved. Goodbye.");
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Run if executed directly
if (require.main === module) {
  const agent = new PokerAgent();

  const handleExit = () => {
    agent.shutdown();
    process.exit(0);
  };
  process.on("SIGINT", handleExit);
  process.on("SIGTERM", handleExit);

  agent.start().catch((err) => {
    logger.error(`Fatal error: ${err.message}`);
    process.exit(1);
  });
}
