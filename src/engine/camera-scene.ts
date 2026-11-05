import { Application, Assets, BlurFilter, Container, PerspectiveMesh, Sprite, Texture } from 'pixi.js';
import { compileCamera } from '../camera/evaluate.ts';
import { layerCorners, projectedLayerInfo, projectLayers } from '../camera/project.ts';
import { calibration, projectPlane } from '../camera/virtual-projection.ts';
import { focusBlur } from '../camera/advanced-moves.ts';
import { clamp, finite } from '../camera/easing.ts';
import type { CameraSceneConfig } from '../camera/types.ts';

export interface Coverage { uncoveredPixels: number; fullyTransparentPixels: number; minAlpha: number; bounds: { x:number;y:number;width:number;height:number } | null }
export async function createCameraScene(host: HTMLElement, input: CameraSceneConfig) {
  let core = compileCamera(input), config = core.config();
  const app = new Application();
  await app.init({ width:config.width,height:config.height,resolution:1,antialias:true,autoStart:false,preference:'webgl',preserveDrawingBuffer:true,background:'#000000',backgroundAlpha:1 });
  app.canvas.setAttribute('aria-label','Illustrated story scene preview'); app.canvas.setAttribute('role','img'); host.appendChild(app.canvas);
  const resizeObserver = new ResizeObserver(() => { const bounds=host.getBoundingClientRect(); if(!bounds.width||!bounds.height)return;const scale=Math.min(bounds.width/config.width,bounds.height/config.height);app.canvas.style.width=`${config.width*scale}px`;app.canvas.style.height=`${config.height*scale}px`; });resizeObserver.observe(host);
  const world = new Container(); app.stage.addChild(world);
  let sprites: Sprite[] = [], meshes: PerspectiveMesh[] = [], focusFilters: (BlurFilter | undefined)[] = [];
  let whipFilter: BlurFilter | undefined;
  async function loadLayers(layers: CameraSceneConfig['layers']) {
    const next: Sprite[] = [], nextMeshes: PerspectiveMesh[] = [];
    try {
      for (const layer of layers) {
        const texture = await Assets.load<Texture>(layer.asset);
        const sprite = new Sprite(texture); sprite.anchor.set(.5); sprite.alpha = layer.opacity ?? 1; sprite.visible = layer.visible ?? true;
        const mesh = new PerspectiveMesh({texture, verticesX: 20, verticesY: 20, x0:0, y0:0, x1:texture.width, y1:0, x2:texture.width, y2:texture.height, x3:0, y3:texture.height});
        mesh.visible = false;
        world.addChild(sprite); world.addChild(mesh); next.push(sprite); nextMeshes.push(mesh);
      }
    } catch (e) { [...next, ...nextMeshes].forEach(s => { world.removeChild(s); s.destroy(); }); throw e; }
    const previous=[...sprites, ...meshes]; sprites=next; meshes=nextMeshes; previous.forEach(s=>{world.removeChild(s);s.destroy();});
    focusFilters.forEach(filter=>filter?.destroy()); focusFilters=[];
  }
  await loadLayers(config.layers);
  let frame=0,intensity=1,state=core.evaluate(0),transforms=projectLayers(config,state);
  const readback=document.createElement('canvas');readback.width=config.width;readback.height=config.height;
  const context=readback.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('PNG export requires a 2D canvas context');
  function renderFrame(index:number){core.evaluate(index,intensity);renderTime(index/config.fps);}
  function renderTime(seconds:number){state=core.evaluateTime(seconds,intensity);frame=seconds*config.fps;
    const base=projectLayers(config,state), camera=state.virtualCamera, cal=calibration(config.width,config.height);
    const perspective=!!camera && (camera.x!==0||camera.y!==0||camera.z!==0||camera.yaw!==0||camera.pitch!==0||camera.roll!==0||camera.focalLength!==cal.focalLength||camera.principal.x!==config.width/2||camera.principal.y!==config.height/2);
    transforms=base.map((pose,i)=>{
      const layer=config.layers[i],sprite=sprites[i],mesh=meshes[i];
      sprite.position.set(pose.x,pose.y);sprite.scale.set(pose.scale);sprite.rotation=pose.roll*Math.PI/180;sprite.alpha=pose.opacity;
      sprite.visible=(layer.visible??true)&&!perspective; mesh.visible=false; mesh.alpha=pose.opacity;
      const blur=focusBlur(layer.depth,camera?.focus);
      sprite.filters=null;mesh.filters=null;
      if(blur>.01 && (layer.visible??true)) {
        const filter=focusFilters[i]??(focusFilters[i]=new BlurFilter({strength:blur,quality:2,resolution:.5}));
        filter.strength=blur;
        (perspective?mesh:sprite).filters=[filter];
      }
      if (!perspective || !camera) return pose;
      const corners=projectPlane(cal,camera,pose.depth,layerCorners(pose,sprite.texture.width,sprite.texture.height));
      if (corners && (layer.visible??true)) {
        mesh.setCorners(corners[0].x,corners[0].y,corners[1].x,corners[1].y,corners[2].x,corners[2].y,corners[3].x,corners[3].y);mesh.visible=true;
      }
      return projectedLayerInfo(config,pose,camera)??pose;
    });
    const motionBlur=camera?.motionBlur??0;
    if(motionBlur>.01){whipFilter??=new BlurFilter({strengthX:motionBlur,strengthY:0,quality:2,resolution:.5});whipFilter.strengthX=motionBlur;whipFilter.strengthY=0;world.filters=[whipFilter];}
    else world.filters=null;
    app.renderer.render({container:app.stage});
  }
  function capture(includePNG=true, matte=true):{png?:string;coverage:Coverage}{const ctx=context!;ctx.clearRect(0,0,config.width,config.height);ctx.drawImage(app.canvas,0,0);const pixels=ctx.getImageData(0,0,config.width,config.height).data;let count=0,transparent=0,minAlpha=255,minX=config.width,minY=config.height,maxX=-1,maxY=-1;
    for(let i=3;i<pixels.length;i+=4){const a=pixels[i];if(a<255){count++;if(a===0)transparent++;minAlpha=Math.min(minAlpha,a);const p=(i-3)/4,x=p%config.width,y=Math.floor(p/config.width);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}}
    const coverage={uncoveredPixels:count,fullyTransparentPixels:transparent,minAlpha,bounds:count?{x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1}:null};if(!includePNG)return{coverage};if(matte){ctx.globalCompositeOperation='destination-over';ctx.fillStyle='#000000';ctx.fillRect(0,0,config.width,config.height);ctx.globalCompositeOperation='source-over';}return{png:readback.toDataURL('image/png'),coverage};}
  async function setConfig(input:CameraSceneConfig){const candidate=compileCamera(input),next=candidate.config();
    if(next.width!==config.width||next.height!==config.height){throw new Error('Scene composition size changes require recreating renderer');}
    const changed=next.layers.length!==config.layers.length||next.layers.some((l,i)=>l.id!==config.layers[i].id||l.asset!==config.layers[i].asset);
    if(changed)await loadLayers(next.layers);
    core=candidate;config=next;renderTime(Math.min(frame/next.fps,next.totalFrames/next.fps));
  }
  renderFrame(0);
  return {app,renderFrame,renderTime,capture,setConfig,
    setIntensity(value:number){intensity=clamp(finite(value,'intensity'),0,1);renderTime(frame/config.fps);},
    setVisible(id:string,visible:boolean){const index=config.layers.findIndex(l=>l.id===id);if(index<0)throw new Error(`Unknown layer ${id}`);config.layers[index].visible=visible;sprites[index].visible=visible;renderTime(frame/config.fps);},
    getCameraView:()=>({...state.compositeCamera, virtualCamera:state.virtualCamera}),
    getState:()=>({frame,intensity,state:structuredClone(state),transforms:structuredClone(transforms),layerBlur:Object.fromEntries(config.layers.map(l=>[l.id,focusBlur(l.depth,state.virtualCamera?.focus)])),spriteAlpha:Object.fromEntries(config.layers.map((l,i)=>[l.id,sprites[i].alpha])),visible:Object.fromEntries(config.layers.map((l,i)=>[l.id,sprites[i].visible||meshes[i].visible])),config:structuredClone(config)}),
    destroy(){resizeObserver.disconnect();app.destroy(true,{children:true});focusFilters.forEach(filter=>filter?.destroy());whipFilter?.destroy();}};
}
export type CameraScene=Awaited<ReturnType<typeof createCameraScene>>;
