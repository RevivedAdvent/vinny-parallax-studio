import { Application, Assets, BlurFilter, ColorMatrixFilter, Container, PerspectiveMesh, Sprite, Texture, type Filter, type ColorMatrix } from 'pixi.js';
import { compileCamera } from '../camera/evaluate.ts';
import { layerCorners, projectedLayerInfo, projectLayers } from '../camera/project.ts';
import { calibration, planePoint, projectPlane, projectPoint, type VirtualCamera } from '../camera/virtual-projection.ts';
import { focusBlur } from '../camera/advanced-moves.ts';
import { parallaxCamera, parallaxFactor, resolvedDepth } from '../camera/layer-effects.ts';
import { LayerMaskView } from './layer-masks.ts';
import { createAtmosphereView } from './atmosphere-view.ts';
import { clamp, finite } from '../camera/easing.ts';
import type { CameraSceneConfig } from '../camera/types.ts';

function tintMatrix(brightness:number,tint:number,amount:number,desaturate:number):ColorMatrix{
  const [lr,lg,lb]=[.2126,.7152,.0722],s=1-desaturate;
  const tr=((tint>>16)&255)/255,tg=((tint>>8)&255)/255,tb=(tint&255)/255;
  const row=(base:number,color:number)=>((1-amount)*(s*base+(1-s)*(base===lr?1:0))+amount*color)*brightness;
  return [
    row(lr,tr),s*lg*(1-amount)*brightness,s*lb*(1-amount)*brightness,0,0,
    s*lr*(1-amount)*brightness,row(lg,tg),s*lb*(1-amount)*brightness,0,0,
    s*lr*(1-amount)*brightness,s*lg*(1-amount)*brightness,row(lb,tb),0,0,
    0,0,0,1,0,
  ] as ColorMatrix;
}

