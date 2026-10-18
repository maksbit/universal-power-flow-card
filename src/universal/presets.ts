import { PowerNode, PowerPort, PortKind, PortDirection, PortSide, emptyDiagram, PowerDiagram, PowerConnection, makeId } from './model';

const p = (id: string, label: string, kind: PortKind, direction: PortDirection, side: PortSide): PowerPort =>
  ({id,label,kind,direction,side});
export const PRESETS: Record<string,{ name: string; icon: string; ports: PowerPort[] }> = {
  grid: {name:'External grid', icon:'mdi:transmission-tower',ports:[p('out','GRID','ac','out','right')]},
  generator: {name:'Generator',icon:'mdi:engine',ports:[p('out','AC OUT','ac','out','right'),p('start','START','signal','in','top')]},
  inverter: {name:'Inverter',icon:'mdi:solar-power-variant',ports:[
    p('grid','GRID','ac','in','left'),p('gen','GEN','ac','in','left'),
    p('load','LOAD','ac','out','right'),p('bat_plus','BAT +','dc+','both','bottom'),
    p('bat_minus','BAT −','dc-','both','bottom'),p('start','GEN CTRL','signal','out','top'),
    p('pv_plus','PV +','pv+','in','top'),p('pv_minus','PV −','pv-','in','top')]},
  rectifier: {name:'AC/DC rectifier',icon:'mdi:current-ac',ports:[
    p('ac_in','AC IN','ac','in','left'),p('dc_plus','DC +','dc+','out','right'),p('dc_minus','DC −','dc-','out','right')]},
  battery: {name:'48V Battery',icon:'mdi:battery-high',ports:[
    p('plus','BAT +','dc+','both','right'),p('minus','BAT −','dc-','both','right')]},
  dc_bus: {name:'48V DC Bus',icon:'mdi:electric-switch',ports:
    Array.from({length:8},(_,i)=>[
      p('plus'+(i+1),'DC +','dc+','both', i<4?'left':'right'),
      p('minus'+(i+1),'DC −','dc-','both',i<4?'left':'right')
    ]).flat()},
  ac_bus: {name:'AC Distribution',icon:'mdi:lightning-bolt',ports:[
    p('in','AC IN','ac','in','left'),
    ...Array.from({length:6},(_,i)=>p('out'+(i+1),`AC OUT ${i+1}`,'ac','out','right'))]},
  ac_load: {name:'AC Load',icon:'mdi:server',ports:[p('in','AC IN','ac','in','left')]},
  dc_load: {name:'DC Load',icon:'mdi:server-network',ports:[
    p('plus','DC +','dc+','in','left'),p('minus','DC −','dc-','in','left')]},
  solar: {name:'PV array',icon:'mdi:solar-panel',ports:[
    p('plus','PV +','pv+','out','right'),p('minus','PV −','pv-','out','right')]},
  ats: {name:'ATS',icon:'mdi:electric-switch-closed',ports:[
    p('source1','SOURCE 1','ac','in','left'),p('source2','SOURCE 2','ac','in','left'),p('out','OUT','ac','out','right')]},
  breaker: {name:'Breaker',icon:'mdi:electric-switch',ports:[
    p('in','IN','ac','in','left'),p('out','OUT','ac','out','right')]},
  custom: {name:'Custom device',icon:'mdi:chip',ports:[
    p('in','IN','signal','both','left'),p('out','OUT','signal','both','right')]},
};
export function createNode(type: string, x: number, y: number): PowerNode {
  const source = PRESETS[type] ?? PRESETS.custom;
  return {id:makeId('node'),type,name:source.name,icon:source.icon,x,y,
    width:type==='dc_bus'?170:156,height:type==='dc_bus'?210:106,
    ports:source.ports.map(port=>({...port}))};
}
export function demoDiagram(): PowerDiagram {
  const d=emptyDiagram();d.width=1720;d.height=1090;
  function add(key: string,type:string,name:string,x:number,y:number): PowerNode{
    const n=createNode(type,x,y);n.id=key;n.name=name;d.nodes.push(n);return n;
  }
  add('grid','grid','External 3-phase GRID',35,90);
  add('gen','generator','3-phase generator',35,360);
  add('inv1','inverter','Deye SUN15K #1',360,180);
  add('acbus','ac_bus','AC LOAD distribution',680,90);
  add('servers','ac_load','AC telecom load',1030,70);
  add('hvac','ac_load','HVAC',1030,225);
  add('rect','rectifier','48V rectifiers',1050,430);
  add('battery','battery','48V Battery',40,760);
  add('bus','dc_bus','48V Common DC bus',690,700);
  add('dc_load','dc_load','Critical DC servers',1220,770);
  add('inv2','inverter','Deye SUN15K #2 (off-grid)',1080,590);
  add('offgrid','ac_load','Reserved AC load',1420,560);
  function edge(key:string,a:string,ap:string,b:string,bp:string):void{
    const c:PowerConnection={id:key,from:{node:a,port:ap},to:{node:b,port:bp}};
    d.connections.push(c);
  }
  edge('grid_inv1','grid','out','inv1','grid');
  edge('gen_inv1','gen','out','inv1','gen');
  edge('gen_start','inv1','start','gen','start');
  edge('inv1_ac','inv1','load','acbus','in');
  edge('ac_server','acbus','out1','servers','in');
  edge('ac_hvac','acbus','out2','hvac','in');
  edge('ac_rect','acbus','out3','rect','ac_in');
  edge('bat_plus','battery','plus','bus','plus1');
  edge('bat_minus','battery','minus','bus','minus1');
  edge('rect_plus','rect','dc_plus','bus','plus5');
  edge('rect_minus','rect','dc_minus','bus','minus5');
  edge('bus_inv1_plus','bus','plus2','inv1','bat_plus');
  edge('bus_inv1_minus','bus','minus2','inv1','bat_minus');
  edge('bus_inv2_plus','bus','plus6','inv2','bat_plus');
  edge('bus_inv2_minus','bus','minus6','inv2','bat_minus');
  edge('bus_dc_plus','bus','plus7','dc_load','plus');
  edge('bus_dc_minus','bus','minus7','dc_load','minus');
  edge('inv2_load','inv2','load','offgrid','in');
  return d;
}
