import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "MON");

  // Deploy TokenVault
  console.log("\nDeploying TokenVault...");
  const TokenVault = await ethers.getContractFactory("TokenVault");
  const vault = await TokenVault.deploy();
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("TokenVault deployed to:", vaultAddress);

  // Deploy PokerGame
  console.log("\nDeploying PokerGame...");
  const PokerGame = await ethers.getContractFactory("PokerGame");
  const pokerGame = await PokerGame.deploy(vaultAddress);
  await pokerGame.waitForDeployment();
  const pokerGameAddress = await pokerGame.getAddress();
  console.log("PokerGame deployed to:", pokerGameAddress);

  // Authorize PokerGame in TokenVault
  console.log("\nAuthorizing PokerGame in TokenVault...");
  const authTx = await vault.authorizeGame(pokerGameAddress);
  await authTx.wait();
  console.log("PokerGame authorized in TokenVault");

  // Summary
  console.log("\n========== DEPLOYMENT COMPLETE ==========");
  console.log(`TOKEN_VAULT_ADDRESS=${vaultAddress}`);
  console.log(`POKER_GAME_ADDRESS=${pokerGameAddress}`);
  console.log("==========================================");
  console.log("\nAdd these to your .env file!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
