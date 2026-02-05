import { ethers } from "ethers";
import { ContractManager } from "../blockchain/ContractManager";
import { GameActions } from "../blockchain/GameActions";
import { PlayerAction } from "../types/game";
import { HandEvaluator } from "../engine/HandEvaluator";
import { Deck } from "../engine/Deck";
import { config } from "../config";
import logger from "../utils/logger";
import * as fs from "fs";
import * as path from "path";

/**
 * Bot strategy archetype for practice matches.
 * Each bot plays with a different style so the agent learns against varied opponents.
 */
export enum BotStyle {
  TIGHT_PASSIVE = "TIGHT_PASSIVE",   // Rock: folds most hands, rarely raises
  TIGHT_AGGRESSIVE = "TIGHT_AGGRESSIVE", // TAG: selective but aggressive
  LOOSE_PASSIVE = "LOOSE_PASSIVE",   // Calling station: calls everything
  LOOSE_AGGRESSIVE = "LOOSE_AGGRESSIVE", // LAG: plays many hands aggressively
  RANDOM = "RANDOM",                 // Unpredictable random play
}

interface BotWallet {
  address: string;
  privateKey: string;
  style: BotStyle;
  label: string;
}

interface ActionWeights {
  FOLD: number;
  CHECK: number;
  CALL: number;
  RAISE: number;
}

interface BotWeights {
  [phase: number]: ActionWeights; // phase 1-4
}

interface BotStats {
  address: string;
  label: string;
  style: BotStyle;
  wins: number;
  losses: number;
  handsPlayed: number;
  currentStreak: number;        // +연승, -연패
  weights: BotWeights;          // 진화하는 액션 확률
  lastActions: string[];        // 최근 게임에서 취한 액션 기록 ("phase:ACTION")
}

const BOT_POOL_FILE = "bot_pool.json";
const BOT_STATS_FILE = "bot_stats.json";

const LEARNING_RATE = 0.07;
const MIN_WEIGHT = 0.02;   // 액션이 완전히 사라지지 않도록
const MAX_WEIGHT = 5.0;

/**
 * Get base action weights for a given bot style.
 * Converts the hardcoded probabilities from botDecide() into initial weight tables.
 */
function getBaseWeights(style: BotStyle): BotWeights {
  switch (style) {
    case BotStyle.TIGHT_PASSIVE:
      return {
        1: { FOLD: 0.60, CHECK: 0.16, CALL: 0.20, RAISE: 0.04 },  // preflop: folds 60%
        2: { FOLD: 0.05, CHECK: 0.60, CALL: 0.30, RAISE: 0.05 },
        3: { FOLD: 0.05, CHECK: 0.60, CALL: 0.30, RAISE: 0.05 },
        4: { FOLD: 0.05, CHECK: 0.60, CALL: 0.30, RAISE: 0.05 },
      };
    case BotStyle.TIGHT_AGGRESSIVE:
      return {
        1: { FOLD: 0.50, CHECK: 0.10, CALL: 0.15, RAISE: 0.25 },  // preflop: folds 50%, raises when playing
        2: { FOLD: 0.05, CHECK: 0.25, CALL: 0.30, RAISE: 0.40 },
        3: { FOLD: 0.05, CHECK: 0.25, CALL: 0.30, RAISE: 0.40 },
        4: { FOLD: 0.05, CHECK: 0.25, CALL: 0.30, RAISE: 0.40 },
      };
    case BotStyle.LOOSE_PASSIVE:
      return {
        1: { FOLD: 0.05, CHECK: 0.10, CALL: 0.80, RAISE: 0.05 },  // rarely folds, mostly calls
        2: { FOLD: 0.05, CHECK: 0.10, CALL: 0.80, RAISE: 0.05 },
        3: { FOLD: 0.05, CHECK: 0.10, CALL: 0.80, RAISE: 0.05 },
        4: { FOLD: 0.05, CHECK: 0.10, CALL: 0.80, RAISE: 0.05 },
      };
    case BotStyle.LOOSE_AGGRESSIVE:
      return {
        1: { FOLD: 0.15, CHECK: 0.05, CALL: 0.25, RAISE: 0.55 },  // plays many hands, raises often
        2: { FOLD: 0.05, CHECK: 0.15, CALL: 0.25, RAISE: 0.55 },
        3: { FOLD: 0.05, CHECK: 0.15, CALL: 0.25, RAISE: 0.55 },
        4: { FOLD: 0.05, CHECK: 0.15, CALL: 0.25, RAISE: 0.55 },
      };
    case BotStyle.RANDOM:
    default:
      return {
        1: { FOLD: 0.15, CHECK: 0.25, CALL: 0.30, RAISE: 0.30 },
        2: { FOLD: 0.15, CHECK: 0.25, CALL: 0.30, RAISE: 0.30 },
        3: { FOLD: 0.15, CHECK: 0.25, CALL: 0.30, RAISE: 0.30 },
        4: { FOLD: 0.15, CHECK: 0.25, CALL: 0.30, RAISE: 0.30 },
      };
  }
}

