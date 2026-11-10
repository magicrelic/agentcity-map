import { renderRelations } from './graph.js?v=56a482069c2bd346656e00375d62966dc5100d2ac748e5e9a3bda38f7ed15bfc';
const $ = selector => document.querySelector(selector);
const browse = $('#browse'), outline = $('#outline'), entries = new Map();
const detail = $('#detail'), tooltip = $('#group-tooltip');
const depthControl = $('#expand-depth'), depthNames = ['','知识组','专题','概念'];
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data, concepts, groups, resources, figures, tree;
let expanded = new Set(), activeGroup = null, selected = null;
let focusBeforeDetail = null, disposeGraph = null;
let searchMatches = [], activeResult = -1, tooltipAnchor = null, tooltipTimer;
const groupNodeId = id => `group-${id}`;
function button(label, action, className = '') {
  const b = document.createElement('button'); b.type = 'button'; b.className = className;
  b.textContent = label; b.addEventListener('click', action); return b;
}
function hideGroupGuide() {
  clearTimeout(tooltipTimer);tooltip.hidden=true;
  tooltipAnchor?.removeAttribute('aria-describedby');tooltipAnchor=null;
}
function showGroupGuide(anchor, group) {
  hideGroupGuide();
  tooltipTimer=setTimeout(()=>{
    if(!anchor.isConnected||detail.open)return;
    tooltipAnchor=anchor;$('#group-tooltip-title').textContent=group.title;$('#group-tooltip-body').textContent=group.guide;
    tooltip.hidden=false;anchor.setAttribute('aria-describedby','group-tooltip');
    const r=anchor.querySelector('.row-title').getBoundingClientRect(), w=tooltip.offsetWidth, h=tooltip.offsetHeight;
    const top=r.bottom+10+h>innerHeight-12?r.top-h-10:r.bottom+10;
    tooltip.style.left=`${Math.max(12,Math.min(innerWidth-w-12,r.left))}px`;
    tooltip.style.top=`${Math.max(12,top)}px`;
  },300);
}
function deferHideGuide(){clearTimeout(tooltipTimer);tooltipTimer=setTimeout(hideGroupGuide,120);}
tooltip.addEventListener('pointerenter',()=>clearTimeout(tooltipTimer));
tooltip.addEventListener('pointerleave',hideGroupGuide);
function closeSearch() {
  $('#search-popover').hidden=true;$('#search').setAttribute('aria-expanded','false');
  $('#search').removeAttribute('aria-activedescendant');activeResult=-1;
}
function setHash(id) {
  const hash=id?`#${encodeURIComponent(id)}`:'';
  if(location.hash!==hash)history.pushState(null,'',hash||location.pathname+location.search);
}
function buildList(nodes,container) {
  for(const node of nodes){
    const item=document.createElement('li'),row=button('',()=>activate(node),`list-row ${node.type}`);
    row.dataset.id=node.id;row.setAttribute('aria-label',node.name);
    if(node.children){
      const chevron=document.createElement('span');chevron.className='chevron';chevron.setAttribute('aria-hidden','true');row.append(chevron);
      row.setAttribute('aria-controls',`children-${node.id}`);
    } else row.setAttribute('aria-haspopup','dialog');
    const text=document.createElement('span'),title=document.createElement('span');
    text.className='row-text';title.className='row-title';title.textContent=node.name;text.append(title);row.append(text);
    if(node.type==='concept'){
      row.dataset.conceptId=node.conceptId;
      const english=document.createElement('span');english.className='row-en';english.textContent=concepts.get(node.conceptId).en;text.append(english);
    } else {
      const count=document.createElement('span');count.className='row-count';count.textContent=`${node.count} 项`;count.setAttribute('aria-hidden','true');row.append(count);
    }
    if(node.type==='group'){
      row.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')showGroupGuide(row,groups.get(node.group));});
      row.addEventListener('pointerleave',deferHideGuide);
      row.addEventListener('focus',()=>{if(row.matches(':focus-visible'))showGroupGuide(row,groups.get(node.group));});
      row.addEventListener('blur',hideGroupGuide);
    }
    item.append(row);container.append(item);
    const children=node.children?document.createElement('ul'):null;
    entries.set(node.id,{node,row,children});
    if(children){children.id=`children-${node.id}`;children.hidden=true;item.append(children);buildList(node.children,children);}
  }
}
function expansionAt(level) {
  return new Set([...entries.values()].filter(({node})=>node.children&&node.depth<level).map(({node})=>node.id));
}
function visibleNodes(nodes=tree) {
  return nodes.flatMap(node=>[node,...(node.children&&expanded.has(node.id)?visibleNodes(node.children):[])]);
}
function render() {
  hideGroupGuide();
  for(const {node,row,children} of entries.values()){
    row.classList.toggle('selected',selected===node.id);
    if(children){children.hidden=!expanded.has(node.id);row.setAttribute('aria-expanded',String(!children.hidden));}
  }
  const visible=visibleNodes(),level=Math.max(...visible.map(node=>node.depth)),preset=expansionAt(level);
  const branches=visible.filter(node=>node.children&&expanded.has(node.id));
  const partial=preset.size!==branches.length||branches.some(node=>!preset.has(node.id));
  depthControl.disabled=false;depthControl.value=level;depthControl.dataset.partial=String(partial);
  depthControl.setAttribute('aria-valuetext',partial?`局部展开，最深 ${level} 级`:`${level} 级，${depthNames[level]}`);
  $('#depth-label').textContent=`${level} 级 · ${partial?'局部':depthNames[level]}`;
}
function expandAncestors(id) {
  let parent=entries.get(id).node.parent;
  while(parent){expanded.add(parent);parent=entries.get(parent).node.parent;}
}
function activate(node) {
  if(node.type==='concept')return selectConcept(node.conceptId,true,node.id);
  const open=!expanded.has(node.id);
  if(open)expanded.add(node.id);else expanded.delete(node.id);
  activeGroup=node.group;hideDetail();closeSearch();
  setHash(open?node.id:node.parent||'');render();
}
function goBranch(id) {
  activeGroup=entries.get(id).node.group;expandAncestors(id);expanded.add(id);
  hideDetail();closeSearch();render();entries.get(id).row.scrollIntoView({block:'nearest'});
}
function setDepth(level,updateHash=true) {
  expanded=expansionAt(level);activeGroup=null;hideDetail();closeSearch();
  if(updateHash)setHash(level===1?'':level===3?'all':'level-2');
  render();browse.scrollTop=0;
}
function hideDetail() {
  disposeGraph?.();disposeGraph=null;
  selected=null;if(detail.open)detail.close();
}
function closeDetail() {
  const id=selected;
  hideDetail();setHash(groupNodeId(activeGroup));render();
  const target=focusBeforeDetail?.isConnected&&focusBeforeDetail!==document.body?focusBeforeDetail:entries.get(id).row;
  target.focus({preventScroll:true});
  if(outline.contains(target))target.scrollIntoView({block:'nearest'});
}
function selectConcept(id,updateHash=true,entryId=null) {
  const c=concepts.get(id);if(!c)return;
  entryId??=[...entries.values()].find(({node})=>node.conceptId===id&&node.group===activeGroup)?.node.id||id;
  if(!detail.open)focusBeforeDetail=document.activeElement.closest('.search-area')?$('#search'):document.activeElement;
  selected=entryId;activeGroup=entries.get(entryId).node.group;expandAncestors(entryId);
  if(updateHash)setHash(entryId);
  closeSearch();render();entries.get(entryId).row.scrollIntoView({block:'nearest'});showDetail(c);
  if(!detail.open)detail.showModal();
  $('#detail-title').focus({preventScroll:true});
}
function showDetail(c) {
  disposeGraph?.();disposeGraph=null;
  $('#detail-group').textContent=groups.get(activeGroup).title;$('#copy-status').textContent='';
  const adjacent=data.relations.filter(r=>r.source===c.id||r.target===c.id);
  const illustrations=c.figures.map(id=>figures.get(id));
  const referenceIds=[...new Set([...c.references,...illustrations.flatMap(f=>f.references),...adjacent.flatMap(r=>r.references)])];
  const paragraphs=items=>items.map(text=>`<p class="description">${esc(text)}</p>`).join('');
  const chapter=(id,title,body)=>`<section class="concept-chapter" id="chapter-${id}" aria-labelledby="heading-${id}"><h3 id="heading-${id}">${title}</h3>${body}</section>`;
  const figureHtml=illustrations.map(f=>`<figure class="concept-figure"><img src="${esc(f.src)}" alt="${esc(f.alt)}" loading="lazy"><figcaption>${esc(f.caption)} <button class="reference-jump" data-reference="${esc(f.references[0])}">图片来源</button></figcaption></figure>`).join('');
  const referenceHtml=`<ol class="reference-list">${referenceIds.map(id=>{
    const r=resources.get(id);
    return `<li id="ref-${esc(id)}">${r.url?`<a target="_blank" rel="noopener noreferrer" href="${esc(r.url)}">${esc(r.title)}</a>`:`<span>${esc(r.title)}</span>`}
      ${r.url?`<small>${esc(new URL(r.url).hostname)}</small>`:''}
      ${r.author?`<p>${esc(r.author)}</p>`:''}${r.note?`<p>${esc(r.note)}</p>`:''}
      ${r.license?`<p>${r.licenseUrl?`<a target="_blank" rel="noopener noreferrer" href="${esc(r.licenseUrl)}">${esc(r.license)}</a>`:esc(r.license)}</p>`:''}</li>`;
  }).join('')}</ol>`;
  const chapters=[['explanation','概念解释'],...(c.math?[['math','数学描述']]:[]),...(c.examples.length||illustrations.length?[['examples','例子与图解']]:[]),...(adjacent.length?[['relations','关联概念']]:[]),['references','参考资料']];
  $('#detail-body').innerHTML=`<h2 id="detail-title" tabindex="-1">${esc(c.name)}</h2><p class="english">${esc(c.en)}</p>
    <p class="meaning">${esc(c.summary)}</p>
    <nav class="chapter-nav" aria-label="概念章节">${chapters.map(([id,title])=>`<button data-chapter="${id}">${title}</button>`).join('')}</nav>
    ${chapter('explanation','概念解释',paragraphs(c.description))}
    ${c.math?chapter('math','数学描述',`<div class="formula">${c.math.formulaHtml}</div><p class="symbols">${esc(c.math.symbols)}</p>${paragraphs(c.math.explanation)}`):''}
    ${c.examples.length||illustrations.length?chapter('examples','例子与图解',paragraphs(c.examples)+figureHtml):''}
    ${adjacent.length?chapter('relations','关联概念','<div id="relations"></div>'):''}
    ${chapter('references','参考资料',referenceHtml)}`;
  if(adjacent.length)disposeGraph=renderRelations($('#relations'),{concept:c,concepts,relations:data.relations,onSelect:selectConcept});
  const scrollTo=target=>{target.scrollIntoView({block:'start',behavior:'instant'});target.tabIndex=-1;target.focus({preventScroll:true});};
  for(const b of document.querySelectorAll('[data-chapter]'))b.addEventListener('click',()=>scrollTo($(`#heading-${b.dataset.chapter}`)));
  for(const b of document.querySelectorAll('[data-reference]'))b.addEventListener('click',()=>scrollTo($(`#ref-${b.dataset.reference}`)));
  $('#detail-body').scrollTop=0;
}

