const PHASES = ["PREFLOP", "FLOP", "TURN", "RIVER", "SHOWDOWN"];

interface PhaseIndicatorProps {
  currentPhase: string | null;
}

export function PhaseIndicator({ currentPhase }: PhaseIndicatorProps) {
  const activeIndex = currentPhase ? PHASES.indexOf(currentPhase) : -1;

  return (
    <div className="flex items-center gap-2">
      {PHASES.map((phase, i) => {
        const isActive = i === activeIndex;
        const isPast = i < activeIndex;

        return (
          <div key={phase} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <div
                className="w-2.5 h-2.5 rounded-full transition-all duration-300"
                style={{
                  background: isActive
                    ? "#836EF9"
                    : isPast
                    ? "rgba(131, 110, 249, 0.5)"
                    : "rgba(107, 100, 148, 0.3)",
                  boxShadow: isActive ? "0 0 10px rgba(131, 110, 249, 0.6), 0 0 20px rgba(131, 110, 249, 0.2)" : "none",
                  transform: isActive ? "scale(1.4)" : "scale(1)",
                }}
              />
              <span
                className="text-[9px] tracking-wider"
                style={{
                  color: isActive ? "#A78BFA" : isPast ? "rgba(131, 110, 249, 0.5)" : "var(--text-muted)",
                  fontWeight: isActive ? 700 : 400,
                }}
              >
                {phase.slice(0, 3)}
              </span>
            </div>
            {i < PHASES.length - 1 && (
              <div
                className="w-4 h-[1px] mb-4"
                style={{
                  background: isPast
                    ? "rgba(131, 110, 249, 0.4)"
                    : "rgba(107, 100, 148, 0.2)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
