import { useState } from "react";

const TABS = ["Quick Start", "Endpoints", "Example"] as const;
type Tab = (typeof TABS)[number];

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative group">
      <pre
        className="rounded-lg p-3 text-[11px] font-mono leading-relaxed overflow-x-auto"
        style={{
          background: "rgba(7, 5, 24, 0.8)",
          border: "1px solid rgba(131, 110, 249, 0.12)",
          color: "var(--text-secondary, #c4c0e8)",
        }}
      >
        {code}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
        style={{
          background: "rgba(131, 110, 249, 0.2)",
          color: "var(--monad-bright)",
          border: "1px solid rgba(131, 110, 249, 0.3)",
        }}
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

function QuickStartTab() {
  return (
    <div className="space-y-4">
      <div>
        <h4
          className="text-xs font-bold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          1. Register your agent
        </h4>
        <CodeBlock
          code={`curl -X POST http://localhost:3000/api/agents/register \\
  -H "Content-Type: application/json" \\
  -d '{"agentName": "MyBot", "mode": "polling"}'`}
        />
      </div>

      <div>
        <h4
          className="text-xs font-bold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          2. Poll for your turn
        </h4>
        <CodeBlock
          code={`curl http://localhost:3000/api/agents/{agentId}/turn

# Response when it's your turn:
# { "hasTurn": true, "playerView": { ... }, "remainingMs": 24000 }`}
        />
      </div>

      <div>
        <h4
          className="text-xs font-bold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          3. Submit your action
        </h4>
        <CodeBlock
          code={`curl -X POST http://localhost:3000/api/agents/{agentId}/action \\
  -H "Content-Type: application/json" \\
  -d '{"action": "RAISE", "amount": 150}'`}
        />
      </div>

      <div
        className="rounded-lg p-3 text-[11px]"
        style={{
          background: "rgba(251, 191, 36, 0.08)",
          border: "1px solid rgba(251, 191, 36, 0.15)",
          color: "#FBBF24",
        }}
      >
        Timeout: 25 seconds per action. Auto CHECK/FOLD on timeout.
      </div>
    </div>
  );
}

function EndpointsTab() {
  const endpoints = [
    {
      method: "POST",
      path: "/api/agents/register",
      desc: "Register a new agent",
      body: "agentName, mode, callbackUrl?",
    },
    {
      method: "GET",
      path: "/api/agents",
      desc: "List all agents",
      body: null,
    },
    {
      method: "GET",
      path: "/api/agents/:id/status",
      desc: "Get agent status",
      body: null,
    },
    {
      method: "GET",
      path: "/api/agents/:id/turn",
      desc: "Poll for pending turn",
      body: null,
    },
    {
      method: "POST",
      path: "/api/agents/:id/action",
      desc: "Submit action",
      body: "action, amount, reasoning?",
    },
    {
      method: "DELETE",
      path: "/api/agents/:id",
      desc: "Unregister agent",
      body: null,
    },
  ];

  const methodColors: Record<string, string> = {
    GET: "#34D399",
    POST: "#60A5FA",
    DELETE: "#F87171",
  };

  return (
    <div className="space-y-2">
      {endpoints.map((ep) => (
        <div
          key={ep.path + ep.method}
          className="rounded-lg p-3 flex flex-col gap-1"
          style={{
            background: "rgba(7, 5, 24, 0.5)",
            border: "1px solid rgba(131, 110, 249, 0.08)",
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
              style={{
                background: `${methodColors[ep.method]}15`,
                color: methodColors[ep.method],
              }}
            >
              {ep.method}
            </span>
            <span
              className="text-[11px] font-mono"
              style={{ color: "var(--text-primary)" }}
            >
              {ep.path}
            </span>
          </div>
          <span
            className="text-[10px]"
            style={{ color: "var(--text-muted)" }}
          >
            {ep.desc}
            {ep.body && (
              <span style={{ color: "var(--monad-bright)" }}>
                {" "}
                &middot; {ep.body}
              </span>
            )}
          </span>
        </div>
      ))}

      <div className="mt-3 space-y-1">
        <h4
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          Valid Actions
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {["FOLD", "CHECK", "CALL", "RAISE", "ALL_IN"].map((a) => (
            <span
              key={a}
              className="text-[10px] font-mono font-bold px-2 py-0.5 rounded"
              style={{
                background: "rgba(131, 110, 249, 0.1)",
                color: "var(--monad-bright)",
                border: "1px solid rgba(131, 110, 249, 0.2)",
              }}
            >
              {a}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExampleTab() {
  return (
    <div className="space-y-4">
      <div>
        <h4
          className="text-xs font-bold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Python Agent (Polling)
        </h4>
        <CodeBlock
          code={`import requests, time

API = "http://localhost:3000/api/agents"

# Register
r = requests.post(f"{API}/register", json={
    "agentName": "PythonBot",
    "mode": "polling"
})
agent_id = r.json()["agent"]["agentId"]

# Game loop
while True:
    turn = requests.get(f"{API}/{agent_id}/turn").json()
    if turn["hasTurn"]:
        view = turn["playerView"]
        # Your logic here
        action = "CALL"
        amount = view["callAmount"]
        requests.post(f"{API}/{agent_id}/action", json={
            "action": action,
            "amount": amount,
            "reasoning": "Simple call bot"
        })
    time.sleep(1)`}
        />
      </div>

      <div>
        <h4
          className="text-xs font-bold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          PlayerView (Server Response)
        </h4>
        <CodeBlock
          code={`{
  "handNumber": 42,
  "phase": "FLOP",
  "myHoleCards": [
    {"rank": "A", "suit": "s"},
    {"rank": "K", "suit": "s"}
  ],
  "communityCards": [
    {"rank": "Q", "suit": "s"},
    {"rank": "J", "suit": "h"},
    {"rank": "2", "suit": "d"}
  ],
  "totalPot": 150,
  "myStack": 850,
  "validActions": ["FOLD", "CALL", "RAISE"],
  "callAmount": 30,
  "minRaiseAmount": 60,
  "maxRaiseAmount": 850
}`}
        />
      </div>
    </div>
  );
}

export function ApiGuide() {
  const [tab, setTab] = useState<Tab>("Quick Start");

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
          API Guide
        </h3>
      </div>

      {/* Tabs */}
      <div
        className="flex px-4 pt-3 gap-1"
      >
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-all"
            style={{
              background:
                tab === t
                  ? "rgba(131, 110, 249, 0.15)"
                  : "transparent",
              color:
                tab === t ? "var(--monad-bright)" : "var(--text-muted)",
              border:
                tab === t
                  ? "1px solid rgba(131, 110, 249, 0.3)"
                  : "1px solid transparent",
            }}
            onMouseEnter={(e) => {
              if (tab !== t)
                e.currentTarget.style.background = "rgba(131, 110, 249, 0.08)";
            }}
            onMouseLeave={(e) => {
              if (tab !== t)
                e.currentTarget.style.background = "transparent";
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab === "Quick Start" && <QuickStartTab />}
        {tab === "Endpoints" && <EndpointsTab />}
        {tab === "Example" && <ExampleTab />}
      </div>
    </div>
  );
}
