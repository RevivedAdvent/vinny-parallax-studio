import { launch } from './runtime.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const runtime=await launch(), errors=[];
try {
 const page=await runtime.browser.newPage({viewport:{width:1400,height:900}});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const width=1363,height=768;
 const config={version:1,id:'virtual-browser',width,height,fps:24,totalFrames:240,
  camera:{baseZoom:1,maxRoll:180,anchor:{x:width/2,y:height/2},limits:{x:{min:-width,max:width},y:{min:-height,max:height},zoom:{min:.25,max:4},roll:{min:-30,max:30}}},tracks:[],
  layers:['01-background.png','02-layer 1.png','03-layer 2.png','04-layer 3.png'].map((asset,i)=>({id:`l${i}`,name:asset,asset:'/test-images/'+encodeURIComponent(asset),depth:i/3,order:i}))};
 await page.addInitScript(config=>{window.__CAMERA_INPUT__={config};},config);
 await page.goto(runtime.url+'/?render=1');await page.waitForFunction(()=>window.cameraStudio?.ready);
 const baseMove=(type,opts={})=>({id:type,model:2,type,start:0,duration:2,x:width/2,y:height/2,scale:1,travel:.2,...opts});
 const cases=[
  baseMove('push',{x:850,y:450,scale:1.2}),baseMove('pull',{scale:.8}),
  baseMove('zoom',{x:850,y:450,scale:1.5}),baseMove('pan',{x:1000}),baseMove('tilt',{y:600}),
  baseMove('truck',{x:1000}),baseMove('pedestal',{y:600}),baseMove('diagonal',{x:1000,y:600}),
  baseMove('crane',{y:600,lookX:width/2,lookY:height/2}),
  baseMove('tracking',{layerId:'l2',x:900,y:500}),
  baseMove('reveal',{layerIds:['l3'],offsetX:300,offsetY:0}),
 ];
 const png=()=>page.evaluate(()=>window.cameraStudio.capture().png);
 const render=t=>page.evaluate(t=>window.cameraStudio.renderTime(t),t);
 await render(0);const neutral=await png();
 for(const move of cases){
  const cfg={...config,cameraMoves:[move]};
  if(move.type==='tracking')cfg.animationTracks=[{id:'anim',target:'layer:l2',property:'x',intensity:1,keyframes:[{id:'a',timeSeconds:0,value:0,easing:'linear'},{id:'b',timeSeconds:10,value:300,easing:'linear'}]}];
  await page.evaluate(cfg=>window.cameraStudio.setConfig(cfg),cfg);await render(0);const initial=await png();
  assert.equal(initial,neutral,`${move.type} changed the neutral composition`);
  await render(2);const end=await png();const state=await page.evaluate(()=>window.cameraStudio.getState());
  assert.notEqual(end,initial,`${move.type} did not change rendered artwork`);
  assert.ok(Object.values(state.visible).every(Boolean),`${move.type} rejected a plane`);
  const colors=await page.evaluate(()=>{const source=document.querySelector('#canvas-host canvas'),c=document.createElement('canvas');c.width=80;c.height=45;const ctx=c.getContext('2d');ctx.drawImage(source,0,0,80,45);const d=ctx.getImageData(0,0,80,45).data;const set=new Set();for(let i=0;i<d.length;i+=4)set.add(`${d[i]},${d[i+1]},${d[i+2]}`);return set.size;});
  assert.ok(colors>30,`${move.type} did not render textured artwork (${colors} colors)`);
  if(move.type==='push'){
   assert.ok(state.transforms[3].scale>state.transforms[0].scale);
   await mkdir('output/camera-virtual',{recursive:true});await writeFile('output/camera-virtual/dolly.png',Buffer.from(end.split(',')[1],'base64'));
  }
  if(move.type==='zoom')for(const layer of state.transforms)assert.ok(Math.abs(layer.scale-1.5)<1e-6);
  if(move.type==='pan'){assert.ok(state.state.virtualCamera.yaw>0);assert.equal(state.state.virtualCamera.x,0);}
  if(move.type==='truck'){assert.equal(state.state.virtualCamera.yaw,0);assert.ok(state.state.virtualCamera.x>0);}
  if(move.type==='pedestal')assert.equal(state.state.virtualCamera.pitch,0);
  if(move.type==='crane')assert.notEqual(state.state.virtualCamera.pitch,0);
  if(move.type==='reveal')assert.equal(state.state.virtualCamera.x,0);
  if(move.type==='tracking'){
   await render(5);const tracked=await page.evaluate(()=>window.cameraStudio.getState());
   assert.ok(Math.abs(tracked.transforms[2].x-900)<1e-5);assert.ok(Math.abs(tracked.transforms[2].y-500)<1e-5);
  }
  await render(1);const snapshot=await png();await render(5);await render(0);await render(1);assert.equal(await png(),snapshot,`${move.type} seeking changed rendering`);
 }
 assert.deepEqual(errors,[]);console.log('Virtual camera browser checks passed for all eleven moves with real artwork and deterministic seeks.');
} finally {await runtime.close();}
