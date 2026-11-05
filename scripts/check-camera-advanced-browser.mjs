import { launch } from './runtime.mjs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const runtime=await launch(),errors=[];
try {
 const page=await runtime.browser.newPage({viewport:{width:1400,height:900}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const width=1363,height=768;
 const config={version:1,id:'advanced-preview',width,height,fps:24,totalFrames:240,
  camera:{baseZoom:1,maxRoll:180,anchor:{x:width/2,y:height/2},limits:{x:{min:-width,max:width},y:{min:-height,max:height},zoom:{min:.25,max:4},roll:{min:-30,max:30}}},tracks:[],
  layers:['01-background.png','02-layer 1.png','03-layer 2.png','04-layer 3.png'].map((asset,i)=>({id:`l${i}`,name:asset,asset:'/test-images/'+encodeURIComponent(asset),depth:i/3,order:i}))};
 await page.addInitScript(config=>{window.__CAMERA_INPUT__={config};},config);
 await page.goto(runtime.url+'/?render=1');await page.waitForFunction(()=>window.cameraStudio?.ready);
 const base=(type,extra)=>({id:type,model:2,type,start:0,duration:2,x:width/2,y:height/2,scale:1,...extra});
 const moves=[base('dutch',{angle:12,x:800,y:400}),base('handheld',{strength:1,speed:2,seed:42}),base('impact',{strength:1}),base('whip',{angle:18,blur:true}),base('dollyZoom',{travel:.2,layerId:'l2'}),base('rackFocus',{focusFrom:0,focusTo:1,strength:1}),base('orbit',{angle:8,radius:1,elevation:.01,layerId:'l2'})];
 const set=cfg=>page.evaluate(cfg=>window.cameraStudio.setConfig(cfg),cfg);
 const render=t=>page.evaluate(t=>window.cameraStudio.renderTime(t),t);
 const png=()=>page.evaluate(()=>window.cameraStudio.capture().png);
 const state=()=>page.evaluate(()=>window.cameraStudio.getState());
 await render(0);const neutral=await png();
 for(const move of moves){
  await set({...config,cameraMoves:[move]});await render(0);const start=await png();
  if(move.type!=='rackFocus')assert.equal(start,neutral,`${move.type} starts neutrally`);
  const at=move.type==='impact'?.15:1;await render(at);const snapshot=await png(),result=await state();
  assert.notEqual(snapshot,start,`${move.type} changes rendered pixels`);assert.ok(Object.values(result.visible).every(Boolean),`${move.type} keeps planes visible`);
  await page.evaluate(()=>window.cameraStudio.setIntensity(0));await render(at);assert.equal(await png(),neutral,`${move.type} respects zero preview intensity`);
  await page.evaluate(()=>window.cameraStudio.setIntensity(1));
  await render(2.5);await render(0);await render(at);assert.equal(await png(),snapshot,`${move.type} seek reproducibility`);
  if(move.type==='whip'){
   assert.ok(result.state.virtualCamera.motionBlur>0);await set({...config,cameraMoves:[{...move,blur:false}]});await render(at);assert.notEqual(await png(),snapshot,'whip blur changes real rendered pixels');
  }
  if(move.type==='rackFocus'){
   assert.ok(result.layerBlur.l0>0&&result.layerBlur.l3>0);assert.ok(result.layerBlur.l1<result.layerBlur.l0);
   // Isolate a real foreground texture: its in-focus and out-of-focus pixels must differ.
   const isolated={...config,layers:config.layers.map(l=>({...l,visible:l.id==='l3'})),cameraMoves:[move]};
   await set(isolated);await render(0);const out=await png();assert.ok((await state()).layerBlur.l3>0);
   await render(2);const sharp=await png();assert.equal((await state()).layerBlur.l3,0);assert.notEqual(out,sharp,'rack focus blurs actual artwork, not just state');
  }
 }
 const ui=await runtime.browser.newPage({viewport:{width:1500,height:1000}});ui.on('pageerror',e=>errors.push(e.message));ui.on('dialog',d=>d.accept());
 await ui.goto(runtime.url);await ui.waitForFunction(()=>window.cameraStudio?.ready);
 await ui.locator('[data-tab="arrange"]').click();await ui.locator('#asset-files').setInputFiles([resolve('test-images/01-background.png'),resolve('test-images/02-layer 1.png')]);
 await ui.waitForFunction(()=>window.cameraStudio.getState().config.layers.length===2);
 await ui.locator('[data-tab="animate"]').click();assert.equal(await ui.locator('#camera-advanced-moves').getAttribute('open'),null);
 await ui.locator('#camera-advanced-moves summary').click();assert.equal(await ui.locator('#camera-advanced-moves [data-preset]').count(),7);
 const controls=[
  ['dutch','camera-angle',14],['handheld','camera-strength',45],['impact','camera-strength',70],['whip','camera-angle',-15],
  ['dollyZoom','camera-travel',-12],['rackFocus','focus-to',.8],['orbit','camera-angle',-7],
 ];
 for(let i=0;i<controls.length;i++){
  const [type,id,value]=controls[i];await ui.locator(`[data-preset="${type}"]`).click();
  await ui.locator('#effect-start').fill(String(i));await ui.locator('#effect-duration').fill('1');await ui.locator('#'+id).fill(String(value));
  if(['dollyZoom','rackFocus','orbit'].includes(type))await ui.locator('#advanced-layer').selectOption({index:1});
  await ui.locator('#effect-form button[type=submit]').click();
  try { await ui.waitForFunction(n=>window.cameraStudio.getState().config.cameraMoves?.length===n,i+1,{timeout:8000}); }
  catch(e) { console.error('Failed adding',type,'state:',await ui.evaluate(()=>({moves:window.cameraStudio.getState().config.cameraMoves,alerts:[...document.querySelectorAll('[role=alert],.toast,#save-status')].map(el=>el.textContent),invalid:[...document.querySelectorAll('#effect-form :invalid')].map(el=>el.id)})));throw e; }
 }
 await ui.locator('[data-tab="effects"]').click();assert.equal(await ui.locator('.effect-list-item').count(),7);
 for(let i=0;i<controls.length;i++){
  const [,id,value]=controls[i];await ui.locator('[data-tab="effects"]').click();await ui.locator('.effect-list-item').nth(i).getByRole('button',{name:'Edit'}).click();
  assert.equal(Number(await ui.locator('#'+id).inputValue()),value,`editable ${controls[i][0]}`);
  if(['dollyZoom','rackFocus','orbit'].includes(controls[i][0]))assert.notEqual(await ui.locator('#advanced-layer').inputValue(),'','target layer remains editable');
  const changed=id==='focus-to'?.9:value+1;
  await ui.locator('#'+id).fill(String(changed));await ui.locator('#effect-form button[type=submit]').click();
  const key=id==='camera-angle'?'angle':id==='camera-strength'?'strength':id==='camera-travel'?'travel':'focusTo';
  const expected=(key==='strength'||key==='travel')?changed/100:changed;
  await ui.waitForFunction(({i,key,expected})=>Math.abs(window.cameraStudio.getState().config.cameraMoves[i][key]-expected)<1e-9,{i,key,expected});
 }
 await ui.locator('#save').click();await ui.waitForFunction(()=>document.querySelector('#save-status').textContent==='Saved locally');await ui.reload();await ui.waitForFunction(()=>window.cameraStudio?.ready);
 const saved=await ui.evaluate(()=>window.cameraStudio.getState().config.cameraMoves);assert.equal(saved.length,7);assert.ok(saved.every(m=>m.model===2));
 assert.equal(saved.find(m=>m.type==='dutch').angle,15);assert.equal(saved.find(m=>m.type==='orbit').angle,-6);
 for(const type of ['dollyZoom','rackFocus','orbit'])assert.ok(saved.find(m=>m.type===type).layerId,`${type} target persisted`);
 assert.deepEqual(errors,[]);console.log('Advanced camera browser checks passed: seven real-artwork previews, blur pixels, deterministic seeking, authoring, editing and persistence.');
} finally {await runtime.close();}
