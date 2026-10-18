import { svg } from 'lit';
import { Point, PowerDiagram, PowerNode, PowerPort, PowerConnection, PortKind } from './model';
import {findOrthogonalPath, segmentHitsObstacle, equipmentObstacle} from './routing';

export interface HassLike { states: Record<string,{state:string;attributes?:Record<string,unknown>}> }
export interface CanvasEvents {
  nodeDown?: (event: PointerEvent, id: string) => void;
  portDown?: (event: PointerEvent, node: string, port: string) => void;
  edgeClick?: (id: string) => void;
  edgeDoubleClick?: (event: MouseEvent, id: string) => void;
  waypointDown?: (event: PointerEvent, edgeId: string, index: number) => void;
  backgroundDown?: (event: PointerEvent) => void;
  pointerMove?: (event: PointerEvent) => void;
  pointerUp?: (event: PointerEvent) => void;
  wheel?: (event: WheelEvent) => void;
}
export interface CanvasOptions {
  diagram: PowerDiagram;
  hass?: HassLike;
  instanceId: string;
  edit?: boolean;
  selectedNode?: string;
  selectedEdge?: string;
  events?: CanvasEvents;
  view?: {x:number;y:number;width:number;height:number};
  animate?: boolean;
}
export const CONNECTION_COLORS: Record<PortKind,string> = {
  ac:'#f8b84e','dc+':'#e94848','dc-':'#555b67','pv+':'#e2b54b','pv-':'#777','signal':'#41a7db',
};
const finite = (x:number):number => Number.isFinite(x)?x:0;
const size = (node:PowerNode):{width:number;height:number} => ({width:node.width??156,height:node.height??106});
export function portPosition(n: PowerNode, p: PowerPort): Point {
  const {width:w,height:h}=size(n); const scale=n.scale??1;
  const peers=n.ports.filter(x=>x.side===p.side);
  const i=peers.findIndex(x=>x.id===p.id), fraction=(i+1)/(peers.length+1);
  let x=0,y=0;
  if(p.side==='left'){x=n.x;y=n.y+h*fraction;}
  if(p.side==='right'){x=n.x+w;y=n.y+h*fraction;}
  if(p.side==='top'){x=n.x+w*fraction;y=n.y;}
  if(p.side==='bottom'){x=n.x+w*fraction;y=n.y+h;}
  const cx=n.x+w/2,cy=n.y+h/2,rad=((n.rotation??0)*Math.PI)/180;
  const dx=(x-cx)*scale,dy=(y-cy)*scale;
  return {x:cx+dx*Math.cos(rad)-dy*Math.sin(rad),
    y:cy+dx*Math.sin(rad)+dy*Math.cos(rad)};
}
export function sensorPower(entity: string|undefined, hass?:HassLike): number|null {
  if(!entity || !hass?.states?.[entity])return null;
  const state=hass.states[entity];
  if(['unknown','unavailable','none',''].includes(state.state.trim().toLowerCase()))return null;
  const n=Number(state.state);
  if(!Number.isFinite(n))return null;
  const unit=String(state.attributes?.unit_of_measurement??'W').trim();
  if(unit==='kW')return n*1000;
  if(unit==='MW')return n*1000000;
  if(unit==='W')return n;
  return null;
}
function powerText(w:number|null):string{
  if(w===null)return '—';
  if(Math.abs(w)>=1000000)return `${(w/1000000).toFixed(2)} MW`;
  if(Math.abs(w)>=1000)return `${(w/1000).toFixed(2)} kW`;
  return `${w.toFixed(Math.abs(w)<10?1:0)} W`;
}
type RouteAxis = 'horizontal' | 'vertical';
function portNormal(node: PowerNode, port: PowerPort): Point {
  const base: Record<PowerPort['side'],Point> = {
    left:{x:-1,y:0},right:{x:1,y:0},top:{x:0,y:-1},bottom:{x:0,y:1}
  };
  const v=base[port.side],angle=(node.rotation??0)*Math.PI/180;
  return {x:Math.round(v.x*Math.cos(angle)-v.y*Math.sin(angle)),
    y:Math.round(v.x*Math.sin(angle)+v.y*Math.cos(angle))};
}
function connectionKind(diagram:PowerDiagram,e:PowerConnection):PortKind|undefined{
  return diagram.nodes.find(n=>n.id===e.from.node)?.ports.find(p=>p.id===e.from.port)?.kind;
}
/** Number each wire leaving a device on a separate lane to reduce overlapping trunks. */
export function automaticLaneOffset(d:PowerDiagram,e:PowerConnection):number{
  const kind=connectionKind(d,e);
  const siblings=d.connections.filter(c=>c.from.node===e.from.node&&connectionKind(d,c)===kind);
  const index=siblings.findIndex(c=>c.id===e.id);
  // A physical port shared by multiple wires still converges at the terminal.
  // The individual routes diverge immediately after leaving that terminal.
  return (index<0?0:index-(siblings.length-1)/2)*34;
}
function cleanPoints(points:Point[]):Point[]{
  return points.filter((p,i)=>i===0||Math.abs(p.x-points[i-1].x)>.01||Math.abs(p.y-points[i-1].y)>.01);
}
/** Reproducible orthogonal routing; explicit manual waypoints always win. */
/** Route edge with collision-safe orthogonal paths, separated from other equipment and wires. */
export function connectionPoints(diagram:PowerDiagram,e:PowerConnection,occupied:Point[][]=[]):Point[]|null{
  const na=diagram.nodes.find(n=>n.id===e.from.node),nb=diagram.nodes.find(n=>n.id===e.to.node);
  const pa=na?.ports.find(p=>p.id===e.from.port),pb=nb?.ports.find(p=>p.id===e.to.port);
  if(!na||!nb||!pa||!pb)return null;
  const a=portPosition(na,pa),b=portPosition(nb,pb);
  if(e.waypoints?.length)return cleanPoints([a,...e.waypoints,b]);
  if(e.route==='straight')return [a,b];
  const normalA=portNormal(na,pa),normalB=portNormal(nb,pb);
  const extension=37;
  const first={x:a.x+normalA.x*extension,y:a.y+normalA.y*extension};
  const last={x:b.x+normalB.x*extension,y:b.y+normalB.y*extension};
  const mode=e.route==='horizontal'||e.route==='vertical'?e.route:
    Math.abs(normalA.x)>Math.abs(normalA.y)?'horizontal':'vertical';
  const lane=automaticLaneOffset(diagram,e)+(e.routeOffset??0);
  const found=findOrthogonalPath(diagram,first,last,{mode,lane,occupied});
  // Never silently draw a wire through equipment if obstacle-aware routing fails.
  if(!found)return null;
  const pts=cleanPoints([a,...found,b]);
  if(pts.slice(1,-1).some((p,i,arr)=>{
    if(i===0)return false;
    return diagram.nodes.some(n=>segmentHitsObstacle(arr[i-1],p,equipmentObstacle(n)));
  }))return null;
  return pts;
}
export function pathOf(points:Point[]):string{
  return points.map((p,i)=>`${i?'L':'M'} ${finite(p.x).toFixed(1)} ${finite(p.y).toFixed(1)}`).join(' ');
}
function midpoint(points:Point[]):Point{
  // Weight the midpoint by line length, not number of bends.
  const lengths=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y));
  const total=lengths.reduce((a,b)=>a+b,0);
  let distance=total/2;
  for(let i=0;i<lengths.length;i++){
    if(distance<=lengths[i]){const t=lengths[i]?distance/lengths[i]:0;
      return {x:points[i].x+(points[i+1].x-points[i].x)*t,y:points[i].y+(points[i+1].y-points[i].y)*t};}
    distance-=lengths[i];
  }
  return points[0];
}
export function renderDiagram(o:CanvasOptions) {
  const {diagram:d,events,edit=false,instanceId:id}=o;
  const view=o.view??{x:0,y:0,width:d.width,height:d.height};
  return svg`<svg class="upfc-canvas" xmlns="http://www.w3.org/2000/svg"
    viewBox="${view.x} ${view.y} ${view.width} ${view.height}"
    preserveAspectRatio="xMidYMid meet"
    @pointermove=${(ev:PointerEvent)=>events?.pointerMove?.(ev)}
    @pointerup=${(ev:PointerEvent)=>events?.pointerUp?.(ev)}
    @pointercancel=${(ev:PointerEvent)=>events?.pointerUp?.(ev)}
    @wheel=${(ev:WheelEvent)=>events?.wheel?.(ev)}>
    <defs>
      <pattern id="${id}-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="var(--divider-color,#607080)" stroke-opacity=".20" stroke-width="1"/></pattern>
    </defs>
    <rect class="upfc-bg" x="0" y="0" width="${d.width}" height="${d.height}"
      fill="${edit?`url(#${id}-grid)`:'transparent'}"
      @pointerdown=${(ev:PointerEvent)=>events?.backgroundDown?.(ev)}/>
    ${(()=>{const routed:Point[][]=[];return d.connections.map(e=>{
      const points=connectionPoints(d,e,routed);
      if(!points)return svg`<g class="upfc-unroutable"><title>Cannot route connection ${e.id}: move equipment or adjust port positions</title></g>`;
      routed.push(points);
      const power=sensorPower(e.powerEntity,o.hass);
      const watts=power===null?null:(e.invert?-power:power);
      const kind=d.nodes.find(n=>n.id===e.from.node)?.ports.find(p=>p.id===e.from.port)?.kind??'signal';
      const color=e.color??CONNECTION_COLORS[kind],pathId=`${id}-flow-${e.id}`;
      const m=midpoint(points),active=watts!==null&&Math.abs(watts)>=0.1&&o.animate!==false;
      const duration=active?Math.max(0.5,Math.min(30,(8-Math.log10(Math.max(1,Math.abs(watts)))*1.25)/(e.animationSpeed??1))):6;
      return svg`<g class="upfc-edge ${o.selectedEdge===e.id?'selected':''}">
        <path id="${pathId}" d="${pathOf(points)}" stroke="${color}"
          stroke-dasharray="${kind==='signal'?'7 5':watts===null?'5 4':''}" stroke-width="${(e.lineWidth??3)+(o.selectedEdge===e.id?2:0)}"
          fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="${watts===null?0.65:1}"/>
        <path class="upfc-edge-hit" d="${pathOf(points)}" @click=${()=>events?.edgeClick?.(e.id)}
          @dblclick=${(ev:MouseEvent)=>events?.edgeDoubleClick?.(ev,e.id)}/>
        ${active?svg`<circle r="5" fill="${color}" stroke="#fff" stroke-width="1">
          <animateMotion dur="${duration}s" repeatCount="indefinite" keyPoints="${watts!<0?'1;0':'0;1'}" keyTimes="0;1" calcMode="linear">
            <mpath href="#${pathId}"/>
          </animateMotion>
        </circle>`:svg``}
        ${e.powerEntity||e.name?svg`<g class="upfc-edge-label" transform="translate(${m.x} ${m.y-12})">
          <rect x="-62" y="-13" width="124" height="22" rx="6" fill="var(--ha-card-background,var(--card-background-color,#192632))" stroke="${color}" stroke-opacity=".6"/>
          <text text-anchor="middle" font-size="12" fill="var(--primary-text-color,#ddd)">${e.name?e.name+': ':''}${powerText(watts)}</text>
        </g>`:svg``}
        ${edit&&o.selectedEdge===e.id? (e.waypoints??[]).map((p,i)=>svg`<circle class="upfc-waypoint" cx="${p.x}" cy="${p.y}" r="9"
          @pointerdown=${(ev:PointerEvent)=>events?.waypointDown?.(ev,e.id,i)}/>`):svg``}
      </g>`;
    });})()}
    ${d.nodes.map(n=>{
      const {width:w,height:h}=size(n), cx=n.x+w/2,cy=n.y+h/2;
      const value=n.stateEntity?o.hass?.states?.[n.stateEntity]?.state:undefined;
      const soc=n.socEntity?o.hass?.states?.[n.socEntity]?.state:undefined;
      const label=value===undefined?'':(value==='unknown'||value==='unavailable'?'—':value);
      return svg`<g class="upfc-node ${o.selectedNode===n.id?'selected':''}"
        @pointerdown=${(ev:PointerEvent)=>events?.nodeDown?.(ev,n.id)}>
        <g transform="translate(${cx} ${cy}) rotate(${n.rotation??0}) scale(${n.scale??1}) translate(${-cx} ${-cy})">
          <rect x="${n.x}" y="${n.y}" width="${w}" height="${h}" rx="10" class="upfc-node-box"/>
          <rect x="${n.x}" y="${n.y}" width="${w}" height="5" rx="3" fill="#4c9bc5"/>
          <foreignObject x="${n.x+12}" y="${n.y+20}" width="33" height="34">
            <div xmlns="http://www.w3.org/1999/xhtml" style="display:flex;align-items:center;justify-content:center;color:var(--primary-text-color,#eee)">
              <ha-icon icon="${n.icon?.startsWith('mdi:')?n.icon:'mdi:chip'}"></ha-icon>
            </div>
          </foreignObject>
          <text x="${n.x+w/2+17}" y="${n.y+30}" text-anchor="middle" class="upfc-node-title">${n.name}</text>
          ${label?svg`<text x="${cx}" y="${n.y+h-30}" text-anchor="middle" class="upfc-node-status">${label}</text>`:svg``}
          ${soc?svg`<text x="${cx}" y="${n.y+h-13}" text-anchor="middle" class="upfc-node-status">SOC ${soc}%</text>`:svg``}
        </g>
        ${n.ports.map(p=>{const xy=portPosition(n,p);return svg`
          <g class="upfc-port" @pointerdown=${(ev:PointerEvent)=>events?.portDown?.(ev,n.id,p.id)}>
            <circle cx="${xy.x}" cy="${xy.y}" r="${edit?8:5}" fill="${CONNECTION_COLORS[p.kind]}" stroke="var(--primary-background-color,#1c2934)" stroke-width="2"/>
            ${edit?svg`<title>${p.label} [${p.kind}, ${p.direction}] — click to connect</title>`:svg``}
          </g>`;})}
      </g>`;
    })}
  </svg>`;
}
