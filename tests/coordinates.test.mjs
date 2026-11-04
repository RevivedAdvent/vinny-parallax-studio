import test from 'node:test';
import assert from 'node:assert/strict';
import { scenePoint } from '../src/studio/coordinates.ts';

const bounds={left:100,top:50,width:800,height:450};
const neutral={x:0,y:0,scale:1};
test('pointer coordinates account for displayed size and canvas offset',()=>{
 assert.deepEqual(scenePoint({x:100,y:50},bounds,1920,1080,neutral),{x:0,y:0});
 assert.deepEqual(scenePoint({x:500,y:275},bounds,1920,1080,neutral),{x:960,y:540});
 assert.deepEqual(scenePoint({x:900,y:500},bounds,1920,1080,neutral),{x:1920,y:1080});
 assert.equal(scenePoint({x:99,y:275},bounds,1920,1080,neutral),null);
 assert.equal(scenePoint({x:500,y:501},bounds,1920,1080,neutral),null);
});
test('picker reverses the composite camera translation and zoom',()=>{
 const camera={x:200,y:-100,scale:2};
 assert.deepEqual(scenePoint({x:500,y:275},bounds,1920,1080,camera),{x:1160,y:440});
 assert.deepEqual(scenePoint({x:300,y:387.5},bounds,1920,1080,camera),{x:920,y:575});
 assert.equal(scenePoint({x:500,y:275},{...bounds,width:0},1920,1080,camera),null);
 assert.equal(scenePoint({x:500,y:275},bounds,1920,1080,{...camera,scale:0}),null);
});
