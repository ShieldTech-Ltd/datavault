export async function checkLiveChain({ rpcUrl, chainId, contractAddress, request = fetch }) {
  const call = async (method, params = []) => {
    const response = await request(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`${method} returned HTTP ${response.status}`);
    const body = await response.json();
    if (body.error || typeof body.result !== "string") throw new Error(`${method} returned an invalid RPC result`);
    return body.result;
  };

  const reportedChain = await call("eth_chainId");
  if (!/^0x[0-9a-f]+$/i.test(reportedChain) || BigInt(reportedChain) !== BigInt(chainId)) {
    throw new Error("RPC chain ID does not match CHAIN_ID");
  }

  const code = await call("eth_getCode", [contractAddress, "latest"]);
  if (!/^0x(?:[0-9a-f]{2})+$/i.test(code) || /^0x(?:00)+$/i.test(code)) {
    throw new Error("CONTRACT_ADDRESS has no deployed code on the configured chain");
  }
}
