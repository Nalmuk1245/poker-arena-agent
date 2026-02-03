import { ethers } from "ethers";
import { ContractManager } from "./ContractManager";
import { GameState, GamePhase, PlayerAction, ActionRecord } from "../types/game";
import logger from "../utils/logger";

export type ActionHandler = (gameState: Partial<GameState>) => Promise<void>;
export type GameCompleteHandler = (gameId: number, winner: string, payout: bigint) => Promise<void>;

const PHASE_MAP: Record<number, GamePhase> = {
  0: GamePhase.WAITING,
  1: GamePhase.PREFLOP,
  2: GamePhase.FLOP,
  3: GamePhase.TURN,
  4: GamePhase.RIVER,
  5: GamePhase.SHOWDOWN,
  6: GamePhase.COMPLETE,
};

/**
 * Polling-based event listener for Monad testnet compatibility.
 * Monad does not support eth_newFilter, so we poll contract state instead.
 */
export class EventListener {
  private contractManager: ContractManager;
  private myAddress: string = "";
  private pollIntervalMs: number;
  private handlers: {
    onOpponentAction?: ActionHandler;
    onPhaseAdvanced?: (gameId: number, phase: GamePhase) => Promise<void>;
    onGameComplete?: GameCompleteHandler;
  } = {};

  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private lastPhase: number = -1;
  private lastTurn: string = "";
  private lastIsActive: boolean = true;

  constructor(contractManager: ContractManager, pollIntervalMs: number = 5000) {
    this.contractManager = contractManager;
    this.pollIntervalMs = pollIntervalMs;
  }

  async init(): Promise<void> {
    this.myAddress = await this.contractManager.getAddress();
  }

  onOpponentAction(handler: ActionHandler): void {
    this.handlers.onOpponentAction = handler;
  }

  onPhaseAdvanced(handler: (gameId: number, phase: GamePhase) => Promise<void>): void {
    this.handlers.onPhaseAdvanced = handler;
  }

  onGameComplete(handler: GameCompleteHandler): void {
    this.handlers.onGameComplete = handler;
  }

  async startListening(gameId: number): Promise<void> {
    this.lastPhase = -1;
    this.lastTurn = "";
    this.lastIsActive = true;

    // Initial fetch to set baseline
    try {
      const gameData = await this.contractManager.getPokerGame().getGame(gameId);
      this.lastPhase = Number(gameData.phase);
      this.lastTurn = (gameData.currentTurn || "").toLowerCase();
      this.lastIsActive = gameData.isActive;
    } catch (err: any) {
      logger.warn(`Initial game state fetch failed: ${err.message}`);
    }

    // Poll at configured interval
    this.pollingInterval = setInterval(async () => {
      try {
        await this.pollGameState(gameId);
      } catch (err: any) {
        logger.warn(`Polling error: ${err.message}`);
      }
    }, this.pollIntervalMs);

    logger.info(`Polling started for game ${gameId} (interval: ${this.pollIntervalMs}ms)`);
  }

  private async pollGameState(gameId: number): Promise<void> {
    const pokerGame = this.contractManager.getPokerGame();
    const gameData = await pokerGame.getGame(gameId);

    const currentPhase = Number(gameData.phase);
    const currentTurn = (gameData.currentTurn || "").toLowerCase();
    const isActive = gameData.isActive;

    // Game completed
    if (this.lastIsActive && !isActive) {
      this.lastIsActive = false;
      if (this.handlers.onGameComplete) {
        const pot = gameData.pot || BigInt(0);
        if (gameData.player1Folded) {
          await this.handlers.onGameComplete(gameId, gameData.player2, pot);
        } else if (gameData.player2Folded) {
          await this.handlers.onGameComplete(gameId, gameData.player1, pot);
        } else if (currentPhase === 6) {
          const p1Rank = Number(gameData.player1HandRank || 0);
          const p2Rank = Number(gameData.player2HandRank || 0);
          const p1Score = Number(gameData.player1HandScore || 0);
          const p2Score = Number(gameData.player2HandScore || 0);
          if (p1Rank > p2Rank || (p1Rank === p2Rank && p1Score > p2Score)) {
            await this.handlers.onGameComplete(gameId, gameData.player1, pot);
          } else if (p2Rank > p1Rank || (p1Rank === p2Rank && p2Score > p1Score)) {
            await this.handlers.onGameComplete(gameId, gameData.player2, pot);
          } else {
            await this.handlers.onGameComplete(gameId, ethers.ZeroAddress, BigInt(0));
          }
        } else {
          await this.handlers.onGameComplete(gameId, ethers.ZeroAddress, pot);
        }
      }
      return;
    }

    // Phase changed
    if (currentPhase !== this.lastPhase && this.lastPhase !== -1) {
      this.lastPhase = currentPhase;
      const phase = PHASE_MAP[currentPhase] || GamePhase.COMPLETE;
      if (this.handlers.onPhaseAdvanced) {
        await this.handlers.onPhaseAdvanced(gameId, phase);
      }
    } else if (this.lastPhase === -1) {
      this.lastPhase = currentPhase;
    }

    // Turn changed to us (opponent acted)
    if (currentTurn && currentTurn !== this.lastTurn) {
      const isMyTurnNow = currentTurn === this.myAddress.toLowerCase();
      if (isMyTurnNow && this.lastTurn !== "") {
        if (this.handlers.onOpponentAction) {
          await this.handlers.onOpponentAction({ gameId, isMyTurn: true });
        }
      }
      this.lastTurn = currentTurn;
    } else if (!this.lastTurn && currentTurn) {
      this.lastTurn = currentTurn;
    }
  }

  stopListening(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
}
