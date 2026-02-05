interface ConnectionBadgeProps {
  connected: boolean;
}

export function ConnectionBadge({ connected }: ConnectionBadgeProps) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1 rounded-full"
      style={{
        background: connected
          ? "rgba(52, 211, 153, 0.1)"
          : "rgba(248, 113, 113, 0.1)",
        border: `1px solid ${connected ? "rgba(52, 211, 153, 0.3)" : "rgba(248, 113, 113, 0.3)"}`,
      }}
    >
      <div
        className="w-2 h-2 rounded-full"
        style={{
          background: connected ? "#34D399" : "#F87171",
          boxShadow: connected
            ? "0 0 8px rgba(52, 211, 153, 0.6)"
            : "0 0 8px rgba(248, 113, 113, 0.6)",
        }}
      />
      <span
        className="text-xs font-medium"
        style={{ color: connected ? "#34D399" : "#F87171" }}
      >
        {connected ? "Live" : "Offline"}
      </span>
    </div>
  );
}
