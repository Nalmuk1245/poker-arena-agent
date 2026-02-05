import { useState, useCallback } from "react";
import { useAccount, useConnect, useDisconnect, useSignMessage } from "wagmi";
import { injected } from "wagmi/connectors";
import { useGameStore } from "./useGameStore";
import type { WalletAuthResponse } from "../types/dashboard";

export function useWalletAuth() {
  const { address, isConnected } = useAccount();
  const { connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { socket, dispatch } = useGameStore();

  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectAndAuth = useCallback(async () => {
    setIsAuthenticating(true);
    setError(null);

    try {
      const result = await connectAsync({ connector: injected() });
      const walletAddress = result.accounts[0];

      if (!walletAddress) {
        throw new Error("No account returned from wallet");
      }

      const message = `Sign in to Poker Arena\nNonce: ${Date.now()}`;
      const signature = await signMessageAsync({ message });

      if (!socket) {
        throw new Error("Socket not connected");
      }

      const response = await new Promise<WalletAuthResponse>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Auth timeout")), 10000);
        socket.emit(
          "wallet:auth",
          { address: walletAddress, signature, message },
          (res: WalletAuthResponse) => {
            clearTimeout(timeout);
            resolve(res);
          }
        );
      });

      if (!response.success) {
        throw new Error(response.error || "Auth failed");
      }

      dispatch({ type: "WALLET_AUTH_SUCCESS", payload: { address: walletAddress } });
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || "Connection failed";
      setError(msg);
      try { await disconnectAsync(); } catch {}
    } finally {
      setIsAuthenticating(false);
    }
  }, [connectAsync, signMessageAsync, socket, dispatch, disconnectAsync]);

  const disconnect = useCallback(async () => {
    try {
      if (socket) {
        socket.emit("wallet:disconnect");
      }
      await disconnectAsync();
      dispatch({ type: "WALLET_DISCONNECT" });
      setError(null);
    } catch {}
  }, [socket, disconnectAsync, dispatch]);

  return {
    address: address ?? null,
    isConnected,
    isAuthenticating,
    error,
    connectAndAuth,
    disconnect,
  };
}
