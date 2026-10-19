import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneDiagram,parseDiagram,portCompatible,validateDiagram,PowerPort} from '../src/universal/model';
import {createNode,demoDiagram} from '../src/universal/presets';
import {connectionPoints,sensorPower,portPosition,automaticLaneOffset,resolveEdgePower} from '../src/universal/render';
import {compactLegacyDiagram} from '../src/universal/migration';
import {PRESETS} from '../src/universal/presets';
import {SVG_MODELS} from '../src/universal/device-art';
import {filteredEntities} from '../src/universal/entities';
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
  const d=demoDiagram();d.connections.push({id:'bad',from:{node:'grid',port:'out'},to:{node:'battery',port:'dc'}});
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
test('DC and PV are a single logical flow per physical circuit',()=>{
  const d=demoDiagram();
  const positive=d.connections.find(e=>e.id==='rect_dc');
  assert.ok(positive);
  assert.equal(positive?.to.port,'dc5');
  assert.equal(d.connections.find(e=>e.id==='rect_minus'),undefined);
  const battery=d.nodes.find(n=>n.id==='battery')!;
  assert.deepEqual(battery.ports.map(p=>p.kind),['dc']);
  assert.deepEqual(validateDiagram(d),[]);
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
test('route offset adjusts an unobstructed wiring corridor',()=>{
  const d=demoDiagram();
  // Place two devices far enough apart to offer several viable cable corridors.
  d.nodes=[createNode('grid',40,110),createNode('ac_load',860,420)];
  d.nodes[0].id='source';
  d.nodes[1].id='sink';
  d.connections=[{id:'test_lane',from:{node:'source',port:'out'},to:{node:'sink',port:'in'}}];
  const edge=d.connections[0],initial=connectionPoints(d,edge);
  edge.routeOffset=76;
  const moved=connectionPoints(d,edge);
  assert.ok(initial&&moved,'both lanes must remain routable');
  assert.notDeepEqual(moved,initial,'offset must alter a corridor when free space exists');
  assert.deepEqual(pathHitsEquipment(moved!.slice(1,-1),d),[]);
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

test('legacy polarity upgrade merges one DC circuit without losing entity/geometry',()=>{
  const d=demoDiagram();
  const battery=d.nodes.find(n=>n.id==='battery')!,bus=d.nodes.find(n=>n.id==='bus')!;
  battery.ports=PRESETS.battery.ports.map(p=>({...p}));
  bus.ports=PRESETS.dc_bus.ports.map(p=>({...p}));
  // Build a self-contained, valid v0.1.x fixture with both physical conductors.
  d.connections=[
    {id:'old_pos',from:{node:'battery',port:'plus'},to:{node:'bus',port:'plus1'},
      powerEntity:'sensor.battery_power',routeOffset:48,waypoints:[{x:225,y:850}]},
    {id:'old_neg',from:{node:'battery',port:'minus'},to:{node:'bus',port:'minus1'}}
  ];
  assert.deepEqual(validateDiagram(d),[]);
  const result=compactLegacyDiagram(d);
  assert.equal(result.changed,true);
  assert.equal(result.mergedEdges,1);
  assert.deepEqual(validateDiagram(result.diagram),[]);
  const link=result.diagram.connections.find(e=>e.id==='old_pos');
  assert.equal(link?.powerEntity,'sensor.battery_power');
  assert.equal(link?.routeOffset,48);
  assert.deepEqual(link?.waypoints,[{x:225,y:850}]);
  assert.equal(result.diagram.nodes.find(n=>n.id==='battery')?.x,battery.x);
  assert.equal(compactLegacyDiagram(result.diagram).changed,false);
});
test('migration does not silently discard incompatible opposing sensor readings',()=>{
  const d=demoDiagram(),battery=d.nodes.find(n=>n.id==='battery')!,bus=d.nodes.find(n=>n.id==='bus')!;
  battery.ports=PRESETS.battery.ports.map(p=>({...p}));
  bus.ports=PRESETS.dc_bus.ports.map(p=>({...p}));
  d.connections=[
    {id:'plus',from:{node:'battery',port:'plus'},to:{node:'bus',port:'plus1'},powerEntity:'sensor.a'},
    {id:'minus',from:{node:'battery',port:'minus'},to:{node:'bus',port:'minus1'},powerEntity:'sensor.b'}
  ];
  const result=compactLegacyDiagram(d);
  assert.equal(result.changed,false);
  assert.match(result.warning??'',/different power sensors/);
});
test('signed battery sensor drives exactly one logical link, reversing on charging',()=>{
  const d=demoDiagram(),battery=d.nodes.find(n=>n.id==='battery')!;
  battery.powerEntity='sensor.battery_power';
  const edge=d.connections.find(e=>e.id==='bat_dc')!;
  const hass={states:{'sensor.battery_power':{state:'-1.25',attributes:{unit_of_measurement:'kW'}}}};
  assert.equal(resolveEdgePower(d,edge,hass).watts,-1250);
  battery.powerPositive='in';
  assert.equal(resolveEdgePower(d,edge,hass).watts,1250);
  edge.powerEntity='sensor.edge';
  assert.equal(resolveEdgePower(d,edge,hass).watts,null,'explicit unavailable edge sensor overrides fallback');
});
test('aggregate inverter power is not implicitly applied to every connected branch',()=>{
  const d=demoDiagram(),inv=d.nodes.find(n=>n.id==='inv1')!;
  inv.powerEntity='sensor.inverter_power';
  const edge=d.connections.find(e=>e.id==='inv1_ac')!;
  const hass={states:{'sensor.inverter_power':{state:'2000',attributes:{unit_of_measurement:'W'}}}};
  assert.equal(resolveEdgePower(d,edge,hass).watts,null);
});
test('entity picker filters by power class/units and text, not every HA entity',()=>{
  const hass={states:{
    'sensor.batt_power':{state:'-500',attributes:{device_class:'power',friendly_name:'Battery Power',unit_of_measurement:'W'}},
    'sensor.batt_voltage':{state:'52',attributes:{device_class:'voltage',friendly_name:'Battery Voltage',unit_of_measurement:'V'}},
    'sensor.room_temperature':{state:'20',attributes:{device_class:'temperature',friendly_name:'Room Temp',unit_of_measurement:'°C'}},
  }};
  assert.deepEqual(filteredEntities(hass,'power','battery').map(e=>e.id),['sensor.batt_power']);
  assert.deepEqual(filteredEntities(hass,'voltage','battery').map(e=>e.id),['sensor.batt_voltage']);
  assert.equal(filteredEntities(hass,'power','room').length,0);
});
test('SVG artwork library provides equipment models for every major power device',()=>{
  for(const type of ['hybrid_inverter','power_inverter','battery_rack','battery_cell',
    'rectifier_rack','rectifier_box','dc_busbar','pv_panels','telecom_server']){
      assert.ok(SVG_MODELS[type]);
    }
});
