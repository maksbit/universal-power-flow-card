import {LitElement,html,nothing} from 'lit';
import {customElement,property,state} from 'lit/decorators.js';
import {fireEvent,HomeAssistant,LovelaceCardEditor} from 'custom-card-helpers';
import {CardConfig,PowerNode,PowerConnection,PowerPort,PowerDiagram,
  PORT_KINDS,PORT_SIDES,PORT_DIRECTIONS,parseDiagram,cloneDiagram,makeId,portCompatible,
  validateDiagram,Point,PortKind,PortDirection,PortSide} from './model';
import {PRESETS,createNode,demoDiagram} from './presets';
import {renderDiagram,CanvasEvents,connectionPoints} from './render';
import {universalStyles} from './styles';

type Drag = {kind:'node'|'waypoint'|'pan';id?:string;index?:number;
  start:Point;origin:Point};
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
  private drag?:Drag;
  private readonly instanceId=makeId('editor');
  private readonly canvasEvents:CanvasEvents={
    nodeDown:(ev,id)=>this.onNodeDown(ev,id),
    portDown:(ev,node,port)=>this.onPortDown(ev,node,port),
    edgeClick:id=>{this.nodeId='';this.edgeId=id;this.portStart=undefined;},
    waypointDown:(ev,id,index)=>this.onWaypointDown(ev,id,index),
    backgroundDown:ev=>this.onBackgroundDown(ev),
    pointerMove:ev=>this.onPointerMove(ev),
    pointerUp:ev=>this.onPointerUp(ev),
    wheel:ev=>{if(ev.ctrlKey){ev.preventDefault();this.setZoom(this.zoom*(ev.deltaY<0?1.15:0.87));}}
  };
  public setConfig(c:CardConfig):void{
    try{
      this.config={...c,diagram:c.diagram?parseDiagram(c.diagram):demoDiagram(),library:c.library??[]};
      this.notice='';
    }catch(e){this.notice=String(e);this.config={type:'custom:universal-power-flow-card',diagram:demoDiagram()};}
  }
  private get diagram():PowerDiagram{return this.config.diagram??demoDiagram();}
  private get selectedNode():PowerNode|undefined{return this.diagram.nodes.find(n=>n.id===this.nodeId);}
  private get selectedEdge():PowerConnection|undefined{return this.diagram.connections.find(e=>e.id===this.edgeId);}
  private emit():void{
    // Config is the single source of truth; fire only after meaningful user edits.
    this.config={...this.config,diagram:cloneDiagram(this.diagram)};
    fireEvent(this,'config-changed',{config:this.config});
  }
  private get svgEl():SVGSVGElement|null{return this.renderRoot.querySelector('svg.upfc-canvas');}
  private at(ev:PointerEvent|DragEvent):Point{
    const el=this.svgEl;if(!el)return{x:0,y:0};
    const mat=el.getScreenCTM();
    if(!mat)return{x:0,y:0};
    return new DOMPoint(ev.clientX,ev.clientY).matrixTransform(mat.inverse());
  }
  private snap(n:number):number{return Math.round(n/12)*12;}
  private onNodeDown(ev:PointerEvent,id:string):void{
    if(ev.button!==0)return;
    ev.preventDefault();ev.stopPropagation();
    this.nodeId=id;this.edgeId='';this.portStart=undefined;
    const n=this.selectedNode;if(!n)return;
    this.drag={kind:'node',id,start:this.at(ev),origin:{x:n.x,y:n.y}};
    this.svgEl?.setPointerCapture?.(ev.pointerId);
  }
  private onWaypointDown(ev:PointerEvent,id:string,index:number):void{
    ev.preventDefault();ev.stopPropagation();
    this.edgeId=id;this.nodeId='';
    const p=this.diagram.connections.find(e=>e.id===id)?.waypoints?.[index];
    if(!p)return;
    this.drag={kind:'waypoint',id,index,start:this.at(ev),origin:{...p}};
    this.svgEl?.setPointerCapture?.(ev.pointerId);
  }
  private onBackgroundDown(ev:PointerEvent):void{
    if(ev.button!==0)return;
    if(ev.shiftKey){
      ev.preventDefault();
      this.drag={kind:'pan',start:{x:ev.clientX,y:ev.clientY},origin:{...this.pan}};
      this.svgEl?.setPointerCapture?.(ev.pointerId);
    }else{this.nodeId='';this.edgeId='';this.portStart=undefined;}
  }
  private onPointerMove(ev:PointerEvent):void{
    if(!this.drag)return;
    if(this.drag.kind==='pan'){
      const el=this.svgEl;
      if(!el)return;
      const rect=el.getBoundingClientRect(),dx=ev.clientX-this.drag.start.x,dy=ev.clientY-this.drag.start.y;
      const k=Math.max(this.diagram.width/this.zoom/rect.width,this.diagram.height/this.zoom/rect.height);
      this.pan={x:this.drag.origin.x-dx*k,y:this.drag.origin.y-dy*k};
      return;
    }
    const p=this.at(ev),dx=p.x-this.drag.start.x,dy=p.y-this.drag.start.y;
    if(this.drag.kind==='node'){
      const n=this.diagram.nodes.find(x=>x.id===this.drag?.id);
      if(n){n.x=this.snap(this.drag.origin.x+dx);n.y=this.snap(this.drag.origin.y+dy);this.requestUpdate();}
    }else{
      const e=this.diagram.connections.find(x=>x.id===this.drag?.id),index=this.drag.index??-1;
      if(e?.waypoints?.[index]){
        e.waypoints[index]={x:this.snap(this.drag.origin.x+dx),y:this.snap(this.drag.origin.y+dy)};
        this.requestUpdate();
      }
    }
  }
  private onPointerUp(_ev:PointerEvent):void{
    if(!this.drag)return;
    const hasTopologyChange=this.drag.kind!=='pan';
    this.drag=undefined;
    if(hasTopologyChange)this.emit();
  }
  private onPortDown(ev:PointerEvent,node:string,port:string):void{
    ev.preventDefault();ev.stopPropagation();
    if(!this.portStart){this.portStart={node,port};this.nodeId=node;this.edgeId='';this.notice='Select the target port to connect';return;}
    const start=this.portStart;this.portStart=undefined;
    if(start.node===node&&start.port===port)return;
    const a=this.diagram.nodes.find(n=>n.id===start.node)?.ports.find(p=>p.id===start.port);
    const b=this.diagram.nodes.find(n=>n.id===node)?.ports.find(p=>p.id===port);
    if(!a||!b||start.node===node||!portCompatible(a,b)){
      this.notice='Incompatible electrical ports (AC/DC/polarity/direction) or same device';return;
    }
    if(this.diagram.connections.some(e=>
      (e.from.node===start.node&&e.from.port===start.port&&e.to.node===node&&e.to.port===port)||
      (e.from.node===node&&e.from.port===port&&e.to.node===start.node&&e.to.port===start.port))){
      this.notice='These ports are already connected';return;
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
    if(n.ports.length>=30){this.notice='Maximum 30 ports per component';return;}
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
      this.diagram.nodes=this.diagram.nodes.filter(n=>n.id!==id);
      this.diagram.connections=this.diagram.connections.filter(e=>e.from.node!==id&&e.to.node!==id);
      this.nodeId='';
    }else if(this.edgeId){
      this.diagram.connections=this.diagram.connections.filter(e=>e.id!==this.edgeId);this.edgeId='';
    }else return;
    this.emit();
  }
  private bend():void{
    const e=this.selectedEdge;if(!e)return;
    const points=connectionPoints(this.diagram,e);if(!points?.length)return;
    const a=points[0],b=points[points.length-1];
    e.waypoints=[...(e.waypoints??[]),{x:this.snap((a.x+b.x)/2),y:this.snap((a.y+b.y)/2)}];
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
    }catch(e){this.notice=`Import failed: ${String(e)}`;}
    input.value='';
  }
  private setZoom(value:number):void{
    this.zoom=Math.max(0.45,Math.min(4,Math.round(value*100)/100));
  }
  private templateOptions(){
    return html`
      ${Object.entries(PRESETS).map(([type,p])=>html`<option value="${type}">${p.name}</option>`)}
      ${(this.config.library??[]).map(n=>html`<option value="lib:${n.id}">★ ${n.name}</option>`)}
    `;
  }
  private entityInput(value:string|undefined,update:(id:string)=>void){
    return html`<input type="text" list="upfc-entities" placeholder="sensor.example_power"
      .value=${value??''} @change=${(e:Event)=>update((e.currentTarget as HTMLInputElement).value.trim())}/>`;
  }
  private renderNodeInspector(n:PowerNode){
    return html`<h4>Equipment · ${n.type}</h4>
      <label>Label</label><input .value=${n.name} @change=${(e:Event)=>this.changeNode('name',(e.currentTarget as HTMLInputElement).value)}/>
      <label>Icon (mdi:...)</label><input .value=${n.icon??''} @change=${(e:Event)=>this.changeNode('icon',(e.currentTarget as HTMLInputElement).value)}/>
      <label>Entity state (optional)</label>${this.entityInput(n.stateEntity,v=>this.changeNode('stateEntity',v))}
      <label>Battery SOC entity (optional)</label>${this.entityInput(n.socEntity,v=>this.changeNode('socEntity',v))}
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
      <label>Label (optional)</label><input .value=${e.name??''} @change=${(ev:Event)=>this.changeEdge('name',(ev.currentTarget as HTMLInputElement).value)}/>
      <label>Power sensor (W/kW/MW)</label>${this.entityInput(e.powerEntity,v=>this.changeEdge('powerEntity',v))}
      <label><input type="checkbox" style="width:auto" .checked=${!!e.invert}
        @change=${(ev:Event)=>this.changeEdge('invert',(ev.currentTarget as HTMLInputElement).checked)}/> Invert flow direction</label>
      <p class="upfc-subtle">Positive: source → target. Negative: target → source. No sensor: no animated flow. Independent readings required to avoid double-counting.</p>
      <div class="upfc-toolbar">
        <button @click=${()=>this.bend()}>+ Bend point</button>
        <button @click=${()=>this.changeEdge('waypoints',[])}>Auto route</button>
      </div>
      <button class="danger" @click=${()=>this.deleteSelected()}>Delete connection</button>`;
  }
  protected render(){
    const d=this.diagram,errors=validateDiagram(d);
    const view={x:this.pan.x,y:this.pan.y,width:d.width/this.zoom,height:d.height/this.zoom};
    const entityIds=this.hass?Object.keys(this.hass.states).filter(id=>id.startsWith('sensor.')||id.startsWith('binary_sensor.')).sort():[];
    return html`<ha-card>
      <h3>Universal Power Flow Designer</h3>
      <div class="upfc-toolbar">
        <label>Equipment:</label>
        <select .value=${this.preset} @change=${(ev:Event)=>this.preset=(ev.currentTarget as HTMLSelectElement).value}>
          ${this.templateOptions()}
        </select>
        <button class="primary" @click=${()=>this.addNode()}>+ Add</button>
        <button @click=${()=>{this.nodeId='';this.edgeId='';this.portStart=undefined;}}>Cancel selection</button>
        <button @click=${()=>this.exportJson()}>Export JSON</button>
        <label style="display:inline-block">Import JSON <input type="file" accept=".json,application/json" @change=${(ev:Event)=>void this.importJson(ev)}/></label>
      </div>
      <div class="upfc-toolbar">
        ${Object.entries(PRESETS).map(([type,p])=>html`<button draggable="true" title="Drag into canvas"
          @dragstart=${(ev:DragEvent)=>this.dragPalette(ev,type)} @click=${()=>this.addNode(type)}>${p.name}</button>`)}
      </div>
      <div class="upfc-toolbar">
        <label>Zoom:</label>
        <button @click=${()=>this.setZoom(this.zoom*1.25)}>+</button>
        <span>${Math.round(this.zoom*100)}%</span>
        <button @click=${()=>this.setZoom(this.zoom/1.25)}>−</button>
        <button @click=${()=>{this.zoom=1;this.pan={x:0,y:0};}}>Fit</button>
        <span class="upfc-subtle">Drag equipment to move • select two ports to connect • Shift+drag empty canvas to pan • Ctrl+wheel to zoom</span>
      </div>
      ${this.portStart?html`<p>Select target port for ${this.portStart.node}/${this.portStart.port}</p>`:nothing}
      ${this.notice?html`<p class="upfc-warning">${this.notice}</p>`:nothing}
      ${errors.length?html`<p class="upfc-warning">Topology validation: ${errors.slice(0,8).join(' • ')}</p>`:nothing}
      <div class="upfc-layout">
        <div @dragover=${(ev:DragEvent)=>ev.preventDefault()} @drop=${(ev:DragEvent)=>this.drop(ev)}>
          ${renderDiagram({diagram:d,hass:this.hass,instanceId:this.instanceId,edit:true,
            selectedNode:this.nodeId,selectedEdge:this.edgeId,events:this.canvasEvents,view})}
        </div>
        <aside class="upfc-inspector">
          <h4>Card settings</h4>
          <label>Title</label><input .value=${this.config.title??''} @change=${(ev:Event)=>{this.config.title=(ev.currentTarget as HTMLInputElement).value;this.emit();}}/>
          <label><input type="checkbox" style="width:auto" .checked=${this.config.animation!==false}
            @change=${(ev:Event)=>{this.config.animation=(ev.currentTarget as HTMLInputElement).checked;this.emit();}}/> Animate valid power readings</label>
          ${this.selectedNode?this.renderNodeInspector(this.selectedNode):
            this.selectedEdge?this.renderEdgeInspector(this.selectedEdge):
            html`<p class="upfc-subtle">Select a device or connection. Custom equipment, ports, entity bindings and reusable templates are stored in this card configuration.</p>
              <p class="upfc-subtle">Equipment: ${d.nodes.length}. Connections: ${d.connections.length}. Saved templates: ${this.config.library?.length??0}.</p>
              <button @click=${()=>{if(confirm('Replace layout with starter telecom example?')){this.config.diagram=demoDiagram();this.nodeId='';this.edgeId='';this.emit();}}}>Load telecom example</button>`}
        </aside>
      </div>
      <datalist id="upfc-entities">${entityIds.map(id=>html`<option value="${id}"></option>`)}</datalist>
    </ha-card>`;
  }
}
