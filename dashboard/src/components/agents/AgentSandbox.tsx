import { useState, useEffect, useCallback } from "react";

interface AgentOption {
  agentId: string;
  agentName: string;
  mode: string;
}

interface TestResult {
  success: boolean;
  latencyMs: number;
  response?: Record<string, any>;
  error?: string;
  validationErrors: string[];
}

interface LatencyStats {
  avgLatency: number;
  lastLatency: number;
  latencyHistory: number[];
  stability: string;
  sampleCount: number;
}

export function AgentSandbox() {
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [phase, setPhase] = useState("FLOP");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [latency, setLatency] = useState<LatencyStats | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/agents");
      if (res.ok) {
        const data = await res.json();
        const list = (data.agents ?? data ?? []) as AgentOption[];
        setAgents(list.filter((a) => a.mode !== "internal"));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const fetchLatency = useCallback(async (agentId: string) => {
    try {
      const res = await fetch(`/api/agents/${agentId}/latency`);
      if (res.ok) setLatency(await res.json());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (selectedAgent) fetchLatency(selectedAgent);
  }, [selectedAgent, fetchLatency]);

  const handleTest = async () => {
    if (!selectedAgent) return;
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch(`/api/agents/${selectedAgent}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase }),
      });
      const data = await res.json();
      setResult(data);
      fetchLatency(selectedAgent);
    } catch (err: any) {
      setResult({
        success: false,
        latencyMs: 0,
        error: err?.message ?? "Network error",
        validationErrors: [],
      });
    } finally {
      setTesting(false);
    }
  };

  const inputStyle = {
    background: "rgba(15, 12, 46, 0.8)",
    border: "1px solid rgba(131, 110, 249, 0.2)",
    color: "var(--text-primary)",
    outline: "none",
  };

  // Mini sparkline from latency history
  const sparkline = latency?.latencyHistory ?? [];
  const sparkMax = sparkline.length > 0 ? Math.max(...sparkline, 1) : 1;

  return (
    <div className="glass-panel">
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--panel-border)" }}
      >
        <h3
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-muted)" }}
        >
          API Test Sandbox
        </h3>
      </div>

      <div className="p-4 space-y-4">
        {/* Controls */}
        <div className="flex flex-wrap items-end gap-3">
          <label className="block flex-1 min-w-[140px]">
            <span
              className="text-[10px] uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Agent
            </span>
            <select
              value={selectedAgent}
              onChange={(e) => {
                setSelectedAgent(e.target.value);
                setResult(null);
              }}
              className="w-full px-3 py-1.5 rounded-lg text-xs"
              style={inputStyle}
            >
              <option value="">Select agent...</option>
              {agents.map((a) => (
                <option key={a.agentId} value={a.agentId}>
                  {a.agentName} ({a.mode})
                </option>
              ))}
            </select>
          </label>

          <label className="block w-24">
            <span
              className="text-[10px] uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Phase
            </span>
            <select
              value={phase}
              onChange={(e) => setPhase(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg text-xs"
              style={inputStyle}
            >
              {["PREFLOP", "FLOP", "TURN", "RIVER"].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={handleTest}
            disabled={!selectedAgent || testing}
            className="px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: "linear-gradient(135deg, #836EF9 0%, #E84393 100%)",
              color: "#fff",
              border: "none",
              boxShadow: "0 0 10px rgba(131, 110, 249, 0.3)",
            }}
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled)
                e.currentTarget.style.boxShadow =
                  "0 0 20px rgba(131, 110, 249, 0.5)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow =
                "0 0 10px rgba(131, 110, 249, 0.3)";
            }}
          >
            {testing ? "Testing..." : "Send Test Request"}
          </button>
        </div>

        {/* Result */}
        {result && (
          <div
            className="rounded-xl p-4 space-y-2"
            style={{
              background: "rgba(15, 12, 46, 0.6)",
              border: `1px solid ${result.success ? "rgba(52, 211, 153, 0.2)" : "rgba(248, 113, 113, 0.2)"}`,
            }}
          >
            <div className="flex items-center gap-3">
              <span
                className="text-xs font-bold px-2 py-0.5 rounded"
                style={{
                  background: result.success
                    ? "rgba(52, 211, 153, 0.15)"
                    : "rgba(248, 113, 113, 0.15)",
                  color: result.success ? "#34D399" : "#F87171",
                }}
              >
                {result.success ? "SUCCESS" : "FAILED"}
              </span>
              <span
                className="text-xs font-mono"
                style={{ color: "var(--text-muted)" }}
              >
                {result.latencyMs}ms
              </span>
            </div>

            {result.response && (
              <pre
                className="text-[11px] font-mono p-2 rounded overflow-x-auto"
                style={{
                  background: "rgba(131, 110, 249, 0.05)",
                  color: "var(--text-primary)",
                }}
              >
                {JSON.stringify(result.response, null, 2)}
              </pre>
            )}

            {result.error && (
              <div
                className="text-[11px]"
                style={{ color: "#F87171" }}
              >
                {result.error}
              </div>
            )}

            {result.validationErrors.length > 0 && (
              <div className="space-y-1">
                <span
                  className="text-[10px] uppercase tracking-wider"
                  style={{ color: "#FBBF24" }}
                >
                  Validation Errors:
                </span>
                {result.validationErrors.map((err, i) => (
                  <div
                    key={i}
                    className="text-[11px] pl-2"
                    style={{ color: "#F87171" }}
                  >
                    - {err}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Latency stats */}
        {latency && latency.sampleCount > 0 && (
          <div>
            <div className="flex items-center gap-4 mb-2">
              <span
                className="text-[10px] uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                Latency Stats
              </span>
              <span
                className="text-xs font-mono"
                style={{ color: "var(--text-primary)" }}
              >
                Avg: {latency.avgLatency}ms
              </span>
              <span
                className="text-xs font-mono"
                style={{ color: "var(--text-muted)" }}
              >
                Last: {latency.lastLatency}ms
              </span>
              <span
                className="text-[10px] font-bold uppercase px-2 py-0.5 rounded"
                style={{
                  background:
                    latency.stability === "stable"
                      ? "rgba(52, 211, 153, 0.15)"
                      : "rgba(251, 191, 36, 0.15)",
                  color:
                    latency.stability === "stable" ? "#34D399" : "#FBBF24",
                }}
              >
                {latency.stability}
              </span>
            </div>

            {/* Mini sparkline */}
            {sparkline.length > 1 && (
              <div className="flex items-end gap-px h-8">
                {sparkline.map((val, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm"
                    style={{
                      height: `${Math.max(2, (val / sparkMax) * 100)}%`,
                      background:
                        val < latency.avgLatency * 1.5
                          ? "rgba(131, 110, 249, 0.5)"
                          : "rgba(248, 113, 113, 0.5)",
                      minWidth: "3px",
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {agents.length === 0 && (
          <div
            className="text-center py-6 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            No external agents registered. Register a callback agent to test.
          </div>
        )}
      </div>
    </div>
  );
}
