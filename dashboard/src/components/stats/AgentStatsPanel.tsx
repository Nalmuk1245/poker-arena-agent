import { useGameStore } from "../../hooks/useGameStore";

const RISK_COLORS: Record<string, string> = {
  LOW: "#34D399",
  MEDIUM: "#FBBF24",
  HIGH: "#F87171",
};

export function AgentStatsPanel() {
  const { state } = useGameStore();
  const stats = state.agentStats;

  if (!stats) {
    return (
      <div className="glass-panel p-4">
        <h3 className="text-xs font-semibold mb-3 uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
          Agent Stats
        </h3>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Waiting for data...</p>
      </div>
    );
  }

  return (
    <div className="glass-panel p-4">
      <h3 className="text-xs font-semibold mb-3 uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
        Agent Stats
      </h3>
      <div className="space-y-3">
        {/* Win Rate */}
        <div>
          <div className="flex justify-between text-sm">
            <span style={{ color: "var(--text-secondary)" }}>Win Rate</span>
            <span className="font-bold" style={{ color: "#A78BFA" }}>
              {stats.winRate.toFixed(1)}%
            </span>
          </div>
          <div
            className="mt-1.5 h-1.5 rounded-full overflow-hidden"
            style={{ background: "rgba(131, 110, 249, 0.1)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(stats.winRate, 100)}%`,
                background: "linear-gradient(90deg, #836EF9, #E84393)",
                boxShadow: "0 0 8px rgba(131, 110, 249, 0.4)",
              }}
            />
          </div>
        </div>

        {/* W/L */}
        <div className="flex justify-between text-sm">
          <span style={{ color: "var(--text-secondary)" }}>Record</span>
          <span>
            <span className="font-bold" style={{ color: "#34D399" }}>{stats.wins}W</span>
            {" / "}
            <span className="font-bold" style={{ color: "#F87171" }}>{stats.losses}L</span>
          </span>
        </div>

        {/* Bankroll */}
        <div className="flex justify-between text-sm">
          <span style={{ color: "var(--text-secondary)" }}>Bankroll</span>
          <span className="font-bold" style={{ color: "var(--text-primary)" }}>{stats.bankroll.toFixed(0)}</span>
        </div>

        {/* Risk Level */}
        <div className="flex justify-between text-sm">
          <span style={{ color: "var(--text-secondary)" }}>Risk</span>
          <span className="font-bold" style={{ color: RISK_COLORS[stats.riskLevel] || "var(--text-muted)" }}>
            {stats.riskLevel}
          </span>
        </div>

        {/* Games Played */}
        <div className="flex justify-between text-sm">
          <span style={{ color: "var(--text-secondary)" }}>Games</span>
          <span className="font-bold" style={{ color: "var(--text-primary)" }}>{stats.matchesPlayed}</span>
        </div>

        {/* Mode */}
        <div className="flex justify-between text-sm">
          <span style={{ color: "var(--text-secondary)" }}>Mode</span>
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-medium"
            style={{
              background: "rgba(131, 110, 249, 0.15)",
              border: "1px solid rgba(131, 110, 249, 0.25)",
              color: "#A78BFA",
            }}
          >
            {stats.isFreePlay ? "Free Play" : "Token"}
          </span>
        </div>
      </div>
    </div>
  );
}
