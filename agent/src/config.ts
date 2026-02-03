import * as dotenv from "dotenv";
dotenv.config();

export const config = {
  // Blockchain
  rpcUrl: process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz",
  chainId: parseInt(process.env.CHAIN_ID || "10143"),
  privateKey: process.env.PRIVATE_KEY || "",

  // Contract addresses (populated after deployment)
  contracts: {
    pokerGame: process.env.POKER_GAME_ADDRESS || "",
    tokenVault: process.env.TOKEN_VAULT_ADDRESS || "",
  },

  // Strategy parameters
  strategy: {
    monteCarloSimulations: 5000,
    kellyFraction: 0.5,
    maxBankrollRisk: 0.10,
    minBankrollRisk: 0.01,
    stopLossThreshold: 0.5,
    consecutiveLossLimit: 3,
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || "info",
};
