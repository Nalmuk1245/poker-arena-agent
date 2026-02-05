import type { ActionLogEntry as LogEntry } from "../../types/dashboard";

const EVENT_STYLES: Record<string, { icon: string; color: string }> = {
  "game:created":        { icon: "+",  color: "#60A5FA" },
  "game:joined":         { icon: ">",  color: "#60A5FA" },
  "game:result":         { icon: "*",  color: "#34D399" },
  "game:phaseChange":    { icon: "#",  color: "#A78BFA" },
  "game:holeCards":      { icon: "[]", color: "#FBBF24" },
  "game:communityCards": { icon: "||", color: "#FBBF24" },
  "game:handStrength":   { icon: "^",  color: "#C084FC" },
  "game:agentAction":    { icon: ">>", color: "#34D399" },
  "game:opponentAction": { icon: "<<", color: "#F87171" },
  "game:virtualChips":   { icon: "$",  color: "#FBBF24" },
  "game:showdown":       { icon: "!",  color: "#E84393" },
  "game:botMatch":       { icon: "@",  color: "#60A5FA" },
  "arena:tableState":    { icon: "~",  color: "#6B6494" },
  "arena:handResult":    { icon: "*",  color: "#34D399" },
};

/**
 * Convert raw log messages (especially JSON-heavy ones) into human-readable text.
 */
function humanize(event: string, raw: string): string {
  // Detect "eventName: {JSON}" pattern from backend default case
  const jsonSuffixMatch = raw.match(/^[\w:.]+:\s*(\{.+\})$/s);
  if (jsonSuffixMatch) {
    try {
      const obj = JSON.parse(jsonSuffixMatch[1]);
      return formatPayload(event, obj);
    } catch {
      // not valid JSON, fall through
    }
  }

  // Full message is a JSON object
  if (raw.startsWith("{") && raw.endsWith("}")) {
    try {
      const obj = JSON.parse(raw);
      return formatPayload(event, obj);
    } catch {
      // fall through
    }
  }

  return raw;
}

function formatPayload(event: string, obj: Record<string, any>): string {
  // Arena table state
  if (event === "arena:tableState" || (obj.phase !== undefined && obj.seats !== undefined)) {
    const phase = obj.phase ?? "?";
    const hand = obj.handNumber ?? "";
    const active = obj.activePlayerId;
    return `Hand #${hand} ${phase}${active ? ` — ${active}'s turn` : ""}`;
  }

  // Arena hand result
  if (event === "arena:handResult" || obj.winners !== undefined) {
    const hand = obj.handNumber ?? "";
    const winners = obj.winners;
    if (Array.isArray(winners) && winners.length > 0) {
      const names = winners.map((w: any) =>
        `${w.playerId || "?"} won ${w.amount ?? 0}${w.handDescription ? ` (${w.handDescription})` : ""}`
      );
      return `Hand #${hand}: ${names.join(", ")}`;
    }
    return `Hand #${hand} complete`;
  }

  // Agent/bot action
  if (obj.action) {
    const action = obj.action;
    const amount = obj.amount;
    const reasoning = obj.reasoning;
    const gameId = obj.gameId ?? obj.handNumber ?? "";
    let msg = gameId ? `#${gameId}: ` : "";
    msg += action;
    if (amount && amount > 0) msg += ` ${amount}`;
    if (reasoning) msg += ` — ${reasoning}`;
    return msg;
  }

  // Player seat info ({"index":0, ...})
  if (obj.index !== undefined && obj.playerId !== undefined) {
    const name = obj.playerName || obj.playerId;
    const stack = obj.stack ?? 0;
    const status = obj.status ?? "";
    return `Seat ${obj.index}: ${name} (${stack}) ${status}`;
  }

  // Generic: extract meaningful fields
  const parts: string[] = [];
  if (obj.gameId) parts.push(`#${obj.gameId}`);
  if (obj.phase) parts.push(obj.phase);
  if (obj.display) parts.push(obj.display);
  if (obj.handName) parts.push(obj.handName);
  if (obj.result) parts.push(String(obj.result));
  if (obj.botLabel) parts.push(`vs ${obj.botLabel}`);
  if (obj.won !== undefined) parts.push(obj.won ? "WIN" : "LOSS");
  if (obj.payout) parts.push(`+${obj.payout}`);

  if (parts.length > 0) return parts.join(" ");

  // Last resort: abbreviated key=value
  const keys = Object.keys(obj).filter((k) => k !== "timestamp");
  return keys
    .slice(0, 4)
    .map((k) => {
      const v = obj[k];
      if (typeof v === "object") return `${k}: [...]`;
      return `${k}: ${v}`;
    })
    .join(", ");
}

interface ActionLogEntryProps {
  entry: LogEntry;
}

export function ActionLogEntryComponent({ entry }: ActionLogEntryProps) {
  const style = EVENT_STYLES[entry.event] || { icon: "-", color: "#6B6494" };
  const time = new Date(entry.timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const isResult = entry.event === "game:result" || entry.event === "arena:handResult";
  const isWin = isResult && (entry.message.includes("WIN") || entry.message.includes("won"));
  const isAction = entry.event === "game:agentAction" || entry.event === "game:opponentAction";

  const message = humanize(entry.event, entry.message);

  return (
    <div
      className="flex items-start gap-2 py-1.5 px-2 text-xs rounded-lg transition-colors"
      style={{
        background: isResult
          ? isWin
            ? "rgba(52, 211, 153, 0.06)"
            : "rgba(248, 113, 113, 0.06)"
          : isAction
            ? "rgba(131, 110, 249, 0.04)"
            : "transparent",
        borderLeft: isResult
          ? `2px solid ${isWin ? "#34D399" : "#F87171"}`
          : isAction
            ? "2px solid rgba(131, 110, 249, 0.3)"
            : "2px solid transparent",
      }}
    >
      <span
        className="flex-shrink-0 w-5 text-center font-bold"
        style={{ color: style.color, opacity: 0.7 }}
      >
        {style.icon}
      </span>
      <span
        className="flex-shrink-0 font-mono"
        style={{ color: "rgba(165, 160, 214, 0.5)", fontSize: "10px" }}
      >
        {time}
      </span>
      <span className="break-words leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {message}
      </span>
    </div>
  );
}
