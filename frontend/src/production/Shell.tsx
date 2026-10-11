import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { SquaresFour, Stack, ChatCircleText, Wallet, Receipt, ChartBar, Key, Gear, List, X, ShieldCheck } from './icons';
import ConnectButton from '../components/ConnectButton';
import { monadTestnet } from '../lib/network';
const links = [['/', 'Dashboard', SquaresFour], ['/collections', 'My Collections', Stack], ['/query', 'Ask & Query', ChatCircleText], ['/earnings', 'Earnings', Wallet], ['/transactions', 'Transactions', Receipt], ['/analytics', 'Analytics', ChartBar], ['/api-access', 'API Access', Key], ['/settings', 'Settings', Gear]] as const;
export default function Shell() {
  const [menu, setMenu] = useState(false);
  useEffect(() => { document.documentElement.classList.remove('dark'); }, []);
  return <div className="dv-shell dv-light-reference">
    <a className="dv-skip" href="#dashboard-content">Skip to content</a>
    <header className="dv-reference-topbar">
      <NavLink className="dv-reference-brand" to="/"><img src="/assets/light/brand.png" alt=""/><strong>DataVault</strong><span>beta</span></NavLink>
      <nav aria-label="Product navigation"><NavLink to="/" end>Home</NavLink><NavLink to="/collections">Collections</NavLink><NavLink to="/marketplace">Marketplace</NavLink><a href="https://github.com/ShieldTech-Ltd/datavault/blob/master/docs/api-contract.md" target="_blank" rel="noreferrer">Docs</a><NavLink to="/analytics">Dashboard</NavLink></nav>
      <div className="dv-reference-wallet"><span className="dv-network"><ShieldCheck size={16} weight="fill"/>{monadTestnet.name}</span><ConnectButton /></div>
      <button className="dv-icon-button dv-mobile-menu" aria-label={menu ? 'Close navigation' : 'Open navigation'} aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X size={22}/> : <List size={22}/>}</button>
    </header>
    <aside className={`dv-sidebar ${menu ? 'open' : ''}`}>
      <nav aria-label="Main navigation">{links.map(([to,label,Icon]) => <NavLink key={to} to={to} end={to === '/'} onClick={() => setMenu(false)}><Icon size={19} weight="duotone"/><span>{label}</span></NavLink>)}</nav>
      <img className="dv-sidebar-art" src="/assets/light/sidebar.png" alt=""/>
      <div className="dv-reference-pro"><strong>DataVault Pro</strong><p>Advanced plans and API keys are not available yet.</p><button disabled>Upgrade unavailable</button></div>
    </aside>
    <div className="dv-main"><main id="dashboard-content" className="dv-content" tabIndex={-1}><Outlet/></main><footer className="dv-footer"><span>DataVault · {monadTestnet.name} · Test tokens</span><NavLink to="/manage">Register a collection</NavLink></footer></div>
  </div>;
}