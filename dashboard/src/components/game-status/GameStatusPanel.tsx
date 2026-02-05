import { useGameStore } from "../../hooks/useGameStore";

const PHASE_COLORS: Record<string, string> = {
  WAITING: "#6B6494",
  PREFLOP: "#836EF9",
  FLOP: "#A78BFA",
  TURN: "#C084FC",
  RIVER: "#F472B6",
  SHOWDOWN: "#34D399",
  COMPLETE: "#34D399",
};

export function GameStatusPanel() {
  const { state } = useGameStore();
  const { currentGameId, currentPhase, pot, myStack, opponentStack, opponentLabel, handStrength } = state;

  return (
    <div className="glass-panel p-4">
      <h3 className="text-xs font-semibold mb-3 uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
        Game Status
      </h3>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Game</span>
          <p className="font-bold" style={{ color: "#A78BFA" }}>
            {currentGameId !== null ? `#${currentGameId}` : "--"}
          </p>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Phase</span>
          <p className="font-bold" style={{ color: PHASE_COLORS[currentPhase || ""] || "#6B6494" }}>
            {currentPhase || "--"}
          </p>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Pot</span>
          <p className="font-bold" style={{ color: "#FBBF24" }}>
            {pot > 0 ? pot.toLocaleString() : "--"}
          </p>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Opponent</span>
          <p className="font-bold truncate" style={{ color: "var(--text-secondary)" }}>
            {opponentLabel || "--"}
          </p>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>My Stack</span>
          <p className="font-bold" style={{ color: "#34D399" }}>
            {myStack > 0 ? myStack.toLocaleString() : "--"}
          </p>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Opp Stack</span>
          <p className="font-bold" style={{ color: "#F87171" }}>
            {opponentStack > 0 ? opponentStack.toLocaleString() : "--"}
          </p>
        </div>
      </div>
      {handStrength && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--panel-border)" }}>
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Hand</span>
          <p className="font-bold text-lg" style={{ color: "#A78BFA" }}>{handStrength}</p>
        </div>
      )}
    </div>
  );
}
