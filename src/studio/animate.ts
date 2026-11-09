import type { CameraSceneConfig } from '../camera/types.ts';
import { sceneDuration } from '../camera/animation.ts';
import { moveNames, basicMoves, spatialMoves, advancedMoves, type CameraMove, type CameraMoveType } from '../camera/moves.ts';
import { renderTimeline, updateTimelineTime } from './timeline.ts';
import { scenePoint, type Point, type View } from './coordinates.ts';
import { bindNumberSteppers, numberFieldHtml } from './number-stepper.ts';

// Moves whose X/Y fields are screen or target coordinates, so a picked point can fill them.
const pickable:(CameraMoveType|'static')[]=['push','pull','zoom','pan','tilt','truck','pedestal','diagonal','crane','tracking','dutch','dollyZoom','orbit'];
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const descriptions: Record<CameraMoveType,string> = {
  push:'Move toward a point in the scene.', pull:'Move back to reveal more of the scene.',
  pan:'Turn the camera left or right.', tilt:'Turn the camera up or down.',
  zoom:'Change the lens magnification around an anchor.',
  truck:'Slide the viewpoint sideways to a chosen X position.', pedestal:'Move the viewpoint up or down while keeping the framing level.',
  diagonal:'Move the viewpoint to a chosen X and Y in one continuous path.', crane:'Rise or descend on a boom while looking toward a target.',
  tracking:'Keep a chosen layer near a set screen position as the viewpoint moves.', reveal:'Slide selected foreground layers aside to uncover the artwork behind them.',
  dutch:'Roll the camera around a point.', handheld:'Add subtle, irregular camera drift.', impact:'Add a short, fading shake.',
  whip:'Turn quickly with optional directional blur.', dollyZoom:'Move the camera while holding a subject’s size.',
  rackFocus:'Shift visual focus between layer depths.', orbit:'Arc around a subject in the layered scene.',
};

