import {LitElement,html,nothing} from 'lit';
import {customElement,property,state} from 'lit/decorators.js';
import {HomeAssistant,LovelaceCardEditor} from 'custom-card-helpers';
import {CardConfig,PowerNode,PowerConnection,PowerPort,PowerDiagram,
  PORT_KINDS,PORT_SIDES,PORT_DIRECTIONS,parseDiagram,cloneDiagram,makeId,portCompatible,
  validateDiagram,Point,PortKind,PortDirection,PortSide} from './model';
import {PRESETS,createNode,demoDiagram} from './presets';
import {renderDiagram,CanvasEvents,connectionPoints,pathOf,resolveEdgePower,flowDescription} from './render';
import {universalStyles} from './styles';
import {SVG_MODELS,defaultModel} from './device-art';
import type {SensorKind} from './entities';
import './entity-picker';
import {compactLegacyDiagram} from './migration';

type Drag = {kind:'node'|'waypoint'|'pan';id?:string;index?:number;pointerId?:number;
  screenStart?:Point;activated?:boolean;
  start:Point;origin:Point;moved?:boolean;
  nodeElement?:SVGGElement;preview?:Point};
@customElement('universal-power-flow-card-editor')
export class UniversalPowerFlowEditor extends LitElement implements LovelaceCardEditor{
  static styles=universalStyles;
  @property({attribute:false}) public hass!:HomeAssistant;
  @state() private config:CardConfig={type:'custom:universal-power-flow-card'};
  @state() private nodeId='';
  @state() private edgeId='';
  @state() private preset='inverter';
  @state() private portStart?:{node:string;port:string};
  @state() private notice='';
  @state() private zoom=1;
  @state() private pan:Point={x:0,y:0};
  @state() private expanded=false;
  @state() private pendingDeleteId='';
  @state() private revision=0;
  private lastEmittedSignature='';
  private lastInboundSignature='';
  private localEditsPending=false;
  private drag?:Drag;
  private pendingRoutes=0;
  private readonly instanceId=makeId('editor');
  private readonly moveListener=(ev:PointerEvent)=>this.onPointerMove(ev);
  private readonly upListener=(ev:PointerEvent)=>this.onPointerUp(ev);
  // Recovery from pointerup lost by the host HA settings dialog or window.
  // A subsequent click always begins from an idle state, never a stale drag.
  private readonly recoveryListener=()=>{if(this.drag)this.endDrag();};
  private readonly keyboardListener=(ev:KeyboardEvent)=>this.onKeyDown(ev);
  private readonly blurListener=()=>this.endDrag();
  private readonly visibilityListener=()=>{if(document.visibilityState==='hidden')this.endDrag();};
  private readonly fullscreenListener=()=>{
    const surface=this.renderRoot.querySelector<HTMLElement>('.upfc-fullscreen-workspace');
    if(this.expanded&&surface&&!surface.matches(':fullscreen')){
      this.endDrag();
      this.expanded=false;
      this.requestUpdate();
    }
  };
  public connectedCallback():void{
    super.connectedCallback();
    window.addEventListener('keydown',this.keyboardListener);
    window.addEventListener('pointerdown',this.recoveryListener,{capture:true});
    window.addEventListener('blur',this.blurListener);
    document.addEventListener('visibilitychange',this.visibilityListener);
    document.addEventListener('fullscreenchange',this.fullscreenListener);
  }
  public disconnectedCallback():void{
    super.disconnectedCallback();
    window.removeEventListener('keydown',this.keyboardListener);
    window.removeEventListener('pointerdown',this.recoveryListener,true);
    window.removeEventListener('blur',this.blurListener);
    document.removeEventListener('visibilitychange',this.visibilityListener);
    document.removeEventListener('fullscreenchange',this.fullscreenListener);
    this.endDrag();
  }
  private onKeyDown(ev:KeyboardEvent):void{
    if(ev.key==='Escape' && this.expanded){this.closeExpanded();return;}
    if(ev.key!=='Delete'&&ev.key!=='Backspace')return;
    if(!this.expanded && !this.matches(':focus-within'))return;
    const target=ev.target as HTMLElement|null;
    if(target?.closest('input,textarea,select,[contenteditable=true]')||
       this.shadowRoot?.activeElement?.closest('input,textarea,select,[contenteditable=true]'))return;
    if(!this.nodeId&&!this.edgeId)return;
    ev.preventDefault();this.deleteSelected();
  }
  private openExpanded():void{
    this.endDrag();
    const surface=this.renderRoot.querySelector<HTMLElement>('.upfc-fullscreen-workspace');
    if(!surface){this.notice='Fullscreen surface unavailable';this.requestUpdate();return;}
    // A CSS position:fixed descendant is clipped by Home Assistant's own
    // dialog/transform. The native Fullscreen API moves the editor into the
    // browser top layer, independent of all HA modal bounds and stacking contexts.
    surface.removeAttribute('hidden');
    this.expanded=true;
    this.notice='';
    this.requestUpdate();
    if(!surface.requestFullscreen){
      this.expanded=false;
      this.notice='Этот браузер не поддерживает полноэкранный редактор';
      this.requestUpdate();
      return;
    }
    void surface.requestFullscreen().catch((error:unknown)=>{
      this.expanded=false;
      this.notice='Полноэкранный режим заблокирован браузером: '+String(error);
      this.requestUpdate();
    });
  }
  private closeExpanded():void{
    this.endDrag();
    const surface=this.renderRoot.querySelector<HTMLElement>('.upfc-fullscreen-workspace');
    this.expanded=false;
    this.localEditsPending=false;
    this.requestUpdate();
    if(surface?.matches(':fullscreen'))void document.exitFullscreen().catch(()=>{});
  }
  private startDrag(next:Drag):void{
    this.endDrag();
    this.drag=next;
    window.addEventListener('pointermove',this.moveListener,{capture:true});
    window.addEventListener('pointerup',this.upListener,{capture:true});
    window.addEventListener('pointercancel',this.upListener,{capture:true});
  }
  private endDrag(commit=false):void{
    const previous=this.drag;
    if(this.pendingRoutes){cancelAnimationFrame(this.pendingRoutes);this.pendingRoutes=0;}
    // On interruption (ESC/blur/pointercancel) roll back provisional geometry.
    // On pointerup, commit the same geometry as displayed during dragging.
    if(!commit&&previous?.kind==='node'&&previous.id){
      const node=this.diagram.nodes.find(n=>n.id===previous.id);
      if(node){node.x=previous.origin.x;node.y=previous.origin.y;}
    }
    if(previous?.nodeElement?.isConnected)previous.nodeElement.removeAttribute('transform');
    this.drag=undefined;
    window.removeEventListener('pointermove',this.moveListener,true);
    window.removeEventListener('pointerup',this.upListener,true);
    window.removeEventListener('pointercancel',this.upListener,true);
    if(!commit&&previous?.moved)this.requestUpdate();
  }
  private refreshLiveWires():void{
    const canvas=this.svgEl;
    if(!canvas||!this.drag)return;
    // Recompute collision-aware routes with the current in-memory node positions.
    // Only change attributes in the existing SVG; do not recreate nodes under the mouse.
    const occupied:Point[][]=[];
    for(const edge of this.diagram.connections){
      const points=connectionPoints(this.diagram,edge,occupied);
      const g=[...canvas.querySelectorAll<SVGGElement>('g[data-upfc-edge]')]
        .find(element=>element.dataset.upfcEdge===edge.id);
      if(!g)continue;
      if(!points){g.style.visibility='hidden';continue;}
      occupied.push(points);
      g.style.visibility='';
      const d=pathOf(points);
      g.querySelectorAll<SVGPathElement>('path').forEach(path=>path.setAttribute('d',d));
      const motion=g.querySelector<SVGAnimateMotionElement>('animateMotion');
      if(motion){
        const watts=resolveEdgePower(this.diagram,edge,this.hass).watts;
        motion.setAttribute('path',pathOf(watts!==null&&watts<0?[...points].reverse():points));
      }

      const lengths=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y));
      let remaining=lengths.reduce((a,b)=>a+b,0)/2;
      let middle=points[Math.floor(points.length/2)];
      for(let i=0;i<lengths.length;i++){
        if(remaining<=lengths[i]){
          const t=lengths[i]?remaining/lengths[i]:0;
          middle={x:points[i].x+(points[i+1].x-points[i].x)*t,
                  y:points[i].y+(points[i+1].y-points[i].y)*t};
          break;
        }
        remaining-=lengths[i];
      }
      const label=g.querySelector<SVGGElement>('g.upfc-edge-label');
      label?.setAttribute('transform',`translate(${middle.x} ${middle.y-12})`);
    }
  }
  private scheduleLiveWires():void{
    if(this.pendingRoutes)return;
    this.pendingRoutes=requestAnimationFrame(()=>{
      this.pendingRoutes=0;
      this.refreshLiveWires();
    });
  }
  private readonly canvasEvents:CanvasEvents={
    nodeDown:(ev,id)=>this.onNodeDown(ev,id),
    nodeClick:(ev,id)=>this.onNodeClick(ev,id),
    portDown:(ev,node,port)=>this.onPortDown(ev,node,port),
    edgeClick:id=>{this.nodeId='';this.edgeId=id;this.portStart=undefined;this.pendingDeleteId='';this.requestUpdate();},
    edgeDoubleClick:(ev,id)=>this.onEdgeDoubleClick(ev,id),
    waypointDown:(ev,id,index)=>this.onWaypointDown(ev,id,index),
    backgroundDown:ev=>this.onBackgroundDown(ev),
    wheel:ev=>{if(ev.ctrlKey){ev.preventDefault();this.setZoom(this.zoom*(ev.deltaY<0?1.15:0.87));}}
  };
  public setConfig(c:CardConfig):void{
    // HA replays the config we just emitted. Do not destroy the active picker,
    // drag position, search focus, selected node or full-screen dialog.
    const incomingSignature=JSON.stringify(c);
    if(incomingSignature===this.lastEmittedSignature||incomingSignature===this.lastInboundSignature)return;
    // Prevent obsolete HA config echoes from replacing in-progress local edits.
    if(this.expanded&&this.localEditsPending)return;
    this.lastInboundSignature=incomingSignature;
    try{
      const original=c.diagram?parseDiagram(c.diagram):demoDiagram();
      const migrated=compactLegacyDiagram(original);
      this.config={...c,diagram:migrated.diagram,library:c.library??[]};
      this.revision++;
      this.requestUpdate();
      this.notice=migrated.warning??(migrated.changed?
        `Old +/- wires unified into ${migrated.mergedEdges} logical circuits; save any edit to persist`:'');
    }catch(e){this.notice=String(e);this.config={type:'custom:universal-power-flow-card',diagram:demoDiagram()};this.revision++;this.requestUpdate();}
  }
  private get diagram():PowerDiagram{return this.config.diagram??demoDiagram();}
  private get selectedNode():PowerNode|undefined{return this.diagram.nodes.find(n=>n.id===this.nodeId);}
  private get selectedEdge():PowerConnection|undefined{return this.diagram.connections.find(e=>e.id===this.edgeId);}
  private emit():void{
    for(const n of this.diagram.nodes){
      if(n.powerFlowEdgeId&&!this.diagram.connections.some(e=>e.id===n.powerFlowEdgeId &&
        (e.from.node===n.id||e.to.node===n.id)))delete n.powerFlowEdgeId;
    }
    // Never expose mutable live arrays to Home Assistant. Publishing a fresh
    // snapshot and incrementing a reactive revision updates both editor and preview.
    const next:CardConfig={...this.config,diagram:cloneDiagram(this.diagram)};
    this.config=next;
    this.lastEmittedSignature=JSON.stringify(next);
    this.localEditsPending=true;
    this.revision++;
    this.requestUpdate();
    this.dispatchEvent(new CustomEvent('config-changed',{
      detail:{config:next},bubbles:true,composed:true
    }));
  }
  private get svgEl():SVGSVGElement|null{
    return this.expanded?
      this.renderRoot.querySelector('.upfc-fullscreen-workspace svg.upfc-canvas'):
      this.renderRoot.querySelector('.upfc-compact-workspace svg.upfc-canvas');
  }
  private at(ev:PointerEvent|DragEvent|MouseEvent):Point{
    const el=this.svgEl;if(!el)return{x:0,y:0};
    const mat=el.getScreenCTM();
    if(!mat)return{x:0,y:0};
    return new DOMPoint(ev.clientX,ev.clientY).matrixTransform(mat.inverse());
  }
  private snap(n:number):number{return Math.round(n/12)*12;}
  private onNodeClick(ev:MouseEvent,id:string):void{
    if(ev.button!==0)return;
    ev.stopPropagation();
    this.nodeId=id;this.edgeId='';this.portStart=undefined;this.pendingDeleteId='';
    this.requestUpdate();
  }
  private onNodeDown(ev:PointerEvent,id:string):void{
    if(ev.button!==0)return;
    // Do not cancel pointerdown, because the following native click is needed.
    ev.stopPropagation();
    this.nodeId=id;this.edgeId='';this.portStart=undefined;this.pendingDeleteId='';
    // Selection will refresh on click/pointerup; do not rerender SVG beneath
    // the active pointer just before starting a drag.
    const n=this.selectedNode;if(!n)return;
    this.startDrag({kind:'node',id,pointerId:ev.pointerId,
      screenStart:{x:ev.clientX,y:ev.clientY},start:this.at(ev),origin:{x:n.x,y:n.y},
      nodeElement:ev.currentTarget as SVGGElement});
  }
  private onWaypointDown(ev:PointerEvent,id:string,index:number):void{
    ev.preventDefault();ev.stopPropagation();
    this.edgeId=id;this.nodeId='';this.requestUpdate();
    const p=this.diagram.connections.find(e=>e.id===id)?.waypoints?.[index];
    if(!p)return;
    this.startDrag({kind:'waypoint',id,index,pointerId:ev.pointerId,start:this.at(ev),origin:{...p}});
  }
  private onBackgroundDown(ev:PointerEvent):void{
    if(ev.button!==0)return;
    if(ev.shiftKey){
      ev.preventDefault();
      this.startDrag({kind:'pan',pointerId:ev.pointerId,start:{x:ev.clientX,y:ev.clientY},origin:{...this.pan}});
    }else{this.nodeId='';this.edgeId='';this.portStart=undefined;this.pendingDeleteId='';this.requestUpdate();}
  }
  private onPointerMove(ev:PointerEvent):void{
    if(!this.drag||(this.drag.pointerId!==undefined&&ev.pointerId!==this.drag.pointerId))return;
    // Missing pointerup (focus switch, shadow-root changes) must never leave
    // the editor in a permanently dragging/frozen state.
    if(ev.buttons===0){this.onPointerUp(ev);return;}
    if(!this.drag.activated&&this.drag.kind!=='pan'&&this.drag.screenStart){
      const distance=Math.hypot(ev.clientX-this.drag.screenStart.x,ev.clientY-this.drag.screenStart.y);
      if(distance<6)return; // a mouse click must not move/snap an existing node
      this.drag.activated=true;
    }
    if(this.drag.kind==='pan'){
      const el=this.svgEl;
      if(!el)return;
      const rect=el.getBoundingClientRect(),dx=ev.clientX-this.drag.start.x,dy=ev.clientY-this.drag.start.y;
      const k=Math.max(this.diagram.width/this.zoom/rect.width,this.diagram.height/this.zoom/rect.height);
      this.pan={x:this.drag.origin.x-dx*k,y:this.drag.origin.y-dy*k};
      this.requestUpdate();
      return;
    }
    const p=this.at(ev),dx=p.x-this.drag.start.x,dy=p.y-this.drag.start.y;
    if(this.drag.kind==='node'){
      const n=this.diagram.nodes.find(x=>x.id===this.drag?.id);
      if(n){
        const x=this.snap(this.drag.origin.x+dx),y=this.snap(this.drag.origin.y+dy);
        if(n.x!==x||n.y!==y){
          // Keep graph geometry and visible node in sync without a Lit render.
          n.x=x;n.y=y;
          this.drag.preview={x,y};
          this.drag.moved=x!==this.drag.origin.x||y!==this.drag.origin.y;
          const element=this.drag.nodeElement;
          if(element?.isConnected)element.setAttribute('transform',
            `translate(${x-this.drag.origin.x} ${y-this.drag.origin.y})`);
          this.scheduleLiveWires();
        }
      }
    }else{
      const e=this.diagram.connections.find(x=>x.id===this.drag?.id),index=this.drag.index??-1;
      if(e?.waypoints?.[index]){
        const x=this.snap(this.drag.origin.x+dx),y=this.snap(this.drag.origin.y+dy);
        if(e.waypoints[index].x!==x||e.waypoints[index].y!==y){
          e.waypoints[index]={x,y};this.drag.moved=true;this.requestUpdate();
        }
      }
    }
  }
  private onPointerUp(ev:PointerEvent):void{
    if(!this.drag||(this.drag.pointerId!==undefined&&ev.pointerId!==this.drag.pointerId))return;
    if(ev.type==='pointercancel'){this.endDrag();return;}
    const hasTopologyChange=this.drag.kind!=='pan'&&!!this.drag.moved;
    this.endDrag(true);
    if(hasTopologyChange)this.emit();
    else this.requestUpdate();
  }
  private onPortDown(ev:PointerEvent,node:string,port:string):void{
    ev.preventDefault();ev.stopPropagation();
    if(!this.portStart){this.portStart={node,port};this.nodeId=node;this.edgeId='';this.notice='Select the target port to connect';this.requestUpdate();return;}
    const start=this.portStart;this.portStart=undefined;
    if(start.node===node&&start.port===port){this.requestUpdate();return;}
    const a=this.diagram.nodes.find(n=>n.id===start.node)?.ports.find(p=>p.id===start.port);
    const b=this.diagram.nodes.find(n=>n.id===node)?.ports.find(p=>p.id===port);
    if(!a||!b||start.node===node||!portCompatible(a,b)){
      this.notice='Incompatible electrical ports (AC/DC/polarity/direction) or same device';this.requestUpdate();return;
    }
    if(this.diagram.connections.some(e=>
      (e.from.node===start.node&&e.from.port===start.port&&e.to.node===node&&e.to.port===port)||
      (e.from.node===node&&e.from.port===port&&e.to.node===start.node&&e.to.port===start.port))){
      this.notice='These ports are already connected';this.requestUpdate();return;
    }
    const edge:PowerConnection={id:makeId('edge'),from:start,to:{node,port}};
    this.diagram.connections.push(edge);
    this.edgeId=edge.id;this.nodeId='';this.notice='Connection created; assign a power sensor in inspector';
    this.emit();
  }
  private addNode(type=this.preset,point?:Point):void{
    let n:PowerNode;
    if(type.startsWith('lib:')){
      const saved=this.config.library?.find(x=>x.id===type.slice(4));
      if(!saved)return;
      n=JSON.parse(JSON.stringify(saved)) as PowerNode;
      n.id=makeId('node');delete n.stateEntity;delete n.socEntity;
    }else n=createNode(type,point?.x??100+this.diagram.nodes.length*18,point?.y??100+this.diagram.nodes.length*18);
    if(point){n.x=this.snap(point.x);n.y=this.snap(point.y);}
    this.diagram.nodes.push(n);this.nodeId=n.id;this.edgeId='';this.emit();
  }
  private drop(ev:DragEvent):void{
    ev.preventDefault();
    const type=ev.dataTransfer?.getData('text/plain')??'';
    if(type&&this.isPreset(type))this.addNode(type,this.at(ev));
  }
  private isPreset(type:string):boolean{return type in PRESETS||(type.startsWith('lib:')&&!!this.config.library?.find(x=>x.id===type.slice(4)));}
  private dragPalette(ev:DragEvent,type:string):void{ev.dataTransfer?.setData('text/plain',type);}
  private changeNode<K extends keyof PowerNode>(key:K,value:PowerNode[K]):void{
    const n=this.selectedNode;if(!n)return;
    n[key]=value;this.emit();
  }
  private changeEdge<K extends keyof PowerConnection>(key:K,value:PowerConnection[K]):void{
    const e=this.selectedEdge;if(!e)return;
    e[key]=value;this.emit();
  }
  private changePort(index:number,key:keyof PowerPort,value:string):void{
    const p=this.selectedNode?.ports[index];if(!p)return;
    if(key==='id')return;
    (p as unknown as Record<string,string>)[key]=value;
    const errors=validateDiagram(this.diagram);
    if(errors.length)this.notice=errors.slice(0,2).join('; ');
    this.emit();
  }
  private addPort():void{
    const n=this.selectedNode;if(!n)return;
    if(n.ports.length>=30){this.notice='Maximum 30 ports per component';this.requestUpdate();return;}
    n.ports.push({id:makeId('port'),label:'NEW',kind:'signal',direction:'both',side:'right'});this.emit();
  }
  private removePort(portId:string):void{
    const n=this.selectedNode;if(!n)return;
    n.ports=n.ports.filter(p=>p.id!==portId);
    this.diagram.connections=this.diagram.connections.filter(e=>!(e.from.node===n.id&&e.from.port===portId)&&!(e.to.node===n.id&&e.to.port===portId));
    this.emit();
  }
  private deleteSelected():void{
    if(this.nodeId){
      const id=this.nodeId;
      const count=this.diagram.connections.filter(e=>e.from.node===id||e.to.node===id).length;
      if(count>0&&this.pendingDeleteId!==id){
        this.pendingDeleteId=id;
        this.notice=`Удаление этого устройства также удалит ${count} подключённых линий. Нажми Delete selected ещё раз для подтверждения.`;
        this.requestUpdate();
        return;
      }
      this.diagram.nodes=this.diagram.nodes.filter(n=>n.id!==id);
      this.diagram.connections=this.diagram.connections.filter(e=>e.from.node!==id&&e.to.node!==id);
      this.nodeId='';
    }else if(this.edgeId){
      this.diagram.connections=this.diagram.connections.filter(e=>e.id!==this.edgeId);this.edgeId='';
    }else return;
    this.pendingDeleteId='';
    this.notice='Selected item deleted';
    this.emit();
  }
  private bend():void{
    const e=this.selectedEdge;if(!e)return;
    const points=connectionPoints(this.diagram,e);
    if(!points?.length){this.notice='Route is blocked. Move a component or use a different port.';return;}
    if(!e.waypoints?.length){
      // Start from the actual auto route, rather than creating a diagonal shortcut.
      e.waypoints=points.slice(1,-1).map(p=>({...p}));
      this.notice='Bends are now editable: drag blue handles directly on the wire';
    }else{
      const a=points[0],b=points[points.length-1];
      e.waypoints.push({x:this.snap((a.x+b.x)/2),y:this.snap((a.y+b.y)/2)});
    }
    this.emit();
  }
  private onEdgeDoubleClick(ev:MouseEvent,id:string):void{
    ev.preventDefault();ev.stopPropagation();
    const e=this.diagram.connections.find(x=>x.id===id);if(!e)return;
    const points=connectionPoints(this.diagram,e);if(!points||points.length<2)return;
    const click=this.at(ev);
    let best=0,dist=Infinity;
    for(let i=0;i<points.length-1;i++){
      const a=points[i],b=points[i+1];
      const dx=b.x-a.x,dy=b.y-a.y;
      const t=(dx*dx+dy*dy)>0?Math.max(0,Math.min(1,((click.x-a.x)*dx+(click.y-a.y)*dy)/(dx*dx+dy*dy))):0;
      const ds=Math.hypot(click.x-(a.x+dx*t),click.y-(a.y+dy*t));
      if(ds<dist){best=i;dist=ds;}
    }
    const interior=points.slice(1,-1).map(p=>({...p}));
    interior.splice(best,0,{x:this.snap(click.x),y:this.snap(click.y)});
    e.waypoints=interior;
    this.edgeId=id;this.nodeId='';
    this.notice='Bend added: drag the blue handle to route the wire';
    this.emit();
  }
  private savePreset():void{
    const n=this.selectedNode;if(!n)return;
    const entry=JSON.parse(JSON.stringify(n)) as PowerNode;
    entry.id=makeId('template');entry.x=0;entry.y=0;
    delete entry.stateEntity;delete entry.socEntity;
    const list=this.config.library??[];
    this.config.library=[...list,entry];this.notice='Reusable component saved into this card configuration';
    this.emit();
  }
  private exportJson():void{
    const json=JSON.stringify({diagram:this.diagram,library:this.config.library??[]},null,2);
    const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='universal-power-flow-diagram.json';a.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  private async importJson(ev:Event):Promise<void>{
    const input=ev.currentTarget as HTMLInputElement,file=input.files?.[0];
    if(!file)return;
    try{
      if(file.size>2_000_000)throw Error('Import file is too large (2 MB limit)');
      const raw=JSON.parse(await file.text()) as Record<string,unknown>;
      const d=parseDiagram(raw.diagram??raw);
      this.config={...this.config,diagram:d};
      if(Array.isArray(raw.library)){
        this.config.library=(raw.library as PowerNode[]).filter(x=>x&&typeof x.name==='string'&&Array.isArray(x.ports)).slice(0,100);
      }
      this.nodeId='';this.edgeId='';this.notice='Diagram imported';this.emit();
    }catch(e){this.notice=`Import failed: ${String(e)}`;this.requestUpdate();}
    input.value='';
  }
  private setZoom(value:number):void{
    this.zoom=Math.max(0.45,Math.min(4,Math.round(value*100)/100));
    this.requestUpdate();
  }
  private templateOptions(){
    return html`
      ${Object.entries(PRESETS).map(([type,p])=>html`<option value="${type}">${p.name}</option>`)}
      ${(this.config.library??[]).map(n=>html`<option value="lib:${n.id}">★ ${n.name}</option>`)}
    `;
  }
  private entityInput(key:string,kind:SensorKind,value:string|undefined,update:(id:string)=>void){
    return html`<upfc-entity-picker .hass=${this.hass} .kind=${kind}
      .fieldKey=${key} .value=${value??''}
      @entity-selected=${(ev:CustomEvent<{value:string}>)=>{
        ev.stopPropagation();update(ev.detail.value);
      }}></upfc-entity-picker>`;
  }
  private renderNodeFlowDiagnostic(n:PowerNode){
    const links=this.diagram.connections.filter(e=>{
      if(e.from.node!==n.id&&e.to.node!==n.id)return false;
      const portId=e.from.node===n.id?e.from.port:e.to.port;
      return n.ports.find(p=>p.id===portId)?.kind!=='signal';
    });
    const selected=n.powerFlowEdgeId?links.find(e=>e.id===n.powerFlowEdgeId):links.length===1?links[0]:undefined;
    return html`<div class="upfc-diagnostic" aria-live="polite">
      <strong>Проверка анимации устройства</strong>
      <p>Назначено: ${n.powerEntity||'датчик мощности не выбран'}</p>
      <p>Показание: ${n.powerEntity?(this.hass?.states[n.powerEntity]?.state??'сущность отсутствует'):'—'}
        ${n.powerEntity?String(this.hass?.states[n.powerEntity]?.attributes?.unit_of_measurement??''):''}</p>
      <p>Силовых соединений: ${links.length}. Применяемая линия: ${selected?.name||selected?.id||'не определена'}.</p>
      <p class="upfc-subtle">${!n.powerEntity?'Для анимации нужна числовая мощность (W, kW, MW).':
         !selected?'При нескольких линиях выбери конкретную связь ниже.':
         flowDescription(this.diagram,selected,this.hass,this.config.animation!==false)}</p>
    </div>`;
  }
  private renderNodeInspector(n:PowerNode){
    return html`<h4>Equipment · ${n.type}</h4>
      <label>Label</label><input .value=${n.name} @change=${(e:Event)=>this.changeNode('name',(e.currentTarget as HTMLInputElement).value)}/>
      <label>SVG-модель оборудования</label>
      <select .value=${n.modelId??defaultModel(n.type)}
        @change=${(e:Event)=>this.changeNode('modelId',(e.currentTarget as HTMLSelectElement).value)}>
        ${Object.entries(SVG_MODELS).map(([id,label])=>html`<option value="${id}">${label}</option>`)}
      </select>
      <label>Мощность устройства (W/kW/MW) — запускает поток при одной связи</label>
      ${this.entityInput('node-power:'+n.id,'power',n.powerEntity,v=>this.changeNode('powerEntity',v))}
      <label>Как трактовать положительную мощность</label>
      <select .value=${n.powerPositive??'out'} @change=${(e:Event)=>
        this.changeNode('powerPositive',(e.currentTarget as HTMLSelectElement).value as 'out'|'in')}>
        <option value="out">Положительное = отдаёт энергию (разряд батареи)</option>
        <option value="in">Положительное = принимает энергию (заряд батареи)</option>
      </select>
      <label>К какой линии применять мощность устройства</label>
      <select .value=${n.powerFlowEdgeId??''}
        @change=${(ev:Event)=>this.changeNode('powerFlowEdgeId',
          (ev.currentTarget as HTMLSelectElement).value||undefined)}>
        <option value="">Автоматически, если одна силовая линия</option>
        ${this.diagram.connections.filter(e=>e.from.node===n.id||e.to.node===n.id)
          .filter(e=>n.ports.find(p=>p.id===(e.from.node===n.id?e.from.port:e.to.port))?.kind!=='signal')
          .map(e=>html`<option value="${e.id}">${e.name||e.id}: ${e.from.node} → ${e.to.node}</option>`)}
      </select>
      ${this.renderNodeFlowDiagnostic(n)}
      <label>SOC аккумулятора (%)</label>
      ${this.entityInput('node-soc:'+n.id,'soc',n.socEntity,v=>this.changeNode('socEntity',v))}
      <label>Напряжение (V)</label>
      ${this.entityInput('node-voltage:'+n.id,'voltage',n.voltageEntity,v=>this.changeNode('voltageEntity',v))}
      <label>Ток (A)</label>
      ${this.entityInput('node-current:'+n.id,'current',n.currentEntity,v=>this.changeNode('currentEntity',v))}
      <label>Дополнительный статус</label>
      ${this.entityInput('node-state:'+n.id,'any',n.stateEntity,v=>this.changeNode('stateEntity',v))}
      <div class="upfc-port-row">
        <div><label>Rotation</label><select .value=${String(n.rotation??0)} @change=${(e:Event)=>this.changeNode('rotation',Number((e.currentTarget as HTMLSelectElement).value))}>
          ${[0,90,180,270].map(x=>html`<option value="${x}">${x}°</option>`)}</select></div>
        <div><label>Scale</label><input type="number" min=".5" max="3" step=".1" .value=${String(n.scale??1)}
          @change=${(e:Event)=>this.changeNode('scale',Math.min(3,Math.max(.5,Number((e.currentTarget as HTMLInputElement).value))))}/></div>
      </div>
      <div class="upfc-port-row">
        <div><label>Width</label><input type="number" min="80" max="500" .value=${String(n.width??156)}
          @change=${(e:Event)=>this.changeNode('width',Math.min(500,Math.max(80,Number((e.currentTarget as HTMLInputElement).value))))}/></div>
        <div><label>Height</label><input type="number" min="60" max="500" .value=${String(n.height??106)}
          @change=${(e:Event)=>this.changeNode('height',Math.min(500,Math.max(60,Number((e.currentTarget as HTMLInputElement).value))))}/></div>
      </div>
      <h4>Electrical ports</h4>
      ${n.ports.map((p,i)=>html`<div class="upfc-list">
        <label>${p.id}</label>
        <input .value=${p.label} @change=${(e:Event)=>this.changePort(i,'label',(e.currentTarget as HTMLInputElement).value)}/>
        <div class="upfc-port-row">
          <select .value=${p.kind} @change=${(e:Event)=>this.changePort(i,'kind',(e.currentTarget as HTMLSelectElement).value as PortKind)}>
            ${PORT_KINDS.map(kind=>html`<option value="${kind}">${kind}</option>`)}</select>
          <select .value=${p.direction} @change=${(e:Event)=>this.changePort(i,'direction',(e.currentTarget as HTMLSelectElement).value as PortDirection)}>
            ${PORT_DIRECTIONS.map(dir=>html`<option value="${dir}">${dir}</option>`)}</select>
          <select .value=${p.side} @change=${(e:Event)=>this.changePort(i,'side',(e.currentTarget as HTMLSelectElement).value as PortSide)}>
            ${PORT_SIDES.map(side=>html`<option value="${side}">${side}</option>`)}</select>
          <button class="danger" @click=${()=>this.removePort(p.id)}>Remove port</button>
        </div>
      </div>`)}
      <div class="upfc-toolbar">
        <button @click=${()=>this.addPort()}>+ Port</button>
        <button @click=${()=>this.savePreset()}>Save as component</button>
      </div>
      <button class="danger" @click=${()=>this.deleteSelected()}>Delete equipment</button>`;
  }
  private renderEdgeInspector(e:PowerConnection){
    return html`<h4>Electrical connection</h4>
      <div class="upfc-subtle">${e.from.node}/${e.from.port} → ${e.to.node}/${e.to.port}</div>
      <label>Label (optional)</label><input .value=${e.name??''}
        @change=${(ev:Event)=>this.changeEdge('name',(ev.currentTarget as HTMLInputElement).value)}/>
      <label>Power sensor (W/kW/MW)</label>${this.entityInput('edge-power:'+e.id,'power',e.powerEntity,v=>this.changeEdge('powerEntity',v))}
      <div class="upfc-diagnostic" aria-live="polite">
        <strong>Текущее состояние потока</strong>
        <p>${flowDescription(this.diagram,e,this.hass,this.config.animation!==false)}</p>
        <p>Источник: ${resolveEdgePower(this.diagram,e,this.hass).origin==='edge'?'датчик линии':
          resolveEdgePower(this.diagram,e,this.hass).origin==='node'?'датчик оборудования':'не назначен'}</p>
      </div>
      <label><input type="checkbox" style="width:auto" .checked=${!!e.invert}
        @change=${(ev:Event)=>this.changeEdge('invert',(ev.currentTarget as HTMLInputElement).checked)}/> Reverse positive direction</label>
      <p class="upfc-subtle">Мощность линии имеет приоритет. Если её нет, используется мощность устройства только при одной энергосвязи. Нулевое или недоступное измерение останавливает анимацию.</p>
      <h4>Wire routing</h4>
      <label>Mode</label>
      <select .value=${e.route??'auto'} @change=${(ev:Event)=>{
        e.route=(ev.currentTarget as HTMLSelectElement).value as PowerConnection['route'];
        e.waypoints=[];this.emit();
      }}>
        <option value="auto">Auto · separated lanes</option>
        <option value="horizontal">Horizontal corridors</option>
        <option value="vertical">Vertical corridors</option>
        <option value="straight">Straight line</option>
      </select>
      <label>Lane displacement (SVG units)</label>
      <input type="range" min="-180" max="180" step="6" .value=${String(e.routeOffset??0)}
        @input=${(ev:Event)=>{e.routeOffset=Number((ev.currentTarget as HTMLInputElement).value);this.requestUpdate();}}
        @change=${(ev:Event)=>this.changeEdge('routeOffset',Number((ev.currentTarget as HTMLInputElement).value))}/>
      <div class="upfc-subtle">Offset: ${e.routeOffset??0}</div>
      <div class="upfc-port-row">
        <div><label>Stroke width</label><input type="number" min="1" max="12" step="1"
          .value=${String(e.lineWidth??3)} @change=${(ev:Event)=>this.changeEdge('lineWidth',Math.min(12,Math.max(1,Number((ev.currentTarget as HTMLInputElement).value))))}/></div>
        <div><label>Color</label><input type="color" .value=${e.color??'#f8b84e'}
          @change=${(ev:Event)=>this.changeEdge('color',(ev.currentTarget as HTMLInputElement).value)}/></div>
        <div><label>Flow speed</label><input type="number" min=".25" max="8" step=".25"
          .value=${String(e.animationSpeed??1)} @change=${(ev:Event)=>this.changeEdge('animationSpeed',Math.min(8,Math.max(.25,Number((ev.currentTarget as HTMLInputElement).value))))}/></div>
        <div><label>Sensor sign</label><button @click=${()=>this.changeEdge('invert',!e.invert)}>${e.invert?'Reversed':'Normal'}</button></div>
      </div>
      <div class="upfc-toolbar">
        <button @click=${()=>this.bend()}>${e.waypoints?.length?'+ Bend point':'Edit bends'}</button>
        <button @click=${()=>{e.waypoints=[];this.emit();}}>Reset auto bends</button>
        <button @click=${()=>this.changeEdge('color',undefined)}>Auto color</button>
      </div>
      ${!connectionPoints(this.diagram,e)?html`<p class="upfc-warning">⚠ Automatic routing blocked by equipment. Move equipment or edit port positions; the connection is preserved.</p>`:nothing}
      <p class="upfc-subtle">Double-click any wire to add a draggable handle. Manual bends override obstacle avoidance; review them for intersections. Wire values are not summed automatically.</p>
      <button class="danger" @click=${()=>this.deleteSelected()}>🗑 Delete connection</button>`;
  }
  private selectItem(raw:string):void{
    this.nodeId=raw.startsWith('node:')?raw.slice(5):'';
    this.edgeId=raw.startsWith('edge:')?raw.slice(5):'';
    this.portStart=undefined;
    this.pendingDeleteId='';
    this.requestUpdate();
  }
  private renderWorkspace(){
    // Keep the workspace render dependent on every committed mutation.
    void this.revision;
    const d=this.diagram,errors=validateDiagram(d);
    const view={x:this.pan.x,y:this.pan.y,width:d.width/this.zoom,height:d.height/this.zoom};
    const blocked=d.connections.filter(e=>!connectionPoints(d,e)&&!e.waypoints?.length).length;
    return html`
      <div class="upfc-toolbar upfc-primarybar">
        <label>Equipment</label>
        <select .value=${this.preset} @change=${(ev:Event)=>this.preset=(ev.currentTarget as HTMLSelectElement).value}>
          ${this.templateOptions()}
        </select>
        <button class="primary" @click=${()=>this.addNode()}>+ Add equipment</button>
        <label>Selected</label>
        <select .value=${this.nodeId?'node:'+this.nodeId:this.edgeId?'edge:'+this.edgeId:''}
          @change=${(ev:Event)=>this.selectItem((ev.currentTarget as HTMLSelectElement).value)}>
          <option value="">— select an item —</option>
          <optgroup label="Equipment">${d.nodes.map(n=>html`<option value="node:${n.id}">${n.name}</option>`)}</optgroup>
          <optgroup label="Wires">${d.connections.map(e=>html`<option value="edge:${e.id}">${e.name??e.id} · ${e.from.node} → ${e.to.node}</option>`)}</optgroup>
        </select>
        <button class="danger" ?disabled=${!this.nodeId&&!this.edgeId} @click=${()=>this.deleteSelected()}>
          ${this.nodeId&&this.pendingDeleteId===this.nodeId?'⚠ Confirm delete':'🗑 Delete selected'}</button>
        ${this.pendingDeleteId?html`<button type="button" @click=${()=>{this.pendingDeleteId='';this.notice='';this.requestUpdate();}}>Cancel delete</button>`:nothing}
      </div>
      <details class="upfc-palette"><summary>Equipment palette — click to add or drag onto canvas</summary>
        <div class="upfc-toolbar">${Object.entries(PRESETS).map(([type,p])=>html`
          <button draggable="true" title="Drag onto canvas to position" @dragstart=${(ev:DragEvent)=>this.dragPalette(ev,type)}
            @click=${()=>this.addNode(type)}>${p.name}</button>`)}</div>
      </details>
      <div class="upfc-toolbar">
        <span>Zoom</span>
        <button @click=${()=>this.setZoom(this.zoom*1.3)}>+</button>
        <span>${Math.round(this.zoom*100)}%</span>
        <button @click=${()=>this.setZoom(this.zoom/1.3)}>−</button>
        <button @click=${()=>{this.zoom=1;this.pan={x:0,y:0};this.requestUpdate();}}>Reset view</button>
        <button @click=${()=>this.exportJson()}>Export JSON</button>
        <label>Import JSON <input type="file" accept=".json,application/json" @change=${(ev:Event)=>void this.importJson(ev)}/></label>
      </div>
      ${this.portStart?html`<p>Select second port for ${this.portStart.node}/${this.portStart.port}</p>`:nothing}
      ${this.notice?html`<p class="upfc-warning">${this.notice}</p>`:nothing}
      ${errors.length?html`<p class="upfc-warning">Topology errors: ${errors.slice(0,8).join(' • ')}</p>`:nothing}
      ${blocked?html`<p class="upfc-warning">⚠ ${blocked} connection(s) cannot be routed around equipment. Select the wire to adjust layout or ports.</p>`:nothing}
      <p class="upfc-subtle">Drag devices by their body • click one port then another to connect • double-click wire for bends • Shift+drag background to pan • Ctrl+wheel to zoom • Delete key removes selection</p>
      <div class="upfc-layout">
        <div class="upfc-canvas-shell" @dragover=${(ev:DragEvent)=>ev.preventDefault()}
          @drop=${(ev:DragEvent)=>this.drop(ev)}>
          ${renderDiagram({diagram:d,hass:this.hass,instanceId:this.instanceId,edit:true,
            selectedNode:this.nodeId,selectedEdge:this.edgeId,events:this.canvasEvents,view})}
        </div>
        <aside class="upfc-inspector">
          <h4>Card settings</h4>
          <label>Title</label><input .value=${this.config.title??''} @change=${(ev:Event)=>{
            this.config.title=(ev.currentTarget as HTMLInputElement).value;this.emit();}}/>
          <label><input type="checkbox" style="width:auto" .checked=${this.config.animation!==false}
            @change=${(ev:Event)=>{this.config.animation=(ev.currentTarget as HTMLInputElement).checked;this.emit();}}/> Animate measured power flow</label>
          ${this.selectedNode?this.renderNodeInspector(this.selectedNode):
            this.selectedEdge?this.renderEdgeInspector(this.selectedEdge):
            html`<p class="upfc-subtle">Select equipment or wire from canvas, or select its name above. The Delete button then becomes active.</p>
              <p class="upfc-subtle">${d.nodes.length} devices · ${d.connections.length} wires · ${this.config.library?.length??0} templates</p>
              <button @click=${()=>{if(window.confirm('Replace layout with telecom demo?')){
                this.config.diagram=demoDiagram();this.nodeId='';this.edgeId='';this.emit();}}}>Restore telecom example</button>`}
        </aside>
      </div>

    `;
  }
  protected render(){
    // A fixed in-component workspace prevents nested native HTML modal conflicts.
    return html`<ha-card class="upfc-editor-card">
      <div class="upfc-toolbar">
        <h3>Universal Power Flow Designer</h3>
        <button type="button" class="primary" @click=${()=>this.openExpanded()}>⛶ Full-screen editor</button>
      </div>
      <div class="upfc-compact-workspace" ?hidden=${this.expanded}>
        ${!this.expanded?this.renderWorkspace():nothing}
      </div>
      <div class="upfc-dialog upfc-fullscreen-workspace" ?hidden=${!this.expanded}
        role="dialog" aria-modal="false" aria-label="Universal Power Flow Designer">
        ${this.expanded?html`
          <div class="upfc-toolbar">
            <h3>Universal Power Flow Designer · full screen</h3>
            <button type="button" @click=${()=>this.closeExpanded()}>✕ Close full screen</button>
          </div>
          ${this.renderWorkspace()}
        `:nothing}
      </div>
    </ha-card>`;
  }
}
