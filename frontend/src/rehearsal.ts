// Explicit development entry, excluded from the production index.html bundle.
// Uses only disposable unlocked Hardhat accounts on the loopback test chain.
async function start() {
  if (!import.meta.env.DEV || !['127.0.0.1', 'localhost'].includes(location.hostname)
    || Number(import.meta.env.VITE_CHAIN_ID) !== 31337) throw new Error('Local rehearsal requires a loopback development server and chain 31337.');
  let id = 0;
  async function rpc(method: string, params: unknown[] = []) {
    const response = await fetch('http://127.0.0.1:8545', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
    const result = await response.json();
    if (result.error) throw new Error(result.error.message);
    return result.result;
  }
  if (Number(await rpc('eth_chainId')) !== 31337) throw new Error('Unexpected RPC chain.');
  const accounts: string[] = await rpc('eth_accounts');
  if (accounts.length < 2) throw new Error('Local test accounts unavailable.');
  const listeners = new Map<string, Set<(...args: any[]) => void>>();
  const params = new URLSearchParams(location.search);
  let selected = params.get('account') === 'buyer' ? accounts[1] : accounts[0];
  const provider = {
    async request({ method, params = [] }: { method: string; params?: unknown[] }) {
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [selected];
      if (method === 'wallet_switchEthereumChain') {
        if (Number((params[0] as { chainId: string }).chainId) !== 31337) throw new Error('Only the local chain is available.');
        return null;
      }
      if (method === 'eth_sendTransaction' && (params[0] as { from: string }).from.toLowerCase() !== selected.toLowerCase()) throw new Error('Test account changed.');
      return rpc(method, params);
    },
    on(event: string, listener: (...args: any[]) => void) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event)!.add(listener); },
    removeListener(event: string, listener: (...args: any[]) => void) { listeners.get(event)?.delete(listener); },
  };
  Object.assign(window, { ethereum: provider });
  const banner = document.createElement('div');
  banner.style.cssText = 'padding:10px;background:#fff2c7;color:#493300;position:relative;z-index:100;font:14px sans-serif';
  banner.append('LOCAL TEST WALLET, disposable Hardhat accounts only. ');
  const label = document.createElement('label'); label.textContent = 'Test account ';
  const select = document.createElement('select');
  for (const [value, text] of [[accounts[0], 'Owner'], [accounts[1], 'Buyer']]) {
    const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option);
  }
  select.value = selected;
  select.onchange = () => { selected = select.value; listeners.get('accountsChanged')?.forEach(listener => listener([selected])); };
  label.append(select); banner.append(label); document.body.prepend(banner);
  const route = params.get('route') ?? '/';
  history.replaceState(null, '', route.startsWith('/') && !route.startsWith('//') ? route : '/');
  await import('./main');
}
start().catch(error => { document.getElementById('root')!.textContent = error.message; });
