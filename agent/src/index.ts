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
import { GameState, GamePhase, PlayerAction, Decision } from "./types/game";
import { Card } from "./types/cards";
import { MoltbookClient } from "./social/MoltbookClient";
import logger from "./utils/logger";
import * as fs from "fs";
import * as path from "path";

export class PokerAgent {
  private contractManager: ContractManager;
  private eventListener: EventListener;
  private gameActions: GameActions;
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

  constructor() {
    this.contractManager = new ContractManager(config.rpcUrl, config.privateKey);
    this.eventListener = new EventListener(this.contractManager);
    this.gameActions = new GameActions(this.contractManager);
    this.opponentModel = new OpponentModel();
    this.evaluator = new HandEvaluator();

    // Load persisted opponent data if available
    this.loadOpponentData();

    const initialBankroll = 1000; // Will be updated from on-chain balance
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
  }

  async start(): Promise<void> {
    logger.info("Poker Arena Agent starting...");

    // Initialize contracts
    await this.contractManager.initialize(
      config.contracts.pokerGame,
      config.contracts.tokenVault
    );
    await this.eventListener.init();
    this.myAddress = await this.contractManager.getAddress();

    const balance = await this.contractManager.getBalance();
    logger.info(`Agent address: ${this.myAddress}`);
    logger.info(`Balance: ${ethers.formatEther(balance)} MON`);

    // Initialize Moltbook social integration
    try {
      this.moltbook = new MoltbookClient();
      const status = await this.moltbook.checkClaimStatus();
      logger.info(`Moltbook status: ${status.status || "connected"}`);
    } catch (err: any) {
      logger.warn(`Moltbook not configured: ${err.message}. Social features disabled.`);
      this.moltbook = null;
    }

    // Setup event handlers
    this.setupEventHandlers();

    // Main loop: look for games or create one
    await this.gameLoop();
  }

  private setupEventHandlers(): void {
    this.eventListener.onOpponentAction(async (partialState) => {
      logger.info(`Opponent acted in game ${partialState.gameId}, our turn`);
      await this.handleMyTurn();
    });

    this.eventListener.onPhaseAdvanced(async (gameId, phase) => {
      logger.info(`Game ${gameId} advanced to ${phase}`);
      this.currentPhase = phase;

      if (phase === GamePhase.SHOWDOWN) {
        await this.handleShowdown();
      }
    });

    this.eventListener.onGameComplete(async (gameId, winner, payout) => {
      const won = winner.toLowerCase() === this.myAddress.toLowerCase();
      const payoutEth = Number(ethers.formatEther(payout));

      if (winner === ethers.ZeroAddress) {
        logger.info(`Game ${gameId}: DRAW`);
      } else {
        logger.info(`Game ${gameId}: ${won ? "WIN" : "LOSS"} (payout: ${payoutEth})`);
      }

      this.bankroll.recordResult(won, payoutEth);
      this.matchesPlayed++;

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
            "Monte Carlo + Opponent Modeling"
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
              this.bankroll.getBankroll(),
              "Adaptive strategy with GTO bluffing"
            );
          } catch (err: any) {
            logger.warn(`Moltbook stats post failed: ${err.message}`);
          }
        }
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

        // Start listening for events
        await this.eventListener.startListening(this.currentGameId);

        // Deal our cards (off-chain)
        const deck = new Deck();
        this.myHoleCards = deck.deal(2);
        this.communityCards = [];
        this.currentPhase = GamePhase.PREFLOP;

        // Commit our cards
        this.salt = this.gameActions.generateSalt();
        const handResult = this.evaluator.evaluate([
          ...this.myHoleCards,
          // Will need full community for final eval
        ].length >= 5 ? [...this.myHoleCards, ...this.communityCards] : [...this.myHoleCards, ...deck.deal(5 - this.myHoleCards.length - this.communityCards.length)]);

        // For now, commit a placeholder (will re-commit at showdown)
        const commitment = this.gameActions.generateCommitment(
          handResult.category,
          handResult.rank,
          this.salt
        );
        await this.gameActions.commitCards(this.currentGameId, commitment);

        logger.info(`Cards committed. Hole cards: ${this.myHoleCards.map(c => `${c.rank}${c.suit}`).join(", ")}`);

        // Wait for game to complete
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
      opponentAddress: "", // TODO: fetch from contract
      myHoleCards: this.myHoleCards,
      communityCards: this.communityCards,
      potSize: 0,     // TODO: fetch from contract
      myStack: 0,     // TODO: fetch from contract
      opponentStack: 0,
      currentBet: 0,
      myBetThisRound: 0,
      opponentBetThisRound: 0,
      isMyTurn: true,
      actionHistory: [],
      wagerAmount: 0,
    };

    // Get game data from contract
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

    // Record our action observation for opponent model context
    await this.gameActions.submitAction(
      this.currentGameId,
      decision.action,
      BigInt(Math.floor(decision.amount * 1e18))
    );
  }

  private async handleShowdown(): Promise<void> {
    logger.info("Showdown! Revealing cards...");

    // Evaluate our final hand
    const allCards = [...this.myHoleCards, ...this.communityCards];
    if (allCards.length >= 5) {
      const result = this.evaluator.evaluate(allCards);
      logger.info(`Our hand: ${result.name} (rank ${result.category})`);

      await this.gameActions.revealCards(
        this.currentGameId,
        result.category,
        result.rank,
        this.salt
      );
    }
  }

  private async waitForGameEnd(): Promise<void> {
    // Simple polling until game is complete
    while (this.currentPhase !== GamePhase.COMPLETE) {
      await this.sleep(2000);
      const gameData = await this.gameActions.getGameState(this.currentGameId);
      if (!gameData.isActive) {
        this.currentPhase = GamePhase.COMPLETE;
        break;
      }
    }
    this.eventListener.stopListening();
  }

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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Run if executed directly
if (require.main === module) {
  const agent = new PokerAgent();
  agent.start().catch((err) => {
    logger.error(`Fatal error: ${err.message}`);
    process.exit(1);
  });
}
