import { ethers } from "ethers";
import { ContractManager } from "./ContractManager";
import { PlayerAction } from "../types/game";
import logger from "../utils/logger";

// Map our PlayerAction to contract enum values
const ACTION_MAP: Record<PlayerAction, number> = {
  [PlayerAction.FOLD]: 1,
  [PlayerAction.CHECK]: 2,
  [PlayerAction.CALL]: 3,
  [PlayerAction.RAISE]: 4,
  [PlayerAction.ALL_IN]: 5,
};

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 3000;

export class GameActions {
  private contractManager: ContractManager;

  constructor(contractManager: ContractManager) {
    this.contractManager = contractManager;
  }

  /**
   * Retry wrapper for RPC rate limit errors (-32007).
   */
  private async withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        const msg = err?.message || "";
        const isRateLimit = msg.includes("-32007") || msg.includes("request limit");
        if (isRateLimit && attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * attempt;
          logger.warn(`RPC 속도 제한 (${label}), ${delay / 1000}초 후 재시도... (${attempt}/${MAX_RETRIES})`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
    throw new Error(`${label}: 최대 재시도 횟수 초과`);
  }

  /**
   * Create a new game with the specified wager.
   */
  async createGame(wagerWei: bigint): Promise<number> {
    return this.withRetry("createGame", async () => {
    const pokerGame = this.contractManager.getPokerGame();
    const tx = await pokerGame.createGame({ value: wagerWei });
    const receipt = await tx.wait();

    // Parse GameCreated event to get gameId
    const event = receipt.logs.find(
      (log: any) => {
        try {
          const parsed = pokerGame.interface.parseLog({ topics: log.topics as string[], data: log.data });
          return parsed?.name === "GameCreated";
        } catch { return false; }
      }
    );

    if (event) {
      const parsed = pokerGame.interface.parseLog({ topics: event.topics as string[], data: event.data });
      return Number(parsed!.args[0]);
    }

    throw new Error("GameCreated event not found in receipt");
    });
  }

  /**
   * Create a free game (no token wager, recorded on-chain).
   */
  async createFreeGame(): Promise<number> {
    return this.withRetry("createFreeGame", async () => {
    const pokerGame = this.contractManager.getPokerGame();
    const tx = await pokerGame.createFreeGame();
    const receipt = await tx.wait();

    const event = receipt.logs.find(
      (log: any) => {
        try {
          const parsed = pokerGame.interface.parseLog({ topics: log.topics as string[], data: log.data });
          return parsed?.name === "GameCreated";
        } catch { return false; }
      }
    );

    if (event) {
      const parsed = pokerGame.interface.parseLog({ topics: event.topics as string[], data: event.data });
      return Number(parsed!.args[0]);
    }

    throw new Error("GameCreated event not found in receipt");
    });
  }

  /**
   * Join an existing game.
   */
  async joinGame(gameId: number, wagerWei: bigint): Promise<void> {
    await this.withRetry("joinGame", async () => {
      const pokerGame = this.contractManager.getPokerGame();
      const tx = await pokerGame.joinGame(gameId, { value: wagerWei });
      await tx.wait();
    });
  }

  /**
   * Commit seed hash for the combined-seed card dealing.
   * Each player commits hash(seed) before the game starts.
   */
  async commitSeed(gameId: number, seedHash: string): Promise<void> {
    await this.withRetry("commitSeed", async () => {
      const pokerGame = this.contractManager.getPokerGame();
      const tx = await pokerGame.commitSeed(gameId, seedHash);
      await tx.wait();
    });
  }

  /**
   * Reveal the seed after both players have committed.
   * The contract verifies it matches the committed hash.
   */
  async revealSeed(gameId: number, seed: string): Promise<void> {
    await this.withRetry("revealSeed", async () => {
      const pokerGame = this.contractManager.getPokerGame();
      const tx = await pokerGame.revealSeed(gameId, seed);
      await tx.wait();
    });
  }

  /**
   * Get the combined seed after both players revealed.
   */
  async getCombinedSeed(gameId: number): Promise<string> {
    return this.withRetry("getCombinedSeed", async () => {
      const pokerGame = this.contractManager.getPokerGame();
      return pokerGame.getCombinedSeed(gameId);
    });
  }

  /**
   * Commit card hash for the showdown commit-reveal scheme.
   */
  async commitCards(gameId: number, cardHash: string): Promise<void> {
    await this.withRetry("commitCards", async () => {
      const pokerGame = this.contractManager.getPokerGame();
      const tx = await pokerGame.commitCards(gameId, cardHash);
      await tx.wait();
    });
  }

  /**
   * Submit a game action (fold, check, call, raise, all-in).
   * In free play mode (raiseAmount = 0), automatically converts RAISE to CHECK
   * to avoid "Raise amount must be > 0" contract error.
   */
  async submitAction(
    gameId: number,
    action: PlayerAction,
    raiseAmount: bigint = BigInt(0)
  ): Promise<void> {
    // Safeguard: Convert RAISE/ALL_IN with 0 amount to CHECK
    // This handles free play mode where no actual betting occurs
    let finalAction = action;
    if ((action === PlayerAction.RAISE || action === PlayerAction.ALL_IN) && raiseAmount === BigInt(0)) {
      logger.info(`Converting ${PlayerAction[action]} to CHECK (amount is 0)`);
      finalAction = PlayerAction.CHECK;
    }

    await this.withRetry("submitAction", async () => {
      const pokerGame = this.contractManager.getPokerGame();
      const actionValue = ACTION_MAP[finalAction];
      const tx = await pokerGame.submitAction(gameId, actionValue, raiseAmount);
      await tx.wait();
    });
  }

  /**
   * Reveal cards during showdown.
   */
  async revealCards(
    gameId: number,
    handRank: number,
    handScore: number,
    salt: string
  ): Promise<void> {
    await this.withRetry("revealCards", async () => {
      const pokerGame = this.contractManager.getPokerGame();
      const tx = await pokerGame.revealCards(gameId, handRank, handScore, salt);
      await tx.wait();
    });
  }

  /**
   * Claim timeout if opponent hasn't acted.
   */
  async claimTimeout(gameId: number): Promise<void> {
    await this.withRetry("claimTimeout", async () => {
      const pokerGame = this.contractManager.getPokerGame();
      const tx = await pokerGame.claimTimeout(gameId);
      await tx.wait();
    });
  }

  /**
   * Get list of open games available to join.
   */
  async getOpenGames(): Promise<number[]> {
    return this.withRetry("getOpenGames", async () => {
      const pokerGame = this.contractManager.getPokerGame();
      const games = await pokerGame.getOpenGames();
      return games.map((g: bigint) => Number(g));
    });
  }

  /**
   * Get game state from contract.
   */
  async getGameState(gameId: number): Promise<any> {
    return this.withRetry("getGameState", async () => {
      const pokerGame = this.contractManager.getPokerGame();
      return pokerGame.getGame(gameId);
    });
  }

  /**
   * Get player stats (wins, losses, total wagered).
   */
  async getPlayerStats(address: string): Promise<{
    wins: number;
    losses: number;
    totalWagered: bigint;
  }> {
    return this.withRetry("getPlayerStats", async () => {
      const pokerGame = this.contractManager.getPokerGame();
      const [wins, losses, wagered] = await pokerGame.getPlayerStats(address);
      return {
        wins: Number(wins),
        losses: Number(losses),
        totalWagered: wagered,
      };
    });
  }

  /**
   * Generate the commitment hash for commit-reveal.
   */
  generateCommitment(
    handRank: number,
    handScore: number,
    salt: string
  ): string {
    return ethers.solidityPackedKeccak256(
      ["uint8", "uint256", "bytes32"],
      [handRank, handScore, salt]
    );
  }

  /**
   * Generate a random salt for commitment.
   */
  generateSalt(): string {
    return ethers.hexlify(ethers.randomBytes(32));
  }
}
