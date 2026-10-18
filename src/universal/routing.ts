import { Point, PowerDiagram, PowerNode } from './model';

/** Rectangles are expanded to leave a visible channel around equipment. */
export interface Obstacle { id: string; left: number; right: number; top: number; bottom: number }
export interface RouteOptions {
  mode: 'horizontal'|'vertical';
  lane: number;
  /** Honor a user-adjusted lane even when a detour is necessary. */
  forceLane?: boolean;
  /** Already laid-out wires; used to discourage shared trunks and crossings. */
  occupied?: Point[][];
}

export function equipmentObstacle(n:PowerNode,clearance=15):Obstacle {
  const w=(n.width??156)*(n.scale??1),h=(n.height??106)*(n.scale??1);
  const flip=((n.rotation??0)%180)!==0;
  const width=flip?h:w,height=flip?w:h;
  const cx=n.x+(n.width??156)/2,cy=n.y+(n.height??106)/2;
  return {id:n.id,left:cx-width/2-clearance,right:cx+width/2+clearance,
    top:cy-height/2-clearance,bottom:cy+height/2+clearance};
}

function inRect(p:Point,r:Obstacle):boolean {
  return p.x>r.left+0.01&&p.x<r.right-0.01&&p.y>r.top+0.01&&p.y<r.bottom-0.01;
}

