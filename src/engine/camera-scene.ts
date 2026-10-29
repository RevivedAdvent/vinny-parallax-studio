import { Application, Assets, Container, Sprite, Texture } from 'pixi.js';
import { compileCamera } from '../camera/evaluate.ts';
import { projectLayers } from '../camera/project.ts';
import { clamp, finite } from '../camera/easing.ts';
import type { CameraSceneConfig } from '../camera/types.ts';

export interface Coverage { uncoveredPixels: number; fullyTransparentPixels: number; minAlpha: number; bounds: { x:number;y:number;width:number;height:number } | null }
export async function createCameraScene(host: HTMLElement, input: CameraSceneConfig) {
  let core = compileCamera(input), config = core.config();
  const app = new Application();
  await app.init({ width:config.width,height:config.height,resolution:1,antialias:true,autoStart:false,preference:'webgl',preserveDrawingBuffer:true,background:'#000000',backgroundAlpha:0 });
  app.canvas.setAttribute('aria-label','Illustrated story scene preview'); app.canvas.setAttribute('role','img'); host.appendChild(app.canvas);
  const world = new Container(); app.stage.addChild(world);
  let sprites: Sprite[] = [];
  async function loadLayers(layers: CameraSceneConfig['layers']) {
    const next: Sprite[] = [];
    try {
      for (const layer of layers) {
        const texture = await Assets.load<Texture>(layer.asset);
        const sprite = new Sprite(texture); sprite.anchor.set(.5); sprite.alpha = layer.opacity ?? 1; sprite.visible = layer.visible ?? true;
        world.addChild(sprite); next.push(sprite);
      }
    } catch (e) { next.forEach(s => { world.removeChild(s); s.destroy(); }); throw e; }
    const previous=sprites; sprites=next; previous.forEach(s=>{world.removeChild(s);s.destroy();});
  }
  await loadLayers(config.layers);
  let frame=0,intensity=1,state=core.evaluate(0),transforms=projectLayers(config,state);
  const readback=document.createElement('canvas');readback.width=config.width;readback.height=config.height;
  const context=readback.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('PNG export requires a 2D canvas context');
  function renderFrame(index:number){state=core.evaluate(index,intensity);frame=index;transforms=projectLayers(config,state);
    transforms.forEach((pose,i)=>{const layer=config.layers[i],sprite=sprites[i];sprite.position.set(pose.x,pose.y);sprite.scale.set(pose.scale*(layer.scale??1));sprite.rotation=(pose.roll+(layer.rotation??0))*Math.PI/180;sprite.alpha=layer.opacity??1;sprite.visible=layer.visible??true;});
    app.renderer.render({container:app.stage});
  }
  function capture(includePNG=true, matte=true):{png?:string;coverage:Coverage}{const ctx=context!;ctx.clearRect(0,0,config.width,config.height);ctx.drawImage(app.canvas,0,0);const pixels=ctx.getImageData(0,0,config.width,config.height).data;let count=0,transparent=0,minAlpha=255,minX=config.width,minY=config.height,maxX=-1,maxY=-1;
    for(let i=3;i<pixels.length;i+=4){const a=pixels[i];if(a<255){count++;if(a===0)transparent++;minAlpha=Math.min(minAlpha,a);const p=(i-3)/4,x=p%config.width,y=Math.floor(p/config.width);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}}
    const coverage={uncoveredPixels:count,fullyTransparentPixels:transparent,minAlpha,bounds:count?{x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1}:null};if(!includePNG)return{coverage};if(matte){ctx.globalCompositeOperation='destination-over';ctx.fillStyle='#ff00ff';ctx.fillRect(0,0,config.width,config.height);ctx.globalCompositeOperation='source-over';}return{png:readback.toDataURL('image/png'),coverage};}
  async function setConfig(input:CameraSceneConfig){const candidate=compileCamera(input),next=candidate.config();
    if(next.width!==config.width||next.height!==config.height){throw new Error('Scene composition size changes require recreating renderer');}
    const changed=next.layers.length!==config.layers.length||next.layers.some((l,i)=>l.id!==config.layers[i].id||l.asset!==config.layers[i].asset);
    if(changed)await loadLayers(next.layers);
    core=candidate;config=next;renderFrame(Math.min(frame,next.totalFrames-1));
  }
  renderFrame(0);
  return {app,renderFrame,capture,setConfig,
    setIntensity(value:number){intensity=clamp(finite(value,'intensity'),0,1);renderFrame(frame);},
    setVisible(id:string,visible:boolean){const index=config.layers.findIndex(l=>l.id===id);if(index<0)throw new Error(`Unknown layer ${id}`);config.layers[index].visible=visible;sprites[index].visible=visible;renderFrame(frame);},
    getState:()=>({frame,intensity,state:structuredClone(state),transforms:structuredClone(transforms),visible:Object.fromEntries(config.layers.map((l,i)=>[l.id,sprites[i].visible])),config:structuredClone(config)}),
    destroy(){app.destroy(true,{children:true});}};
}
export type CameraScene=Awaited<ReturnType<typeof createCameraScene>>;
