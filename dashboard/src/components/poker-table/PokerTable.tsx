import { useGameStore } from "../../hooks/useGameStore";
import { HoleCards } from "./HoleCards";
import { CommunityCards } from "./CommunityCards";
import { PotDisplay } from "./PotDisplay";
import { PlayerSeat } from "./PlayerSeat";
import { PhaseIndicator } from "./PhaseIndicator";

export function PokerTable() {
  const { state } = useGameStore();
  const { holeCards, communityCards, pot, myStack, opponentStack, opponentLabel, currentPhase } = state;

  return (
    <div className="glass-panel p-5 glow-purple">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          Table
        </h3>
        <PhaseIndicator currentPhase={currentPhase} />
      </div>

      {/* Table felt */}
      <div
        className="relative rounded-[50%/40%] mx-auto flex flex-col items-center justify-center gap-4"
        style={{
          background: "radial-gradient(ellipse at center, #2E1F6E 0%, #1A1145 40%, #0D0A2A 100%)",
          border: "2px solid rgba(131, 110, 249, 0.2)",
          boxShadow:
            "inset 0 0 80px rgba(0,0,0,0.4), 0 0 40px rgba(131, 110, 249, 0.08)",
          minHeight: 460,
          padding: "60px 32px",
        }}
      >
        {/* Inner ring */}
        <div
          className="absolute inset-6 rounded-[50%/40%] pointer-events-none"
          style={{ border: "1px solid rgba(131, 110, 249, 0.08)" }}
        />

        {/* Opponent seat */}
        <div className="absolute top-4">
          <PlayerSeat name={opponentLabel || "Opponent"} stack={opponentStack} />
        </div>

        {/* Community cards */}
        <div className="mt-8">
          <CommunityCards cards={communityCards} />
        </div>

        {/* Pot */}
        <PotDisplay pot={pot} />

        {/* Hole cards */}
        <div className="mt-2">
          <HoleCards cards={holeCards} />
        </div>

        {/* Agent seat */}
        <div className="absolute bottom-4">
          <PlayerSeat name="Agent" stack={myStack} isAgent />
        </div>
      </div>
    </div>
  );
}
