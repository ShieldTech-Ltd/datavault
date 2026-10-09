import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useWallet } from '../lib/wallet';
import { CONTRACT_ADDRESS } from '../lib/contract';
import { monadTestnet } from '../lib/network';
import { AccountClient, type AccountState } from './account-client';
const Account = createContext<{ client: AccountClient; state: AccountState } | null>(null);
export function useOptionalAccount() { return useContext(Account); }
export function AccountProvider({ children }: { children: ReactNode }) {
  const { primaryWallet, correctNetwork } = useWallet();
  const controller = useRef<AccountClient>();
  if (!controller.current) controller.current = new AccountClient(monadTestnet.chainId, CONTRACT_ADDRESS);
  const client = controller.current;
  const [state, setState] = useState(client.state);
  useEffect(() => client.subscribe(setState), [client]);
  useEffect(() => { void client.setWallet(primaryWallet, correctNetwork); }, [client, primaryWallet, correctNetwork]);
  // Hide the old profile immediately, including the render before the effect runs.
  const matching = correctNetwork && state.session?.account.address === primaryWallet?.address.toLowerCase();
  return <Account.Provider value={{ client, state: { ...state, session: matching ? state.session : null } }}>{children}</Account.Provider>;
}
export function useAccount() { const value = useContext(Account); if (!value) throw new Error('Account provider missing'); return value; }
