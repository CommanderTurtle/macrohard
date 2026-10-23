import { useEffect, useMemo, useRef, useState } from "react";
import { ReactFlow, Background, BackgroundVariant, Controls, MiniMap, Handle, Position, MarkerType, type Node, type NodeProps, type NodeChange, type ReactFlowInstance } from "@xyflow/react";
import { Braces, Copy, Maximize2, Plus, Search, Trash2, X } from "lucide-react";
import { commands, replaceCommand, type Command, type Layout } from "./workflow";

interface PaletteItem { category: string; label: string; token: string; detail: string }
interface StepData extends Record<string, unknown> { command: Command; index: number; tone: string }
function tone(op: string) {
  if (["if","else","endif"].includes(op)) return "amber";
  if (op === "wait") return "green";
  if (["rgd","rgdclip","rgdappend","profile","play"].includes(op)) return "pink";
  if (["point","pt","zone","zonebuf","screen","left","right","middle","click"].includes(op)) return "cyan";
  return "violet";
}
function StepNode({ data, selected }: NodeProps<Node<StepData>>) {
  return <section className={`step-node tone-${data.tone} ${selected ? "selected" : ""}`}>
    <Handle type="target" position={Position.Left} isConnectable={false}/>
    <header><span className="step-dot"/><strong>{data.command.op || "command"}</strong><small>#{String(data.index+1).padStart(2,"0")}</small></header>
    <div className="step-body"><span className="socket-label">flow</span><pre>{data.command.body || data.command.raw}</pre><span className="socket-label end">next</span></div>
    <Handle type="source" position={Position.Right} isConnectable={false}/>
  </section>;
}
const nodeTypes = { step: StepNode };
export default function WorkflowCanvas({ script, change, palette, positions, setPositions }: { script: string; change: (script: string)=>void; palette: PaletteItem[];positions:Layout;setPositions:React.Dispatch<React.SetStateAction<Layout>> }) {
  const parsed = useMemo(()=>commands(script),[script]);
  const [sizes,setSizes] = useState<Record<string,{width:number;height:number}>>({});
  const [selected,setSelected] = useState<number|null>(null);
  const [draft,setDraft] = useState("");
  const [search,setSearch] = useState("");
  const [popup,setPopup] = useState<{x:number;y:number;flow:{x:number;y:number}}|null>(null);
  const [api,setApi] = useState<ReactFlowInstance<Node<StepData>>|null>(null);
  const [grid,setGrid] = useState(true), [minimap,setMinimap] = useState(true);
  const wrapper = useRef<HTMLDivElement>(null), searchRef = useRef<HTMLInputElement>(null);
  const command = selected === null ? undefined : parsed.items[selected];
  useEffect(()=>setDraft(command?.raw||""),[command?.raw,selected]);
  useEffect(()=>{if(popup)searchRef.current?.focus()},[popup]);
  const nodes: Node<StepData>[] = useMemo(()=>parsed.items.map((command,index)=>({ id:`step-${index}`,type:"step",position:positions[`step-${index}`]||{x:60+(index%4)*310,y:60+Math.floor(index/4)*210},measured:sizes[`step-${index}`],data:{command,index,tone:tone(command.op)},selected:selected===index })),[parsed,positions,sizes,selected]);
  const edges = parsed.items.slice(1).map((_,i)=>({ id:`flow-${i}`,source:`step-${i}`,target:`step-${i+1}`,type:"smoothstep",markerEnd:{type:MarkerType.ArrowClosed},style:{stroke:"#8999b6",strokeWidth:1.6} }));
  const add = (text: string, at?: {x:number;y:number})=>{
    if(at){const next={...positions};commands(text).items.forEach((_,i)=>next[`step-${parsed.items.length+i}`]={x:at.x+i*290,y:at.y});setPositions(next)}
    change(script + (script.trim()?"\n":"") + text);setSelected(parsed.items.length);setPopup(null);setSearch("");
  };
  const remove = ()=>{if(command){change(replaceCommand(script,command,""));setSelected(null);setPositions({})}};
  const duplicate = ()=>{if(command){change(replaceCommand(script,command,command.raw+"\n"+command.raw));setSelected((selected||0)+1);setPositions({})}};
  const changes = (items: NodeChange<Node<StepData>>[])=>{
    if(items.some(item=>item.type==="position"))setPositions(prev=>{const next={...prev};for(const item of items)if(item.type==="position"&&item.position)next[item.id]=item.position;return next});
    if(items.some(item=>item.type==="dimensions"))setSizes(prev=>{const next={...prev};let changed=false;for(const item of items)if(item.type==="dimensions"&&item.dimensions&&(next[item.id]?.width!==item.dimensions.width||next[item.id]?.height!==item.dimensions.height)){next[item.id]=item.dimensions;changed=true}return changed?next:prev});
  };
  const openPalette = (x: number,y: number)=>{
    const rect = wrapper.current?.getBoundingClientRect();if(!rect||!api)return;
    setSearch("");setPopup({x:Math.max(8,Math.min(x-rect.left,rect.width-300)),y:Math.max(8,Math.min(y-rect.top,rect.height-340)),flow:api.screenToFlowPosition({x,y})});
  };
  return <div className="command-workspace">
    <div className="command-canvas" ref={wrapper} tabIndex={0} aria-label="Workflow canvas" onKeyDown={e=>{
      if((e.target as HTMLElement).closest("input,textarea"))return;
      if(e.key.toLowerCase()==="f"){e.preventDefault();api?.fitView({padding:.16,duration:250})}
      if(e.key.toLowerCase()==="g")setGrid(v=>!v);
      if(e.key.toLowerCase()==="m")setMinimap(v=>!v);
      if(e.key==="Delete"||e.key==="Backspace"){e.preventDefault();remove()}
      if(e.key==="Escape")setPopup(null);
      if(e.key===" "&&wrapper.current){e.preventDefault();const r=wrapper.current.getBoundingClientRect();openPalette(r.left+80,r.top+80)}
    }} onDoubleClick={e=>{if(!(e.target as HTMLElement).closest(".react-flow__node,button,input,textarea"))openPalette(e.clientX,e.clientY)}}
      onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="copy"}} onDrop={e=>{e.preventDefault();const text=e.dataTransfer.getData("application/x-macrohard-token");if(text&&api)add(text,api.screenToFlowPosition({x:e.clientX,y:e.clientY}))}}>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onInit={setApi} onNodesChange={changes} onNodeClick={(_,node)=>setSelected(node.data.index)} onNodeDragStart={(_,node)=>setSelected(node.data.index)}
        onPaneClick={()=>{setSelected(null);setPopup(null)}} onPaneContextMenu={e=>{e.preventDefault();openPalette(e.clientX,e.clientY)}} deleteKeyCode={null}
        minZoom={.15} maxZoom={2} defaultViewport={{x:10,y:30,zoom:.82}} panOnScroll selectionOnDrag snapToGrid snapGrid={[16,16]} proOptions={{hideAttribution:true}}>
        {grid&&<Background variant={BackgroundVariant.Dots} color="#45516a" gap={24}/>}
        <Controls showInteractive={false}/>{minimap&&<MiniMap pannable zoomable nodeColor="#7f91b0" maskColor="rgba(10,12,20,.8)"/>}
      </ReactFlow>
      <div className="canvas-tools"><button title="Fit canvas (F)" onClick={()=>api?.fitView({padding:.16,duration:250})}><Maximize2 size={15}/></button><button title="Add command" onClick={()=>{const r=wrapper.current!.getBoundingClientRect();openPalette(r.left+80,r.top+80)}}><Plus size={15}/></button><button onClick={()=>{setPositions({});api?.fitView({padding:.16,duration:250})}}>Arrange</button></div>
      <div className="canvas-status"><span>{parsed.items.length} commands · {parsed.items.filter(t=>t.op==="wait").length} explicit waits</span><span>Text order → execution · F fit · G grid · M map</span></div>
      {popup&&<section className="command-popup" style={{left:popup.x,top:popup.y}} aria-label="Add command"><div className="search"><Search size={14}/><input ref={searchRef} aria-label="Find command" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Add command…" onKeyDown={e=>{if(e.key==="Escape")setPopup(null)}}/><button onClick={()=>setPopup(null)} title="Close command search"><X size={14}/></button></div><div>{palette.filter(p=>`${p.label} ${p.token}`.toLowerCase().includes(search.toLowerCase())).map(p=><button key={p.category+p.token} title={p.detail} onClick={()=>add(p.token,popup.flow)}><span>{p.label}</span><code>{p.token}</code></button>)}</div></section>}
    </div>
    <aside className="inspector"><header><Braces size={15}/><strong>{command?`Command ${(selected||0)+1}`:"Workflow"}</strong></header>
      {command?<><div className="inspector-actions"><button onClick={duplicate}><Copy size={14}/> Duplicate</button><button onClick={remove}><Trash2 size={14}/> Delete</button></div><label>Command<textarea spellCheck={false} rows={8} value={draft} onChange={e=>setDraft(e.target.value)}/></label><button className="primary" onClick={()=>change(replaceCommand(script,command,draft))}>Apply command</button></>:<p className="muted">Select a node to edit. Double-click the canvas or drag a command from the library.</p>}
      <label>Source<textarea aria-label="Workflow source" spellCheck={false} value={script} onChange={e=>change(e.target.value)} rows={16}/></label>
      <div className={parsed.errors.length?"diagnostics bad":"diagnostics"}>{parsed.errors.length?parsed.errors.map((e,i)=><p key={i}>{e}</p>):"Balanced workflow"}</div>
    </aside>
  </div>;
}
