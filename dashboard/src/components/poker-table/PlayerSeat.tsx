interface PlayerSeatProps {
  name: string;
  stack: number;
  isAgent?: boolean;
}

export function PlayerSeat({ name, stack, isAgent = false }: PlayerSeatProps) {
  return (
    <div
      className="flex flex-col items-center gap-1 px-5 py-2.5 rounded-xl"
      style={{
        background: isAgent
          ? "rgba(131, 110, 249, 0.25)"
          : "rgba(15, 12, 46, 0.8)",
        border: `1px solid ${isAgent ? "rgba(131, 110, 249, 0.4)" : "rgba(131, 110, 249, 0.15)"}`,
        backdropFilter: "blur(10px)",
        boxShadow: isAgent
          ? "0 0 20px rgba(131, 110, 249, 0.15)"
          : "0 4px 12px rgba(0,0,0,0.3)",
      }}
    >
      <span
        className="text-xs font-semibold"
        style={{ color: isAgent ? "#F1F0FF" : "#A5A0D6" }}
      >
        {name}
      </span>
      {stack > 0 && (
        <span
          className="text-sm font-bold"
          style={{ color: isAgent ? "#A78BFA" : "#836EF9" }}
        >
          {stack.toLocaleString()}
        </span>
      )}
    </div>
  );
}
