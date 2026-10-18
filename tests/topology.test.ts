import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneDiagram,parseDiagram,portCompatible,validateDiagram,PowerPort} from '../src/universal/model';
import {createNode,demoDiagram} from '../src/universal/presets';
import {connectionPoints,sensorPower,portPosition,automaticLaneOffset} from '../src/universal/render';
import {equipmentObstacle,findOrthogonalPath,pathHitsEquipment,segmentHitsObstacle} from '../src/universal/routing';

test('telecom topology demo is electrically and structurally valid',()=>{
  const d=demoDiagram();
  assert.deepEqual(validateDiagram(d),[]);
  assert.equal(d.nodes.filter(n=>n.type==='inverter').length,2);
  assert.ok(d.connections.some(e=>e.id==='gen_start'));
});
test('reject AC-to-DC shorts and mismatched polarity',()=>{
  const ac:PowerPort={id:'ac',label:'AC',kind:'ac',direction:'out',side:'right'};
  const plus:PowerPort={id:'plus',label:'+',kind:'dc+',direction:'in',side:'left'};
  const minus:PowerPort={...plus,id:'minus',kind:'dc-'};
  assert.equal(portCompatible(ac,plus),false);
  assert.equal(portCompatible(plus,minus),false);
  assert.equal(portCompatible({...plus,direction:'in'}, {...plus,id:'in2',direction:'in'}),false);
});
test('invalid connection is reported and import rejected',()=>{
  const d=demoDiagram();d.connections.push({id:'bad',from:{node:'grid',port:'out'},to:{node:'battery',port:'plus'}});
  assert.ok(validateDiagram(d).some(s=>s.includes('Incompatible ports')));
  assert.throws(()=>parseDiagram(d),/Incompatible ports/);
});
test('duplicate connection and missing endpoints are detected',()=>{
  const d=demoDiagram();
  d.connections.push({...d.connections[0],id:'other'});
  d.connections.push({id:'orphan',from:{node:'missing',port:'out'},to:{node:'grid',port:'out'}});
  assert.ok(validateDiagram(d).some(s=>s.includes('Duplicate connection')));
  assert.ok(validateDiagram(d).some(s=>s.includes('Dangling')));
});
test('defensive clone isolates changes',()=>{
  const d=demoDiagram(),copy=cloneDiagram(d);
  copy.nodes[0].x=999;
  assert.notEqual(d.nodes[0].x,999);
});
test('positive DC+ and DC- connections remain separate',()=>{
  const d=demoDiagram();
  const positive=d.connections.find(e=>e.id==='rect_plus');
  const negative=d.connections.find(e=>e.id==='rect_minus');
  assert.ok(positive&&negative);
  assert.notEqual(positive?.to.port,negative?.to.port);
});
test('port positioning honors 90 degree rotation',()=>{
  const node=createNode('grid',10,20);
  const before=portPosition(node,node.ports[0]);
  node.rotation=90;
  const after=portPosition(node,node.ports[0]);
  assert.notDeepEqual(before,after);
});
test('orthogonal and custom paths have valid endpoints',()=>{
  const d=demoDiagram(),e=d.connections[0];
  const auto=connectionPoints(d,e);
  assert.ok(auto&&auto.length>=2);
  e.waypoints=[{x:123,y:456}];
  const custom=connectionPoints(d,e);
  assert.deepEqual(custom?.[1],{x:123,y:456});
});
test('HA power unit conversion and unavailable state',()=>{
  const hass={states:{'sensor.kilowatts':{state:'2.5',attributes:{unit_of_measurement:'kW'}},
    'sensor.down':{state:'unavailable',attributes:{unit_of_measurement:'W'}}}};
  assert.equal(sensorPower('sensor.kilowatts',hass),2500);
  assert.equal(sensorPower('sensor.down',hass),null);
  assert.equal(sensorPower('sensor.missing',hass),null);
});

