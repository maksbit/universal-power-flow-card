import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const cwd=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const bundle=await readFile(resolve(cwd,'dist/universal-power-flow-card.js'));
const bootstrap=`<!doctype html><html><head><meta charset="utf-8"><title>UPFC Browser E2E</title>
<style>body{margin:0;background:#1a2731;color:#f0f0f0;font:14px sans-serif}
#ha-dialog{width:calc(100vw - 80px);height:calc(100vh - 80px);max-width:none;max-height:none;
 box-sizing:border-box;background:#283744;color:white;border:0;padding:14px;overflow:auto}</style></head>
<body><dialog id="ha-dialog"><h2>Home Assistant — Configure card</h2><div id="mount"></div></dialog>
<script type="module">
import '/bundle.js';
await customElements.whenDefined('universal-power-flow-card');
const ctor=customElements.get('universal-power-flow-card');
const editor=await ctor.getConfigElement();
const states={
  'sensor.battery_power':{state:'1200',attributes:{device_class:'power',unit_of_measurement:'W',
    friendly_name:'Test battery power'}},
  'sensor.battery_soc':{state:'60',attributes:{device_class:'battery',unit_of_measurement:'%',friendly_name:'Battery SOC'}}
};
editor.hass={states};
editor.setConfig({type:'custom:universal-power-flow-card',title:'Browser test',animation:true});
document.getElementById('mount').appendChild(editor);
document.getElementById('ha-dialog').showModal();
window.upfcTest={editor,events:[]};
editor.addEventListener('config-changed',e=>{
 window.upfcTest.events.push(e.detail.config);
 // Simulate HA echoing a saved config while the settings modal stays open.
 editor.setConfig(structuredClone(e.detail.config));
});
</script></body></html>`;
const server=createServer((req,res)=>{
 if(req.url==='/bundle.js'){
  res.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});res.end(bundle);
 }else if(req.url==='/'){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(bootstrap);
 }else{res.writeHead(404);res.end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const port=server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1480,height:940},acceptDownloads:true});
 const errors=[];
 const messages=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>messages.push(m.type()+': '+m.text()));
 await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
 await page.waitForFunction(()=>!!window.upfcTest?.editor,{timeout:15000});
 const editor=page.locator('universal-power-flow-card-editor');
 await editor.getByRole('button',{name:/Full-screen editor/}).click();
 const snapshot=await page.evaluate(()=>{
  const e=window.upfcTest?.editor;
  const o=e?.shadowRoot?.querySelector('.upfc-fullscreen-workspace');
  return {expanded:e?.expanded,hidden:o?.hasAttribute('hidden'),classes:o?.className,
    bodyLength:o?.innerHTML?.length,editorConnected:e?.isConnected};
 });
 console.log('FULLSCREEN DIAGNOSTICS',JSON.stringify({snapshot,errors,messages:messages.slice(-20)}));
 const workspace=editor.locator('.upfc-fullscreen-workspace');
 await workspace.waitFor({state:'visible',timeout:3000});
 assert.equal(await page.locator('#ha-dialog').evaluate(e=>e.open),true,'HA dialog remains open');
 const nodes=workspace.locator('svg.upfc-canvas g.upfc-node');
 const initialCount=await nodes.count();
 assert.ok(initialCount>=10,`Expected demo equipment; got ${initialCount}`);
 // Click WITHOUT dragging. This was broken in v0.2.1.
 const first=nodes.first();
 await first.locator('rect.upfc-node-box').click();
 assert.equal(await first.getAttribute('class'),'upfc-node selected','single click selects a node');
 await workspace.locator('.upfc-inspector input').first().fill('Browser renamed grid');
 await workspace.locator('.upfc-inspector input').first().press('Tab');
 assert.ok((await page.evaluate(()=>window.upfcTest.events.length))>=1,'editor emits config changes');
 // HA's config echo must not reset selected equipment, modal or subsequent events.
 assert.equal(await workspace.isVisible(),true);
 const add=workspace.getByRole('button',{name:/\+ Add equipment/});
 await add.click();
 assert.equal(await nodes.count(),initialCount+1,'add updates diagram immediately');
 await workspace.locator('.upfc-primarybar select').nth(1).selectOption({index:1});
 // Select a different node via native click after the first edit.
 await nodes.nth(1).locator('rect.upfc-node-box').click();
 assert.ok(await workspace.locator('g.upfc-node.selected').count()===1,'selection remains responsive');
 const second=nodes.nth(1);
 const old=await second.boundingBox();
 assert.ok(old,'equipment rectangle exists');
 await page.mouse.move(old.x+old.width/2,old.y+old.height/2);
 await page.mouse.down();
 await page.mouse.move(old.x+old.width/2+75,old.y+old.height/2+50,{steps:8});
 await page.mouse.up();
 const after=await second.boundingBox();
 assert.ok(after&&Math.hypot(after.x-old.x,after.y-old.y)>10,'drag moves selected node');
 const inspect=()=>page.evaluate(()=>({drag:window.upfcTest.editor.drag,
   selected:window.upfcTest.editor.nodeId,expanded:window.upfcTest.editor.expanded,
   events:window.upfcTest.events.length}));
 console.log('AFTER FIRST DRAG',JSON.stringify(await inspect()));
 assert.equal((await inspect()).drag,undefined,'first drag must release pointer tracking');
 // Repeat drag of the SAME node before editing or deleting anything.
 const initialX=after.x,initialY=after.y;
 const p1={x:after.x+after.width/2,y:after.y+after.height/2};
 await page.mouse.move(p1.x,p1.y);
 await page.mouse.down();
 await page.mouse.move(p1.x+85,p1.y-65,{steps:9});
 await page.mouse.up();
 const afterRepeat=await second.boundingBox();
 console.log('AFTER REPEATED DRAG',JSON.stringify({initialX,initialY,afterRepeat,state:await inspect()}));
 assert.ok(afterRepeat&&Math.hypot(afterRepeat.x-initialX,afterRepeat.y-initialY)>12,
   'second drag of SAME node must work immediately');
 assert.equal((await inspect()).drag,undefined,'second drag must release pointer tracking');
 // Editing immediately after a second drag must emit config updates.
 const eventsBeforeEdit=await page.evaluate(()=>window.upfcTest.events.length);
 await workspace.locator('.upfc-inspector > input').nth(1).fill('Edited after second drag');
 await workspace.locator('.upfc-inspector > input').nth(1).press('Tab');
 assert.ok((await page.evaluate(()=>window.upfcTest.events.length))>eventsBeforeEdit,
   'node properties must remain editable immediately after repeat drag');
 // Moving a different node must not be blocked by the first object's listeners.
 const third=nodes.nth(2);
 const box3=await third.boundingBox();assert.ok(box3);
 const p3={x:box3.x+box3.width/2,y:box3.y+box3.height/2};
 await page.mouse.move(p3.x,p3.y);await page.mouse.down();
 await page.mouse.move(p3.x-80,p3.y+65,{steps:9});await page.mouse.up();
 const moved3=await third.boundingBox();
 assert.ok(moved3&&Math.hypot(moved3.x-box3.x,moved3.y-box3.y)>12,
   'another equipment item must be draggable after moving the first');
 assert.equal((await inspect()).drag,undefined,'drag state must reset across devices');
 await second.locator('rect.upfc-node-box').click();
 // Native nested dialogs used to swallow controls after a drag.
 await workspace.getByRole('button',{name:/Delete selected/}).click();
 const confirm=workspace.getByRole('button',{name:/Confirm delete/});
 if(await confirm.count())await confirm.click();
 assert.equal(await nodes.count(),initialCount,'delete applies without moving another device');
 // Edit another object after delete to ensure pointer listeners are released.
 await nodes.first().locator('rect.upfc-node-box').click();
 assert.equal(await workspace.locator('g.upfc-node.selected').count(),1);
 await workspace.locator('upfc-entity-picker input[type=search]').first().fill('battery');
 const picker=workspace.locator('upfc-entity-picker').first();
 await picker.getByRole('option').first().click();
 assert.ok((await page.evaluate(()=>window.upfcTest.events.length))>=3,'editor still emits after drag/delete');
 await workspace.getByRole('button',{name:/Close full screen/}).click();
 assert.equal(await workspace.isVisible(),false);
 await editor.getByRole('button',{name:/Full-screen editor/}).click();
 assert.equal(await workspace.isVisible(),true,'can reopen full screen without moving equipment');
 assert.deepEqual(errors,[],'page console has no unhandled JS errors');
 console.log('BROWSER E2E PASS: single click, editor changes, HA config echo, add, drag, delete, sensor select, modal reopen');
}catch(err){
 console.error('BROWSER E2E FAILURE:',err);
 if(typeof page!=='undefined') {
  console.error('JS ERRORS',errors);
  console.error('CONSOLE',messages.slice(-20));
 }

 throw err;
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}
