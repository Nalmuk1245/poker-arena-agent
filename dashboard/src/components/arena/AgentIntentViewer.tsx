import { useGameStore } from "../../hooks/useGameStore";

function equityColor(equity: number): string {
  if (equity >= 0.5) return "#34D399";
  if (equity >= 0.3) return "#FBBF24";
  return "#F87171";
}

function evLabel(value: number): string {
  if (value > 0) return `+${value.toFixed(0)}`;
  return value.toFixed(0);
}

const ARCHETYPE_COLORS: Record<string, string> = {
  LAG: "#E84393",
  TAG: "#836EF9",
  ROCK: "#6B7280",
  STATION: "#FBBF24",
  UNKNOWN: "var(--text-muted)",
};

export function AgentIntentViewer() {
  const { state } = useGameStore();
  const intent = state.agentIntent;

  if (!intent) return null;

  const eqPct = Math.round(intent.equity * 100);
  const eqClr = equityColor(intent.equity);
  const isPreflop = intent.phase === "PREFLOP";
  const isBluff = intent.bluffDecision?.shouldBluff;

  // Determine best EV action highlight
  const evEntries = [
    { label: "Fold", value: intent.evFold, key: "FOLD" },
    { label: "Call", value: intent.evCall, key: "CALL" },
    { label: "Raise", value: intent.evRaise, key: "RAISE" },
  ];

  return (
    <div
      className="glass-panel"
      style={{
        borderColor: "rgba(131, 110, 249, 0.15)",
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--panel-border)" }}
      >
        <h3
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-muted)" }}
        >
          Agent Intent
        </h3>
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
            style={{
              background: "rgba(131, 110, 249, 0.15)",
              color: "#836EF9",
            }}
          >
            {intent.phase}
          </span>
          <span
            className="text-[10px] font-mono"
            style={{ color: "var(--text-muted)" }}
          >
            {intent.position}
          </span>
          {isBluff && (
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
              style={{
                background: "rgba(251, 191, 36, 0.15)",
                color: "#FBBF24",
              }}
            >
              Bluff
            </span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Equity bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span
              className="text-[10px] uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Equity
            </span>
            <span
              className="text-sm font-bold font-mono"
              style={{ color: eqClr }}
            >
              {isPreflop && intent.equity === 0 ? "Heuristic" : `${eqPct}%`}
            </span>
          </div>
          {!(isPreflop && intent.equity === 0) && (
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ background: "rgba(131, 110, 249, 0.1)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${eqPct}%`,
                  background: eqClr,
                  boxShadow: `0 0 6px ${eqClr}50`,
                }}
              />
            </div>
          )}
        </div>

        {/* EV Analysis */}
        {!isPreflop && (
          <div>
            <span
              className="text-[10px] uppercase tracking-wider block mb-1.5"
              style={{ color: "var(--text-muted)" }}
            >
              EV Analysis
            </span>
            <div className="flex items-center gap-4">
              {evEntries.map((entry) => {
                const isBest =
                  intent.evBestAction.toUpperCase() === entry.key;
                return (
                  <div key={entry.key} className="flex items-center gap-1.5">
                    <span
                      className="text-[11px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {entry.label}:
                    </span>
                    <span
                      className="text-xs font-mono font-bold"
                      style={{
                        color: isBest ? "#836EF9" : "var(--text-primary)",
                      }}
                    >
                      {evLabel(entry.value)}
                    </span>
                    {isBest && (
                      <span
                        className="text-[9px] font-bold uppercase"
                        style={{ color: "#836EF9" }}
                      >
                        Best
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Opponent profile */}
        {intent.opponentProfile && (
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className="text-[10px] uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Opponent:
            </span>
            <span
              className="text-[10px] font-bold uppercase px-2 py-0.5 rounded"
              style={{
                background: `${ARCHETYPE_COLORS[intent.opponentProfile.archetype] || "var(--text-muted)"}20`,
                color:
                  ARCHETYPE_COLORS[intent.opponentProfile.archetype] ||
                  "var(--text-muted)",
              }}
            >
              {intent.opponentProfile.archetype}
            </span>
            <span
              className="text-[11px] font-mono"
              style={{ color: "var(--text-muted)" }}
            >
              AGG {intent.opponentProfile.aggression.toFixed(2)}
            </span>
            <span
              className="text-[11px] font-mono"
              style={{ color: "var(--text-muted)" }}
            >
              FTR {intent.opponentProfile.foldToRaise.toFixed(2)}
            </span>
            <span
              className="text-[11px] font-mono"
              style={{ color: "var(--text-muted)" }}
            >
              VPIP {intent.opponentProfile.vpip.toFixed(2)}
            </span>
            {intent.multiwayCount > 2 && (
              <span
                className="text-[10px] font-mono px-2 py-0.5 rounded"
                style={{
                  background: "rgba(131, 110, 249, 0.1)",
                  color: "#836EF9",
                }}
              >
                {intent.multiwayCount}P
              </span>
            )}
          </div>
        )}

        {/* Decision */}
        <div
          className="flex items-center gap-3 px-3 py-2 rounded-lg"
          style={{
            background: "rgba(15, 12, 46, 0.6)",
            border: "1px solid rgba(131, 110, 249, 0.15)",
          }}
        >
          <span
            className="text-xs font-bold uppercase tracking-wider"
            style={{ color: "#836EF9" }}
          >
            {intent.action}
            {intent.amount > 0 && ` ${intent.amount}`}
          </span>
          <span
            className="text-[11px] flex-1"
            style={{ color: "var(--text-muted)" }}
          >
            {intent.reasoning}
          </span>
        </div>
      </div>
    </div>
  );
}
