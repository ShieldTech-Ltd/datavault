const hre = require("hardhat");

async function main() {
  if (!["localhost", "monadTestnet"].includes(hre.network.name)) {
    throw new Error("Choose --network localhost or --network monadTestnet explicitly.");
  }
  if (hre.network.name === "monadTestnet" && !process.env.DEPLOYER_PRIVATE_KEY) {
    throw new Error("DEPLOYER_PRIVATE_KEY is required for Monad testnet deployment.");
  }
  const network = await hre.ethers.provider.getNetwork();
  if (hre.network.name === "monadTestnet" && network.chainId !== 10143n) {
    throw new Error(`Unexpected chain ID ${network.chainId}; expected Monad testnet 10143.`);
  }
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error("No deployer signer is configured.");
  console.log("Deploying DataVault with account:", deployer.address);
  console.log("Network:", hre.network.name);
  console.log("Chain ID:", network.chainId.toString());

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance),
    hre.network.name === "localhost" ? "local ETH" : "MON");

  const DataVault = await hre.ethers.getContractFactory("DataVault");
  const dataVault = await DataVault.deploy();
  await dataVault.waitForDeployment();

  const address = await dataVault.getAddress();
  const code = await hre.ethers.provider.getCode(address);
  if (code === "0x") throw new Error("Deployment transaction completed without contract code.");
  const transaction = dataVault.deploymentTransaction();
  if (!transaction) throw new Error("Deployment transaction hash unavailable.");
  console.log("DataVault deployed to:", address);
  console.log("Deployment transaction:", transaction.hash);
  console.log("REFUND_TIMEOUT:", (await dataVault.REFUND_TIMEOUT()).toString(), "seconds");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
