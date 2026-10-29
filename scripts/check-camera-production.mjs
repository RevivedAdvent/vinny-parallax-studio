import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { resolve, extname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { projectRoot } from './runtime.mjs';
import assert from 'node:assert/strict';

const root=resolve(projectRoot,'dist'), dir=resolve(projectRoot,'output/camera-phase1');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
  try {
    const path=new URL(req.url,'http://local').pathname;
    const file=resolve(root,'.'+(path==='/'?'/index.html':decodeURIComponent(path)));
    if(!file.startsWith(root+sep)) {res.writeHead(403);res.end();return;}
    const body=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});res.end(body);
  } catch {res.writeHead(404);res.end();}
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const external=[],errors=[];
try {
  const page=await browser.newPage({viewport:{width:1440,height:1050}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith(origin+'/')||url.startsWith('data:')||url.startsWith('blob:')) return route.continue();
    external.push(url);return route.abort();
  });
  await page.goto(origin);await page.waitForFunction(()=>window.cameraStudio?.ready);
  const manifest=JSON.parse(await readFile(resolve(dir,'manifest.json'),'utf8')), hashes=[];
  for(const frame of [120,500]) {
    const result=await page.evaluate(frame=>{window.cameraStudio.renderFrame(frame);return window.cameraStudio.capture();},frame);
    assert.equal(result.coverage.uncoveredPixels,0);
    const hash=createHash('sha256').update(Buffer.from(result.png.split(',')[1],'base64')).digest('hex');
    assert.equal(hash,manifest.frames[frame].sha256,'Production PNG must match master frame '+frame);
    hashes.push({frame,sha256:hash,equal:true});
  }
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  const report={pass:true,externalRequests:external,pageErrors:errors,masterMatches:hashes};
  await writeFile(resolve(dir,'production-checks.json'),JSON.stringify(report,null,2));
  console.log('PRODUCTION CHECKS PASSED: local assets only; frames 120/500 match PNG master byte-for-byte.');
} finally {await browser.close();await new Promise(r=>server.close(r));}