export class BotPool {
  private bots: BotWallet[] = [];
  private botStats: BotStats[] = [];
  private dataDir: string;
  private rpcUrl: string;

  constructor() {
    this.dataDir = path.resolve(__dirname, "../../data");
    this.rpcUrl = config.rpcUrl;
    this.loadOrCreateBots();
    this.loadOrCreateBotStats();
  }

  /**
   * Load existing bot wallets from disk, or generate new ones.
   */
  private loadOrCreateBots(): void {
    const filePath = path.join(this.dataDir, BOT_POOL_FILE);

    try {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        if (Array.isArray(data) && data.length > 0) {
          this.bots = data;
          logger.info(`Loaded ${this.bots.length} bot wallets from ${BOT_POOL_FILE}`);
          return;
        }
      }
    } catch {
      logger.warn("Could not load bot pool, generating new bots");
    }

    // Generate bot wallets with different play styles
    const styles: Array<{ style: BotStyle; label: string }> = [
      { style: BotStyle.TIGHT_PASSIVE, label: "RockBot" },
      { style: BotStyle.TIGHT_AGGRESSIVE, label: "TAGBot" },
      { style: BotStyle.LOOSE_PASSIVE, label: "CallingBot" },
      { style: BotStyle.LOOSE_AGGRESSIVE, label: "LAGBot" },
      { style: BotStyle.RANDOM, label: "RandomBot" },
    ];

    this.bots = styles.map(({ style, label }) => {
      const wallet = ethers.Wallet.createRandom();
      return {
        address: wallet.address,
        privateKey: wallet.privateKey,
        style,
        label,
      };
    });

