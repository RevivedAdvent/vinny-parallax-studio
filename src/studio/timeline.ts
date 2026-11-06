import type { CameraSceneConfig } from '../camera/types.ts';
import { sceneDuration } from '../camera/animation.ts';
import { moveNames, type CameraMove } from '../camera/moves.ts';
import { layerEffectNames, type LayerEffect } from '../camera/layer-effects.ts';
import { atmosphereGroups, atmosphereGroupOrder, atmosphereNames, atmosphereTargetLabel, type AtmosphereEffect } from '../camera/atmosphere.ts';

const escape = (s:string) => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const display = (n:number) => String(Number(n.toPrecision(12)));

export function renderTimeline(options:{
  container:HTMLElement; scene:CameraSceneConfig; time:number;
  seek:(seconds:number)=>void; edit:(move:CameraMove)=>void; remove:(move:CameraMove)=>void;
  retime:(move:CameraMove,start:number,end:number)=>Promise<void>;
  effectEdit?:(effect:LayerEffect)=>void; effectRemove?:(effect:LayerEffect)=>void;
  effectRetime?:(effect:LayerEffect,start:number,end:number)=>Promise<void>;
  atmosphereEdit?:(effect:AtmosphereEffect)=>void; atmosphereRemove?:(effect:AtmosphereEffect)=>void;
  atmosphereRetime?:(effect:AtmosphereEffect,start:number,end:number)=>Promise<void>;
}) {
  const {container,scene}=options, duration=sceneDuration(scene), moves=scene.cameraMoves??[];
  const effects=[...(scene.layerEffects??[])].sort((a,b)=>a.start-b.start);
  const atmosphere=[...(scene.atmosphere??[])].sort((a,b)=>
    atmosphereGroupOrder.indexOf(atmosphereGroups[a.kind])-atmosphereGroupOrder.indexOf(atmosphereGroups[b.kind])
    || a.start-b.start || a.id.localeCompare(b.id));
  const targetName=(target:string)=>target==='camera'?'camera':scene.layers.find(l=>`layer:${l.id}`===target)?.name??'layer';
  const legacy=[
    ...scene.tracks.map(t=>({name:`Legacy ${targetName(t.target)} · ${t.property}`,start:t.startFrame/scene.fps,end:t.endFrame/scene.fps})),
    ...(scene.animationTracks??[]).map(t=>({name:`Legacy ${targetName(t.target)} · ${t.property}${t.enabled===false?' (disabled)':''}`,start:t.keyframes.reduce((a,k)=>Math.min(a,k.timeSeconds),Infinity),end:t.keyframes.reduce((a,k)=>Math.max(a,k.timeSeconds),-Infinity)})),
  ];
  const bar=(start:number,end:number,label:string,interactive:boolean)=>`<div class="timeline-lane"><span class="timeline-playhead" style="left:${options.time/duration*100}%"></span>${interactive?`<button type="button" class="timeline-bar" data-seek="${start}" style="left:${start/duration*100}%;width:${(end-start)/duration*100}%" title="${escape(label)}: ${display(start)}s to ${display(end)}s" aria-label="Seek to ${escape(label)} start at ${display(start)} seconds"></button>`:`<span class="timeline-bar legacy" style="left:${start/duration*100}%;width:${(end-start)/duration*100}%" title="${escape(label)}: ${display(start)}s to ${display(end)}s"></span>`}</div>`;
  const timingForm=(attribute:string,id:string,label:string,start:number,end:number,extra='')=>`<form class="timeline-edit" ${attribute}="${escape(id)}"><label>Start<input aria-label="Start seconds for ${escape(label)}" name="start" type="number" min="0" max="${duration}" step="any" required value="${display(start)}"></label><label>End<input aria-label="End seconds for ${escape(label)}" name="end" type="number" min="0" max="${duration}" step="any" required value="${display(end)}"></label><button type="submit" class="outline">Apply timing</button>${extra}<span class="timeline-error" role="alert"></span></form>`;
  container.innerHTML=`<div class="timeline-scroll"><div class="timeline-chart">
    <div class="timeline-ruler-row"><span>Track</span><div class="timeline-ruler">${Array.from({length:5},(_,i)=>`<button type="button" data-seek="${duration*i/4}" style="left:${i*25}%">${display(duration*i/4)}s</button>`).join('')}</div><span>Timing · seconds</span></div>
    ${moves.map(m=>`<div class="timeline-row effect-list-item" data-move="${escape(m.id)}"><div class="timeline-name"><b>${moveNames[m.type]}</b><small>Camera · ${display(m.start)}s – ${display(m.start+m.duration)}s</small></div>
      ${bar(m.start,m.start+m.duration,moveNames[m.type],true)}
      ${timingForm('data-timing',m.id,moveNames[m.type],m.start,m.start+m.duration,`<button type="button" data-edit="${escape(m.id)}">Edit</button><button type="button" data-delete="${escape(m.id)}">Delete</button>`)}</div>`).join('')}
    ${effects.map(e=>`<div class="timeline-row effect-list-item" data-effect="${escape(e.id)}"><div class="timeline-name"><b>${layerEffectNames[e.kind]}</b><small>Parallax · ${escape(e.layerIds.map(id=>scene.layers.find(l=>l.id===id)?.name??'layer').join(', '))} · ${display(e.start)}s – ${display(e.start+e.duration)}s</small></div>
      ${bar(e.start,e.start+e.duration,layerEffectNames[e.kind],true)}
      ${timingForm('data-effect-timing',e.id,layerEffectNames[e.kind],e.start,e.start+e.duration,`<button type="button" data-effect-edit="${escape(e.id)}">Edit</button><button type="button" data-effect-delete="${escape(e.id)}">Delete</button>`)}</div>`).join('')}
    ${atmosphere.map((e,index)=>`${index===0||atmosphereGroups[atmosphere[index-1].kind]!==atmosphereGroups[e.kind]?`<div class="timeline-group-label">${escape(atmosphereGroups[e.kind].toUpperCase())}</div>`:''}<div class="timeline-row effect-list-item atmosphere-row" data-atmos="${escape(e.id)}"><div class="timeline-name"><b>${escape(atmosphereNames[e.kind])}</b><small>${escape(atmosphereGroups[e.kind])} · ${escape(atmosphereTargetLabel(scene,e))} · ${display(e.start)}s – ${display(e.start+e.duration)}s${e.loop!==false?' · loop':''}</small></div>
      <div class="timeline-lane"><span class="timeline-playhead" style="left:${options.time/duration*100}%"></span><button type="button" class="timeline-bar atmosphere${e.loop!==false?' loop':''}" data-seek="${e.start}" style="left:${e.start/duration*100}%;width:${e.duration/duration*100}%" title="${escape(atmosphereNames[e.kind])}: ${display(e.start)}s to ${display(e.start+e.duration)}s" aria-label="Seek to ${escape(atmosphereNames[e.kind])} start at ${display(e.start)} seconds"></button></div>
      ${timingForm('data-atmos-timing',e.id,atmosphereNames[e.kind],e.start,e.start+e.duration,`<button type="button" data-atmos-edit="${escape(e.id)}">Edit</button><button type="button" data-atmos-delete="${escape(e.id)}">Delete</button>`)}</div>`).join('')}
    ${legacy.map(t=>`<div class="timeline-row legacy-row"><div class="timeline-name"><b>${escape(t.name)}</b><small>${display(t.start)}s – ${display(t.end)}s</small></div>${bar(t.start,t.end,t.name,false)}<span class="timeline-legacy-note">Legacy track · read-only</span></div>`).join('')}
    ${!moves.length&&!effects.length&&!atmosphere.length&&!legacy.length?'<p class="timeline-empty">No movements yet. Add camera movements, layer effects or atmosphere in their workspaces.</p>':''}
    </div></div>`;
  container.querySelectorAll<HTMLButtonElement>('[data-seek]').forEach(b=>b.onclick=()=>options.seek(Number(b.dataset.seek)));
  container.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach(b=>b.onclick=()=>options.edit(moves.find(m=>m.id===b.dataset.edit)!));
  container.querySelectorAll<HTMLButtonElement>('[data-delete]').forEach(b=>b.onclick=()=>options.remove(moves.find(m=>m.id===b.dataset.delete)!));
  container.querySelectorAll<HTMLButtonElement>('[data-effect-edit]').forEach(b=>b.onclick=()=>options.effectEdit?.(effects.find(e=>e.id===b.dataset.effectEdit)!));
  container.querySelectorAll<HTMLButtonElement>('[data-effect-delete]').forEach(b=>b.onclick=()=>options.effectRemove?.(effects.find(e=>e.id===b.dataset.effectDelete)!));
  container.querySelectorAll<HTMLButtonElement>('[data-atmos-edit]').forEach(b=>b.onclick=()=>options.atmosphereEdit?.(atmosphere.find(e=>e.id===b.dataset.atmosEdit)!));
  container.querySelectorAll<HTMLButtonElement>('[data-atmos-delete]').forEach(b=>b.onclick=()=>options.atmosphereRemove?.(atmosphere.find(e=>e.id===b.dataset.atmosDelete)!));
  const bindTiming=(form:HTMLFormElement,retime:(start:number,end:number)=>Promise<void>)=>{
    form.onsubmit=async event=>{
      event.preventDefault();
      const start=form.elements.namedItem('start') as HTMLInputElement, end=form.elements.namedItem('end') as HTMLInputElement;
      const error=form.querySelector<HTMLElement>('.timeline-error')!;
      if(!Number.isFinite(start.valueAsNumber)||!Number.isFinite(end.valueAsNumber)||end.valueAsNumber<=start.valueAsNumber){error.textContent='End must be later than start.';return;}
      const submit=form.querySelector<HTMLButtonElement>('[type=submit]')!;submit.disabled=true;error.textContent='';
      try {await retime(start.valueAsNumber,end.valueAsNumber);}
      catch(e){error.textContent=e instanceof Error?e.message:String(e);submit.disabled=false;}
    };
  };
  container.querySelectorAll<HTMLFormElement>('[data-timing]').forEach(form=>bindTiming(form,(start,end)=>{
    const move=moves.find(m=>m.id===form.dataset.timing)!;
    return options.retime(move,start,end);
  }));
  container.querySelectorAll<HTMLFormElement>('[data-effect-timing]').forEach(form=>bindTiming(form,(start,end)=>{
    const effect=effects.find(e=>e.id===form.dataset.effectTiming)!;
    if(!options.effectRetime)throw new Error('Layer effects cannot be retimed here.');
    return options.effectRetime(effect,start,end);
  }));
  container.querySelectorAll<HTMLFormElement>('[data-atmos-timing]').forEach(form=>bindTiming(form,(start,end)=>{
    const effect=atmosphere.find(e=>e.id===form.dataset.atmosTiming)!;
    if(!options.atmosphereRetime)throw new Error('Atmosphere effects cannot be retimed here.');
    return options.atmosphereRetime(effect,start,end);
  }));
}

export function updateTimelineTime(container:HTMLElement, seconds:number, duration:number) {
  container.querySelectorAll<HTMLElement>('.timeline-playhead').forEach(el=>el.style.left=`${Math.max(0,Math.min(1,seconds/duration))*100}%`);
}
