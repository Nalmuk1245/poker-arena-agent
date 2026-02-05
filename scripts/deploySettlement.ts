import { ethers } from "hardhat";

/**
 * Deploy only the PokerSettlement contract.
 * Usage: npx hardhat run scripts/deploySettlement.ts --network monadTestnet
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying PokerSettlement with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "MON");

  console.log("\nDeploying PokerSettlement...");
  const PokerSettlement = await ethers.getContractFactory("PokerSettlement");
  const settlement = await PokerSettlement.deploy();
  await settlement.waitForDeployment();
  const settlementAddress = await settlement.getAddress();
  console.log("PokerSettlement deployed to:", settlementAddress);

  console.log("\n========== SETTLEMENT DEPLOYMENT COMPLETE ==========");
  console.log(`POKER_SETTLEMENT_ADDRESS=${settlementAddress}`);
  console.log("=====================================================");
  console.log("\nAdd these to your .env file:");
  console.log(`  SETTLEMENT_ENABLED=true`);
  console.log(`  POKER_SETTLEMENT_ADDRESS=${settlementAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
