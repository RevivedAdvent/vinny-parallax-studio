import type { CameraSceneConfig, Easing, Track } from '../camera/types.ts';
import { animationEasings, cameraPresets, channel, legacyChannel, effectTrack, effectDuration, editEffectTiming, neutralValue, propertyBounds, putKeyframe, deleteKeyframe, sceneDuration, snapSecond, keyframeValue, type AnimationProperty, type AnimationTrack } from '../camera/animation.ts';

const names: Record<AnimationProperty,string> = {x:'X position',y:'Y position',zoom:'Scale',dolly:'Depth-aware dolly',rotation:'Rotation',opacity:'Opacity'};
const easingName = (value:string) => ({ease_in:'Ease-in',ease_out:'Ease-out',ease_in_out:'Ease-in-out',overshoot_settle:'Overshoot and settle',linear:'Linear',hold:'Hold'}[value] ?? value);
const escape = (s:string) => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const uid = () => crypto.randomUUID();
export function createAnimateWorkspace(options: {
  getScene:()=>CameraSceneConfig; getTime:()=>number; seek:(seconds:number)=>void;
  commit:(scene:CameraSceneConfig)=>Promise<void>; notify:(message:string)=>void;
}) {
  let target:Track['target']='camera', property:AnimationProperty='dolly', preset='push', selected='', sceneId='';
  const $ = <T extends HTMLElement=HTMLElement>(id:string) => document.getElementById(id) as T;
  const current = () => (options.getScene().animationTracks ?? []).find(t=>t.target===target&&t.property===property);
  function targetName() { return target==='camera'?'Camera':options.getScene().layers.find(l=>`layer:${l.id}`===target)?.name??'Layer'; }
  const valueScale = () => property==='opacity'?100:1;
  function point() { return current()?.keyframes.find(k=>k.id===selected); }
  async function save(next:CameraSceneConfig) {
    try { await options.commit(next); render(); } catch(e) { options.notify(String(e)); }
  }
  function replace(track:AnimationTrack|undefined) {
    const next=structuredClone(options.getScene()), name=channel({target,property});
    next.animationTracks=(next.animationTracks??[]).filter(t=>channel(t)!==name);
    if(track?.keyframes.length)next.animationTracks.push(track);
    // Explicit editing of a channel replaces legacy contributions only for that channel.
    next.tracks=next.tracks.filter(t=>legacyChannel(t)!==name);
    void save(next);
  }
  function choose(nextTarget:Track['target'],nextProperty?:AnimationProperty) {
    target=nextTarget;property=nextProperty??(target==='camera'?'dolly':'x');selected='';render();
  }
  function render() {
    const cfg=options.getScene();
    if(sceneId!==cfg.id){sceneId=cfg.id;selected='';}
    if(target!=='camera'&&!cfg.layers.some(l=>`layer:${l.id}`===target)){target='camera';property='dolly';selected='';}
    const targets=$('animation-targets');if(!targets)return;
    targets.innerHTML=`<div class="panel-heading">ANIMATION TARGETS</div>${[{id:'camera',name:'Camera'},...cfg.layers.map(l=>({id:`layer:${l.id}`,name:l.name}))].map(t=>`<button class="animation-target ${target===t.id?'selected':''}" data-target="${escape(t.id)}">${escape(t.name)}<small>${[...(cfg.animationTracks??[]),...cfg.tracks].some(a=>a.target===t.id)?'● Animated':'Still'}</small></button>`).join('')}
      <p class="nav-help">Each image is independent. Camera movement uses each layer’s depth from Arrange.</p>
      ${target==='camera'?`<div class="panel-heading">CAMERA MOVEMENTS</div><div class="camera-catalogue">${cameraPresets.map(p=>`<button data-preset="${p.id}" class="camera-card ${preset===p.id?'selected':''}"><b>${p.name}</b><span>${p.description}</span></button>`).join('')}</div>`:''}`;
    targets.querySelectorAll<HTMLButtonElement>('[data-target]').forEach(b=>b.onclick=()=>choose(b.dataset.target as Track['target']));
    targets.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach(b=>b.onclick=()=>{
      preset=b.dataset.preset!;const p=cameraPresets.find(p=>p.id===preset)!;property=p.property;selected='';render();
      if(preset==='static')return;
      // Choosing a preset prepares a draft only, even when an effect already exists.
      $<HTMLInputElement>('effect-start').value='0';$<HTMLInputElement>('effect-duration').value=String(Math.min(3,sceneDuration(cfg)));
      $<HTMLInputElement>('effect-from').value=String(neutralValue(property));const bounds=propertyBounds(cfg,target,property);$<HTMLInputElement>('effect-to').value=String(Math.max(bounds.min,Math.min(bounds.max,p.to)));
    });
    renderInspector();renderTimeline();
  }
  function renderInspector() {
    const cfg=options.getScene(),track=current(),k=point(),first=track?.keyframes[0],last=track?.keyframes.at(-1),staticMode=target==='camera'&&preset==='static';
    const properties:AnimationProperty[]=target==='camera'?['x','y','zoom','dolly']:['x','y','zoom','rotation','opacity'];
    const bounds=propertyBounds(cfg,target,property),scale=valueScale();
    const input=(id:string,label:string,value:number,min:number,max:number,step='any')=>`<label class="field">${label}<input id="${id}" type="number" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
    const enabled=track?.enabled!==false;
    $('animation-inspector').innerHTML=`<div class="selected-name">${escape(targetName())} · Animation</div>
      ${staticMode?'<h3>Static / locked-off</h3><p class="nav-help">Reset the camera and clear its movement tracks. Layer animations will stay intact. Nothing changes until you confirm.</p><button id="camera-reset" class="outline">Reset camera movement…</button>':`
      <label class="field">Property<select id="animation-property">${properties.map(p=>`<option value="${p}" ${p===property?'selected':''}>${p==='zoom'&&target==='camera'?'Uniform zoom':names[p]}</option>`).join('')}</select></label>
      <p class="animation-note">${target==='camera'?'Camera right (+X) moves artwork left; camera down (+Y) moves artwork up. Dolly responds to depth; zoom scales all layers equally.':'Values are offsets from Arrange: X/Y in pixels, scale as a multiplier, rotation in degrees, opacity as a percentage of the layer’s base opacity.'}</p>
      <form id="effect-form"><div class="panel-heading">${track?'UPDATE':'CREATE'} EFFECT</div>
      ${input('effect-start','Start · seconds',first?.timeSeconds??snapSecond(options.getTime(),sceneDuration(cfg)),0,sceneDuration(cfg))}
      ${input('effect-duration','Duration · seconds',track?effectDuration(track):Math.min(3,sceneDuration(cfg)),.01,sceneDuration(cfg))}
      ${input('effect-from','Start value', (first?.value??neutralValue(property))*scale,bounds.min*scale,bounds.max*scale)}
      ${input('effect-to','End value',(last?.value??(property==='opacity'?0:property==='zoom'||property==='dolly'?1.2:80))*scale,bounds.min*scale,bounds.max*scale)}
      ${input('effect-intensity','Intensity · %',(track?.intensity??1)*100,0,100)}
      <label class="field">Easing<select id="effect-easing">${animationEasings.map(e=>`<option value="${e}" ${e===(first?.easing??'ease_in_out')?'selected':''}>${easingName(e)}</option>`).join('')}</select></label>
      <p class="animation-note">Apply updates this property’s effect while preserving its keyframes. Final value holds. ${cfg.tracks.some(t=>legacyChannel(t)===channel({target,property}))?'This channel has legacy animation; applying replaces it.':''}</p>
      <div class="row-actions"><button type="submit" class="outline">${track?'Update effect':'Create effect'}</button>${track?`<button id="effect-enabled" type="button">${enabled?'Disable':'Enable'}</button><button id="remove-effect" type="button">Delete / Reset</button>`:''}</div></form>
      <hr><div class="panel-heading">ONE-SECOND KEYFRAMES</div><p class="animation-note">Add at the playhead (snaps to a whole second). Select a diamond to edit its outgoing easing, time or value.</p>
      ${input('key-time','Time · seconds',k?.timeSeconds??snapSecond(options.getTime(),sceneDuration(cfg)),0,sceneDuration(cfg),'any')}
      ${input('key-value',property==='opacity'?'Value · %':'Value',(k?.value??(track?keyframeValue(track,options.getTime()):neutralValue(property)))*scale,bounds.min*scale,bounds.max*scale)}
      <label class="field">Segment easing<select id="key-easing">${animationEasings.map(e=>`<option value="${e}" ${e===(k?.easing??'linear')?'selected':''}>${easingName(e)}</option>`).join('')}</select></label>
      <div class="row-actions"><button id="add-key" class="outline">Add at playhead</button><button id="update-key" ${k?'':'disabled'}>Update keyframe</button><button id="delete-key" ${k?'':'disabled'}>Delete keyframe</button></div>`}`;
    if(staticMode){$('camera-reset').onclick=()=>{if(!confirm('Clear camera movement? Layer animations will remain.'))return;const next=structuredClone(cfg);next.tracks=next.tracks.filter(t=>t.target!=='camera');next.animationTracks=(next.animationTracks??[]).filter(t=>t.target!=='camera');next.camera.baseZoom=1;next.camera.anchor={x:cfg.width/2,y:cfg.height/2};void save(next);};return;}
    $('animation-property').onchange=e=>{property=(e.target as HTMLSelectElement).value as AnimationProperty;preset=property==='dolly'?'push':property==='x'?'pan':property==='y'?'tilt':'zoom';selected='';render();};
    const number=(id:string)=>$<HTMLInputElement>(id).valueAsNumber;
    const validKey=()=>{for(const id of ['key-value','key-time'])if(!$<HTMLInputElement>(id).reportValidity())return false;return true;};
    $('effect-form').onsubmit=e=>{e.preventDefault();try{const start=number('effect-start'),duration=number('effect-duration'),from=number('effect-from')/scale,to=number('effect-to')/scale,easing=$<HTMLSelectElement>('effect-easing').value as Easing;let next:AnimationTrack;if(track){const retimed=editEffectTiming(track,start,duration,cfg),firstPoint=retimed.keyframes[0],lastPoint=retimed.keyframes.at(-1)!;next={...retimed,intensity:number('effect-intensity')/100,keyframes:retimed.keyframes.map(k=>({...k,value:k.id===firstPoint.id?from:k.id===lastPoint.id?to:k.value,easing:k.id===lastPoint.id?easing:k.easing}))};}else next=effectTrack({id:uid(),target,property,start,duration,from,to,intensity:number('effect-intensity')/100,easing},cfg);selected='';replace(next);}catch(error){options.notify(String(error));}};
    if(track){$('effect-enabled').onclick=()=>replace({...track,enabled:!enabled});$('remove-effect').onclick=()=>{selected='';replace(undefined);};}
    $('add-key').onclick=()=>{if(!validKey())return;const t=track??{id:uid(),target,property,intensity:1,keyframes:[]};const time=snapSecond(options.getTime(),sceneDuration(cfg)),id=t.keyframes.find(p=>p.timeSeconds===time)?.id??uid();selected=id;replace(putKeyframe(t,{id,timeSeconds:time,value:number('key-value')/scale,easing:$<HTMLSelectElement>('key-easing').value as Easing}));};
    $('update-key').onclick=()=>{if(!k||!track||!validKey())return;const time=number('key-time')===k.timeSeconds?k.timeSeconds:snapSecond(number('key-time'),sceneDuration(cfg));if(track.keyframes.some(p=>p.id!==k.id&&p.timeSeconds===time)){options.notify('There is already a keyframe at that second.');return;}replace(putKeyframe(track,{...k,timeSeconds:time,value:number('key-value')/scale,easing:$<HTMLSelectElement>('key-easing').value as Easing}));};
    $('delete-key').onclick=()=>{if(track&&k){selected='';replace(deleteKeyframe(track,k.id));}};
  }
  function renderTimeline() {
    const cfg=options.getScene(),duration=sceneDuration(cfg),tracks=(cfg.animationTracks??[]).filter(t=>t.target==='camera'||t.target===target);
    const legacy=cfg.tracks.filter(t=>t.target==='camera'||t.target===target);
    $('animation-timeline').innerHTML=`<div class="timeline-head"><b>Animation</b><span id="animation-time"></span><button id="timeline-add-key">＋ Keyframe</button></div><div class="seconds-scroll"><div class="seconds-content" style="min-width:${Math.max(300,duration*48)}px"><div class="seconds-ruler">${Array.from({length:Math.floor(duration)+1},(_,i)=>`<button data-seek="${i}" style="left:${i/duration*100}%">${i}s</button>`).join('')}</div><div class="seconds-playhead" id="seconds-playhead"></div>${tracks.map(t=>`<div class="seconds-track"><button class="track-name" data-track="${escape(t.id)}">${escape(t.target==='camera'?'Camera':cfg.layers.find(l=>`layer:${l.id}`===t.target)?.name??'Layer')} · ${names[t.property]}${t.enabled===false?' · Disabled':''}</button><div class="seconds-lane">${t.keyframes.map(k=>`<button class="animation-key ${k.id===selected?'selected':''}" data-track-id="${escape(t.id)}" data-key="${escape(k.id)}" title="${escape(names[t.property])} at ${k.timeSeconds}s: ${k.value}" aria-label="${escape(names[t.property])} keyframe ${k.timeSeconds}s" style="left:${k.timeSeconds/duration*100}%"></button>`).join('')}</div></div>`).join('')}${legacy.length?`<p class="animation-note">${legacy.length} legacy frame track(s) preserved at ${cfg.fps} FPS. Editing a property explicitly replaces that legacy channel.</p>`:''}${!tracks.length?'<p class="animation-note">Choose a target and apply an effect, or add your first keyframe.</p>':''}</div></div>`;
    $('timeline-add-key').onclick=()=>{if($('add-key'))$('add-key').click();};
    $('animation-timeline').querySelectorAll<HTMLButtonElement>('[data-seek]').forEach(b=>b.onclick=()=>{options.seek(Number(b.dataset.seek));selected='';renderInspector();});
    $('animation-timeline').querySelectorAll<HTMLButtonElement>('[data-track]').forEach(b=>b.onclick=()=>{const t=tracks.find(t=>t.id===b.dataset.track)!;target=t.target;property=t.property;preset='';selected='';render();});
    $('animation-timeline').querySelectorAll<HTMLButtonElement>('[data-key]').forEach(b=>b.onclick=()=>{const t=tracks.find(t=>t.id===b.dataset.trackId)!,k=t.keyframes.find(k=>k.id===b.dataset.key)!;target=t.target;property=t.property;preset='';selected=k.id;options.seek(k.timeSeconds);render();});
    updateTime();
  }
  function updateTime() {
    const time=options.getTime(),duration=sceneDuration(options.getScene());
    if($('animation-time'))$('animation-time').textContent=`${time.toFixed(2)}s / ${duration.toFixed(2)}s`;
    if($('seconds-playhead'))$('seconds-playhead').style.left=`${time/duration*100}%`;
  }
  return {render,updateTime,selectLayer:(id:string)=>choose(`layer:${id}`)};
}
