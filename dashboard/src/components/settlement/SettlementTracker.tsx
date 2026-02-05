import { useGameStore } from "../../hooks/useGameStore";

export function SettlementTracker() {
  const { state } = useGameStore();
  const { settlementProgress, settlementLog, settlementFlash } = state;

  const isActive = settlementProgress !== null;
  const pct = settlementProgress
    ? Math.round((settlementProgress.pendingCount / settlementProgress.batchSize) * 100)
    : 0;

  return (
    <div
      className="glass-panel transition-all duration-300"
      style={{
        boxShadow: settlementFlash
          ? "0 0 25px rgba(131, 110, 249, 0.4), inset 0 0 25px rgba(131, 110, 249, 0.05)"
          : undefined,
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
          On-Chain Settlement
        </h3>
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{
              background: isActive ? "#836EF9" : "rgba(165, 160, 214, 0.3)",
              boxShadow: isActive ? "0 0 8px rgba(131, 110, 249, 0.5)" : "none",
            }}
          />
          <span
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: isActive ? "#836EF9" : "var(--text-muted)" }}
          >
            {isActive ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Progress gauge */}
        {isActive && settlementProgress ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span
                className="text-[10px] uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                Next Settlement
              </span>
              <span className="text-xs font-mono" style={{ color: "var(--text-primary)" }}>
                {settlementProgress.pendingCount}/{settlementProgress.batchSize} Hands
              </span>
            </div>
            <div
              className="h-2 rounded-full overflow-hidden"
              style={{ background: "rgba(131, 110, 249, 0.1)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  background: "linear-gradient(90deg, #836EF9 0%, #E84393 100%)",
                  boxShadow: "0 0 8px rgba(131, 110, 249, 0.4)",
                }}
              />
            </div>
          </div>
        ) : (
          <div
            className="text-center py-3 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            Settlement inactive — no on-chain batching in progress
          </div>
        )}

        {/* Settlement log */}
        {settlementLog.length > 0 && (
          <div className="space-y-1.5">
            <span
              className="text-[10px] uppercase tracking-wider block"
              style={{ color: "var(--text-muted)" }}
            >
              Recent Settlements
            </span>
            {settlementLog.map((entry, i) => (
              <div
                key={`${entry.batchNumber}-${i}`}
                className="flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] font-mono"
                style={{
                  background: "rgba(15, 12, 46, 0.6)",
                  border: "1px solid rgba(131, 110, 249, 0.1)",
                }}
              >
                <div className="flex items-center gap-2">
                  <span style={{ color: "#34D399" }}>&#10003;</span>
                  <span style={{ color: "var(--text-primary)" }}>
                    Batch #{entry.batchNumber}
                  </span>
                  <span style={{ color: "var(--text-muted)" }}>
                    {entry.handsSettled} hands
                  </span>
                </div>
                <a
                  href={`https://testnet.monadexplorer.com/tx/${entry.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                  style={{ color: "#836EF9" }}
                >
                  {entry.txHash.slice(0, 8)}...
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