export interface Coverage { uncoveredPixels: number; fullyTransparentPixels: number; minAlpha: number; bounds: { x:number;y:number;width:number;height:number } | null }
export async function createCameraScene(host: HTMLElement, input: CameraSceneConfig) {
  let core = compileCamera(input), config = core.config();
  const app = new Application();
  await app.init({ width:config.width,height:config.height,resolution:1,antialias:true,autoStart:false,preference:'webgl',preserveDrawingBuffer:true,background:'#000000',backgroundAlpha:1 });
  app.canvas.setAttribute('aria-label','Illustrated story scene preview'); app.canvas.setAttribute('role','img'); host.appendChild(app.canvas);
  const resizeObserver = new ResizeObserver(() => { const bounds=host.getBoundingClientRect(); if(!bounds.width||!bounds.height)return;const scale=Math.min(bounds.width/config.width,bounds.height/config.height);app.canvas.style.width=`${config.width*scale}px`;app.canvas.style.height=`${config.height*scale}px`; });resizeObserver.observe(host);
  const world = new Container(); app.stage.addChild(world);
  const atmosphereOverlay = new Container(); atmosphereOverlay.label = 'atmosphere-overlay'; app.stage.addChild(atmosphereOverlay);
  let groups: Container[] = [];
  let sprites: Sprite[] = [], meshes: PerspectiveMesh[] = [], focusFilters: (BlurFilter | undefined)[] = [];
  let atmosphereFilters: (ColorMatrixFilter | undefined)[] = [], sceneBrightnessFilter: ColorMatrixFilter | undefined;
  let maskViews: (LayerMaskView | undefined)[] = [];
  let shadowViews: (Sprite | undefined)[] = [], shadowFilters: (BlurFilter | undefined)[] = [];
  let silhouetteTextures: (Texture | undefined)[] = [];
  let wrapViews: Sprite[][] = [], particleViews: Sprite[][] = [];
  let whipFilter: BlurFilter | undefined;
  const atmosphereView = createAtmosphereView({
    world, overlay: atmosphereOverlay,
    textureFor: id => {
      const index = config.layers.findIndex(layer => layer.id === id);
      return index >= 0 ? sprites[index]?.texture : undefined;
    },
  });
  function disposeAtmosphereFilters() {
    atmosphereFilters.forEach(filter => filter?.destroy()); atmosphereFilters = [];
  }
  function disposeExtras() {
    shadowViews.forEach(view => view?.destroy()); shadowViews = [];
    shadowFilters.forEach(filter => filter?.destroy()); shadowFilters = [];
    silhouetteTextures.forEach(texture => texture?.destroy(true)); silhouetteTextures = [];
    wrapViews.forEach(views => views.forEach(view => view.destroy())); wrapViews = [];
    particleViews.forEach(views => views.forEach(view => view.destroy())); particleViews = [];
  }
  async function loadLayers(layers: CameraSceneConfig['layers']) {
    const nextSprites: Sprite[] = [], nextMeshes: PerspectiveMesh[] = [], nextGroups: Container[] = [];
    try {
      for (const layer of layers) {
        const texture = await Assets.load<Texture>(layer.asset);
        const group = new Container();
        const sprite = new Sprite(texture); sprite.anchor.set(.5); sprite.alpha = layer.opacity ?? 1; sprite.visible = layer.visible ?? true;
        const mesh = new PerspectiveMesh({texture, verticesX: 20, verticesY: 20, x0:0, y0:0, x1:texture.width, y1:0, x2:texture.width, y2:texture.height, x3:0, y3:texture.height});
        mesh.visible = false;
        group.addChild(sprite, mesh); world.addChild(group);
        nextSprites.push(sprite); nextMeshes.push(mesh); nextGroups.push(group);
      }
    } catch (e) {
      nextGroups.forEach(group => { world.removeChild(group); group.destroy({ children: true }); });
      throw e;
    }
    const previous = groups; groups = nextGroups; sprites = nextSprites; meshes = nextMeshes;
    previous.forEach(group => { world.removeChild(group); group.destroy({ children: true }); });
    focusFilters.forEach(filter => filter?.destroy()); focusFilters = [];
    disposeAtmosphereFilters();
    disposeExtras(); disposeMasks();
  }
  await loadLayers(config.layers);
  let frame=0,intensity=1,state=core.evaluate(0),transforms=projectLayers(config,state);
  const readback=document.createElement('canvas');readback.width=config.width;readback.height=config.height;
  const context=readback.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('PNG export requires a 2D canvas context');
  function renderFrame(index:number){core.evaluate(index,intensity);renderTime(index/config.fps);}
  function silhouette(index: number): Texture {
    const cached = silhouetteTextures[index];
    if (cached) return cached;
    const source = sprites[index].texture;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = source.width; canvas.height = source.height;
      const context = canvas.getContext('2d');
      if (!context) return source;
      context.drawImage(source.source.resource as CanvasImageSource, 0, 0, source.width, source.height);
      context.globalCompositeOperation = 'source-in';
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, source.width, source.height);
      return silhouetteTextures[index] = Texture.from(canvas);
    } catch { return source; }
  }
  function ensureShadow(index: number): Sprite {
    if (!shadowViews[index]) {
      const view = new Sprite(silhouette(index));
      view.anchor.set(.5); view.visible = false;
      groups[index].addChildAt(view, 0);
      shadowViews[index] = view;
    }
    return shadowViews[index]!;
  }
  function ensureWrap(index: number, count: number): Sprite[] {
    const views = wrapViews[index] ??= [];
    while (views.length < count) {
      const view = new Sprite(sprites[index].texture);
      view.anchor.set(.5); view.visible = false;
      groups[index].addChildAt(view, groups[index].getChildIndex(sprites[index]));
      views.push(view);
    }
    for (let i = count; i < views.length; i++) views[i].visible = false;
    return views;
  }
  function ensureParticles(index: number, count: number): Sprite[] {
    const views = particleViews[index] ??= [];
    while (views.length < count) {
      const view = new Sprite(sprites[index].texture);
      view.anchor.set(.5); view.visible = false;
      groups[index].addChild(view);
      views.push(view);
    }
    for (let i = count; i < views.length; i++) views[i].visible = false;
    return views;
  }
  function disposeShadow(index: number) {
    shadowViews[index]?.destroy(); shadowViews[index] = undefined;
    shadowFilters[index]?.destroy(); shadowFilters[index] = undefined;
  }
  function disposeWrap(index: number) {
    wrapViews[index]?.forEach(view => view.destroy()); wrapViews[index] = [];
  }
  function disposeParticles(index: number) {
    particleViews[index]?.forEach(view => view.destroy()); particleViews[index] = [];
  }
  function renderTime(seconds:number){state=core.evaluateTime(seconds,intensity);frame=seconds*config.fps;
    const base=projectLayers(config,state), camera=state.virtualCamera, cal=calibration(config.width,config.height);
    const perspective=!!camera && (camera.x!==0||camera.y!==0||camera.z!==0||camera.yaw!==0||camera.pitch!==0||camera.roll!==0||camera.focalLength!==cal.focalLength||camera.principal.x!==config.width/2||camera.principal.y!==config.height/2);
    transforms=base.map((pose,i)=>{
      const layer=config.layers[i],sprite=sprites[i],mesh=meshes[i],group=groups[i],visible=layer.visible??true;
      const warp=state.layerWarps?.[layer.id], particles=state.layerParticles?.[layer.id];
      const wrap=state.layerWraps?.[layer.id], shadow=state.layerShadows?.[layer.id];
      const warpActive=!!warp&&warp.some((corner,cornerIndex)=>Math.abs(corner.x-[-1,1,1,-1][cornerIndex])>1e-6||Math.abs(corner.y-[-1,-1,1,1][cornerIndex])>1e-6);
      const useMesh=perspective||warpActive;
      sprite.position.set(pose.x,pose.y);sprite.scale.set(pose.scale);sprite.rotation=pose.roll*Math.PI/180;sprite.alpha=pose.opacity;
      sprite.visible=visible&&!useMesh&&!wrap&&!particles; mesh.visible=false; mesh.alpha=pose.opacity;
      sprite.filters=null; mesh.filters=null;
      if(!visible){ disposeShadow(i); disposeWrap(i); disposeParticles(i); return pose; }
      const layerFilters: Filter[] = [];
      const atmosphere=state.atmosphere?.layers[layer.id];
      const blur=Math.min(24,focusBlur(resolvedDepth(config,layer.id),camera?.focus)+(atmosphere?.blur??0));
      if(blur>.01) {
        const filter=focusFilters[i]??(focusFilters[i]=new BlurFilter({strength:blur,quality:2,resolution:.5}));
        filter.strength=blur;
        layerFilters.push(filter);
      }
      if(atmosphere&&(atmosphere.tintAmount>.002||atmosphere.desaturate>.002||Math.abs(atmosphere.brightness-1)>.002)) {
        const filter=atmosphereFilters[i]??(atmosphereFilters[i]=new ColorMatrixFilter());
        filter.matrix=tintMatrix(atmosphere.brightness,atmosphere.tint?parseInt(atmosphere.tint.slice(1),16):0xffffff,Math.min(1,atmosphere.tintAmount),Math.min(1,atmosphere.desaturate));
        layerFilters.push(filter);
      }
      if(layerFilters.length) (useMesh?mesh:sprite).filters=layerFilters;
      const layerCamera=camera?parallaxCamera(camera,parallaxFactor(config,layer.id)):undefined;
      if(useMesh) {
        const corners=layerCorners(pose,sprite.texture.width,sprite.texture.height,warp);
        const projected=perspective&&layerCamera?projectPlane(cal,layerCamera,pose.depth,corners):corners;
        if(projected) {
          mesh.setCorners(projected[0].x,projected[0].y,projected[1].x,projected[1].y,projected[2].x,projected[2].y,projected[3].x,projected[3].y);
          mesh.visible=true; mesh.alpha=pose.opacity;
        } else if(!warpActive) sprite.visible=true;
      }
      if(shadow) {
        const view=ensureShadow(i);
        const shadowPose={...pose,x:pose.x+shadow.x,y:pose.y+shadow.y};
        const info=perspective&&camera?projectedLayerInfo(config,shadowPose,camera):shadowPose;
        if(info) {
          view.position.set(info.x,info.y); view.scale.set(info.scale); view.rotation=info.roll*Math.PI/180;
          view.alpha=pose.opacity*shadow.opacity; view.tint=parseInt(shadow.color.replace('#',''),16);
          if(shadow.blur>.01){const filter=shadowFilters[i]??(shadowFilters[i]=new BlurFilter({strength:shadow.blur,quality:2,resolution:.5}));filter.strength=shadow.blur;view.filters=[filter];}else view.filters=null;
          view.visible=true;
        }
      } else if(shadowViews[i]) disposeShadow(i);
      if(wrap&&!particles&&!warp) {
        const horizontal=wrap.x!==0;
        const extent=(horizontal?sprite.texture.width:sprite.texture.height)*pose.scale;
        if(extent>1) {
          const raw=horizontal?wrap.x:wrap.y;
          const offset=((raw%extent)+extent)%extent;
          const span=horizontal?config.width:config.height;
          const views=ensureWrap(i,Math.min(5,Math.max(3,Math.ceil(span/extent)+2)));
          views.forEach((view,k)=>{
            const shifted=k-(views.length-1)/2;
            const copy=horizontal?{...pose,x:pose.x+offset+shifted*extent}:{...pose,y:pose.y+offset+shifted*extent};
            const info=perspective&&camera?projectedLayerInfo(config,copy,camera):copy;
            if(!info){view.visible=false;return;}
            view.position.set(info.x,info.y); view.scale.set(info.scale); view.rotation=info.roll*Math.PI/180;
            view.alpha=pose.opacity; view.visible=true;
          });
        }
      } else if(wrapViews[i]?.length) disposeWrap(i);
      if(particles) {
        const views=ensureParticles(i,particles.length);
        const baseInfo=perspective&&camera?projectedLayerInfo(config,pose,camera):undefined;
        particles.forEach((particle,k)=>{
          const view=views[k];
          let x=pose.x+particle.x, y=pose.y+particle.y, scale=(particle.size/sprite.texture.width)*pose.scale;
          if(perspective&&layerCamera) {
            const center=projectPoint(layerCamera,planePoint(cal,pose.depth,{x,y}),cal.focalLength*.1);
            if(!center){view.visible=false;return;}
            x=center.x; y=center.y;
            if(baseInfo) scale=(particle.size/sprite.texture.width)*(baseInfo.scale/Math.max(.0001,pose.scale));
          }
          view.position.set(x,y); view.scale.set(scale); view.rotation=particle.rotation*Math.PI/180;
          view.alpha=particle.opacity*pose.opacity; view.visible=true;
        });
      } else if(particleViews[i]?.length) disposeParticles(i);
      return perspective&&camera?projectedLayerInfo(config,pose,camera)??pose:pose;
    });
    const motionBlur=camera?.motionBlur??0;
    const worldFilters: Filter[] = [];
    if(motionBlur>.01){whipFilter??=new BlurFilter({strengthX:motionBlur,strengthY:0,quality:2,resolution:.5});whipFilter.strengthX=motionBlur;whipFilter.strengthY=0;worldFilters.push(whipFilter);}
    const brightness=state.atmosphere?.sceneBrightness??1;
    const sceneTint=state.atmosphere?.sceneTint;
    if(Math.abs(brightness-1)>.002||(sceneTint?.amount??0)>.002){
      sceneBrightnessFilter??=new ColorMatrixFilter();
      sceneBrightnessFilter.matrix=tintMatrix(brightness,sceneTint?parseInt(sceneTint.color.slice(1),16):0xffffff,sceneTint?.amount??0,0);
      worldFilters.push(sceneBrightnessFilter);
    }
    world.filters=worldFilters.length?worldFilters:null;
    atmosphereView.configure(config);
    if(state.atmosphere) atmosphereView.update(state.atmosphere);
    applyMasks();
    app.renderer.render({container:app.stage});
  }
  /** Mask state is evaluated with the pose; only reveal effects ever set it. */
  function applyMasks(){const masks=state.layerMasks;config.layers.forEach((layer,i)=>{const target=meshes[i].visible?meshes[i]:sprites[i];const mask=masks?.[layer.id];
    if(!mask||mask.coverage>=.999){if(target.mask)target.mask=null;maskViews[i]?.hide();return;}
    let view=maskViews[i];if(!view){view=maskViews[i]=new LayerMaskView();world.addChild(view.sprite);}
    view.update(mask,config.width,config.height);target.setMask({mask:view.sprite,channel:'red'});});}
  function disposeMasks(){maskViews.forEach(view=>view?.destroy());maskViews=[];}
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
    /** Read-only snapshot for the Arrange overlay: no clones of atmosphere or mask state. */
    getAdjustView:()=>{const camera=state.virtualCamera,cal=calibration(config.width,config.height);return {width:config.width,height:config.height,
      camera:{...state.compositeCamera,virtualCamera:camera},
      roll:state.roll,uniformDelta:state.uniformDelta,dollyDelta:state.dollyDelta,
      perspective:!!camera&&(camera.x!==0||camera.y!==0||camera.z!==0||camera.yaw!==0||camera.pitch!==0||camera.roll!==0||camera.focalLength!==cal.focalLength||camera.principal.x!==config.width/2||camera.principal.y!==config.height/2),
      layers:config.layers.map((layer,index)=>{const pose=transforms[index];return {id:layer.id,x:pose?.x??0,y:pose?.y??0,scale:pose?.scale??1,roll:pose?.roll??0,opacity:pose?.opacity??1,depth:pose?.depth??layer.depth,visible:layer.visible??true,locked:layer.locked===true,
        width:layer.width??sprites[index]?.texture.width??0,height:layer.height??sprites[index]?.texture.height??0};})};},
    getState:()=>({frame,intensity,state:structuredClone(state),transforms:structuredClone(transforms),
      layerBlur:Object.fromEntries(config.layers.map(l=>[l.id,focusBlur(resolvedDepth(config,l.id),state.virtualCamera?.focus)])),
      spriteAlpha:Object.fromEntries(config.layers.map((l,i)=>[l.id,sprites[i].alpha])),
      visible:Object.fromEntries(config.layers.map((l,i)=>[l.id,sprites[i].visible||meshes[i].visible||(wrapViews[i]??[]).some(v=>v.visible)||(particleViews[i]??[]).some(v=>v.visible)])),
      shadows:Object.fromEntries(config.layers.map(l=>[l.id,state.layerShadows?.[l.id]??null])),
      warps:Object.fromEntries(config.layers.map(l=>[l.id,state.layerWarps?.[l.id]??null])),
      wraps:Object.fromEntries(config.layers.map(l=>[l.id,state.layerWraps?.[l.id]??null])),
      particles:Object.fromEntries(config.layers.map(l=>[l.id,state.layerParticles?.[l.id]?.length??0])),
      atmosphere:state.atmosphere?structuredClone(state.atmosphere):null,
      config:structuredClone(config)}),
    destroy(){resizeObserver.disconnect();disposeMasks();disposeExtras();disposeAtmosphereFilters();atmosphereView.destroy();sceneBrightnessFilter?.destroy();app.destroy(true,{children:true});focusFilters.forEach(filter=>filter?.destroy());whipFilter?.destroy();}};
}
export type CameraScene=Awaited<ReturnType<typeof createCameraScene>>;
