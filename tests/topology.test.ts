import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneDiagram,parseDiagram,portCompatible,validateDiagram,PowerPort} from '../src/universal/model';
import {createNode,demoDiagram} from '../src/universal/presets';
import {connectionPoints,sensorPower,portPosition} from '../src/universal/render';

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
