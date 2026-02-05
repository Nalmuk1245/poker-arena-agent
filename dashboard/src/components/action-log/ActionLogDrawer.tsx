import { useState } from "react";
import { useGameStore } from "../../hooks/useGameStore";
import { ActionLogEntryComponent } from "./ActionLogEntry";
import { useEffect, useRef } from "react";

export function ActionLogDrawer() {
  const { state } = useGameStore();
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.actionLog.length, open]);

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 px-4 py-2.5 rounded-xl cursor-pointer transition-all"
        style={{
          background: open
            ? "rgba(248, 113, 113, 0.15)"
            : "linear-gradient(135deg, rgba(131, 110, 249, 0.9), rgba(232, 67, 147, 0.9))",
          color: open ? "#F87171" : "#fff",
          border: open ? "1px solid rgba(248, 113, 113, 0.3)" : "1px solid rgba(131, 110, 249, 0.3)",
          boxShadow: open
            ? "0 4px 20px rgba(248, 113, 113, 0.2)"
            : "0 4px 20px rgba(131, 110, 249, 0.3)",
          backdropFilter: "blur(12px)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = open
            ? "0 6px 25px rgba(248, 113, 113, 0.3)"
            : "0 6px 25px rgba(131, 110, 249, 0.5)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = open
            ? "0 4px 20px rgba(248, 113, 113, 0.2)"
            : "0 4px 20px rgba(131, 110, 249, 0.3)";
        }}
      >
        <span className="text-xs font-bold uppercase tracking-wider">
          {open ? "Close" : "Log"}
        </span>
        {!open && state.actionLog.length > 0 && (
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{
              background: "rgba(255,255,255,0.2)",
              color: "#fff",
            }}
          >
            {state.actionLog.length}
          </span>
        )}
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: "rgba(0, 0, 0, 0.3)" }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer Panel */}
      <div
        className="fixed top-0 right-0 z-50 h-full flex flex-col transition-transform duration-300 ease-out"
        style={{
          width: "min(420px, 90vw)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          background: "rgba(10, 8, 32, 0.97)",
          borderLeft: "1px solid rgba(131, 110, 249, 0.15)",
          backdropFilter: "blur(24px)",
          boxShadow: open ? "-8px 0 40px rgba(0, 0, 0, 0.5)" : "none",
        }}
      >
        {/* Drawer Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid rgba(131, 110, 249, 0.12)" }}
        >
          <div className="flex items-center gap-2">
            <h3
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--text-muted)" }}
            >
              Action Log
            </h3>
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{
                background: "rgba(131, 110, 249, 0.15)",
                color: "var(--monad-bright)",
              }}
            >
              {state.actionLog.length}
            </span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer transition-all"
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
            <span className="text-sm font-bold">&times;</span>
          </button>
        </div>

        {/* Drawer Content */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-3 space-y-0.5"
        >
          {state.actionLog.length === 0 ? (
            <div
              className="text-center text-sm py-12"
              style={{ color: "var(--text-muted)" }}
            >
              <div className="text-2xl mb-2" style={{ opacity: 0.3 }}>~</div>
              Waiting for events...
            </div>
          ) : (
            state.actionLog.map((entry) => (
              <ActionLogEntryComponent key={entry.id} entry={entry} />
            ))
          )}
        </div>
      </div>
    </>
  );
}
