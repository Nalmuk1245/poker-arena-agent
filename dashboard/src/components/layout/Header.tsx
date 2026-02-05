import { useGameStore } from "../../hooks/useGameStore";
import { ConnectionBadge } from "../game-status/ConnectionBadge";
import { SoundControls } from "./SoundControls";
import { WalletBadge } from "./WalletBadge";
import type { Page } from "../../hooks/useHashRoute";

const NAV_TABS: { key: Page; label: string }[] = [
  { key: "arena", label: "Arena" },
  { key: "agents", label: "Agents" },
];

export function Header({ page, onNavigate }: { page: Page; onNavigate: (p: Page) => void }) {
  const { state } = useGameStore();

  return (
    <header
      className="relative flex items-center justify-between px-6 py-3"
      style={{
        background: "rgba(7, 5, 24, 0.8)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(131, 110, 249, 0.15)",
      }}
    >
      {/* Gradient accent line at top */}
      <div
        className="absolute top-0 left-0 right-0 h-[1px]"
        style={{ background: "linear-gradient(90deg, transparent, #836EF9, #E84393, transparent)" }}
      />

      <div className="flex items-center gap-6">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #836EF9 0%, #E84393 100%)",
              boxShadow: "0 0 20px rgba(131, 110, 249, 0.3)",
            }}
          >
            <span className="text-white text-sm font-bold">M</span>
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight" style={{ color: "#F1F0FF" }}>
              Poker Arena
            </h1>
            <span
              className="text-[9px] uppercase tracking-[0.2em] font-medium"
              style={{ color: "rgba(165, 160, 214, 0.7)" }}
            >
              Monad Testnet
            </span>
          </div>
        </div>

        {/* Nav Tabs */}
        <nav className="flex items-center gap-1">
          {NAV_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onNavigate(tab.key)}
              className="relative px-4 py-1.5 rounded-lg text-sm font-bold tracking-wide cursor-pointer transition-all"
              style={{
                background:
                  page === tab.key
                    ? "rgba(131, 110, 249, 0.15)"
                    : "transparent",
                color:
                  page === tab.key ? "#F1F0FF" : "rgba(165, 160, 214, 0.6)",
                border: "none",
              }}
              onMouseEnter={(e) => {
                if (page !== tab.key)
                  e.currentTarget.style.color = "rgba(165, 160, 214, 0.9)";
              }}
              onMouseLeave={(e) => {
                if (page !== tab.key)
                  e.currentTarget.style.color = "rgba(165, 160, 214, 0.6)";
              }}
            >
              {tab.label}
              {page === tab.key && (
                <div
                  className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                  style={{
                    background: "linear-gradient(90deg, #836EF9, #E84393)",
                  }}
                />
              )}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-4">
        <WalletBadge />
        {state.agentStats && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            Games{" "}
            <span className="font-bold" style={{ color: "var(--monad-bright)" }}>
              {state.agentStats.matchesPlayed}
            </span>
          </span>
        )}
        <SoundControls />
        <ConnectionBadge connected={state.connected} />
      </div>
    </header>
  );
}