    this.saveBots();
    logger.info(`Generated ${this.bots.length} new bot wallets`);
  }

  private saveBots(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    const filePath = path.join(this.dataDir, BOT_POOL_FILE);
    fs.writeFileSync(filePath, JSON.stringify(this.bots, null, 2));
  }

  /**
   * Get all bot wallet addresses.
   */
  getBotAddresses(): string[] {
    return this.bots.map(b => b.address);
  }

  /**
   * Get bot count.
   */
  getBotCount(): number {
    return this.bots.length;
  }

  /**
   * Check if an address belongs to one of our bots.
   */
  isBot(address: string): boolean {
    return this.bots.some(b => b.address.toLowerCase() === address.toLowerCase());
  }

  /**
   * Get the bot style for a given address.
   */
  getBotStyle(address: string): BotStyle | null {
    const bot = this.bots.find(b => b.address.toLowerCase() === address.toLowerCase());
    return bot?.style ?? null;
  }

  /**
   * Pick a random bot to act as the opponent.
   */
  pickRandomBot(): BotWallet {
    const idx = Math.floor(Math.random() * this.bots.length);
    return this.bots[idx];
  }

  /**
   * Try to have a bot join an open free game and start playing.
   * Returns the bot address if successful, null otherwise.
   */
  async botJoinGame(gameId: number): Promise<string | null> {
    const bot = this.pickRandomBot();
    logger.info(`Bot "${bot.label}" (${bot.style}) attempting to join game ${gameId}`);

    try {
      const provider = new ethers.JsonRpcProvider(this.rpcUrl);
      const wallet = new ethers.Wallet(bot.privateKey, provider);
      const balance = await provider.getBalance(wallet.address);

      const minGas = ethers.parseEther("0.0005");
      if (balance < minGas) {
        logger.warn(`Bot "${bot.label}" has insufficient gas (${ethers.formatEther(balance)} MON). Need funding.`);
        return null;
      }

      // Create a separate ContractManager for the bot
      const botContractManager = new ContractManager(this.rpcUrl, bot.privateKey);
      await botContractManager.initialize(
        config.contracts.pokerGame,
        config.contracts.tokenVault
      );
      const botActions = new GameActions(botContractManager);

      await botActions.joinGame(gameId, BigInt(0));
      logger.info(`Bot "${bot.label}" joined game ${gameId}`);
      return bot.address;
    } catch (err: any) {
      logger.warn(`Bot "${bot.label}" failed to join game ${gameId}: ${err.message}`);
      return null;
    }
  }

  /**
   * Run a bot as an autonomous opponent in a game.
   * Polls for turns, decides actions based on style, handles showdown.
   * Runs in the background — fire and forget.
   */
  async botPlayGame(gameId: number, botAddress: string): Promise<void> {
    const bot = this.bots.find(b => b.address.toLowerCase() === botAddress.toLowerCase());
    if (!bot) {
      logger.warn(`Bot not found for address ${botAddress}`);
      return;
    }

    const botCM = new ContractManager(this.rpcUrl, bot.privateKey);
    await botCM.initialize(config.contracts.pokerGame, config.contracts.tokenVault);
    const botActions = new GameActions(botCM);
    const evaluator = new HandEvaluator();

    // Bot deals its own hand off-chain
    const deck = new Deck();
    const botHoleCards = deck.deal(2);
    const botSalt = botActions.generateSalt();

    logger.info(`Bot "${bot.label}" playing game ${gameId} (style: ${bot.style})`);

    const POLL_MS = 6000;
    const MAX_POLLS = 120; // 12 minutes max
    let lastPhase = -1;

    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise(r => setTimeout(r, POLL_MS));

      try {
        const game = await botActions.getGameState(gameId);
        if (!game.isActive) {
          logger.info(`Bot "${bot.label}": game ${gameId} ended`);
          return;
        }

        const phase = Number(game.phase);
        const currentTurn = (game.currentTurn || "").toLowerCase();
        const isBotTurn = currentTurn === bot.address.toLowerCase();

        // Handle showdown: commit + reveal
        if (phase === 5) { // SHOWDOWN
          await this.botHandleShowdown(bot, botActions, botHoleCards, deck, evaluator, gameId, botSalt, game);
          // Wait for game to end after showdown
          continue;
        }

        // Not our turn — keep polling
        if (!isBotTurn) continue;

        // Decide and submit action
        const action = this.botDecide(bot.style, phase, lastPhase !== phase);
        lastPhase = phase;

        // Raise requires a non-zero amount (free play: symbolic micro-raise)
        const raiseAmount = (action === PlayerAction.RAISE || action === PlayerAction.ALL_IN)
          ? BigInt(1) // minimal raise for free play
          : BigInt(0);

        logger.info(`Bot "${bot.label}" action: ${action} (phase ${phase})`);
        await botActions.submitAction(gameId, action, raiseAmount);

      } catch (err: any) {
        const msg = err?.message || "";
        // Skip transient errors, abort on serious ones
        if (msg.includes("Not your turn") || msg.includes("Invalid phase")) continue;
        if (msg.includes("Game not active")) return;
        // Stop if bot ran out of gas
        if (msg.includes("insufficient balance") || msg.includes("Signer had insufficient")) {
          logger.warn(`Bot "${bot.label}" ran out of gas, stopping`);
          return;
        }
        logger.warn(`Bot "${bot.label}" poll error: ${msg}`);
      }
    }

    logger.warn(`Bot "${bot.label}" timed out playing game ${gameId}`);
  }

  /**
   * Bot showdown: commit hand hash, then reveal.
   */
  private async botHandleShowdown(
    bot: BotWallet,
    botActions: GameActions,
    holeCards: any[],
    deck: Deck,
    evaluator: HandEvaluator,
    gameId: number,
    salt: string,
    game: any
  ): Promise<void> {
    const botAddr = bot.address.toLowerCase();
    const isP1 = (game.player1 || "").toLowerCase() === botAddr;
    const alreadyCommitted = isP1 ? game.player1CardCommit !== ethers.ZeroHash : game.player2CardCommit !== ethers.ZeroHash;
    const alreadyRevealed = isP1 ? game.player1Revealed : game.player2Revealed;

    if (alreadyRevealed) return;

    // Evaluate bot's hand (use 5 random community cards for simplicity)
    const communityCards = deck.deal(5);
    const allCards = [...holeCards, ...communityCards];
    const result = evaluator.evaluate(allCards);

    if (!alreadyCommitted) {
      try {
        const commitment = botActions.generateCommitment(result.category, result.rank, salt);
        await botActions.commitCards(gameId, commitment);
        logger.info(`Bot "${bot.label}" committed cards (rank ${result.category})`);
      } catch (err: any) {
        if (!err.message?.includes("Already committed")) {
          logger.warn(`Bot "${bot.label}" commit failed: ${err.message}`);
        }
        return;
      }
    }

    // Small delay then reveal
    await new Promise(r => setTimeout(r, 2000));

    try {
      await botActions.revealCards(gameId, result.category, result.rank, salt);
      logger.info(`Bot "${bot.label}" revealed cards: ${result.name}`);
    } catch (err: any) {
      if (!err.message?.includes("Already revealed")) {
        logger.warn(`Bot "${bot.label}" reveal failed: ${err.message}`);
      }
    }
  }

  /**
   * Decide bot action based on play style.
   * If botAddress is provided, uses evolved weights and records the action.
   */
  botDecide(style: BotStyle, phase: number, isNewPhase: boolean, botAddress?: string): PlayerAction {
    // If botAddress provided, use evolved weights
    if (botAddress) {
      const stats = this.getBotStats(botAddress);
      if (stats) {
        const phaseKey = Math.min(Math.max(phase, 1), 4);
        const weights = stats.weights[phaseKey];
        if (weights) {
          const action = this.sampleFromWeights(weights);
          const actionMap: Record<string, PlayerAction> = {
            FOLD: PlayerAction.FOLD,
            CHECK: PlayerAction.CHECK,
            CALL: PlayerAction.CALL,
            RAISE: PlayerAction.RAISE,
          };
          const playerAction = actionMap[action];
          // Record the action for this game
          stats.lastActions.push(`${phaseKey}:${action}`);
          return playerAction;
        }
      }
    }

    // Fallback: hardcoded logic
    const r = Math.random();

    switch (style) {
      case BotStyle.TIGHT_PASSIVE:
        // Folds 60% preflop, checks/calls post-flop
        if (phase === 1 && r < 0.6) return PlayerAction.FOLD;
        return r < 0.8 ? PlayerAction.CHECK : PlayerAction.CALL;

      case BotStyle.TIGHT_AGGRESSIVE:
        // Folds 50% preflop, raises when playing
        if (phase === 1 && r < 0.5) return PlayerAction.FOLD;
        if (r < 0.3) return PlayerAction.CHECK;
        if (r < 0.6) return PlayerAction.CALL;
        return PlayerAction.RAISE;

      case BotStyle.LOOSE_PASSIVE:
        // Rarely folds, mostly calls
        if (r < 0.05) return PlayerAction.FOLD;
        if (r < 0.15) return PlayerAction.CHECK;
        return PlayerAction.CALL;

      case BotStyle.LOOSE_AGGRESSIVE:
        // Plays many hands, raises often
        if (phase === 1 && r < 0.15) return PlayerAction.FOLD;
        if (r < 0.2) return PlayerAction.CHECK;
        if (r < 0.45) return PlayerAction.CALL;
        return PlayerAction.RAISE;

      case BotStyle.RANDOM:
      default:
        // Completely random
        if (r < 0.15) return PlayerAction.FOLD;
        if (r < 0.4) return PlayerAction.CHECK;
        if (r < 0.7) return PlayerAction.CALL;
        return PlayerAction.RAISE;
    }
  }

  /**
   * Fund a bot wallet with MON from the main agent's wallet.
   * Sends a small amount for gas fees.
   */
  async fundBot(
    fromPrivateKey: string,
    botAddress: string,
    amountMon: string = "0.01"
  ): Promise<boolean> {
    try {
      const provider = new ethers.JsonRpcProvider(this.rpcUrl);
      const wallet = new ethers.Wallet(fromPrivateKey, provider);

      const tx = await wallet.sendTransaction({
        to: botAddress,
        value: ethers.parseEther(amountMon),
      });
      await tx.wait();

      logger.info(`Funded bot ${botAddress} with ${amountMon} MON`);
      return true;
    } catch (err: any) {
      logger.warn(`Failed to fund bot ${botAddress}: ${err.message}`);
      return false;
    }
  }

  /**
   * Fund all bots with gas from the main wallet.
   */
  async fundAllBots(fromPrivateKey: string, amountPerBot: string = "0.005"): Promise<number> {
    let funded = 0;
    for (const bot of this.bots) {
      const provider = new ethers.JsonRpcProvider(this.rpcUrl);
      const balance = await provider.getBalance(bot.address);
      const minBalance = ethers.parseEther("0.001");

      if (balance < minBalance) {
        const success = await this.fundBot(fromPrivateKey, bot.address, amountPerBot);
        if (success) funded++;
      } else {
        logger.debug(`Bot "${bot.label}" already has sufficient balance`);
      }
    }
    return funded;
  }

  // ============ Bot Stats & Evolution ============

  /**
   * Load bot stats from disk, or initialize for all bots.
   */
  private loadOrCreateBotStats(): void {
    const filePath = path.join(this.dataDir, BOT_STATS_FILE);

    try {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        if (Array.isArray(data) && data.length > 0) {
          this.botStats = data;
          logger.info(`Loaded bot stats for ${this.botStats.length} bots from ${BOT_STATS_FILE}`);
          // Ensure any new bots also have stats
          for (const bot of this.bots) {
            if (!this.botStats.find(s => s.address.toLowerCase() === bot.address.toLowerCase())) {
              this.botStats.push(this.initBotStats(bot));
            }
          }
          return;
        }
      }
    } catch {
      logger.warn("Could not load bot stats, initializing fresh");
    }

    // Initialize stats for all bots
    this.botStats = this.bots.map(bot => this.initBotStats(bot));
    this.saveBotStats();
    logger.info(`Initialized bot stats for ${this.botStats.length} bots`);
  }

  /**
   * Create initial stats for a single bot.
   */
  private initBotStats(bot: BotWallet): BotStats {
    return {
      address: bot.address,
      label: bot.label,
      style: bot.style,
      wins: 0,
      losses: 0,
      handsPlayed: 0,
      currentStreak: 0,
      weights: getBaseWeights(bot.style),
      lastActions: [],
    };
  }

  /**
   * Save bot stats to disk.
   */
  private saveBotStats(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    const filePath = path.join(this.dataDir, BOT_STATS_FILE);
    fs.writeFileSync(filePath, JSON.stringify(this.botStats, null, 2));
  }

  /**
   * Record a game result for a bot and evolve its weights.
   *
   * Evolution algorithm:
   * - Win: reinforce actions taken this game (+LEARNING_RATE)
   * - Loss: weaken actions taken this game (-LEARNING_RATE),
   *         boost RAISE weight (+LEARNING_RATE*0.5) to make losers more aggressive
   */
  recordBotGameResult(address: string, won: boolean): void {
    const stats = this.getBotStats(address);
    if (!stats) return;

    stats.handsPlayed++;
    if (won) {
      stats.wins++;
      stats.currentStreak = stats.currentStreak > 0 ? stats.currentStreak + 1 : 1;
    } else {
      stats.losses++;
      stats.currentStreak = stats.currentStreak < 0 ? stats.currentStreak - 1 : -1;
    }

    // Evolve weights based on actions taken this game
    for (const actionStr of stats.lastActions) {
      const [phaseStr, action] = actionStr.split(":");
      const phase = Number(phaseStr);
      const weights = stats.weights[phase];
      if (!weights || !(action in weights)) continue;

      const key = action as keyof ActionWeights;

      if (won) {
        // Reinforce the actions that led to a win
        weights[key] = Math.min(weights[key] + LEARNING_RATE, MAX_WEIGHT);
      } else {
        // Weaken the actions that led to a loss
        weights[key] = Math.max(weights[key] - LEARNING_RATE, MIN_WEIGHT);
        // Make losing bots more aggressive (boost RAISE)
        weights.RAISE = Math.min(weights.RAISE + LEARNING_RATE * 0.5, MAX_WEIGHT);
      }
    }

    // Clear lastActions for next game
    stats.lastActions = [];

    logger.info(
      `Bot "${stats.label}" result: ${won ? "WIN" : "LOSS"} (${stats.wins}W/${stats.losses}L, streak: ${stats.currentStreak})`
    );

    this.saveBotStats();
  }

  /**
   * Get stats for a specific bot by address.
   */
  getBotStats(address: string): BotStats | undefined {
    return this.botStats.find(s => s.address.toLowerCase() === address.toLowerCase());
  }

  /**
   * Get stats for all bots.
   */
  getAllBotStats(): BotStats[] {
    return this.botStats;
  }

  /**
   * Sample an action from weights using weighted random selection.
   */
  private sampleFromWeights(weights: ActionWeights): string {
    const entries = Object.entries(weights) as [string, number][];
    const total = entries.reduce((sum, [, w]) => sum + w, 0);

    let r = Math.random() * total;
    for (const [action, weight] of entries) {
      r -= weight;
      if (r <= 0) return action;
    }

    // Fallback (should not reach here)
    return entries[entries.length - 1][0];
  }

  /**
   * Get a summary of all bots and their balances.
   */
  async getBotSummary(): Promise<Array<{
    label: string;
    address: string;
    style: BotStyle;
    balance: string;
  }>> {
    const provider = new ethers.JsonRpcProvider(this.rpcUrl);
    const summary = [];

    for (const bot of this.bots) {
      try {
        const balance = await provider.getBalance(bot.address);
        summary.push({
          label: bot.label,
          address: bot.address,
          style: bot.style,
          balance: ethers.formatEther(balance),
        });
      } catch {
        summary.push({
          label: bot.label,
          address: bot.address,
          style: bot.style,
          balance: "error",
        });
      }
    }

    return summary;
  }
}
