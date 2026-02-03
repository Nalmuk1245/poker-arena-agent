import { ethers } from "ethers";
import { ContractManager } from "./ContractManager";
import { GameState, GamePhase, PlayerAction, ActionRecord } from "../types/game";

export type ActionHandler = (gameState: Partial<GameState>) => Promise<void>;
export type GameCompleteHandler = (gameId: number, winner: string, payout: bigint) => Promise<void>;

export class EventListener {
  private contractManager: ContractManager;
  private myAddress: string = "";
  private handlers: {
    onOpponentAction?: ActionHandler;
    onPhaseAdvanced?: (gameId: number, phase: GamePhase) => Promise<void>;
    onGameComplete?: GameCompleteHandler;
  } = {};

  constructor(contractManager: ContractManager) {
    this.contractManager = contractManager;
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
    const pokerGame = this.contractManager.getPokerGame();

    // Listen for opponent actions
    const actionFilter = pokerGame.filters.ActionSubmitted(gameId);
    pokerGame.on(actionFilter, async (...args: any[]) => {
      const event = args[args.length - 1];
      const [, player, action, amount] = event.args || args;

      if (player.toLowerCase() !== this.myAddress.toLowerCase()) {
        if (this.handlers.onOpponentAction) {
          await this.handlers.onOpponentAction({
            gameId,
            isMyTurn: true,
          });
        }
      }
    });

    // Listen for phase changes
    const phaseFilter = pokerGame.filters.PhaseAdvanced(gameId);
    pokerGame.on(phaseFilter, async (...args: any[]) => {
      const event = args[args.length - 1];
      const [, newPhase] = event.args || args;

      const phaseMap: Record<number, GamePhase> = {
        0: GamePhase.WAITING,
        1: GamePhase.PREFLOP,
        2: GamePhase.FLOP,
        3: GamePhase.TURN,
        4: GamePhase.RIVER,
        5: GamePhase.SHOWDOWN,
        6: GamePhase.COMPLETE,
      };

      if (this.handlers.onPhaseAdvanced) {
        await this.handlers.onPhaseAdvanced(
          gameId,
          phaseMap[Number(newPhase)] || GamePhase.COMPLETE
        );
      }
    });

    // Listen for game completion
    const completeFilter = pokerGame.filters.GameComplete(gameId);
    pokerGame.on(completeFilter, async (...args: any[]) => {
      const event = args[args.length - 1];
      const [, winner, payout] = event.args || args;

      if (this.handlers.onGameComplete) {
        await this.handlers.onGameComplete(gameId, winner, payout);
      }
    });

    // Also listen for draws
    const drawFilter = pokerGame.filters.GameDraw(gameId);
    pokerGame.on(drawFilter, async (...args: any[]) => {
      if (this.handlers.onGameComplete) {
        await this.handlers.onGameComplete(
          gameId,
          ethers.ZeroAddress,
          BigInt(0)
        );
      }
    });
  }

  stopListening(): void {
    const pokerGame = this.contractManager.getPokerGame();
    pokerGame.removeAllListeners();
  }
}