export function createAnimateWorkspace(options: {
  getScene:()=>CameraSceneConfig; getSceneKey:()=>string; getTime:()=>number; getCameraView:()=>View; seek:(seconds:number)=>void;
  commit:(scene:CameraSceneConfig)=>Promise<void>; notify:(message:string)=>void; openCamera:()=>void; openParallax:(effectId:string)=>void; openAtmosphere:(effectId:string)=>void;
}) {
  let preset:CameraMoveType|'static'='push', selected='', sceneId='', picking=false;
  let picked:Point|null=null;
  const $ = <T extends HTMLElement=HTMLElement>(id:string) => document.getElementById(id) as T;
  async function save(next:CameraSceneConfig) {
    try { await options.commit(next); render(); } catch(e) { options.notify(String(e)); }
  }
  function render() {
    const cfg=options.getScene();
    if(sceneId!==options.getSceneKey()){sceneId=options.getSceneKey();selected='';preset='push';picked=null;stopPicker();}
    const move=cfg.cameraMoves?.find(m=>m.id===selected);
    if(selected&&!move)selected='';
    const card=(id:CameraMoveType)=>`<button data-preset="${id}" class="camera-card ${preset===id?'selected':''}"><b>${moveNames[id]}</b><span>${descriptions[id]}</span></button>`;
    $('animation-targets').innerHTML=`<div class="camera-catalogue">
      <button data-preset="static" class="camera-card ${preset==='static'?'selected':''}"><b>Static / locked-off</b><span>No camera movement.</span></button>
      ${basicMoves.map(card).join('')}</div>`;
    $('spatial-moves-targets').innerHTML=`<div class="camera-catalogue">${spatialMoves.map(card).join('')}</div>`;
    $('advanced-moves-targets').innerHTML=`<div class="camera-catalogue">${advancedMoves.map(card).join('')}</div>`;
    const counts: Record<string, number> = { 'camera-basic-count': basicMoves.length + 1, 'camera-spatial-count': spatialMoves.length, 'camera-advanced-count': advancedMoves.length };
    for (const [id, count] of Object.entries(counts)) { const badge = $(id); if (badge) badge.textContent = String(count); }
    document.querySelectorAll<HTMLButtonElement>('#camera-basic-moves [data-preset], #camera-spatial-moves [data-preset], #camera-advanced-moves [data-preset]').forEach(b=>b.onclick=()=>{preset=b.dataset.preset as typeof preset;selected='';render();});
    const inspector=$('animation-inspector');
    bindNumberSteppers(inspector);
    if(preset==='static') {
      inspector.innerHTML='<h3>Static / locked-off</h3><p class="animation-note">Clear camera movement and return to the original framing. Existing layer animations are kept.</p><button id="camera-reset" class="outline">Reset camera movement…</button>';
      $('camera-reset').onclick=()=>{if(!confirm('Clear all camera movement? Layer animations will remain.'))return;const next=structuredClone(cfg);next.tracks=next.tracks.filter(t=>t.target!=='camera');next.animationTracks=(next.animationTracks??[]).filter(t=>t.target!=='camera');next.cameraMoves=[];next.camera.baseZoom=1;next.camera.anchor={x:cfg.width/2,y:cfg.height/2};selected='';void save(next);};
    } else {
      const current=move?.type===preset?move:undefined;
      const legacy=!!current && current.model!==2;
      const input=(id:string,label:string,value:number,min:number,max:number)=>numberFieldHtml(id,label,value,min,max);
      inspector.innerHTML=`<h3>${moveNames[preset]}</h3><p class="animation-note">Coordinates are scene pixels, measured from the top left. ${legacy?'This saved movement retains its original camera behaviour.':'Depth affects physical camera moves; reveal moves only the selected layers.'}</p>
        <form id="effect-form">
        ${input('effect-start','Start · seconds',current?.start??0,0,sceneDuration(cfg))}
        ${input('effect-duration','Duration · seconds',current?.duration??Math.min(preset==='whip'?.35:preset==='impact'?.6:3,sceneDuration(cfg)),0,sceneDuration(cfg))}
        ${preset==='push'||preset==='pan'||(!legacy&&(preset==='pull'||preset==='zoom'))?input('camera-x',preset==='zoom'?'Anchor X · pixels':'Target X · pixels',current?.x??cfg.width/2,0,cfg.width):''}
        ${preset==='push'||preset==='tilt'||(!legacy&&(preset==='pull'||preset==='zoom'))?input('camera-y',preset==='zoom'?'Anchor Y · pixels':'Target Y · pixels',current?.y??cfg.height/2,0,cfg.height):''}
        ${picked&&pickable.includes(preset)&&!(legacy&&(preset==='pull'||preset==='zoom'))?`<button id="use-picked-point" type="button" class="outline">Use picked point · ${picked.x}, ${picked.y}</button>`:''}
        ${preset==='tracking'?`<label class="field">Target layer<select id="track-layer">${cfg.layers.map(l=>`<option value="${escape(l.id)}" ${l.id===(current?.layerId)?'selected':''}>${escape(l.name)}</option>`).join('')}</select></label>`:''}
        ${preset==='reveal'?`<fieldset class="reveal-layers"><legend>Layers to move aside</legend>${cfg.layers.map(l=>`<label class="field"><span>${escape(l.name)}</span><input type="checkbox" name="reveal-layer" value="${escape(l.id)}" ${(current?.layerIds??[]).includes(l.id)?'checked':''}></label>`).join('')}</fieldset>`:''}
        ${preset==='truck'||preset==='diagonal'||preset==='tracking'?input('camera-x',preset==='tracking'?'Screen X · pixels':'Target X · pixels',current?.x??cfg.width/2,0,cfg.width):''}
        ${preset==='pedestal'||preset==='diagonal'||preset==='crane'||preset==='tracking'?input('camera-y',preset==='tracking'?'Screen Y · pixels':preset==='crane'?'Vertical destination · pixels':'Target Y · pixels',current?.y??cfg.height/2,0,cfg.height):''}
        ${preset==='crane'&&!legacy?input('camera-look-x','Look-at X · pixels',current?.lookX??cfg.width/2,0,cfg.width)+input('camera-look-y','Look-at Y · pixels',current?.lookY??cfg.height/2,0,cfg.height):''}
        ${preset==='reveal'?input('camera-x','Offset X · pixels',current?.offsetX??0,-cfg.width,cfg.width)+input('camera-y','Offset Y · pixels',current?.offsetY??0,-cfg.height,cfg.height):''}
        ${['dollyZoom','orbit','rackFocus'].includes(preset)?`<label class="field">${preset==='rackFocus'?'End focus layer (optional)':'Target layer (optional)'}<select id="advanced-layer"><option value="">${preset==='rackFocus'?'Use ending depth':'Use scene point'}</option>${cfg.layers.map(l=>`<option value="${escape(l.id)}" ${l.id===current?.layerId?'selected':''}>${escape(l.name)}</option>`).join('')}</select></label>`:''}
        ${['dutch','dollyZoom','orbit'].includes(preset)?input('camera-x',preset==='dutch'?'Rotation center X · pixels':'Scene point X · pixels',current?.x??cfg.width/2,0,cfg.width)+input('camera-y',preset==='dutch'?'Rotation center Y · pixels':'Scene point Y · pixels',current?.y??cfg.height/2,0,cfg.height):''}
        ${preset==='dollyZoom'||preset==='orbit'?'<p class="animation-note">A selected layer replaces the scene point as the target.</p>':preset==='rackFocus'?'<p class="animation-note">A selected layer replaces the ending depth. Blur is applied per layer.</p>':''}
        ${['dutch','whip','orbit'].includes(preset)?input('camera-angle','Angle · degrees (− / +)',current?.angle??(preset==='orbit'?8:preset==='whip'?18:12),preset==='orbit'?-12:preset==='whip'?-20:-30,preset==='orbit'?12:preset==='whip'?20:30):''}
        ${['handheld','impact','rackFocus'].includes(preset)?input('camera-strength','Intensity · %',100*(current?.strength??(preset==='handheld'?.3:.6)),0,100):''}
        ${preset==='handheld'?input('camera-speed','Movement speed · ×',current?.speed??1,.1,5)+input('camera-seed','Variation seed',current?.seed??42,0,2147483647):''}
        ${preset==='whip'?`<label class="field">Directional blur<input type="checkbox" id="camera-blur" ${current?.blur===false?'':'checked'}></label>`:''}
        ${preset==='dollyZoom'?input('camera-travel','Travel · % (− out / + in)',100*(current?.travel??.15),-25,25):''}
        ${preset==='rackFocus'?input('focus-from','Starting depth',current?.focusFrom??0,0,1)+input('focus-to','Ending depth',current?.focusTo??1,0,1):''}
        ${preset==='orbit'?input('camera-radius','End radius · %',100*(current?.radius??1),80,120)+input('camera-elevation','Elevation · %',100*(current?.elevation??0),-5,5):''}
        ${!legacy&&(preset==='push'||preset==='pull')?input('camera-travel','Travel · %',100*(current?.travel??.2),0,35):''}
        ${preset==='zoom'||(legacy&&(preset==='push'||preset==='pull'))?input('camera-scale','End scale · ×',current?.scale??(preset==='pull'?.8:1.2),preset==='push'?1:.25,preset==='pull'?1:4):''}
        <p class="animation-note">${preset==='handheld'||preset==='impact'?'This effect fades to zero at the end.':preset==='whip'?'The whip accelerates and settles; blur is temporary.':'Moves hold their final position.'}</p>
        <div class="row-actions"><button class="outline" type="submit">${current?'Update movement':'Add movement'}</button>${current?'<button type="button" id="camera-add-another">＋ Add another</button><button type="button" id="cancel-edit">Cancel edit</button>':''}</div><p class="animation-note">The same movement can be added more than once; each copy keeps its own timing.</p></form>`;
      if(current)$('cancel-edit').onclick=()=>{selected='';render();};
      if(current)$('camera-add-another').onclick=()=>{selected='';render();};
      updatePickedButton();
      $('effect-form').onsubmit=e=>{
        e.preventDefault();
        const value=(id:string,fallback:number)=>$(id)?$<HTMLInputElement>(id).valueAsNumber:fallback;
        const next=structuredClone(cfg);
        if(!current && (next.tracks.some(t=>t.target==='camera')||(next.animationTracks??[]).some(t=>t.target==='camera'))) {
          if(!confirm('Replace existing legacy camera tracks with independent camera movements? Layer animation will remain.'))return;
          next.tracks=next.tracks.filter(t=>t.target!=='camera');next.animationTracks=(next.animationTracks??[]).filter(t=>t.target!=='camera');
        }
        const m:CameraMove={...current,id:current?.id??crypto.randomUUID(),type:preset as CameraMoveType,start:value('effect-start',0),duration:value('effect-duration',0),x:value('camera-x',current?.x??cfg.width/2),y:value('camera-y',current?.y??cfg.height/2),scale:value('camera-scale',current?.scale??(preset==='push'?1.2:preset==='pull'?.8:1))};
        if(!current)m.model=2;
        if(!legacy&&(preset==='push'||preset==='pull'))m.travel=value('camera-travel',20)/100;
        if(!legacy&&preset==='crane'){m.lookX=value('camera-look-x',cfg.width/2);m.lookY=value('camera-look-y',cfg.height/2);}
        if(['dutch','whip','orbit'].includes(preset))m.angle=value('camera-angle',0);
        if(['handheld','impact','rackFocus'].includes(preset))m.strength=value('camera-strength',0)/100;
        if(preset==='handheld'){m.speed=value('camera-speed',1);m.seed=value('camera-seed',42);}
        if(preset==='whip')m.blur=$<HTMLInputElement>('camera-blur').checked;
        if(preset==='dollyZoom')m.travel=value('camera-travel',15)/100;
        if(preset==='rackFocus'){m.focusFrom=value('focus-from',0);m.focusTo=value('focus-to',1);}
        if(preset==='orbit'){m.radius=value('camera-radius',100)/100;m.elevation=value('camera-elevation',0)/100;}
        if(['dollyZoom','orbit','rackFocus'].includes(preset))m.layerId=$<HTMLSelectElement>('advanced-layer').value||undefined;
        if(preset==='tracking')m.layerId=$<HTMLSelectElement>('track-layer').value;
        if(preset==='reveal'){m.layerIds=[...document.querySelectorAll<HTMLInputElement>('input[name=reveal-layer]:checked')].map(i=>i.value);m.offsetX=value('camera-x',0);m.offsetY=value('camera-y',0);m.x=cfg.width/2;m.y=cfg.height/2;}
        next.cameraMoves=current?(next.cameraMoves??[]).map(old=>old.id===current.id?m:old):[...(next.cameraMoves??[]),m];
        selected=m.id;void save(next);
      };
    }
    renderApplied(cfg);
    renderTimeline({container:$('effects-list'),scene:cfg,time:options.getTime(),seek:options.seek,
      edit:m=>{preset=m.type;selected=m.id;options.openCamera();render();},
      remove:m=>{if(!confirm('Delete this camera movement?'))return;const next=structuredClone(options.getScene());next.cameraMoves=(next.cameraMoves??[]).filter(old=>old.id!==m.id);selected='';void save(next);},
      retime:async(m,start,end)=>{const next=structuredClone(options.getScene()),move=next.cameraMoves?.find(old=>old.id===m.id);if(!move)throw new Error('Movement no longer exists.');move.start=start;move.duration=end-start;await options.commit(next);render();},
      effectEdit:e=>{options.openParallax(e.id);},
      effectRemove:e=>{if(!confirm('Delete this layer effect?'))return;const next=structuredClone(options.getScene());next.layerEffects=(next.layerEffects??[]).filter(old=>old.id!==e.id);void save(next);},
      effectRetime:async(e,start,end)=>{const next=structuredClone(options.getScene()),effect=(next.layerEffects??[]).find(old=>old.id===e.id);if(!effect)throw new Error('Effect no longer exists.');if(start<0||end<=start||end>sceneDuration(next)+1e-9)throw new Error('Effect must fit within the scene duration');effect.start=start;effect.duration=end-start;await options.commit(next);render();},
      atmosphereEdit:e=>{options.openAtmosphere(e.id);},
      atmosphereRemove:e=>{if(!confirm('Delete this atmosphere effect?'))return;const next=structuredClone(options.getScene());next.atmosphere=(next.atmosphere??[]).filter(old=>old.id!==e.id);void save(next);},
      atmosphereRetime:async(e,start,end)=>{const next=structuredClone(options.getScene()),effect=(next.atmosphere??[]).find(old=>old.id===e.id);if(!effect)throw new Error('Atmosphere effect no longer exists.');if(start<0||end<=start||end>sceneDuration(next)+1e-9)throw new Error('Effect must fit within the scene duration');effect.start=start;effect.duration=end-start;await options.commit(next);render();},
    });
    updateTime();
  }
  function updatePickedButton() {
    if(!picked||!pickable.includes(preset))return;
    const form=$('effect-form'), target=$('camera-look-y')||$('camera-y')||$('camera-x');if(!form||!target)return;
    let button=$<HTMLButtonElement>('use-picked-point');
    if(!button){button=document.createElement('button');button.id='use-picked-point';button.type='button';button.className='outline';target.closest('label')?.insertAdjacentElement('afterend',button);}
    button.textContent=`Use picked point · ${picked.x}, ${picked.y}`;
    button.onclick=()=>{if($('camera-look-x')){$<HTMLInputElement>('camera-look-x').value=String(picked!.x);$<HTMLInputElement>('camera-look-y').value=String(picked!.y);}else{if($('camera-x'))$<HTMLInputElement>('camera-x').value=String(picked!.x);if($('camera-y'))$<HTMLInputElement>('camera-y').value=String(picked!.y);}};
  }
  /** Compact list of authored camera movements, mirroring Parallax > Applied Effects. */
  function renderApplied(cfg:CameraSceneConfig) {
    const host=$('animation-effects-list');if(!host)return;
    const moves=[...(cfg.cameraMoves??[])].sort((a,b)=>a.start-b.start);
    host.innerHTML=moves.length?moves.map(m=>`<div class="parallax-item ${selected===m.id?'selected':''}"><div><b>${moveNames[m.type]}</b><small>${display(m.start)}s + ${display(m.duration)}s${m.layerId?` · ${escape(cfg.layers.find(l=>l.id===m.layerId)?.name??'layer')}`:''}</small></div><div class="parallax-actions"><button data-move-edit="${escape(m.id)}">Edit</button><button data-move-duplicate="${escape(m.id)}">Duplicate</button><button data-move-delete="${escape(m.id)}">Delete</button></div></div>`).join(''):'<p class="parallax-empty">No camera movements yet. Choose a move above.</p>';
    const appliedCount=$('animate-count');if(appliedCount)appliedCount.textContent=String(moves.length);
    host.querySelectorAll<HTMLButtonElement>('[data-move-edit]').forEach(b=>b.onclick=()=>{const move=cfg.cameraMoves?.find(m=>m.id===b.dataset.moveEdit);if(!move)return;preset=move.type;selected=move.id;render();});
    host.querySelectorAll<HTMLButtonElement>('[data-move-duplicate]').forEach(b=>b.onclick=()=>{const move=cfg.cameraMoves?.find(m=>m.id===b.dataset.moveDuplicate);if(!move)return;const next=structuredClone(cfg),copy={...structuredClone(move),id:crypto.randomUUID()};next.cameraMoves=[...(next.cameraMoves??[]),copy];preset=copy.type;selected=copy.id;void save(next);});
    host.querySelectorAll<HTMLButtonElement>('[data-move-delete]').forEach(b=>b.onclick=()=>{if(!confirm('Delete this camera movement?'))return;const next=structuredClone(cfg);next.cameraMoves=(next.cameraMoves??[]).filter(m=>m.id!==b.dataset.moveDelete);if(selected===b.dataset.moveDelete)selected='';void save(next);});
  }
  const display=(n:number)=>String(Number(n.toPrecision(12)));
  function updateTime() {
    const applied=$('animate-clock');if(applied)applied.textContent=`${options.getTime().toFixed(2)}s / ${sceneDuration(options.getScene()).toFixed(2)}s`;
    const clock=$('timeline-clock');if(!clock)return;
    const seconds=options.getTime(),duration=sceneDuration(options.getScene());
    clock.textContent=`${seconds.toFixed(2)}s / ${duration.toFixed(2)}s`;
    updateTimelineTime($('effects-list'),seconds,duration);
  }
  function stopPicker(){
    picking=false;const button=$<HTMLButtonElement>('coordinate-picker');if(!button)return;
    button.setAttribute('aria-pressed','false');$('canvas-host').classList.remove('picking');$('coordinate-overlay').hidden=true;
    $('coordinate-readout').textContent=picked?`Picked X: ${picked.x}, Y: ${picked.y}. Use this point in Camera Movements.`:'Turn on the picker, then hover over the preview.';
  }
  function bindPicker(){
    const host=$('canvas-host'),button=$<HTMLButtonElement>('coordinate-picker'),readout=$('coordinate-readout'),overlay=$('coordinate-overlay');
    const show=(message:string)=>{readout.textContent=message;overlay.textContent=message;};
    button.onclick=()=>{if(picking){stopPicker();return;}picking=true;button.setAttribute('aria-pressed','true');host.classList.add('picking');overlay.hidden=false;show('Hover over the image; click to select a point.');};
    function point(e:MouseEvent){
      if(!picking||!(e.target instanceof HTMLCanvasElement))return null;
      const cfg=options.getScene();
      const view=(preset==='tracking'||preset==='zoom'||preset==='dutch')?{x:0,y:0,scale:1}:options.getCameraView();
      return scenePoint({x:e.clientX,y:e.clientY},e.target.getBoundingClientRect(),cfg.width,cfg.height,view);
    }
    host.addEventListener('pointermove',e=>{
      const p=point(e);if(!p)return;const cfg=options.getScene(),inside=p.x>=0&&p.x<=cfg.width&&p.y>=0&&p.y<=cfg.height;
      const legacy=cfg.tracks.some(t=>t.target==='camera')||(cfg.animationTracks??[]).some(t=>t.target==='camera');
      const perspective=!!options.getCameraView().virtualCamera && preset!=='tracking' && preset!=='zoom' && preset!=='dutch';
      show(`X: ${p.x}, Y: ${p.y} px${inside?' · Click to select':' · Outside scene'}${legacy?' · Legacy camera tracks may affect accuracy':perspective?' · Middle-depth plane':''}`);
    });
    host.addEventListener('pointerleave',()=>{if(picking)show(picked?`Picked X: ${picked.x}, Y: ${picked.y}. Hover to inspect another point.`:'Hover over the image; click to select a point.');});
    host.addEventListener('click',e=>{const p=point(e);if(!p)return;const cfg=options.getScene();if(p.x<0||p.x>cfg.width||p.y<0||p.y>cfg.height){show('Point is outside the scene; choose a point inside it.');return;}picked=p;show(`Picked X: ${p.x}, Y: ${p.y}. Use this point in Camera Movements.`);updatePickedButton();});
  }
  return {render,updateTime,bindPicker,stopPicker};
}
