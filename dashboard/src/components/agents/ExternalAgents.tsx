import { useState, useEffect, useCallback } from "react";

interface AgentInfo {
  agentId: string;
  agentName: string;
  mode: "callback" | "polling";
  callbackUrl?: string;
  walletAddress?: string;
  status: "registered" | "seated" | "playing" | "disconnected";
  registeredAt: number;
  lastSeen: number;
  playerId?: string;
  tableId?: string;
  avgLatency?: number;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; glow: string }> = {
  registered: {
    bg: "rgba(251, 191, 36, 0.12)",
    text: "#FBBF24",
    glow: "0 0 8px rgba(251, 191, 36, 0.3)",
  },
  seated: {
    bg: "rgba(96, 165, 250, 0.12)",
    text: "#60A5FA",
    glow: "0 0 8px rgba(96, 165, 250, 0.3)",
  },
  playing: {
    bg: "rgba(52, 211, 153, 0.12)",
    text: "#34D399",
    glow: "0 0 8px rgba(52, 211, 153, 0.3)",
  },
  disconnected: {
    bg: "rgba(165, 160, 214, 0.12)",
    text: "var(--text-muted)",
    glow: "none",
  },
};

function AgentCard({
  agent,
  onRemove,
}: {
  agent: AgentInfo;
  onRemove: () => void;
}) {
  const sc = STATUS_STYLES[agent.status] || STATUS_STYLES.registered;
  const timeSince = Math.round((Date.now() - agent.lastSeen) / 1000);

  return (
    <div
      className="rounded-xl p-4 transition-all"
      style={{
        background: "rgba(15, 12, 46, 0.5)",
        border: "1px solid rgba(131, 110, 249, 0.12)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.border = "1px solid rgba(131, 110, 249, 0.3)";
        e.currentTarget.style.background = "rgba(15, 12, 46, 0.7)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.border = "1px solid rgba(131, 110, 249, 0.12)";
        e.currentTarget.style.background = "rgba(15, 12, 46, 0.5)";
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4
            className="text-sm font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            {agent.agentName}
          </h4>
          <span
            className="text-[10px] font-mono"
            style={{ color: "var(--text-muted)" }}
          >
            {agent.agentId}
          </span>
        </div>
        <div
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-full"
          style={{ background: sc.bg }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: sc.text, boxShadow: sc.glow }}
          />
          <span
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: sc.text }}
          >
            {agent.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="text-center">
          <div
            className="text-xs font-bold uppercase"
            style={{ color: "var(--monad-bright)" }}
          >
            {agent.mode}
          </div>
          <div
            className="text-[9px] uppercase"
            style={{ color: "var(--text-muted)" }}
          >
            Mode
          </div>
        </div>
        <div className="text-center">
          <div
            className="text-xs font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            {agent.tableId ?? "-"}
          </div>
          <div
            className="text-[9px] uppercase"
            style={{ color: "var(--text-muted)" }}
          >
            Table
          </div>
        </div>
        <div className="text-center">
          <div
            className="text-xs font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            {agent.avgLatency ? `${agent.avgLatency}ms` : "-"}
          </div>
          <div
            className="text-[9px] uppercase"
            style={{ color: "var(--text-muted)" }}
          >
            Latency
          </div>
        </div>
        <div className="text-center">
          <div
            className="text-xs font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            {timeSince < 60
              ? `${timeSince}s`
              : `${Math.round(timeSince / 60)}m`}
          </div>
          <div
            className="text-[9px] uppercase"
            style={{ color: "var(--text-muted)" }}
          >
            Last Seen
          </div>
        </div>
      </div>

      {agent.callbackUrl && (
        <div
          className="text-[10px] font-mono mb-3 px-2 py-1 rounded truncate"
          style={{
            background: "rgba(131, 110, 249, 0.08)",
            color: "var(--text-muted)",
          }}
        >
          {agent.callbackUrl}
        </div>
      )}

      <button
        onClick={onRemove}
        className="w-full py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all"
        style={{
          background: "rgba(248, 113, 113, 0.1)",
          color: "#F87171",
          border: "1px solid rgba(248, 113, 113, 0.2)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(248, 113, 113, 0.2)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(248, 113, 113, 0.1)";
        }}
      >
        Remove
      </button>
    </div>
  );
}

