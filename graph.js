const NS='http://www.w3.org/2000/svg';
const svgEl=(tag,attrs={})=>{const el=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);return el;};
const htmlEl=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
const button=(text,action)=>{const el=htmlEl('button','quiet',text);el.type='button';el.addEventListener('click',action);return el;};
function lines(text){
 const result=[];let line='',size=0;
 for(const word of text.match(/[（(][A-Za-z0-9 .–-]+[）)]|[A-Za-z0-9]+|./gu)||[]){const width=[...word].reduce((n,char)=>n+(/[\x00-\x7F]/.test(char)?.55:1),0);if(line&&size+width>7.5){result.push(line);line='';size=0;}line+=word;size+=width;}
 if(line)result.push(line);return result;
}
export function renderRelations(container,{concept,concepts,relations,types,onSelect}){
 const adjacent=relations.filter(r=>r.source===concept.id||r.target===concept.id);
 const toolbar=htmlEl('div','relation-tools'),label=htmlEl('label','','关系类型'),filter=htmlEl('select','relation-filter');
 filter.setAttribute('aria-label','筛选关联类型');
 const options=[['all','全部关系'],...Object.entries(types).filter(([id])=>adjacent.some(r=>r.type===id))];
 for(const [value,title] of options){const option=htmlEl('option','',title);option.value=value;filter.append(option);}
 label.append(filter);toolbar.append(label);
 const status=htmlEl('span','relation-status');status.setAttribute('role','status');toolbar.append(status);
 const frame=htmlEl('div','graph-frame');frame.setAttribute('aria-label','局部知识图谱');
 const list=htmlEl('ul','relation-list'),pages=htmlEl('div','relation-pages');
 container.append(toolbar,pages,frame,list);
 const compact=matchMedia('(max-width: 680px)');
 let page=0;
 function render(){
  const filtered=adjacent.filter(r=>filter.value==='all'||r.type===filter.value),count=filtered.length;
  const size=compact.matches?2:8,cx=compact.matches?160:360,cy=compact.matches?215:220;
  const visible=filtered.slice(page*size,page*size+size);
  frame.replaceChildren();list.replaceChildren();pages.replaceChildren();
  status.textContent=`${count} 条关联`;
  if(!count){frame.hidden=true;return;}frame.hidden=false;
  const svg=svgEl('svg',{viewBox:compact.matches?'0 0 320 430':'0 0 720 440',width:compact.matches?320:720,height:compact.matches?430:440,role:'group','aria-label':`${concept.name}的局部知识图谱`});
  frame.classList.toggle('compact',compact.matches);
  const defs=svgEl('defs'),marker=svgEl('marker',{id:'relation-arrow',viewBox:'0 0 8 8',refX:7,refY:4,markerWidth:6,markerHeight:6,orient:'auto'});
  marker.append(svgEl('path',{d:'M0,1 L7,4 L0,7 Z',fill:'#8a9daa'}));defs.append(marker);svg.append(defs);
  const positions=visible.map((r,i)=>{const angle=-Math.PI/2+2*Math.PI*i/visible.length;return {r,x:compact.matches?cx:cx+260*Math.cos(angle),y:compact.matches?(i?370:60):cy+158*Math.sin(angle),id:r.source===concept.id?r.target:r.source};});
  const drawText=(parent,text,x,y,className)=>{const wrapped=lines(text),node=svgEl('text',{x,y:y-(wrapped.length-1)*9,class:className,'text-anchor':'middle','dominant-baseline':'central'});wrapped.forEach((line,i)=>{const span=svgEl('tspan',{x,dy:i?18:0});span.textContent=line;node.append(span);});parent.append(node);};
  for(const {r,x,y} of positions){
   const dx=x-cx,dy=y-cy,length=Math.hypot(dx,dy),ux=dx/length,uy=dy/length;
   const start={x:cx+ux*61,y:cy+uy*61},end={x:x-ux*55,y:y-uy*55};
   const a=r.source===concept.id?start:end,b=r.source===concept.id?end:start;
   const edge=svgEl('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:'relation-edge','data-relation':r.id});
   if(r.directed)edge.setAttribute('marker-end','url(#relation-arrow)');svg.append(edge);
   const t=svgEl('text',{x:compact.matches?cx+12:cx+dx*.54,y:cy+dy*.54-8,class:'edge-label','text-anchor':compact.matches?'start':'middle'});t.textContent=r.label;svg.append(t);
  }
  const center=svgEl('g',{class:'graph-center','data-concept-id':concept.id});center.append(svgEl('circle',{cx,cy,r:60}));drawText(center,concept.name,cx,cy,'node-label');svg.append(center);
  for(const {r,x,y,id} of positions){
   const other=concepts.get(id),node=svgEl('g',{class:'graph-node',tabindex:0,role:'button','aria-label':`查看${other.name}`,'data-concept-id':id,'data-relation':r.id});
   const title=svgEl('title');title.textContent=other.name;node.append(title,svgEl('circle',{cx:x,cy:y,r:54}));drawText(node,other.name,x,y,'node-label');
   const open=()=>onSelect(id);node.addEventListener('click',open);node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});
   const highlight=active=>{for(const el of container.querySelectorAll('[data-relation]'))el.classList.toggle('highlighted',active&&el.dataset.relation===r.id);};
   node.addEventListener('pointerenter',()=>highlight(true));node.addEventListener('pointerleave',()=>highlight(false));node.addEventListener('focus',()=>highlight(true));node.addEventListener('blur',()=>highlight(false));
   svg.append(node);
   const li=htmlEl('li','relation-item');li.dataset.relation=r.id;
   const heading=htmlEl('div','relation-heading');
   const source=concepts.get(r.source),target=concepts.get(r.target);
   for(const [index,c] of [source,target].entries()){
    if(index)heading.append(htmlEl('span','relation-verb',`${r.directed?'→':'↔'} ${r.label} ${r.directed?'→':'↔'}`));
    heading.append(c.id===concept.id?htmlEl('span','relation-current',c.name):button(c.name,()=>onSelect(c.id)));
   }
   li.append(heading,htmlEl('p','description',r.description));list.append(li);
  }
  frame.append(svg);
  pages.hidden=count<=size;
  if(count>size){const previous=button('上一组',()=>{page--;render();}),next=button('下一组',()=>{page++;render();});previous.disabled=page===0;next.disabled=(page+1)*size>=count;pages.append(previous,htmlEl('span','',`${page*size+1}–${Math.min((page+1)*size,count)} / ${count}`),next);}
  requestAnimationFrame(()=>{frame.scrollLeft=Math.max(0,(frame.scrollWidth-frame.clientWidth)/2);});
 }
 const reset=()=>{page=0;render();};
 filter.addEventListener('change',reset);compact.addEventListener('change',reset);render();
 return ()=>compact.removeEventListener('change',reset);
}
