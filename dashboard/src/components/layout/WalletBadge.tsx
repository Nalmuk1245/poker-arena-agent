import { useGameStore } from "../../hooks/useGameStore";
import { useWalletAuth } from "../../hooks/useWalletAuth";

function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WalletBadge() {
  const { state } = useGameStore();
  const { isConnected, isAuthenticating, error, connectAndAuth, disconnect, address } =
    useWalletAuth();
  const wallet = state.walletInfo;

  // Not connected — show connect button (direct, no dropdown)
  if (!isConnected && !state.userWalletAddress) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={connectAndAuth}
          disabled={isAuthenticating}
          className="flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider cursor-pointer transition-all disabled:opacity-50 disabled:cursor-wait"
          style={{
            background: isAuthenticating
              ? "rgba(131, 110, 249, 0.2)"
              : "linear-gradient(135deg, #836EF9 0%, #E84393 100%)",
            color: "#fff",
            border: "none",
            boxShadow: "0 0 15px rgba(131, 110, 249, 0.3)",
          }}
          onMouseEnter={(e) => {
            if (!isAuthenticating)
              e.currentTarget.style.boxShadow = "0 0 25px rgba(131, 110, 249, 0.5)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "0 0 15px rgba(131, 110, 249, 0.3)";
          }}
        >
          {isAuthenticating ? (
            <>
              <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Connecting...
            </>
          ) : (
            "Connect Wallet"
          )}
        </button>

        {error && (
          <span
            className="text-[10px] max-w-[140px] truncate"
            style={{ color: "#F87171" }}
            title={error}
          >
            {error}
          </span>
        )}
      </div>
    );
  }

  // Connected — show address + balance + disconnect
  const displayAddress = address || state.userWalletAddress;

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex items-center gap-2 px-3 py-1 rounded-full"
        style={{
          background: "rgba(131, 110, 249, 0.08)",
          border: "1px solid rgba(131, 110, 249, 0.2)",
        }}
      >
        <div
          className="w-2 h-2 rounded-full"
          style={{
            background: "#34D399",
            boxShadow: "0 0 6px rgba(52, 211, 153, 0.5)",
          }}
        />
        <span
          className="text-xs font-mono font-medium"
          style={{ color: "rgba(165, 160, 214, 0.9)" }}
          title={displayAddress || undefined}
        >
          {displayAddress ? truncateAddress(displayAddress) : "..."}
        </span>
        {wallet && (
          <span className="text-xs font-bold" style={{ color: "#836EF9" }}>
            {parseFloat(wallet.balance).toFixed(3)} MON
          </span>
        )}
      </div>

      {wallet?.settlementEnabled ? (
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded-full"
          style={{
            background: "rgba(52, 211, 153, 0.08)",
            border: "1px solid rgba(52, 211, 153, 0.25)",
          }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: "#34D399", boxShadow: "0 0 6px rgba(52, 211, 153, 0.5)" }}
          />
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "#34D399" }}
          >
            On-Chain
          </span>
        </div>
      ) : wallet ? (
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded-full"
          style={{
            background: "rgba(165, 160, 214, 0.06)",
            border: "1px solid rgba(165, 160, 214, 0.15)",
          }}
        >
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "rgba(165, 160, 214, 0.5)" }}
          >
            Off-Chain
          </span>
        </div>
      ) : null}

      <button
        onClick={disconnect}
        className="px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-all"
        style={{
          background: "rgba(248, 113, 113, 0.08)",
          color: "rgba(248, 113, 113, 0.7)",
          border: "1px solid rgba(248, 113, 113, 0.15)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(248, 113, 113, 0.15)";
          e.currentTarget.style.color = "#F87171";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(248, 113, 113, 0.08)";
          e.currentTarget.style.color = "rgba(248, 113, 113, 0.7)";
        }}
      >
        Disconnect
      </button>
    </div>
  );
}
