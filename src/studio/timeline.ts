import type { CameraSceneConfig } from '../camera/types.ts';
import { sceneDuration } from '../camera/animation.ts';
import { moveNames, type CameraMove } from '../camera/moves.ts';

const escape = (s:string) => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const display = (n:number) => String(Number(n.toPrecision(12)));

export function renderTimeline(options:{
  container:HTMLElement; scene:CameraSceneConfig; time:number;
  seek:(seconds:number)=>void; edit:(move:CameraMove)=>void; remove:(move:CameraMove)=>void;
  retime:(move:CameraMove,start:number,end:number)=>Promise<void>;
}) {
  const {container,scene}=options, duration=sceneDuration(scene), moves=scene.cameraMoves??[];
  const targetName=(target:string)=>target==='camera'?'camera':scene.layers.find(l=>`layer:${l.id}`===target)?.name??'layer';
  const legacy=[
    ...scene.tracks.map(t=>({name:`Legacy ${targetName(t.target)} · ${t.property}`,start:t.startFrame/scene.fps,end:t.endFrame/scene.fps})),
    ...(scene.animationTracks??[]).map(t=>({name:`Legacy ${targetName(t.target)} · ${t.property}${t.enabled===false?' (disabled)':''}`,start:t.keyframes.reduce((a,k)=>Math.min(a,k.timeSeconds),Infinity),end:t.keyframes.reduce((a,k)=>Math.max(a,k.timeSeconds),-Infinity)})),
  ];
  const bar=(start:number,end:number,label:string,interactive:boolean)=>`<div class="timeline-lane"><span class="timeline-playhead" style="left:${options.time/duration*100}%"></span>${interactive?`<button type="button" class="timeline-bar" data-seek="${start}" style="left:${start/duration*100}%;width:${(end-start)/duration*100}%" title="${escape(label)}: ${display(start)}s to ${display(end)}s" aria-label="Seek to ${escape(label)} start at ${display(start)} seconds"></button>`:`<span class="timeline-bar legacy" style="left:${start/duration*100}%;width:${(end-start)/duration*100}%" title="${escape(label)}: ${display(start)}s to ${display(end)}s"></span>`}</div>`;
  container.innerHTML=`<div class="timeline-scroll"><div class="timeline-chart">
    <div class="timeline-ruler-row"><span>Movement</span><div class="timeline-ruler">${Array.from({length:5},(_,i)=>`<button type="button" data-seek="${duration*i/4}" style="left:${i*25}%">${display(duration*i/4)}s</button>`).join('')}</div><span>Timing · seconds</span></div>
    ${moves.map(m=>`<div class="timeline-row effect-list-item" data-move="${escape(m.id)}"><div class="timeline-name"><b>${moveNames[m.type]}</b><small>${display(m.start)}s – ${display(m.start+m.duration)}s</small></div>
      ${bar(m.start,m.start+m.duration,moveNames[m.type],true)}
      <form class="timeline-edit" data-timing="${escape(m.id)}"><label>Start<input aria-label="Start seconds for ${moveNames[m.type]}" name="start" type="number" min="0" max="${duration}" step="any" required value="${display(m.start)}"></label><label>End<input aria-label="End seconds for ${moveNames[m.type]}" name="end" type="number" min="0" max="${duration}" step="any" required value="${display(m.start+m.duration)}"></label><button type="submit" class="outline">Apply timing</button><button type="button" data-edit="${escape(m.id)}">Edit</button><button type="button" data-delete="${escape(m.id)}">Delete</button><span class="timeline-error" role="alert"></span></form></div>`).join('')}
    ${legacy.map(t=>`<div class="timeline-row legacy-row"><div class="timeline-name"><b>${escape(t.name)}</b><small>${display(t.start)}s – ${display(t.end)}s</small></div>${bar(t.start,t.end,t.name,false)}<span class="timeline-legacy-note">Legacy track · read-only</span></div>`).join('')}
    ${!moves.length&&!legacy.length?'<p class="timeline-empty">No movements yet. Add one in Camera Movements.</p>':''}
    </div></div>${legacy.length?'<p class="timeline-note">Legacy tracks are shown for reference and cannot be retimed here. New camera movements can be edited above.</p>':''}`;
  container.querySelectorAll<HTMLButtonElement>('[data-seek]').forEach(b=>b.onclick=()=>options.seek(Number(b.dataset.seek)));
  container.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach(b=>b.onclick=()=>options.edit(moves.find(m=>m.id===b.dataset.edit)!));
  container.querySelectorAll<HTMLButtonElement>('[data-delete]').forEach(b=>b.onclick=()=>options.remove(moves.find(m=>m.id===b.dataset.delete)!));
  container.querySelectorAll<HTMLFormElement>('[data-timing]').forEach(form=>form.onsubmit=async event=>{
    event.preventDefault();
    const start=form.elements.namedItem('start') as HTMLInputElement, end=form.elements.namedItem('end') as HTMLInputElement;
    const error=form.querySelector<HTMLElement>('.timeline-error')!;
    if(!Number.isFinite(start.valueAsNumber)||!Number.isFinite(end.valueAsNumber)||end.valueAsNumber<=start.valueAsNumber){error.textContent='End must be later than start.';return;}
    const submit=form.querySelector<HTMLButtonElement>('[type=submit]')!;submit.disabled=true;error.textContent='';
    try {await options.retime(moves.find(m=>m.id===form.dataset.timing)!,start.valueAsNumber,end.valueAsNumber);}
    catch(e){error.textContent=e instanceof Error?e.message:String(e);submit.disabled=false;}
  });
}

export function updateTimelineTime(container:HTMLElement, seconds:number, duration:number) {
  container.querySelectorAll<HTMLElement>('.timeline-playhead').forEach(el=>el.style.left=`${Math.max(0,Math.min(1,seconds/duration))*100}%`);
}