/** True for a line crossing an expanded node interior (not merely running beside it). */
export function segmentHitsObstacle(a:Point,b:Point,r:Obstacle):boolean {
  const eps=0.01;
  if(Math.abs(a.y-b.y)<eps){
    return a.y>r.top+eps&&a.y<r.bottom-eps &&
      Math.max(a.x,b.x)>r.left+eps&&Math.min(a.x,b.x)<r.right-eps;
  }
  if(Math.abs(a.x-b.x)<eps){
    return a.x>r.left+eps&&a.x<r.right-eps &&
      Math.max(a.y,b.y)>r.top+eps&&Math.min(a.y,b.y)<r.bottom-eps;
  }
  // Explicit/manual diagonal edges use intersection against an axis-aligned rect.
  const dx=b.x-a.x,dy=b.y-a.y;
  let low=0,high=1;
  for(const [p,q] of [[-dx,a.x-r.left],[dx,r.right-a.x],[-dy,a.y-r.top],[dy,r.bottom-a.y]]){
    if(Math.abs(p)<1e-9){if(q<0)return false;continue;}
    const t=q/p;
    if(p<0)low=Math.max(low,t);else high=Math.min(high,t);
    if(low>high)return false;
  }
  return high>low+eps;
}
export function pathHitsEquipment(path:Point[],diagram:PowerDiagram,clearance=15):string[]{
  const boxes=diagram.nodes.map(n=>equipmentObstacle(n,clearance));
  return boxes.filter(box=>path.slice(1).some((p,i)=>segmentHitsObstacle(path[i],p,box))).map(box=>box.id);
}
function distinct(nums:number[]):number[]{
  const sorted=nums.filter(Number.isFinite).sort((a,b)=>a-b);
  return sorted.filter((n,i)=>i===0||Math.abs(n-sorted[i-1])>0.00001);
}
function simplify(pts:Point[]):Point[]{
  const output:Point[]=[];
  for(const p of pts){
    if(output.length&&Math.hypot(p.x-output[output.length-1].x,p.y-output[output.length-1].y)<0.1)continue;
    output.push(p);
    while(output.length>2){
      const a=output[output.length-3],b=output[output.length-2],c=output[output.length-1];
      if((Math.abs(a.x-b.x)<.01&&Math.abs(b.x-c.x)<.01)||
         (Math.abs(a.y-b.y)<.01&&Math.abs(b.y-c.y)<.01))output.splice(output.length-2,1);
      else break;
    }
  }
  return output;
}
const segmentOverlap=(a:Point,b:Point,c:Point,d:Point):number=>{
  const eps=2.5;
  if(Math.abs(a.y-b.y)<eps&&Math.abs(c.y-d.y)<eps&&Math.abs(a.y-c.y)<eps)
    return Math.max(0,Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))-
      Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x)));
  if(Math.abs(a.x-b.x)<eps&&Math.abs(c.x-d.x)<eps&&Math.abs(a.x-c.x)<eps)
    return Math.max(0,Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y))-
      Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y)));
  return 0;
};
const overlapPenalty=(a:Point,b:Point,occupied:Point[][]):number=>{
  let cost=0;
  for(const path of occupied)for(let i=1;i<path.length;i++){
    // A 5x penalty motivates distinct routing but allows intentional bus convergence.
    cost+=segmentOverlap(a,b,path[i-1],path[i])*5;
  }
  return cost;
};
interface QueueEntry { key:number; cost:number; score:number }
class PriorityQueue {
  private data:QueueEntry[]=[];
  push(e:QueueEntry):void{
    const a=this.data;a.push(e);let i=a.length-1;
    while(i>0){const p=(i-1)>>1;if(a[p].score<=e.score)break;a[i]=a[p];i=p;}a[i]=e;
  }
  pop():QueueEntry|undefined{
    const a=this.data,head=a[0],last=a.pop();if(!last||!a.length)return head;
    let i=0;while(2*i+1<a.length){
      let j=2*i+1;if(j+1<a.length&&a[j+1].score<a[j].score)j++;
      if(a[j].score>=last.score)break;a[i]=a[j];i=j;
    }a[i]=last;return head;
  }
  get length():number{return this.data.length;}
}
/** Obstacle-aware Manhattan A*. Every permitted edge is axis-aligned and collision-free. */
export function findOrthogonalPath(diagram:PowerDiagram,start:Point,end:Point,options:RouteOptions):Point[]|null {
  if(![start.x,start.y,end.x,end.y].every(Number.isFinite))return null;
  if(Math.abs(start.x-end.x)<.1&&Math.abs(start.y-end.y)<.1)return [start];
  const reach=240+Math.min(Math.abs(options.lane),400);
  const bounds={left:Math.min(start.x,end.x)-reach,right:Math.max(start.x,end.x)+reach,
    top:Math.min(start.y,end.y)-reach,bottom:Math.max(start.y,end.y)+reach};
  const boxes=diagram.nodes.map(n=>equipmentObstacle(n)).filter(r=>
    r.left<bounds.right&&r.right>bounds.left&&r.top<bounds.bottom&&r.bottom>bounds.top);
  if(boxes.some(r=>inRect(start,r)||inRect(end,r)))return null;
  const midX=(start.x+end.x)/2,midY=(start.y+end.y)/2;
  const guide=options.mode==='horizontal'?midX+options.lane:midY+options.lane;
  // User slider specifies a corridor to traverse whenever a reasonable detour exists.
  // When the guide falls inside equipment, look for unobstructed positions alongside
  // that equipment rather than silently ignoring the requested offset.
  if(options.forceLane&&Math.abs(options.lane)>0.5){
    const cross=options.mode==='horizontal'?midY:midX;
    const nearby=distinct([cross,
      options.mode==='horizontal'?start.y:start.x,
      options.mode==='horizontal'?end.y:end.x,
      ...boxes.flatMap(r=>options.mode==='horizontal'
        ?[r.top-1,r.bottom+1]:[r.left-1,r.right+1])])
      .sort((u,v)=>Math.abs(u-cross)-Math.abs(v-cross)).slice(0,10);
    const neutral:RouteOptions={...options,lane:0,forceLane:false};
    const basicDistance=Math.abs(start.x-end.x)+Math.abs(start.y-end.y);
    let chosen:Point[]|null=null,chosenLength=Infinity;
    const length=(points:Point[])=>points.slice(1).reduce((sum,p,i)=>
      sum+Math.abs(p.x-points[i].x)+Math.abs(p.y-points[i].y),0);
    for(const coordinate of nearby){
      const guidePoint=options.mode==='horizontal'?{x:guide,y:coordinate}:{x:coordinate,y:guide};
      if(guidePoint.x<bounds.left||guidePoint.x>bounds.right||
         guidePoint.y<bounds.top||guidePoint.y>bounds.bottom||
         boxes.some(r=>inRect(guidePoint,r)))continue;
      const first=findOrthogonalPath(diagram,start,guidePoint,neutral);
      const second=findOrthogonalPath(diagram,guidePoint,end,neutral);
      if(!first||!second)continue;
      const candidate=simplify([...first,...second.slice(1)]);
      const total=length(candidate);
      if(total<chosenLength){chosen=candidate;chosenLength=total;}
    }
    if(chosen&&chosenLength<(basicDistance+160)*3)return chosen;
  }
  const xs=distinct([start.x,end.x,midX,options.mode==='horizontal'?guide:midX,
    bounds.left,bounds.right,...boxes.flatMap(r=>[r.left-1,r.right+1])]);
  const ys=distinct([start.y,end.y,midY,options.mode==='vertical'?guide:midY,
    bounds.top,bounds.bottom,...boxes.flatMap(r=>[r.top-1,r.bottom+1])]);
  const nx=xs.length,ny=ys.length,vertices=nx*ny;
  // Large diagrams retain an explicit failure instead of freezing Home Assistant.
  if(vertices>22000)return null;
  const valid=new Uint8Array(vertices);
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
    const p={x:xs[x],y:ys[y]};
    valid[y*nx+x]=boxes.some(r=>inRect(p,r))?0:1;
  }
  const ix=(v:number,list:number[])=>list.findIndex(n=>Math.abs(n-v)<0.1);
  const source=ix(start.y,ys)*nx+ix(start.x,xs),target=ix(end.y,ys)*nx+ix(end.x,xs);
  if(source<0||target<0||!valid[source]||!valid[target])return null;
  // 4 states per vertex record last direction (none, horizontal, vertical).
  const visited=new Float64Array(vertices*3);visited.fill(Infinity);
  const previous=new Int32Array(vertices*3);previous.fill(-1);
  const heuristic=(at:number)=>Math.abs(xs[at%nx]-end.x)+Math.abs(ys[Math.floor(at/nx)]-end.y);
  const queue=new PriorityQueue();
  const initial=source*3;
  visited[initial]=0;queue.push({key:initial,cost:0,score:heuristic(source)});
  let best=-1;
  const occupied=options.occupied??[];
  const freeSegment=(a:Point,b:Point)=>!boxes.some(r=>segmentHitsObstacle(a,b,r));
  let attempts=0;
  while(queue.length&&attempts++<vertices*12){
    const cur=queue.pop()!;
    if(cur.cost>visited[cur.key]+.001)continue;
    const at=Math.floor(cur.key/3),lastDir=cur.key%3;
    if(at===target){best=cur.key;break;}
    const x=at%nx,y=Math.floor(at/nx),p={x:xs[x],y:ys[y]};
    for(const [xx,yy,dir] of [[x-1,y,1],[x+1,y,1],[x,y-1,2],[x,y+1,2]]){
      if(xx<0||xx>=nx||yy<0||yy>=ny)continue;
      const next=yy*nx+xx;if(!valid[next])continue;
      const q={x:xs[xx],y:ys[yy]};
      if(!freeSegment(p,q))continue;
      const step=Math.abs(q.x-p.x)+Math.abs(q.y-p.y);
      const turn=lastDir&&lastDir!==dir?26:0;
      // Strongly prefer a user-chosen corridor when traversing across it.
      const laneDistance=dir===2&&options.mode==='horizontal'?Math.abs(p.x-guide):
        dir===1&&options.mode==='vertical'?Math.abs(p.y-guide):0;
      const bias=Math.min(150,laneDistance)*0.12;
      const overlap=occupied.length?overlapPenalty(p,q,occupied):0;
      const cost=cur.cost+step+turn+bias+overlap;
      const key=next*3+dir;
      if(cost<visited[key]-0.001){
        visited[key]=cost;previous[key]=cur.key;
        queue.push({key,cost,score:cost+heuristic(next)});
      }
    }
  }
  if(best<0)return null;
  const path:Point[]=[];
  let key=best;
  while(key>=0){
    const v=Math.floor(key/3);
    path.push({x:xs[v%nx],y:ys[Math.floor(v/nx)]});
    key=previous[key];
  }
  path.reverse();
  return simplify(path);
}
