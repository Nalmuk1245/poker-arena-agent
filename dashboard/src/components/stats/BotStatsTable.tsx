import { useGameStore } from "../../hooks/useGameStore";

export function BotStatsTable() {
  const { state } = useGameStore();
  const bots = state.botStats?.bots ?? [];

  return (
    <div className="glass-panel overflow-hidden">
      <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--panel-border)" }}>
        <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
          Bot Pool
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--panel-border)", background: "rgba(131, 110, 249, 0.04)" }}>
              <th className="text-left px-4 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Bot</th>
              <th className="text-center px-2 py-2 font-medium" style={{ color: "var(--text-muted)" }}>W</th>
              <th className="text-center px-2 py-2 font-medium" style={{ color: "var(--text-muted)" }}>L</th>
              <th className="text-center px-2 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Rate</th>
              <th className="text-center px-2 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Streak</th>
              <th className="text-center px-2 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Hands</th>
            </tr>
          </thead>
          <tbody>
            {bots.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-6" style={{ color: "var(--text-muted)" }}>
                  No bot data yet
                </td>
              </tr>
            ) : (
              bots.map((bot) => (
                <tr
                  key={bot.address}
                  className="transition-colors"
                  style={{ borderBottom: "1px solid rgba(131, 110, 249, 0.06)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(131, 110, 249, 0.05)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <td className="px-4 py-2">
                    <div className="font-semibold" style={{ color: "var(--text-primary)" }}>{bot.label}</div>
                    <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{bot.style}</div>
                  </td>
                  <td className="text-center px-2 py-2 font-bold" style={{ color: "#34D399" }}>
                    {bot.wins}
                  </td>
                  <td className="text-center px-2 py-2 font-bold" style={{ color: "#F87171" }}>
                    {bot.losses}
                  </td>
                  <td className="text-center px-2 py-2 font-bold" style={{ color: "#A78BFA" }}>
                    {bot.winRate.toFixed(0)}%
                  </td>
                  <td className="text-center px-2 py-2">
                    <span
                      style={{
                        color: bot.currentStreak > 0
                          ? "#34D399"
                          : bot.currentStreak < 0
                          ? "#F87171"
                          : "var(--text-muted)",
                      }}
                    >
                      {bot.currentStreak > 0 ? `+${bot.currentStreak}` : bot.currentStreak}
                    </span>
                  </td>
                  <td className="text-center px-2 py-2" style={{ color: "var(--text-secondary)" }}>
                    {bot.handsPlayed}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
