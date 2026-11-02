'use strict';
/* Per-tab UI memory. Only controls/positions are saved, never research data. */
Object.assign(ResearchWorkspace, (() => {
  const enabled=typeof window!=='undefined'&&typeof document.addEventListener==='function';
  let root,key,storageOK=false,current=null;
  let cache={version:1,pages:{},last:{}};
  function valid(value){return value?.version===1&&value.pages&&typeof value.pages==='object'&&value.last&&typeof value.last==='object'}
  function load(){
    try{const value=JSON.parse(sessionStorage.getItem(key)||'null');storageOK=true;if(valid(value))cache=value}catch(_){storageOK=false}
  }
  function initialize(){
    if(!enabled)return;
    const home=document.querySelector('.topbar [data-workspace-link="markets"]');
    root=new URL('.',new URL(home?.getAttribute('href')||location.href,location.href));
    key='research-workspace:v1:'+root.origin+root.pathname;
    load();
    try{const carried=JSON.parse(new URL(location.href).searchParams.get('_ws')||'null');if(valid(carried))cache=carried}catch(_){}
  }
  function route(){
    const url=new URL(location.href);url.searchParams.delete('_ws');url.searchParams.delete('_resume');
    return url.pathname.slice(root.pathname.length)+url.search+url.hash;
  }
  function safeRoute(value){
    try{const url=new URL(value,root);return url.origin===root.origin&&url.pathname.startsWith(root.pathname)&&url.pathname.endsWith('.html')?url:null}catch(_){return null}
  }
  function applyControls(values,ids=Object.keys(values||{})){
    for(const id of ids){
      const element=document.getElementById(id);if(!element||!Object.hasOwn(values||{},id))continue;
      if(element.type==='checkbox'||element.type==='radio')element.checked=Boolean(values[id]);else element.value=String(values[id]??'');
    }
  }
  function captureAnchor(){
    const header=document.querySelector('.topbar')?.getBoundingClientRect().bottom||0;
    const elements=[...document.querySelectorAll('.opinion[id],.review-case[id],.episode,.paragraph')];
    for(const element of elements){
      if(!element.getClientRects().length||element.closest('details:not([open])'))continue;
      const rect=element.getBoundingClientRect();if(rect.bottom<=header||rect.top>=window.innerHeight)continue;
      if(element.id)return {id:element.id,offset:rect.top};
      if(element.dataset.id)return {episode:element.dataset.id,offset:rect.top};
      return {paragraph:[...document.querySelectorAll('.paragraph')].indexOf(element),offset:rect.top};
    }
    return null;
  }
  function detailKey(element){
    const owner=element.closest('[id]');
    return owner?owner.id+':'+(owner===element?'self':[...owner.querySelectorAll('details')].indexOf(element)):null;
  }
  function snapshot(){
    const controls={};
    for(const element of document.querySelectorAll('input[id],select[id]')){
      if(['password','file','hidden'].includes(element.type))continue;
      controls[element.id]=['checkbox','radio'].includes(element.type)?element.checked:element.value;
    }
    return {route:route(),controls,extra:current.config.capture?.()||{},
      x:window.scrollX,y:window.scrollY,anchor:captureAnchor(),
      sidebar:document.querySelector('.sidebar')?.scrollTop||0,
      assetList:document.getElementById('assetList')?.scrollTop||0,
      collapsed:document.querySelector('.sidebar')?.dataset.collapsed,
      details:[...document.querySelectorAll('details')].filter(e=>e.open).map(detailKey).filter(Boolean),savedAt:Date.now()};
  }
  function save(){
    if(!current)return;
    // BFCache can revive an older JS closure; merge the latest sibling-page state.
    try{const latest=JSON.parse(sessionStorage.getItem(key)||'null');if(valid(latest))cache={version:1,pages:{...cache.pages,...latest.pages},last:{...cache.last,...latest.last}}}catch(_){}
    cache.pages[current.name]=snapshot();cache.last[current.alias]=current.name;
    const ordered=Object.keys(cache.pages).sort((a,b)=>(cache.pages[b].savedAt||0)-(cache.pages[a].savedAt||0));
    for(const name of ordered.slice(16))delete cache.pages[name];
    try{sessionStorage.setItem(key,JSON.stringify(cache));storageOK=true}catch(_){storageOK=false}
  }
  function scrollTarget(anchor){
    if(!anchor)return null;
    if(anchor.id)return document.getElementById(anchor.id);
    if(anchor.episode)return [...document.querySelectorAll('.episode')].find(e=>e.dataset.id===anchor.episode);
    return Number.isInteger(anchor.paragraph)?document.querySelectorAll('.paragraph')[anchor.paragraph]:null;
  }
  function restoreGeometry(state){
    const sidebar=document.querySelector('.sidebar');
    if(sidebar&&typeof state.collapsed==='string'){
      sidebar.dataset.collapsed=state.collapsed;
      const toggle=sidebar.querySelector('.sidebar-toggle'),expanded=state.collapsed!=='true';
      if(toggle){toggle.setAttribute('aria-expanded',String(expanded));toggle.setAttribute('aria-label',expanded?'收起筛选':'展开筛选');toggle.textContent=expanded?'收起 −':'筛选 ＋'}
    }
    const details=[...document.querySelectorAll('details')];
    for(let i=0;i<details.length;i++)details[i].open=state.details?.includes(detailKey(details[i]))||false;
    const position=()=>{
      const target=scrollTarget(state.anchor);
      if(target&&target.getClientRects().length){target.scrollIntoView({block:'start',behavior:'instant'});window.scrollBy({top:target.getBoundingClientRect().top-state.anchor.offset,left:0,behavior:'instant'})}
      else window.scrollTo({top:Number(state.y)||0,left:Number(state.x)||0,behavior:'instant'});
      if(sidebar)sidebar.scrollTop=Number(state.sidebar)||0;
      const list=document.getElementById('assetList');if(list)list.scrollTop=Number(state.assetList)||0;
    };
    // Wait for async data, then for layout/content-visibility to settle.
    requestAnimationFrame(()=>{position();requestAnimationFrame(position)});
  }
  function remember(name,config={}){
    if(!enabled)return false;
    current={name,alias:config.alias||name,config};
    const reload=window.performance?.getEntriesByType('navigation')[0]?.type==='reload';
    const state=cache.pages[name],resume=new URL(location.href).searchParams.get('_resume')==='1';
    if(state&&(resume||(reload&&state.route===route()))&&safeRoute(state.route)){
      if(config.restore)config.restore(state);else applyControls(state.controls);
      restoreGeometry(state);return true;
    }
    save();return false;
  }
  function navigate(event){
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const anchor=event.target.closest('a[href]');if(!anchor||anchor.target==='_blank'||anchor.hasAttribute('download'))return;
    const raw=anchor.getAttribute('href');if(!raw||raw.startsWith('#'))return;
    const target=safeRoute(new URL(raw,location.href).href);if(!target)return;
    const tab=anchor.closest('.workspace-nav')?anchor.dataset.workspaceLink:null;
    const listReturn=Boolean(anchor.closest('.report-toolbar'))&&target.pathname.endsWith('/meeting-reports/index.html');
    if(!tab&&!listReturn&&location.protocol!=='file:'&&storageOK)return;
    if(!tab&&!listReturn&&target.pathname===location.pathname&&target.search===location.search)return;
    save();
    const name=listReturn?'meeting-list':tab?(cache.last[tab]||tab):null;
    if(name&&current?.name===name){event.preventDefault();return}
    const state=name&&cache.pages[name],destination=state&&safeRoute(state.route)||target;
    if(state)destination.searchParams.set('_resume','1');
    // file:// storage may be isolated per file. Carry only compact UI state.
    if(location.protocol==='file:'||!storageOK)destination.searchParams.set('_ws',JSON.stringify(cache));
    event.preventDefault();window.location.assign(destination.href);
  }
  initialize();
  if(enabled){
    document.addEventListener('click',navigate);
    window.addEventListener('pagehide',save);
    const reader=()=>{if(document.querySelector('.report-reader'))remember('meeting-report:'+location.pathname.split('/').at(-1),{alias:'meetings'})};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',reader,{once:true});else reader();
  }
  return {remember,applyControls};
})());
