import { encodeFunctionData, parseEther, type Hex } from "viem";
import { DATAVAULT_ABI } from "../lib/contract";
export function parseCollectionPrice(value: string): bigint {
  if (!/^\d+(\.\d{1,18})?$/.test(value))
    throw new Error(
      "Enter a positive MON price with at most 18 decimal places."
    );
  const price = parseEther(value);
  if (price <= 0n || price > parseEther("10"))
    throw new Error(
      "Price must be greater than zero and no larger than 10 MON."
    );
  return price;
}
export async function updateCollectionPrice(
  wallet: { sendTransaction(input: { to: Hex; data: Hex }): Promise<Hex> },
  chain: {
    waitForTransactionReceipt(input: {
      hash: Hex;
    }): Promise<{ status: string }>;
    readContract(input: any): Promise<unknown>;
  },
  contract: Hex,
  id: Hex,
  value: string,
  active: boolean
) {
  const price = parseCollectionPrice(value);
  const hash = await wallet.sendTransaction({
    to: contract,
    data: encodeFunctionData({
      abi: DATAVAULT_ABI,
      functionName: "updatePolicy",
      args: [id, price, active],
    }),
  });
  const receipt = await chain.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success")
    throw new Error("Policy transaction reverted.");
  const saved = (await chain.readContract({
    address: contract,
    abi: DATAVAULT_ABI,
    functionName: "getCollection",
    args: [id],
  })) as [string, string, bigint, number, boolean];
  return { price: saved[2], policyVersion: saved[3], active: saved[4] };
}
