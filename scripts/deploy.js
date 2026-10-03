const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying DataVault with account:", deployer.address);
  console.log("Network:", hre.network.name);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "MON");

  const DataVault = await hre.ethers.getContractFactory("DataVault");
  const dataVault = await DataVault.deploy();
  await dataVault.waitForDeployment();

  const address = await dataVault.getAddress();
  console.log("DataVault deployed to:", address);
  console.log("REFUND_TIMEOUT:", (await dataVault.REFUND_TIMEOUT()).toString(), "seconds");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
