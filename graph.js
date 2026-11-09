const NS='http://www.w3.org/2000/svg';
const svgEl=(tag,attrs={})=>{const el=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);return el;};
const htmlEl=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
const button=(text,action)=>{const el=htmlEl('button','quiet',text);el.type='button';el.addEventListener('click',action);return el;};
const words=new Intl.Segmenter('zh-CN',{granularity:'word'});
const measure=document.createElement('canvas').getContext('2d');

// Balance complete words using the rendered font, then center the actual SVG bounds.
function fitLabel(node,name,x,y,radius){
 const style=getComputedStyle(node),base=Number.parseFloat(style.fontSize);
 const tokens=[...words.segment(name)].map(part=>part.segment);
 let chosen;
 for(let fontSize=base;fontSize>=10; fontSize-=.5){
  const lineHeight=fontSize*1.4;
  measure.font=`${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
  const total=measure.measureText(name).width;
  for(let count=1;count<=Math.min(4,tokens.length);count++){
   const height=fontSize+(count-1)*lineHeight;
   const maxWidth=2*Math.sqrt(Math.max(0,(radius-7)**2-(height/2)**2));
   const memo=new Map();
   function wrap(start,remaining){
    const key=`${start}:${remaining}`;if(memo.has(key))return memo.get(key);
    if(!remaining)return start===tokens.length?{cost:0,lines:[]}:null;
    let best=null;
    for(let end=start+1;end<=tokens.length-remaining+1;end++){
     const line=tokens.slice(start,end).join(''),width=measure.measureText(line).width;
     if(width>maxWidth)break;
     const tail=wrap(end,remaining-1);if(!tail)continue;
     const punctuation=/^[、，。；：）)]/.test(line)||/[（(]$/.test(line)?10000:0;
     const orphan=line.length===1&&count>1?10000:0;
     const cost=(width-total/count)**2+punctuation+orphan+tail.cost;
     if(!best||cost<best.cost)best={cost,lines:[line,...tail.lines]};
    }
    memo.set(key,best);return best;
   }
   const result=wrap(0,count);
   if(result){chosen={fontSize,lineHeight,lines:result.lines};break;}
  }
  if(chosen)break;
 }
 node.style.fontSize=`${chosen.fontSize}px`;
 node.replaceChildren();
 chosen.lines.forEach((line,i)=>{const span=svgEl('tspan',{x:0,y:i*chosen.lineHeight});span.textContent=line;node.append(span);});
 const bounds=node.getBBox();
 node.setAttribute('transform',`translate(${x-bounds.x-bounds.width/2},${y-bounds.y-bounds.height/2})`);
}

function createPreview(container){
 const preview=htmlEl('div','concept-preview');preview.id='concept-preview';
 preview.setAttribute('popover','manual');preview.setAttribute('role','tooltip');
 const title=htmlEl('strong',''),english=htmlEl('p','preview-english'),description=htmlEl('p','preview-description');
 preview.append(title,english,description);container.append(preview);
 const listeners=new AbortController();
 let anchor=null,showTimer,hideTimer;
 const cancelTimers=()=>{clearTimeout(showTimer);clearTimeout(hideTimer);};
 const hide=()=>{
  cancelTimers();anchor?.removeAttribute('aria-describedby');anchor=null;
  if(preview.matches(':popover-open'))preview.hidePopover();
 };
 const delayHide=()=>{clearTimeout(showTimer);clearTimeout(hideTimer);hideTimer=setTimeout(hide,180);};
 function show(node,concept){
  if(!node.isConnected||!container.closest('dialog')?.open)return;
  anchor=node;title.textContent=concept.name;english.textContent=concept.en;description.textContent=concept.description[0];
  node.setAttribute('aria-describedby',preview.id);preview.showPopover();
  const rect=node.getBoundingClientRect(),box=preview.getBoundingClientRect(),gap=12;
  let left,top;
  if(rect.right+gap+box.width<=innerWidth-gap){left=rect.right+gap;top=rect.top+(rect.height-box.height)/2;}
  else if(rect.left-gap-box.width>=gap){left=rect.left-gap-box.width;top=rect.top+(rect.height-box.height)/2;}
  else {left=rect.left+(rect.width-box.width)/2;top=rect.bottom+gap+box.height<=innerHeight-gap?rect.bottom+gap:rect.top-gap-box.height;}
  preview.style.left=`${Math.max(gap,Math.min(innerWidth-box.width-gap,left))}px`;
  preview.style.top=`${Math.max(gap,Math.min(innerHeight-box.height-gap,top))}px`;
 }
 function schedule(node,concept,delay){
  cancelTimers();if(anchor===node&&preview.matches(':popover-open'))return;
  hide();showTimer=setTimeout(()=>show(node,concept),delay);
 }
 preview.addEventListener('pointerenter',cancelTimers);
 preview.addEventListener('pointerleave',delayHide);
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&preview.matches(':popover-open')){event.preventDefault();event.stopImmediatePropagation();hide();}
 },{capture:true,signal:listeners.signal});
 window.addEventListener('scroll',hide,{capture:true,passive:true,signal:listeners.signal});
 window.addEventListener('resize',hide,{signal:listeners.signal});
 return {
  attach(node,concept){
   node.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')schedule(node,concept,250);});
   node.addEventListener('pointerleave',delayHide);
   node.addEventListener('focus',()=>{if(node.matches(':focus-visible'))schedule(node,concept,0);});
   node.addEventListener('blur',delayHide);
  },
  hide,
  dispose(){hide();listeners.abort();preview.remove();},
 };
}

export function renderRelations(container,{concept,concepts,relations,onSelect}){
 const adjacent=relations.filter(r=>r.source===concept.id||r.target===concept.id);
 const status=htmlEl('p','relation-status',`${adjacent.length} 条关联`);status.setAttribute('role','status');
 const frame=htmlEl('div','graph-frame');frame.setAttribute('aria-label','局部知识图谱');
 const list=htmlEl('ul','relation-list'),pages=htmlEl('div','relation-pages');
 container.append(status,pages,frame,list);
 const preview=createPreview(container),compact=matchMedia('(max-width: 680px)');
 let page=0,disposed=false,layoutFrame;
 function render(){
  preview.hide();cancelAnimationFrame(layoutFrame);
  const count=adjacent.length,size=compact.matches?2:8,cx=compact.matches?160:360,cy=compact.matches?215:220;
  const visible=adjacent.slice(page*size,page*size+size);
  frame.replaceChildren();list.replaceChildren();pages.replaceChildren();
  if(!count){frame.hidden=true;return;}frame.hidden=false;
  const svg=svgEl('svg',{viewBox:compact.matches?'0 0 320 430':'0 0 720 440',width:compact.matches?320:720,height:compact.matches?430:440,role:'group','aria-label':`${concept.name}的局部知识图谱`});
  frame.classList.toggle('compact',compact.matches);
  const defs=svgEl('defs'),marker=svgEl('marker',{id:'relation-arrow',viewBox:'0 0 8 8',refX:7,refY:4,markerWidth:6,markerHeight:6,orient:'auto'});
  marker.append(svgEl('path',{d:'M0,1 L7,4 L0,7 Z',fill:'#8a9daa'}));defs.append(marker);svg.append(defs);
  const positions=visible.map((r,i)=>{const angle=-Math.PI/2+2*Math.PI*i/visible.length;return {r,x:compact.matches?cx:cx+260*Math.cos(angle),y:compact.matches?(i?370:60):cy+158*Math.sin(angle),id:r.source===concept.id?r.target:r.source};});
  const labels=[];
  const drawText=(parent,name,x,y,radius)=>{
   const node=svgEl('text',{class:'node-label','text-anchor':'middle','aria-hidden':true});
   parent.append(node);labels.push({node,name,x,y,radius});
  };
  for(const {r,x,y} of positions){
   const dx=x-cx,dy=y-cy,length=Math.hypot(dx,dy),ux=dx/length,uy=dy/length;
   const start={x:cx+ux*61,y:cy+uy*61},end={x:x-ux*55,y:y-uy*55};
   const a=r.source===concept.id?start:end,b=r.source===concept.id?end:start;
   const edge=svgEl('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:'relation-edge','data-relation':r.id});
   if(r.directed)edge.setAttribute('marker-end','url(#relation-arrow)');svg.append(edge);
  }
  const center=svgEl('g',{class:'graph-center','data-concept-id':concept.id,tabindex:0,role:'img','aria-label':concept.name});
  center.append(svgEl('circle',{cx,cy,r:60}));drawText(center,concept.name,cx,cy,60);preview.attach(center,concept);svg.append(center);
  for(const {r,x,y,id} of positions){
   const other=concepts.get(id),node=svgEl('g',{class:'graph-node',tabindex:0,role:'button','aria-label':`查看${other.name}`,'data-concept-id':id,'data-relation':r.id});
   node.append(svgEl('circle',{cx:x,cy:y,r:54}));drawText(node,other.name,x,y,54);preview.attach(node,other);
   const open=()=>onSelect(id);node.addEventListener('click',open);node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});
   const highlight=active=>{for(const el of container.querySelectorAll('[data-relation]'))el.classList.toggle('highlighted',active&&el.dataset.relation===r.id);};
   node.addEventListener('pointerenter',()=>highlight(true));node.addEventListener('pointerleave',()=>highlight(false));node.addEventListener('focus',()=>highlight(true));node.addEventListener('blur',()=>highlight(false));
   svg.append(node);
   const li=htmlEl('li','relation-item');li.dataset.relation=r.id;
   const heading=htmlEl('div','relation-heading');
   const source=concepts.get(r.source),target=concepts.get(r.target);
   for(const [index,c] of [source,target].entries()){
    if(index)heading.append(htmlEl('span','relation-verb',r.directed?'→':'↔'));
    heading.append(c.id===concept.id?htmlEl('span','relation-current',c.name):button(c.name,()=>onSelect(c.id)));
   }
   li.append(heading,htmlEl('p','description',r.description));list.append(li);
  }
  frame.append(svg);
  const layout=()=>{
   if(disposed||!svg.isConnected||!svg.getClientRects().length)return;
   for(const {node,name,x,y,radius} of labels)fitLabel(node,name,x,y,radius);
  };
  layoutFrame=requestAnimationFrame(layout);document.fonts.ready.then(layout);
  pages.hidden=count<=size;
  if(count>size){const previous=button('上一组',()=>{page--;render();}),next=button('下一组',()=>{page++;render();});previous.disabled=page===0;next.disabled=(page+1)*size>=count;pages.append(previous,htmlEl('span','',`${page*size+1}–${Math.min((page+1)*size,count)} / ${count}`),next);}
  frame.scrollLeft=Math.max(0,(frame.scrollWidth-frame.clientWidth)/2);
 }
 const reset=()=>{page=0;render();};
 compact.addEventListener('change',reset);render();
 return ()=>{disposed=true;cancelAnimationFrame(layoutFrame);compact.removeEventListener('change',reset);preview.dispose();};
}
