import {useEffect,useState} from 'react';
export default function ServiceStatus(){
 const [status,setStatus]=useState<{availabilityPercent:number|null;coverage:number;monitoring:string}|null>(null);
 useEffect(()=>{const abort=new AbortController();fetch('/api/status',{signal:abort.signal}).then(async response=>{if(!response.ok)throw Error();return response.json();}).then(data=>{if(!abort.signal.aborted)setStatus(data);}).catch(()=>{});return()=>abort.abort();},[]);
 const measured=status&&typeof status.availabilityPercent==='number'&&Number.isFinite(status.availabilityPercent);
 const monitoringOff=status?.monitoring==='disabled';
 return <div className="dv-card"><span>API availability</span><strong>{measured?`${status.availabilityPercent!.toFixed(2)}%`:'Unknown'}</strong><small>{status?`${Math.round(status.coverage*100)}% sampled, 24h UTC`:'Monitoring unknown'}</small><small aria-label={`${monitoringOff?'Monitoring off. ':''}Worker API only. Model and payments are not monitored.`}>{monitoringOff?'Monitoring off, API only':'API only'}</small></div>;
}
