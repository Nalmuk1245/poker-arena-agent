import { useGameStore } from "../../hooks/useGameStore";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

export function WinRateChart() {
  const { state } = useGameStore();
  const data = state.winHistory;

  return (
    <div className="glass-panel p-4">
      <h3 className="text-xs font-semibold mb-3 uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
        Win Rate Trend
      </h3>
      {data.length < 2 ? (
        <div className="flex items-center justify-center h-40 text-sm" style={{ color: "var(--text-muted)" }}>
          Need at least 2 data points...
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(131, 110, 249, 0.08)" />
            <XAxis
              dataKey="matchNumber"
              tick={{ fill: "#6B6494", fontSize: 10 }}
              axisLine={{ stroke: "rgba(131, 110, 249, 0.15)" }}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: "#6B6494", fontSize: 10 }}
              axisLine={{ stroke: "rgba(131, 110, 249, 0.15)" }}
            />
            <Tooltip
              contentStyle={{
                background: "rgba(15, 12, 46, 0.95)",
                border: "1px solid rgba(131, 110, 249, 0.25)",
                borderRadius: 8,
                fontSize: 12,
                color: "#F1F0FF",
                boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                backdropFilter: "blur(12px)",
              }}
              labelFormatter={(v) => `Game ${v}`}
              formatter={(v: number) => [`${v.toFixed(1)}%`, "Win Rate"]}
            />
            <ReferenceLine y={50} stroke="rgba(131, 110, 249, 0.15)" strokeDasharray="3 3" />
            <Line
              type="monotone"
              dataKey="winRate"
              stroke="url(#lineGradient)"
              strokeWidth={2.5}
              dot={false}
              activeDot={{
                r: 4,
                fill: "#836EF9",
                stroke: "#F1F0FF",
                strokeWidth: 2,
                style: { filter: "drop-shadow(0 0 6px rgba(131, 110, 249, 0.5))" },
              }}
            />
            <defs>
              <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#836EF9" />
                <stop offset="100%" stopColor="#E84393" />
              </linearGradient>
            </defs>
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
