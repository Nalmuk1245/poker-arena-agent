import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

export class ContractManager {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet;
  private pokerGameContract: ethers.Contract | null = null;
  private tokenVaultContract: ethers.Contract | null = null;
  private pokerSettlementContract: ethers.Contract | null = null;

  constructor(rpcUrl: string, privateKey: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer = new ethers.Wallet(privateKey, this.provider);
  }

  async initialize(
    pokerGameAddress: string,
    tokenVaultAddress: string
  ): Promise<void> {
    const pokerAbi = this.loadAbi("PokerGame");
    const vaultAbi = this.loadAbi("TokenVault");

    this.pokerGameContract = new ethers.Contract(
      pokerGameAddress,
      pokerAbi,
      this.signer
    );

    this.tokenVaultContract = new ethers.Contract(
      tokenVaultAddress,
      vaultAbi,
      this.signer
    );
  }

  getPokerGame(): ethers.Contract {
    if (!this.pokerGameContract) throw new Error("PokerGame not initialized");
    return this.pokerGameContract;
  }

  getTokenVault(): ethers.Contract {
    if (!this.tokenVaultContract) throw new Error("TokenVault not initialized");
    return this.tokenVaultContract;
  }

  async initializeSettlement(settlementAddress: string): Promise<void> {
    if (!settlementAddress) return;
    try {
      const abi = this.loadAbi("PokerSettlement");
      this.pokerSettlementContract = new ethers.Contract(
        settlementAddress,
        abi,
        this.signer
      );
    } catch {
      // Settlement contract artifact may not exist yet
    }
  }

  getPokerSettlement(): ethers.Contract {
    if (!this.pokerSettlementContract) throw new Error("PokerSettlement not initialized");
    return this.pokerSettlementContract;
  }

  getSigner(): ethers.Wallet {
    return this.signer;
  }

  getProvider(): ethers.JsonRpcProvider {
    return this.provider;
  }

  async getAddress(): Promise<string> {
    return this.signer.address;
  }

  async getBalance(): Promise<bigint> {
    return this.provider.getBalance(this.signer.address);
  }

  private loadAbi(contractName: string): any[] {
    const artifactPath = path.resolve(
      __dirname,
      `../../../artifacts/contracts/core/${contractName}.sol/${contractName}.json`
    );

    if (!fs.existsSync(artifactPath)) {
      throw new Error(`Artifact not found: ${artifactPath}. Run 'npx hardhat compile' first.`);
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
    return artifact.abi;
  }
}
