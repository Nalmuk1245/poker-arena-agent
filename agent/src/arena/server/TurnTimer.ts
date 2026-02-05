import { PlayerAction } from "../../types/game";

export interface TimerCallback {
  (playerId: string, defaultAction: PlayerAction): void;
}

/**
 * Manages per-player action timeouts.
 * When a player fails to act within the timeout, auto-folds or auto-checks.
 */
export class TurnTimer {
  private timeoutMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private currentPlayerId: string | null = null;
  private callback: TimerCallback | null = null;

  constructor(timeoutMs: number = 30000) {
    this.timeoutMs = timeoutMs;
  }

  /**
   * Start a timer for a player's turn.
   * @param playerId - The player who must act
   * @param canCheck - Whether CHECK is valid (determines default action)
   * @param onTimeout - Callback when timer expires
   */
  start(playerId: string, canCheck: boolean, onTimeout: TimerCallback): void {
    this.cancel();

    this.currentPlayerId = playerId;
    this.callback = onTimeout;

    this.timer = setTimeout(() => {
      const defaultAction = canCheck ? PlayerAction.CHECK : PlayerAction.FOLD;
      if (this.callback && this.currentPlayerId) {
        this.callback(this.currentPlayerId, defaultAction);
      }
      this.reset();
    }, this.timeoutMs);
  }

  /**
   * Cancel the current timer (player acted in time).
   */
  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.reset();
  }

  /**
   * Check if there's an active timer.
   */
  isActive(): boolean {
    return this.timer !== null;
  }

  /**
   * Get the player ID of the current timer.
   */
  getCurrentPlayerId(): string | null {
    return this.currentPlayerId;
  }

  /**
   * Destroy the timer completely.
   */
  destroy(): void {
    this.cancel();
  }

  private reset(): void {
    this.timer = null;
    this.currentPlayerId = null;
    this.callback = null;
  }
}
