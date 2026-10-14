import { useEffect, useState } from 'react';
import { formatEther } from 'viem';
import { useWallet } from '../lib/wallet';
import { monadTestnet } from '../lib/network';
import { viemClient } from '../lib/contract';
import './DemoWalletSetup.css';

export default function DemoWalletSetup({ onBalance }: { onBalance?: (amount: bigint | null) => void }) {
  const { primaryWallet, hasProvider, correctNetwork, connect, switchNetwork, error } = useWallet();
  const address = primaryWallet?.address;
  const [pending, setPending] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [funds, setFunds] = useState<{ address: string; amount?: bigint; error?: string } | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const balance = correctNetwork && funds?.address === address ? funds : null;
  useEffect(() => { onBalance?.(balance?.amount ?? null); }, [onBalance, balance?.amount, address, correctNetwork]);
  useEffect(() => {
    let active = true;
    setFunds(null);
    setCopyStatus('');
    if (address && correctNetwork) {
      void viemClient.getBalance({ address }).then(amount => {
        if (active) setFunds({ address, amount });
      }).catch(() => {
        if (active) setFunds({ address, error: 'Balance could not be checked. Try again.' });
      });
    }
    return () => { active = false; };
  }, [address, correctNetwork, refresh]);
  async function setup() {
    setPending(true);
    try { await (primaryWallet ? switchNetwork() : connect()); }
    finally { setPending(false); }
  }
  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopyStatus('Wallet address copied. Paste it into the faucet, then return here.');
    } catch { setCopyStatus(`Copy this public address into the faucet: ${address}`); }
  }
  return <section className="dv-demo-setup" aria-labelledby="demo-setup-title">
    <div className="dv-demo-setup-heading">
      <strong id="demo-setup-title">Your first demo in three steps</strong>
      <span>Test tokens, no purchase needed</span>
    </div>
    <ol className="dv-demo-steps">
      <li><strong>1. Connect</strong><span>Use an EVM wallet on {monadTestnet.name}.</span></li>
      <li><strong>2. Ask</strong><span>A sample is ready below. Choose a question.</span></li>
      <li><strong>3. Review and pay</strong><span>Approve the price, then see the answer and receipt.</span></li>
    </ol>
    {!primaryWallet && <div className="dv-demo-next">
      <p>{hasProvider ? 'Connecting shares your wallet address. It does not make a payment.' : 'Install an EVM wallet such as MetaMask, or open DataVault in your wallet browser. Return here once it is ready.'}</p>
      {hasProvider ? <button className="dv-button" type="button" disabled={pending} onClick={() => void setup()}>{pending ? 'Connecting…' : 'Connect wallet to get started'}</button>
        : <a className="dv-button" href="https://metamask.io/download/" target="_blank" rel="noreferrer">Get a wallet</a>}
    </div>}
    {primaryWallet && !correctNetwork && <div className="dv-demo-next">
      <p>Your wallet needs {monadTestnet.name}. Approve the network change in your wallet. This does not send tokens.</p>
      <button className="dv-button" type="button" disabled={pending} onClick={() => void setup()}>{pending ? 'Switching…' : `Switch to ${monadTestnet.name}`}</button>
    </div>}
    {address && correctNetwork && <div className="dv-demo-funds">
      <p role="status">{balance?.error ?? (balance?.amount !== undefined
        ? `Wallet balance: ${formatEther(balance.amount)} test MON.${balance.amount === 0n ? ' Get free test tokens before paying.' : ' Review the query price and gas in your wallet before paying.'}`
        : 'Checking your test-token balance…')}</p>
      {monadTestnet.chainId === 10143 && <div className="dv-demo-actions">
        <a className="dv-button secondary" href="https://faucet.monad.xyz/" target="_blank" rel="noreferrer">Get free test MON</a>
        <button className="dv-button secondary" type="button" onClick={() => void copyAddress()}>Copy wallet address</button>
        <button className="dv-button secondary" type="button" disabled={!balance} onClick={() => setRefresh(value => value + 1)}>Check balance again</button>
      </div>}
      {copyStatus && <p role="status">{copyStatus}</p>}
    </div>}
    {error && <p role="alert">{error} You can retry the setup step above.</p>}
  </section>;
}
