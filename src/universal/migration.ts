import {cloneDiagram, PowerDiagram, PowerNode, PowerPort, PortKind, validateDiagram} from './model';

/** Deterministic, idempotent upgrade of old DC+/DC- and PV+/PV- drawn circuits.
 * Visual energy-flow links are logical circuits rather than individual conductors.
 * No equipment positions or Home Assistant entity bindings are discarded.
 * An ambiguous pair carrying conflicting sensor bindings is NEVER rewritten.
 */
export interface CompactResult { diagram:PowerDiagram; changed:boolean; mergedEdges:number; warning?:string }
function opposite(id:string):string {
  if(id.includes('plus'))return id.replace('plus','minus');
  if(id.includes('minus'))return id.replace('minus','plus');
  return '';
}
function logicalId(id:string,kind:PortKind):string {
  if(id==='plus'||id==='minus')return kind.startsWith('pv')?'pv':'dc';
  if(/^((plus)|(minus))\d+$/.test(id))return (kind.startsWith('pv')?'pv':'dc')+id.match(/\d+$/)![0];
  if(id==='bat_plus'||id==='bat_minus')return 'bat_dc';
  if(id==='dc_plus'||id==='dc_minus')return 'dc';
  if(id==='pv_plus'||id==='pv_minus')return 'pv';
  return id.replace(/_plus$|_minus$/,'_dc');
}
function asPair(node:PowerNode,port:PowerPort):{id:string;kind:'dc'|'pv';positive:PowerPort;negative:PowerPort}|null{
  const kind=port.kind.startsWith('pv')?'pv':'dc';
  if(!['dc+','dc-','pv+','pv-'].includes(port.kind))return null;
  const plus=port.kind.endsWith('+')?port:node.ports.find(p=>p.id===opposite(port.id));
  const minus=port.kind.endsWith('-')?port:node.ports.find(p=>p.id===opposite(port.id));
  if(!plus||!minus||plus.kind!==kind+'+'||minus.kind!==kind+'-')return null;
  if(opposite(plus.id)!==minus.id)return null;
  return {id:logicalId(plus.id,plus.kind),kind,positive:plus,negative:minus};
}
export function compactLegacyDiagram(input:PowerDiagram):CompactResult {
  const diagram=cloneDiagram(input);
  const portMap=new Map<string,string>();
  let collapsed=0;
  for(const node of diagram.nodes){
    const handled=new Set<string>();
    const updated:PowerPort[]=[];
    for(const port of node.ports){
      if(handled.has(port.id))continue;
      const pair=asPair(node,port);
      if(!pair){updated.push(port);continue;}
      handled.add(pair.positive.id);handled.add(pair.negative.id);
      // Avoid colliding with hand-made logical ports.
      if(node.ports.some(p=>p.id===pair.id&&p.id!==pair.positive.id&&p.id!==pair.negative.id)){
        return {diagram:cloneDiagram(input),changed:false,mergedEdges:0,warning:'Ambiguous legacy port IDs; no conversion performed'};
      }
      portMap.set(node.id+'/'+pair.positive.id,pair.id);
      portMap.set(node.id+'/'+pair.negative.id,pair.id);
      updated.push({...pair.positive,id:pair.id,kind:pair.kind,
        label:pair.id.startsWith('bat')?'BAT DC':pair.kind==='pv'?'PV':'DC'});
      collapsed++;
    }
    node.ports=updated;
  }
  if(!collapsed)return {diagram,changed:false,mergedEdges:0};
  const edges=new Map<string,typeof diagram.connections[number]>();
  let mergedEdges=0;
  for(const item of diagram.connections){
    const edge={...item,from:{...item.from},to:{...item.to}};
    edge.from.port=portMap.get(edge.from.node+'/'+edge.from.port)??edge.from.port;
    edge.to.port=portMap.get(edge.to.node+'/'+edge.to.port)??edge.to.port;
    const key=[edge.from.node+'/'+edge.from.port,edge.to.node+'/'+edge.to.port].sort().join('|');
    const existing=edges.get(key);
    if(existing){
      if(existing.powerEntity&&edge.powerEntity&&existing.powerEntity!==edge.powerEntity){
        return {diagram:cloneDiagram(input),changed:false,mergedEdges:0,
          warning:'Two polarity links carry different power sensors; automatic conversion skipped to protect telemetry'};
      }
      if(!existing.powerEntity&&edge.powerEntity)existing.powerEntity=edge.powerEntity;
      if(!existing.name&&edge.name)existing.name=edge.name;
      if(!existing.waypoints?.length&&edge.waypoints?.length)existing.waypoints=edge.waypoints;
      mergedEdges++;
    }else edges.set(key,edge);
  }
  diagram.connections=[...edges.values()];
  const invalid=validateDiagram(diagram);
  if(invalid.length)return {diagram:cloneDiagram(input),changed:false,mergedEdges:0,
    warning:'Legacy polarity simplification was skipped: '+invalid.slice(0,2).join('; ')};
  return {diagram,changed:true,mergedEdges};
}