export function ExternalAgents() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Registration form
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"polling" | "callback">("polling");
  const [callbackUrl, setCallbackUrl] = useState("");

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/agents");
      if (res.ok) {
        const data = await res.json();
        setAgents(Array.isArray(data) ? data : data.agents ?? []);
      }
    } catch {
      // silently ignore fetch errors
    }
  }, []);

  // Poll agent list every 5 seconds
  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 5000);
    return () => clearInterval(interval);
  }, [fetchAgents]);

  const handleRegister = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError("");

    try {
      const body: Record<string, string> = {
        agentName: name.trim(),
        mode,
      };
      if (mode === "callback" && callbackUrl.trim()) {
        body.callbackUrl = callbackUrl.trim();
      }

      const res = await fetch("/api/agents/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Registration failed");
        return;
      }

      // Reset form
      setName("");
      setCallbackUrl("");
      setMode("polling");
      setShowForm(false);
      await fetchAgents();
    } catch (err: any) {
      setError(err.message ?? "Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (agentId: string) => {
    try {
      await fetch(`/api/agents/${agentId}`, { method: "DELETE" });
      await fetchAgents();
    } catch {
      // ignore
    }
  };

  const inputStyle = {
    background: "rgba(15, 12, 46, 0.8)",
    border: "1px solid rgba(131, 110, 249, 0.2)",
    color: "var(--text-primary)",
    outline: "none",
  };

  return (
    <div className="glass-panel">
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--panel-border)" }}
      >
        <div className="flex items-center gap-2">
          <h3
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-muted)" }}
          >
            External Agents
          </h3>
          {agents.length > 0 && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{
                background: "rgba(131, 110, 249, 0.15)",
                color: "var(--monad-bright)",
              }}
            >
              {agents.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-all"
          style={{
            background: showForm
              ? "rgba(248, 113, 113, 0.15)"
              : "linear-gradient(135deg, #836EF9 0%, #E84393 100%)",
            color: showForm ? "#F87171" : "#fff",
            border: "none",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = showForm
              ? "0 0 15px rgba(248, 113, 113, 0.3)"
              : "0 0 15px rgba(131, 110, 249, 0.4)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          {showForm ? "Cancel" : "+ Register"}
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Registration Form */}
        {showForm && (
          <div
            className="rounded-xl p-4 space-y-3"
            style={{
              background: "rgba(131, 110, 249, 0.06)",
              border: "1px solid rgba(131, 110, 249, 0.15)",
            }}
          >
            <label className="block">
              <span
                className="text-[10px] uppercase tracking-wider block mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Agent Name
              </span>
              <input
                type="text"
                placeholder="MyPokerBot"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg text-xs"
                style={inputStyle}
              />
            </label>

            <label className="block">
              <span
                className="text-[10px] uppercase tracking-wider block mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Mode
              </span>
              <div className="flex gap-2">
                {(["polling", "callback"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className="flex-1 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-all"
                    style={{
                      background:
                        mode === m
                          ? "rgba(131, 110, 249, 0.2)"
                          : "rgba(15, 12, 46, 0.6)",
                      color:
                        mode === m ? "var(--monad-bright)" : "var(--text-muted)",
                      border:
                        mode === m
                          ? "1px solid rgba(131, 110, 249, 0.4)"
                          : "1px solid rgba(131, 110, 249, 0.1)",
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </label>

            {mode === "callback" && (
              <label className="block">
                <span
                  className="text-[10px] uppercase tracking-wider block mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Callback URL
                </span>
                <input
                  type="url"
                  placeholder="http://localhost:8080/decide"
                  value={callbackUrl}
                  onChange={(e) => setCallbackUrl(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg text-xs font-mono"
                  style={inputStyle}
                />
              </label>
            )}

            {error && (
              <div
                className="text-[11px] px-3 py-1.5 rounded-lg"
                style={{
                  background: "rgba(248, 113, 113, 0.1)",
                  color: "#F87171",
                  border: "1px solid rgba(248, 113, 113, 0.2)",
                }}
              >
                {error}
              </div>
            )}

            <button
              onClick={handleRegister}
              disabled={loading || !name.trim()}
              className="w-full py-2 rounded-lg text-xs font-bold uppercase tracking-widest cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background:
                  "linear-gradient(135deg, #836EF9 0%, #E84393 100%)",
                color: "#fff",
                border: "none",
                boxShadow: "0 0 15px rgba(131, 110, 249, 0.3)",
              }}
              onMouseEnter={(e) => {
                if (!e.currentTarget.disabled)
                  e.currentTarget.style.boxShadow =
                    "0 0 25px rgba(131, 110, 249, 0.5)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow =
                  "0 0 15px rgba(131, 110, 249, 0.3)";
              }}
            >
              {loading ? "Registering..." : "Register Agent"}
            </button>
          </div>
        )}

        {/* Agent List */}
        {agents.length === 0 ? (
          <div
            className="text-center py-8 text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            <div className="text-2xl mb-2" style={{ opacity: 0.3 }}>
              ~
            </div>
            No external agents registered.
            <br />
            <span className="text-[11px]">
              Register an agent to join the arena.
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {agents.map((agent) => (
              <AgentCard
                key={agent.agentId}
                agent={agent}
                onRemove={() => handleRemove(agent.agentId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
