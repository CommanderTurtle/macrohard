import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, Play, RefreshCw, Square, Unplug } from "lucide-react";
import { request, type Connection } from "./api";
import { controlConfig, download } from "./workflow";
import type { MacrohelpEnvironment } from "./environment";

export default function HostPanel({ env, append, capture }: {env:MacrohelpEnvironment;append:(text:string)=>void;capture:(slot:string,x:number,y:number)=>void}) {
  const [mode,setMode]=useState<'overlay'|'backend'>('overlay');
  const [overlay,setOverlay]=useState<Connection>({url:'http://127.0.0.1:7778',token:''});
  const [backend,setBackend]=useState<Connection>({url:'http://127.0.0.1:7777',token:'',backend:true});
  const [connected,setConnected]=useState(false), [poll,setPoll]=useState(false), [busy,setBusy]=useState(false);
  const [response,setResponse]=useState(''), [error,setError]=useState(''), [tasks,setTasks]=useState<{name:string}[]>([]);
  const [name,setName]=useState(''),[delay,setDelay]=useState('0'),[point,setPoint]=useState('1');
  const [payload,setPayload]=useState('{\n  "menu": 2,\n  "inputs": ["Z", "{type hello}", "P"],\n  "no_replace": true\n}');
  const [temporary,setTemporary]=useState(true);
  const running=useRef(false),abort=useRef(new AbortController());
  const epoch=useRef(0);
  const connection=mode==='overlay'?overlay:backend;
  useEffect(()=>{abort.current=new AbortController();return()=>abort.current.abort()},[]);
  const showError=(e:unknown)=>setError(e instanceof Error?e.message:String(e));
  const call=async(path:string,body?:unknown)=>{
    if(running.current)return;
    const generation=epoch.current;
    running.current=true;setBusy(true);setError('');
    try { const value=await request(connection,path,body,abort.current.signal);if(generation!==epoch.current)return;setResponse(JSON.stringify(value,null,2));return value; }
    catch(e){if(generation===epoch.current)showError(e);return undefined}finally{running.current=false;setBusy(false)}
  };
  const refresh=async()=>{
    const value=await call(mode==='overlay'?'/v1/state':'/tasks');
    if(value&&mode==='backend')setTasks((Array.isArray(value)?value:value.tasks||[]).map((t:{name?:string;id?:string})=>({name:t.name||t.id||''})).filter((t:{name:string})=>t.name));
  };
  useEffect(()=>{if(!poll||!connected)return;const id=setInterval(()=>{if(!document.hidden&&!running.current)void refresh()},5000);return()=>clearInterval(id)},[poll,connected,mode,overlay,backend]);
  const update=(value:Connection)=>{epoch.current++;setConnected(false);setPoll(false);(mode==='overlay'?setOverlay:setBackend)(value)};
  const disconnect=()=>{epoch.current++;setConnected(false);setPoll(false);setOverlay(v=>({...v,token:''}));setBackend(v=>({...v,token:''}));setTasks([]);setResponse('');setError('')};
  const connect=async()=>{const value=await call(mode==='overlay'?'/v1/health':'/health');setConnected(!!value);if(value)void refresh()};
  const workflowRequest=useMemo(()=>{try{return {body:{menu:2,inputs:['Z',env.script,'P'],config:controlConfig(env),no_replace:temporary},error:''}}catch(e){return {body:null,error:e instanceof Error?e.message:String(e)}}},[env,temporary]);
  const stop=async()=>{setError('');try{const value=await request(connection,mode==='overlay'?'/v1/stop':'/stop',{},abort.current.signal);setResponse(JSON.stringify(value,null,2))}catch(e){showError(e)}};
  return <section className="host-test"><div className="host-grid modern-host">
    <section className="host-panel"><header><strong>Connection</strong><span className={`status ${connected?'ok':''}`}>{connected?'connected':'disconnected'}</span></header>
      <div className="view-tabs host-tabs"><button className={mode==='overlay'?'active':''} onClick={()=>{epoch.current++;setMode('overlay');setConnected(false);setPoll(false)}}>Overlay · 7778</button><button className={mode==='backend'?'active':''} onClick={()=>{epoch.current++;setMode('backend');setConnected(false);setPoll(false)}}>Tasks · 7777</button></div>
      <div className="host-form"><label>Server<input aria-label="Server URL" value={connection.url} onChange={e=>update({...connection,url:e.target.value})} spellCheck={false}/></label><label>{mode==='overlay'?'Bearer token':'Daemon key (if configured)'}<input aria-label="Connection token" type="password" autoComplete="off" value={connection.token} onChange={e=>update({...connection,token:e.target.value})}/></label></div>
      <div className="host-actions"><button disabled={busy||(mode==='overlay'&&!overlay.token.trim())} onClick={connect}><Check size={15}/> Connect</button><button disabled={busy||!connected} onClick={refresh}><RefreshCw size={15}/> Refresh</button><button onClick={disconnect}><Unplug size={15}/> Disconnect</button></div>
      <label className="check-line"><input type="checkbox" checked={poll} disabled={!connected} onChange={e=>setPoll(e.target.checked)}/> Refresh {mode==='overlay'?'state':'tasks'} every 5 seconds</label>
      <p className="muted">Keys stay in memory. Enable CORS in the local server for browser access; allow local-network access when the browser asks.</p>
      {mode==='overlay'?<><div className="host-actions">{['schema','help','coords','state'].map(route=><button disabled={busy||!connected} key={route} onClick={()=>call('/v1/'+route)}>{route}</button>)}</div><div className="host-actions"><select aria-label="Capture point" value={point} onChange={e=>setPoint(e.target.value)}>{Array.from({length:16},(_,i)=><option key={i+1} value={i+1}>Point {i+1}</option>)}</select><button disabled={busy||!connected} onClick={async()=>{const v=await call('/v1/coords');if(v&&typeof v.x==='number'&&typeof v.y==='number')capture(point,v.x,v.y)}}>Capture coordinates</button></div></>:<><div className="host-form"><label>Saved task<input aria-label="Saved task" value={name} onChange={e=>setName(e.target.value)}/></label><label>Delay (seconds)<input type="number" min="0" max="86400" value={delay} onChange={e=>setDelay(e.target.value)}/></label></div><div className="host-actions"><button disabled={busy||!connected||!name.trim()} onClick={()=>{const n=Number(delay);if(!Number.isInteger(n)||n<0||n>86400){setError('Delay must be an integer from 0 to 86400');return}call('/run',{task:name,delay:n,loop:1})}}><Play size={15}/> Run saved task</button><button disabled={!name.trim()} onClick={()=>{if(/[{}\r\n]/.test(name)){setError('Task name contains workflow delimiters');return}append(`{play ${name}}`)}}>Add play command</button></div><div className="task-list">{tasks.map(t=><button key={t.name} className={name===t.name?'selected':''} onClick={()=>setName(t.name)}>{t.name}</button>)}</div></>}
      <div className="host-actions"><button className="danger" disabled={!connected} onClick={stop}><Square size={14}/> Stop all</button></div>
    </section>
    <section className="host-panel"><header><strong>{mode==='overlay'?'Overlay control':'Response'}</strong></header>
      {mode==='overlay'&&<><label className="check-line"><input type="checkbox" checked={temporary} onChange={e=>setTemporary(e.target.checked)}/> no-replace · temporary configuration</label><div className="host-actions"><button disabled={!!workflowRequest.error} onClick={()=>setPayload(JSON.stringify(workflowRequest.body,null,2))}>Use current workflow</button><button onClick={()=>download(payload,'macrohelp-request.json','application/json')}><Download size={14}/> JSON</button><button onClick={()=>navigator.clipboard.writeText(payload).catch(showError)}><Copy size={14}/> Copy</button></div>{workflowRequest.error&&<p className="diagnostics bad">{workflowRequest.error}</p>}<textarea className="control-payload" aria-label="Overlay request JSON" value={payload} onChange={e=>setPayload(e.target.value)} spellCheck={false}/><div className="host-actions"><button className="primary" disabled={busy||!connected} onClick={()=>{try{const value=JSON.parse(payload);call('/v1/control',value)}catch(e){showError(e)}}}><Play size={15}/> Send control</button></div></>}
      {error&&<p className="diagnostics bad" role="alert">{error}</p>}<pre aria-label="Server response">{response||'No request sent.'}</pre>
    </section>
  </div></section>;
}
