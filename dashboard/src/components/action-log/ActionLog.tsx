import { useEffect, useRef } from "react";
import { useGameStore } from "../../hooks/useGameStore";
import { ActionLogEntryComponent } from "./ActionLogEntry";

export function ActionLog() {
  const { state } = useGameStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.actionLog.length]);

  return (
    <div className="glass-panel flex flex-col h-full">
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--panel-border)" }}
      >
        <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
          Action Log
        </h3>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          {state.actionLog.length} entries
        </span>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-2 space-y-0.5"
        style={{ maxHeight: 400 }}
      >
        {state.actionLog.length === 0 ? (
          <div className="text-center text-sm py-8" style={{ color: "var(--text-muted)" }}>
            Waiting for events...
          </div>
        ) : (
          state.actionLog.map((entry) => (
            <ActionLogEntryComponent key={entry.id} entry={entry} />
          ))
        )}
      </div>
    </div>
  );
}