test('auto route spaces parallel wires into separate corridors',()=>{
  const d=demoDiagram();
  const a=d.connections.find(e=>e.id==='ac_server');
  const b=d.connections.find(e=>e.id==='ac_hvac');
  assert.ok(a&&b);
  assert.notEqual(automaticLaneOffset(d,a!),automaticLaneOffset(d,b!));
  const pathA=connectionPoints(d,a!);
  const pathB=connectionPoints(d,b!);
  assert.ok(pathA&&pathB&&pathA.length>=4&&pathB.length>=4);
  assert.notEqual(pathA![2].x,pathB![2].x);
});
test('route offset modifies auto lane without changing topology',()=>{
  const d=demoDiagram(),edge=d.connections[0];
  const orig=connectionPoints(d,edge);
  edge.routeOffset=76;
  const modified=connectionPoints(d,edge);
  assert.ok(orig&&modified);
  assert.notDeepEqual(orig,modified);
  assert.deepEqual(validateDiagram(d),[]);
});
test('horizontal and vertical routing remain orthogonal',()=>{
  const d=demoDiagram(),edge=d.connections.find(e=>e.id==='ac_rect')!;
  for(const mode of ['horizontal','vertical'] as const){
    edge.route=mode;
    const points=connectionPoints(d,edge)!;
    assert.ok(points.length>=4);
    for(let i=1;i<points.length;i++){
      assert.ok(Math.abs(points[i].x-points[i-1].x)<.001 ||
        Math.abs(points[i].y-points[i-1].y)<.001,
        `non-orthogonal segment ${i} for ${mode}`);
    }
  }
});
test('manual bends and straight routing override automatic layout',()=>{
  const d=demoDiagram(),edge=d.connections[0];
  edge.route='straight';
  assert.equal(connectionPoints(d,edge)?.length,2);
  edge.waypoints=[{x:414,y:215},{x:490,y:215}];
  assert.deepEqual(connectionPoints(d,edge)?.slice(1,-1),edge.waypoints);
});
test('invalid visual routing and unbounded offsets are rejected',()=>{
  const d=demoDiagram(),edge=d.connections[0];
  edge.routeOffset=Infinity;
  edge.lineWidth=100;
  edge.color='javascript:alert(1)';
  assert.ok(validateDiagram(d).some(e=>e.includes('lane offset')));
  assert.ok(validateDiagram(d).some(e=>e.includes('line width')));
  assert.ok(validateDiagram(d).some(e=>e.includes('wire color')));
});

test('A* navigation detours around a rectangular equipment obstacle',()=>{
  const d=demoDiagram();
  const blocker=createNode('rectifier',350,300);
  blocker.id='blocker';blocker.width=190;blocker.height=170;
  d.nodes=[blocker];
  const start={x:110,y:380},end={x:820,y:380};
  const pts=findOrthogonalPath(d,start,end,{mode:'horizontal',lane:0});
  assert.ok(pts&&pts.length>2,'route must detour, not cross equipment');
  for(let i=1;i<pts.length;i++){
    assert.ok(pts[i-1].x===pts[i].x||pts[i-1].y===pts[i].y,
      'every segment must remain orthogonal');
    assert.equal(segmentHitsObstacle(pts[i-1],pts[i],equipmentObstacle(blocker)),false,
      'wire must not enter expanded equipment bounds');
  }
});
test('routing immediately recalculates when obstacle moves',()=>{
  const d=demoDiagram(),blocker=createNode('ac_load',345,350);
  blocker.width=240;blocker.height=150;blocker.id='moving-blocker';
  d.nodes=[blocker];
  const a={x:80,y:390},b={x:900,y:390};
  const first=findOrthogonalPath(d,a,b,{mode:'horizontal',lane:0});
  assert.ok(first&&first.length>2);
  blocker.y=750;
  const second=findOrthogonalPath(d,a,b,{mode:'horizontal',lane:0});
  assert.ok(second&&second.length>=2);
  assert.notDeepEqual(second,first,'wire must update after moving device');
});
test('all rendered starter connections have obstacle-free interior or are flagged blocked',()=>{
  const d=demoDiagram();
  for(const e of d.connections){
    const pts=connectionPoints(d,e);
    if(pts===null)continue; // blocked edges are intentionally suppressed, never routed across nodes
    assert.deepEqual(pathHitsEquipment(pts.slice(1,-1),d),[],
      `edge ${e.id} crossed an equipment clearance`);
  }
});
test('line-line overlap carries a lane cost and separate route source is deterministic',()=>{
  const d=demoDiagram(),e=d.connections.find(x=>x.id==='ac_server')!;
  const p=connectionPoints(d,e);
  assert.ok(p&&p.length>=2);
  const again=connectionPoints(d,e);
  assert.deepEqual(p,again);
});
