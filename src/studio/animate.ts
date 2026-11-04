import type { CameraSceneConfig } from '../camera/types.ts';
import { sceneDuration } from '../camera/animation.ts';
import { moveNames, type CameraMove, type CameraMoveType } from '../camera/moves.ts';
import { renderTimeline, updateTimelineTime } from './timeline.ts';
import { scenePoint, type Point, type View } from './coordinates.ts';

const descriptions: Record<CameraMoveType,string> = {
  push:'Move toward a point in the scene.', pull:'Move back to reveal more of the scene.',
  pan:'Move the camera horizontally to an X coordinate.', tilt:'Move the camera vertically to a Y coordinate.',
  zoom:'Change magnification around the center without shifting the viewpoint.',
};

export function createAnimateWorkspace(options: {
  getScene:()=>CameraSceneConfig; getSceneKey:()=>string; getTime:()=>number; getCameraView:()=>View; seek:(seconds:number)=>void;
  commit:(scene:CameraSceneConfig)=>Promise<void>; notify:(message:string)=>void; openCamera:()=>void;
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
    $('animation-targets').innerHTML=`<div class="camera-catalogue">
      <button data-preset="static" class="camera-card ${preset==='static'?'selected':''}"><b>Static / locked-off</b><span>No camera movement.</span></button>
      ${(Object.keys(moveNames) as CameraMoveType[]).map(id=>`<button data-preset="${id}" class="camera-card ${preset===id?'selected':''}"><b>${moveNames[id]}</b><span>${descriptions[id]}</span></button>`).join('')}</div>`;
    $('animation-targets').querySelectorAll<HTMLButtonElement>('[data-preset]').forEach(b=>b.onclick=()=>{preset=b.dataset.preset as typeof preset;selected='';render();});
    const inspector=$('animation-inspector');
    if(preset==='static') {
      inspector.innerHTML='<h3>Static / locked-off</h3><p class="animation-note">Clear camera movement and return to the original framing. Existing layer animations are kept.</p><button id="camera-reset" class="outline">Reset camera movement…</button>';
      $('camera-reset').onclick=()=>{if(!confirm('Clear all camera movement? Layer animations will remain.'))return;const next=structuredClone(cfg);next.tracks=next.tracks.filter(t=>t.target!=='camera');next.animationTracks=(next.animationTracks??[]).filter(t=>t.target!=='camera');next.cameraMoves=[];next.camera.baseZoom=1;next.camera.anchor={x:cfg.width/2,y:cfg.height/2};selected='';void save(next);};
    } else {
      const current=move?.type===preset?move:undefined;
      const input=(id:string,label:string,value:number,min:number,max:number)=>`<label class="field">${label}<input id="${id}" type="number" required min="${min}" max="${max}" step="any" value="${value}"></label>`;
      inspector.innerHTML=`<h3>${moveNames[preset]}</h3><p class="animation-note">Coordinates are scene pixels, measured from the top left. Camera movement applies to the entire composition, not individual layers.</p>
        <form id="effect-form">
        ${input('effect-start','Start · seconds',current?.start??0,0,sceneDuration(cfg))}
        ${input('effect-duration','Duration · seconds',current?.duration??Math.min(3,sceneDuration(cfg)),0,sceneDuration(cfg))}
        ${preset==='push'||preset==='pan'?input('camera-x','Target X · pixels',current?.x??cfg.width/2,0,cfg.width):''}
        ${preset==='push'||preset==='tilt'?input('camera-y','Target Y · pixels',current?.y??cfg.height/2,0,cfg.height):''}
        ${picked&&(preset==='push'||preset==='pan'||preset==='tilt')?`<button id="use-picked-point" type="button" class="outline">Use picked point · ${picked.x}, ${picked.y}</button>`:''}
        ${preset==='push'||preset==='pull'||preset==='zoom'?input('camera-scale','End scale · ×',current?.scale??(preset==='pull'?.8:1.2),preset==='push'?1:.25,preset==='pull'?1:4):''}
        <p class="animation-note">Moves progress at a constant rate and hold their final position. ${preset==='push'?'Flat artwork cannot produce true perspective change; this move shifts the viewpoint while enlarging the composition.':''}</p>
        <div class="row-actions"><button class="outline" type="submit">${current?'Update movement':'Add movement'}</button>${current?'<button type="button" id="cancel-edit">Cancel edit</button>':''}</div></form>`;
      if(current)$('cancel-edit').onclick=()=>{selected='';render();};
      updatePickedButton();
      $('effect-form').onsubmit=e=>{
        e.preventDefault();
        const value=(id:string,fallback:number)=>$(id)?$<HTMLInputElement>(id).valueAsNumber:fallback;
        const next=structuredClone(cfg);
        if(!current && (next.tracks.some(t=>t.target==='camera')||(next.animationTracks??[]).some(t=>t.target==='camera'))) {
          if(!confirm('Replace existing legacy camera tracks with independent camera movements? Layer animation will remain.'))return;
          next.tracks=next.tracks.filter(t=>t.target!=='camera');next.animationTracks=(next.animationTracks??[]).filter(t=>t.target!=='camera');
        }
        const m:CameraMove={id:current?.id??crypto.randomUUID(),type:preset as CameraMoveType,start:value('effect-start',0),duration:value('effect-duration',0),x:value('camera-x',cfg.width/2),y:value('camera-y',cfg.height/2),scale:value('camera-scale',1)};
        next.cameraMoves=current?(next.cameraMoves??[]).map(old=>old.id===current.id?m:old):[...(next.cameraMoves??[]),m];
        selected=m.id;void save(next);
      };
    }
    renderTimeline({container:$('effects-list'),scene:cfg,time:options.getTime(),seek:options.seek,
      edit:m=>{preset=m.type;selected=m.id;options.openCamera();render();},
      remove:m=>{if(!confirm('Delete this camera movement?'))return;const next=structuredClone(options.getScene());next.cameraMoves=(next.cameraMoves??[]).filter(old=>old.id!==m.id);selected='';void save(next);},
      retime:async(m,start,end)=>{const next=structuredClone(options.getScene()),move=next.cameraMoves?.find(old=>old.id===m.id);if(!move)throw new Error('Movement no longer exists.');move.start=start;move.duration=end-start;await options.commit(next);render();},
    });
    updateTime();
  }
  function updatePickedButton() {
    if(!picked||!['push','pan','tilt'].includes(preset))return;
    const form=$('effect-form');if(!form)return;
    let button=$<HTMLButtonElement>('use-picked-point');
    if(!button){button=document.createElement('button');button.id='use-picked-point';button.type='button';button.className='outline';const field=($('camera-y')||$('camera-x')).closest('label');field?.insertAdjacentElement('afterend',button);}
    button.textContent=`Use picked point · ${picked.x}, ${picked.y}`;
    button.onclick=()=>{if($('camera-x'))$<HTMLInputElement>('camera-x').value=String(picked!.x);if($('camera-y'))$<HTMLInputElement>('camera-y').value=String(picked!.y);};
  }
  function updateTime() {
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
      const cfg=options.getScene();return scenePoint({x:e.clientX,y:e.clientY},e.target.getBoundingClientRect(),cfg.width,cfg.height,options.getCameraView());
    }
    host.addEventListener('pointermove',e=>{
      const p=point(e);if(!p)return;const cfg=options.getScene(),inside=p.x>=0&&p.x<=cfg.width&&p.y>=0&&p.y<=cfg.height;
      const legacy=cfg.tracks.some(t=>t.target==='camera')||(cfg.animationTracks??[]).some(t=>t.target==='camera');
      show(`X: ${p.x}, Y: ${p.y} px${inside?' · Click to select':' · Outside scene'}${legacy?' · Legacy camera tracks may affect accuracy':''}`);
    });
    host.addEventListener('pointerleave',()=>{if(picking)show(picked?`Picked X: ${picked.x}, Y: ${picked.y}. Hover to inspect another point.`:'Hover over the image; click to select a point.');});
    host.addEventListener('click',e=>{const p=point(e);if(!p)return;const cfg=options.getScene();if(p.x<0||p.x>cfg.width||p.y<0||p.y>cfg.height){show('Point is outside the scene; choose a point inside it.');return;}picked=p;show(`Picked X: ${p.x}, Y: ${p.y}. Use this point in Camera Movements.`);updatePickedButton();});
  }
  return {render,updateTime,bindPicker,stopPicker};
}
