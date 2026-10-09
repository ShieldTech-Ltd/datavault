import {useEffect,useState} from 'react';
export default function ServiceStatus(){
 const [status,setStatus]=useState<{availabilityPercent:number|null;coverage:number;monitoring:string}|null>(null);
 useEffect(()=>{const abort=new AbortController();fetch('/api/status',{signal:abort.signal}).then(async response=>{if(!response.ok)throw Error();return response.json();}).then(data=>{if(!abort.signal.aborted)setStatus(data);}).catch(()=>{});return()=>abort.abort();},[]);
 const measured=status&&typeof status.availabilityPercent==='number'&&Number.isFinite(status.availabilityPercent);
 return <div className="dv-card"><span>Worker API availability</span><strong>{measured?`${status.availabilityPercent!.toFixed(2)}%`:'Unknown'}</strong><small>{status?`${Math.round(status.coverage*100)}% observation coverage (24h UTC)`:'Monitoring unknown'}</small><small>{status?.monitoring==='disabled'?'Monitoring disabled. ':''}Model and payments are not monitored.</small></div>;
}