function search() {
  const query=$('#search').value.trim().toLocaleLowerCase(), terms=query.split(/\s+/);
  hideGroupGuide();activeResult=-1;$('#search').removeAttribute('aria-activedescendant');
  $('#clear-search').hidden=!query;
  $('#search-results').replaceChildren();
  if(!query){searchMatches=[];$('#search-status').textContent='';closeSearch();return;}
  searchMatches=data.concepts.filter(c=>terms.every(t=>c.searchText.includes(t)));
  searchMatches.sort((a,b)=>Number(b.name.toLowerCase().includes(query)||b.en.toLowerCase().includes(query))-Number(a.name.toLowerCase().includes(query)||a.en.toLowerCase().includes(query)));
  $('#search-status').textContent=searchMatches.length?`找到 ${searchMatches.length} 个结果`:'没有找到匹配概念';
  for(const c of searchMatches) {
    const b=button(c.name,()=>selectConcept(c.id),'search-result');b.id=`result-${c.id}`;b.tabIndex=-1;b.setAttribute('role','option');b.setAttribute('aria-selected','false');
    const sub=document.createElement('small');sub.textContent=c.groups.map(id=>groups.get(id).title).join('、')+' / '+c.en;b.append(sub);$('#search-results').append(b);
  }
  $('#search-popover').hidden=false;$('#search').setAttribute('aria-expanded','true');
}
function stepSearch(direction) {
  if($('#search-popover').hidden)search();
  if(!searchMatches.length)return;
  activeResult=activeResult<0?(direction>0?0:searchMatches.length-1):(activeResult+direction+searchMatches.length)%searchMatches.length;
  const buttons=[...$('#search-results').children];
  buttons.forEach((b,i)=>b.setAttribute('aria-selected',String(i===activeResult)));
  $('#search').setAttribute('aria-activedescendant',buttons[activeResult].id);
  buttons[activeResult].scrollIntoView({block:'nearest'});
}
function route() {
  let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{setDepth(1,false);return;}
  if(id==='all')setDepth(3,false);
  else if(id==='level-2')setDepth(2,false);
  else if(concepts.has(id))selectConcept(id,false,id);
  else if(entries.has(id)){
    const node=entries.get(id).node;
    if(node.type==='concept')selectConcept(node.conceptId,false,id);else goBranch(id);
  }
  // Preserve previously shared group links; concept links keep their existing IDs.
  else if(groups.has(id))goBranch(groupNodeId(id));
  else setDepth(1,false);
}
async function init() {
  try {
    $('#load-error').hidden=true;
    const response=await fetch(document.querySelector('script[data-source]').dataset.source);
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    data=await response.json();concepts=new Map(data.concepts.map(c=>[c.id,c]));groups=new Map(data.groups.map(g=>[g.id,g]));resources=new Map(data.resources.map(r=>[r.id,r]));figures=new Map(data.figures.map(f=>[f.id,f]));
    const leaf=(id,group,parent,depth)=>({id:concepts.get(id).group===group?id:`${group}--${id}`,conceptId:id,name:concepts.get(id).name,type:'concept',group,parent,depth});
    tree=data.groups.map(g=>({id:groupNodeId(g.id),name:g.title,type:'group',group:g.id,parent:null,depth:1,count:g.concepts.length,
      children:g.sections.length?g.sections.map(s=>({id:s.id,name:s.title,type:'section',group:g.id,parent:groupNodeId(g.id),depth:2,count:s.concepts.length,
        children:s.concepts.map(id=>leaf(id,g.id,s.id,3))})):g.concepts.map(id=>leaf(id,g.id,groupNodeId(g.id),2))}));
    entries.clear();outline.replaceChildren();buildList(tree,outline);
    for(const c of data.concepts)c.searchText=[c.name,c.en,c.summary,...c.description,c.math?.latex,c.math?.symbols,...(c.math?.explanation||[]),...c.examples,...c.groups.map(id=>groups.get(id).title)].join(' ').toLocaleLowerCase();
    $('#search').disabled=false;
    search();route();
  } catch(error) {$('#load-error').hidden=false;console.error(error);}
}
$('#search').addEventListener('input',()=>{if(data)search();});
$('#search').addEventListener('focus',()=>{if(data&&$('#search').value.trim())search();});
$('#search').addEventListener('keydown',e=>{
  if(e.isComposing||!data)return;
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();stepSearch(e.key==='ArrowDown'?1:-1);}
  if(e.key==='Enter'&&!$('#search-popover').hidden){e.preventDefault();const c=searchMatches[Math.max(activeResult,0)];if(c)selectConcept(c.id);}
});
$('#clear-search').addEventListener('click',()=>{$('#search').value='';search();$('#search').focus();});
depthControl.addEventListener('input',()=>{if(data)setDepth(Number(depthControl.value));});
depthControl.addEventListener('click',()=>{if(data&&depthControl.dataset.partial==='true')setDepth(Number(depthControl.value));});
depthControl.addEventListener('keydown',event=>{
  if(data&&['Enter',' ','Home','End'].includes(event.key)){
    event.preventDefault();setDepth(event.key==='Home'?1:event.key==='End'?3:Number(depthControl.value));
  }
});
$('#close-detail').addEventListener('click',closeDetail);
detail.addEventListener('cancel',event=>{event.preventDefault();closeDetail();});
detail.addEventListener('keydown',event=>{
  if(event.key!=='Tab')return;
  const first=$('#close-detail'),last=$('#copy-link'),active=document.activeElement;
  if(event.shiftKey&&(active===first||active===$('#detail-title'))){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&(active===last||active===$('#detail-title'))){event.preventDefault();first.focus();}
});
const outsideDetail=event=>{const r=detail.getBoundingClientRect();return event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom;};
let backdropPressed=false;
detail.addEventListener('pointerdown',event=>{backdropPressed=event.target===detail&&outsideDetail(event);});
detail.addEventListener('click',event=>{if(backdropPressed&&event.target===detail&&outsideDetail(event))closeDetail();backdropPressed=false;});
$('#copy-link').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.href);$('#copy-status').textContent='已复制';}catch{$('#copy-status').textContent='可复制浏览器地址栏中的链接';}});
$('#retry').addEventListener('click',init);
window.addEventListener('popstate',()=>{if(data)route();});
window.addEventListener('hashchange',()=>{if(data)route();});
document.addEventListener('keydown',e=>{
  if(detail.open)return;
  if(e.key==='Escape'){
    e.preventDefault();hideGroupGuide();closeSearch();
  }
  if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();$('#search').focus();}
});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.search-area'))closeSearch();});
document.addEventListener('focusin',e=>{if(!e.target.closest('.search-area'))closeSearch();});
browse.addEventListener('scroll',hideGroupGuide,{passive:true});
window.addEventListener('resize',hideGroupGuide);
await init();
