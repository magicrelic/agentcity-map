const $ = selector => document.querySelector(selector);
const viewport = $('#viewport'), world = $('#world'), nodesElement = $('#nodes'), edges = $('#edges');
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data, concepts, groups, sections, parentSection, tree, positions = new Map();
let expanded = new Set(), activeGroup = null, selected = null, view = {x:0,y:0,scale:1};
let readableOverview = false;
let focusBeforeDetail = null;
const narrow = () => matchMedia('(max-width:999px)').matches;
const groupNodeId = id => `group-${id}`;
function button(label, action, className = '') {
  const b = document.createElement('button'); b.type = 'button'; b.className = className;
  b.textContent = label; b.addEventListener('click', action); return b;
}
function closeMenu() {$('#sidebar').classList.remove('open'); $('#menu').setAttribute('aria-expanded','false');}
function setHash(id) {const next=id ? `#${encodeURIComponent(id)}` : location.pathname+location.search; if(location.hash!==`#${id}`) history.pushState(null,'',next);}
function paintTransform() {
  world.style.transform=`translate(${view.x}px,${view.y}px) scale(${view.scale})`;
  $('#zoom-label').textContent=`${Math.round(view.scale*100)}%`;
}
function bounds(items) {
  return {left:Math.min(...items.map(n=>n.x)),right:Math.max(...items.map(n=>n.x+n.w)),top:Math.min(...items.map(n=>n.y)),bottom:Math.max(...items.map(n=>n.y+n.h))};
}
function fit() {
  let items=[...positions.values()];
  if(activeGroup) items=items.filter(n=>n.group===activeGroup);
  if(!items.length) return;
  // A selected concept stays readable on a small canvas; the hierarchy remains available by panning.
  if(selected && (viewport.clientWidth<600 || viewport.clientHeight<400)) items=[positions.get(selected)].filter(Boolean);
  if(!items.length) return;
  if(readableOverview) items=items.filter(n=>n.type!=='root');
  const b=bounds(items), w=viewport.clientWidth, h=viewport.clientHeight;
  if(readableOverview){
    view.scale=Math.max(.75,Math.min(1,(w-60)/(b.right-b.left)));
    const left=w<600?items.find(n=>n.type==='concept').x:b.left;
    view.x=30-left*view.scale;view.y=80-b.top*view.scale;
  } else {
    view.scale=Math.max(.03,Math.min(1.1,(w-60)/(b.right-b.left),(h-145)/(b.bottom-b.top)));
    view.x=w/2-(b.left+b.right)/2*view.scale;
    view.y=(h+8)/2-(b.top+b.bottom)/2*view.scale;
  }
  paintTransform();
}
function zoom(factor, x=viewport.clientWidth/2, y=viewport.clientHeight/2) {
  const next=Math.max(.03,Math.min(2.5,view.scale*factor)), ratio=next/view.scale;
  view.x=x-(x-view.x)*ratio; view.y=y-(y-view.y)*ratio; view.scale=next; paintTransform();
}
function visibleChildren(n) {return expanded.has(n.id) ? n.children || [] : [];}
function layout() {
  positions=new Map();
  const measure=n=>{
    n.w=n.type==='group'?254:n.type==='section'?206:248;
    n.h=n.type==='group'?66:56;
    const children=visibleChildren(n);
    n.span=children.length ? Math.max(n.h,children.reduce((sum,c)=>sum+measure(c),0)+(children.length-1)*18) : n.h;
    return n.span;
  };
  tree.forEach(measure);
  const height=tree.reduce((sum,n)=>sum+n.span,0)+(tree.length-1)*32;
  const root={id:'root',name:data.title,type:'root',x:0,y:(height-104)/2,w:230,h:104,group:null};
  positions.set('root',root);
  const place=(n,parent,top)=>{
    n.x=parent.x+parent.w+72;n.y=top+(n.span-n.h)/2;
    positions.set(n.id,n);
    let cursor=top;
    for(const child of visibleChildren(n)){place(child,n,cursor);cursor+=child.span+18;}
  };
  let top=0;
  for(const n of tree){place(n,root,top);top+=n.span+32;}
}
function branchIds() {return [...groups.keys()].map(groupNodeId).concat([...sections.keys()]);}
function allExpanded() {return branchIds().every(id=>expanded.has(id));}
function render() {
  const focused=document.activeElement?.dataset?.id;
  layout(); nodesElement.replaceChildren(); edges.replaceChildren();
  for(const n of positions.values()) {
    if(n.type!=='root') {
      const parent=positions.get(n.parent);
      const x1=parent.x+parent.w, x2=n.x;
      const y1=parent.y+parent.h/2,y2=n.y+n.h/2, bend=(x1+x2)/2;
      const line=document.createElementNS('http://www.w3.org/2000/svg','path');
      line.setAttribute('d',`M${x1},${y1} H${bend} V${y2} H${x2}`);edges.append(line);
    }
    const b=button('',()=>activate(n),'node '+n.type+(selected===n.id?' selected':''));
    b.dataset.id=n.id;b.style.cssText=`left:${n.x}px;top:${n.y}px;width:${n.w}px;height:${n.h}px`;
    b.setAttribute('aria-label',n.type==='root'?'返回全图':n.name);
    if(n.children?.length) b.setAttribute('aria-expanded',String(expanded.has(n.id)));
    if(n.type==='concept') b.setAttribute('aria-pressed',String(selected===n.id));
    const title=document.createElement('span');title.textContent=n.name;b.append(title);
    if(n.type==='root'){const small=document.createElement('small');small.textContent=data.subtitle;b.append(small);}
    else if(n.children?.length){const count=document.createElement('span');count.className='node-count';count.textContent=expanded.has(n.id)?'−':`＋ ${n.count}`;b.append(count);}
    nodesElement.append(b);
  }
  $('#breadcrumb').textContent=activeGroup ? groups.get(activeGroup).question : '11 个知识组与资料来源';
  $('#toggle-all').disabled=false;
  $('#toggle-all').textContent=allExpanded()?'折叠所有':'展开所有';
  $('#toggle-all').setAttribute('aria-expanded',String(allExpanded()));
  $('#group-guide-title').textContent=activeGroup ? groups.get(activeGroup).title : '分类与阅读';
  $('#group-guide').textContent=activeGroup ? groups.get(activeGroup).guide : '按概念在研究中承担的主要任务归组，同一概念只保留一处，用关联链接连接不同领域。读论文时，从对象表示、演化规律一路找到求解、分析和验证方法。';
  document.querySelectorAll('.group-item').forEach(b=>b.setAttribute('aria-current',String(b.dataset.group===activeGroup)));
  if(focused) nodesElement.querySelector(`[data-id="${focused}"]`)?.focus({preventScroll:true});
}
function activate(n) {
  if(n.type==='root') return overview();
  if(n.type==='concept') return selectConcept(n.id);
  readableOverview=false;
  if(n.type==='group') {
    if(expanded.has(n.id) && activeGroup===n.group){expanded.delete(n.id);activeGroup=null;setHash('');}
    else {activeGroup=n.group;expanded.add(n.id);setHash(n.id);}
  } else {
    activeGroup=n.group;
    if(expanded.has(n.id)) expanded.delete(n.id); else expanded.add(n.id);
    setHash(groupNodeId(n.group));
  }
  hideDetail(false);closeMenu();render();fit();
}
function goGroup(id, updateHash=true) {
  readableOverview=false;
  activeGroup=id;expanded.add(groupNodeId(id));hideDetail(false);closeMenu();
  if(updateHash) setHash(groupNodeId(id));render();fit();
}
function overview(updateHash=true) {
  readableOverview=false;
  activeGroup=null;expanded.clear();hideDetail(false);closeMenu();
  if(updateHash) setHash('');render();fit();
}
function expandAll(updateHash=true) {
  expanded=new Set(branchIds());activeGroup=null;readableOverview=true;
  hideDetail(false);closeMenu();if(updateHash)setHash('all');render();fit();
}
function hideDetail(restoreFocus=true) {
  selected=null;$('#detail').hidden=true;$('.workspace').classList.remove('has-detail');
  if(restoreFocus) focusBeforeDetail?.focus({preventScroll:true});
}
function selectConcept(id, updateHash=true) {
  const c=concepts.get(id);if(!c) return;
  readableOverview=false;
  if($('#detail').hidden) focusBeforeDetail=document.activeElement;
  selected=id;activeGroup=c.group;expanded.add(groupNodeId(c.group));
  if(parentSection.has(id)) expanded.add(parentSection.get(id));
  if(updateHash) setHash(id);closeMenu();showDetail(c);render();fit();
  $('#detail-title').focus({preventScroll:true});
}
function showDetail(c) {
  const g=groups.get(c.group);$('#detail').hidden=false;$('.workspace').classList.add('has-detail');
  $('#detail-group').textContent=g.title;$('#copy-status').textContent='';
  $('#detail-body').innerHTML=`<h2 id="detail-title" tabindex="-1">${esc(c.name)}</h2>
    <p class="english">${esc(c.en)}</p><span class="kind">${esc(c.kind)}</span>
    <p class="meaning">${esc(c.meaning)}</p>
    ${c.group==='sources'?'':`<h3>直觉与区别</h3><p class="description">${esc(c.intuition)}</p>
      <h3>代表公式与读法</h3><div class="formula">${c.formulaHtml}</div><p class="symbols">${esc(c.symbols)}</p>
      <p class="description formula-reading">${esc(c.reading)}</p>
      <h3>具体例子</h3><p class="description example">${esc(c.example)}</p>`}
    <h3>${c.group==='sources'?'用途':'在论文中怎么用'}</h3><p class="description">${esc(c.use)}</p>
    ${c.group==='sources'?'':`<p class="description paper-role">${esc(c.inPaper)}</p>`}
    <h3>适用条件</h3><p class="description">${esc(c.condition)}</p>
    ${c.related.length?'<h3>关联概念</h3><ul class="related" id="related"></ul>':''}
    <h3>集智资料</h3><a class="source-link" target="_blank" rel="noopener noreferrer" href="${esc(c.source.url)}">${esc(c.source.title)}<small>${esc(new URL(c.source.url).hostname)}</small></a>
    ${c.references.length?`<h3>延伸阅读 · 原始论文与作者资料</h3>${c.references.map(r=>`<a class="reference-link" target="_blank" rel="noopener noreferrer" href="${esc(r.url)}">${esc(r.title)}<small>${esc(new URL(r.url).hostname)}</small></a>`).join('')}`:''}`;
  for(const relation of c.related){
    const li=document.createElement('li'),target=concepts.get(relation.id);
    const b=button(target.name,()=>selectConcept(target.id));
    const small=document.createElement('small');small.textContent=relation.label==='参见'?groups.get(target.group).title:relation.label;b.append(small);li.append(b);$('#related').append(li);
  }
  $('#detail-body').scrollTop=0;
}
function search() {
  const query=$('#search').value.trim().toLocaleLowerCase(), terms=query.split(/\s+/);
  $('#clear-search').hidden=!query;$('#search-results').hidden=!query;$('#groups').hidden=!!query;
  $('#search-results').replaceChildren();
  if(!query){$('#search-status').textContent=`${data.concepts.filter(c=>c.group!=='sources').length} 个概念 · 4 个资料入口`;return;}
  const matches=data.concepts.filter(c=>terms.every(t=>c.searchText.includes(t)));
  matches.sort((a,b)=>Number(b.name.toLowerCase().includes(query)||b.en.toLowerCase().includes(query))-Number(a.name.toLowerCase().includes(query)||a.en.toLowerCase().includes(query)));
  $('#search-status').textContent=`找到 ${matches.length} 个结果`;
  for(const c of matches) {
    const b=button(c.name,()=>selectConcept(c.id),'search-result');const sub=document.createElement('small');sub.textContent=groups.get(c.group).title+' / '+c.en;b.append(sub);$('#search-results').append(b);
  }
  if(!matches.length){const p=document.createElement('p');p.className='empty';p.textContent='没有找到匹配概念。试试中文名称、英文术语，或“稳定性”“预测”等用途关键词。';$('#search-results').append(p);}
}
function route() {
  let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{overview(false);return;}
  if(id==='all')expandAll(false);
  else if(concepts.has(id))selectConcept(id,false);
  else if(id.startsWith('group-')&&groups.has(id.slice(6)))goGroup(id.slice(6),false);
  // Preserve previously shared group links; concept links keep their existing IDs.
  else if(groups.has(id))goGroup(id,false);
  else overview(false);
}
async function init() {
  try {
    $('#load-error').hidden=true;
    const response=await fetch(document.querySelector('script[data-source]').dataset.source);
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    data=await response.json();concepts=new Map(data.concepts.map(c=>[c.id,c]));groups=new Map(data.groups.map(g=>[g.id,g]));sections=new Map();parentSection=new Map();
    tree=data.groups.map(g=>({id:groupNodeId(g.id),name:g.title,type:'group',group:g.id,parent:'root',count:g.concepts.length,
      children:g.sections.length ? g.sections.map(s=>{sections.set(s.id,s);return {id:s.id,name:s.title,type:'section',group:g.id,parent:groupNodeId(g.id),count:s.concepts.length,
        children:s.concepts.map(id=>{parentSection.set(id,s.id);return {id,name:concepts.get(id).name,type:'concept',group:g.id,parent:s.id};})};}) : g.concepts.map(id=>({id,name:concepts.get(id).name,type:'concept',group:g.id,parent:groupNodeId(g.id)}))}));
    for(const c of data.concepts)c.searchText=[c.name,c.en,c.meaning,c.formula,c.symbols,c.use,c.condition,c.intuition,c.reading,c.example,c.inPaper,groups.get(c.group).title].join(' ').toLocaleLowerCase();
    $('#groups').replaceChildren();
    for(const g of data.groups){const b=button('',()=>goGroup(g.id),'group-item');b.dataset.group=g.id;b.innerHTML=`<span>${esc(g.title)}</span><small>${g.concepts.length}</small>`;$('#groups').append(b);}
    search();route();
    if(narrow()&&!location.hash){$('#sidebar').classList.add('open');$('#menu').setAttribute('aria-expanded','true');}
  } catch(error) {$('#load-error').hidden=false;$('#search-status').textContent='导图尚未加载';console.error(error);}
}
$('#menu').addEventListener('click',()=>{const open=$('#sidebar').classList.toggle('open');$('#menu').setAttribute('aria-expanded',String(open));if(open)$('#search').focus();});
$('#search').addEventListener('input',()=>{if(data)search();});
$('#search').addEventListener('keydown',e=>{if(e.key==='Enter')$('#search-results button')?.click();});
$('#clear-search').addEventListener('click',()=>{$('#search').value='';search();$('#search').focus();});
$('#overview').addEventListener('click',()=>{if(data)overview();});
$('#toggle-all').addEventListener('click',()=>{if(data){if(allExpanded())overview();else expandAll();}});
$('#fit').addEventListener('click',()=>{readableOverview=false;fit();});$('#zoom-in').addEventListener('click',()=>zoom(1.2));$('#zoom-out').addEventListener('click',()=>zoom(1/1.2));
$('#close-detail').addEventListener('click',()=>{hideDetail();setHash(groupNodeId(activeGroup));render();fit();});
$('#copy-link').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.href);$('#copy-status').textContent='已复制';}catch{$('#copy-status').textContent='可复制浏览器地址栏中的链接';}});
$('#retry').addEventListener('click',init);
window.addEventListener('popstate',()=>{if(data)route();});
window.addEventListener('hashchange',()=>{if(data)route();});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    if($('#sidebar').classList.contains('open'))closeMenu();
    else if(selected){hideDetail();setHash(groupNodeId(activeGroup));render();fit();}
    else if(document.activeElement===$('#search')){$('#search').value='';search();}
  }
  if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();if(narrow()){$('#sidebar').classList.add('open');$('#menu').setAttribute('aria-expanded','true');}$('#search').focus();}
});
viewport.addEventListener('wheel',e=>{e.preventDefault();const r=viewport.getBoundingClientRect();zoom(Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top);},{passive:false});
const pointers=new Map();let gesture=null,suppressClick=false;
const centerAndDistance=()=>{const points=[...pointers.values()];return points.length===1 ? {x:points[0].x,y:points[0].y,distance:0} : {x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2,distance:Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y)};};
viewport.addEventListener('pointerdown',e=>{
  if(e.button!==0) return;
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});gesture=centerAndDistance();suppressClick=false;
  // Capture on the original node, so an unmoved tap still activates the concept.
  e.target.setPointerCapture(e.pointerId);
});
viewport.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId))return;
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const next=centerAndDistance();
  const dx=next.x-gesture.x,dy=next.y-gesture.y;
  if(Math.abs(dx)+Math.abs(dy)>3||suppressClick||pointers.size>1){
    suppressClick=true;viewport.classList.add('dragging');view.x+=dx;view.y+=dy;
    if(next.distance&&gesture.distance){const r=viewport.getBoundingClientRect();zoom(next.distance/gesture.distance,next.x-r.left,next.y-r.top);}else paintTransform();
    gesture=next;
  }
});
function release(e){pointers.delete(e.pointerId);gesture=pointers.size?centerAndDistance():null;if(!pointers.size)viewport.classList.remove('dragging');}
viewport.addEventListener('pointerup',release);viewport.addEventListener('pointercancel',release);
viewport.addEventListener('click',e=>{if(suppressClick){e.stopPropagation();e.preventDefault();suppressClick=false;}},{capture:true});
viewport.addEventListener('keydown',e=>{
  if(e.target!==viewport)return;
  const directions={ArrowLeft:[40,0],ArrowRight:[-40,0],ArrowUp:[0,40],ArrowDown:[0,-40]};
  if(directions[e.key]){e.preventDefault();view.x+=directions[e.key][0];view.y+=directions[e.key][1];paintTransform();}
  if(e.key==='+'||e.key==='=')zoom(1.2);if(e.key==='-')zoom(1/1.2);if(e.key==='0'){readableOverview=false;fit();}
});
let resizeFrame;
new ResizeObserver(()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{if(data)fit();});}).observe(viewport);
await init();
