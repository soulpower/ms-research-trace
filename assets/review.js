'use strict';
const $ = id => document.getElementById(id);
const MAIN_PAGE='index.html';
let REVIEW, mode='current', indexMode='current', section='equity', limit=24, deepView=null;
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const price=n=>n==null||!Number.isFinite(Number(n))?'—':Number(n).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const pct=n=>n==null?'—':`${n>0?'+':''}${price(n)}%`;
function option(el,value,label){const n=node('option',label);n.value=value;el.append(n)}
function link(label,url){const a=node('a',label);a.href=url;return a}
function badge(text,cls){return node('span',text,'badge '+(cls||''))}
function metric(label,value,note){const d=node('div');d.append(node('small',label),node('b',value),node('span',note));return d}
function mainUrl(asset,view){const p=new URLSearchParams();if(asset)p.set('asset',asset);if(view)p.set('view',view);return MAIN_PAGE+(p.size?'?'+p:'')}
function syncWorkspaceContext(){
  const asset=section==='index'?$('reviewIndex').value:$('reviewAsset').value;
  ResearchWorkspace.context(asset,deepView);
  // Keep the legacy dedicated market-link hook available to simple readers.
  for(const a of document.querySelectorAll('.topbar [data-workspace-link="markets"]'))a.href=mainUrl(asset,deepView);
}
function external(label,url){try{const u=new URL(url);if(u.protocol!=='https:')return node('span',label);const a=link(label,u.href);a.target='_blank';a.rel='noopener noreferrer';return a}catch(_){return node('span',label)}}
function sourceElement(s,asset){
  const box=node('div',null,'review-source'),title=s.title||s.filename||s.id||'来源标题待核';
  if(s.local_pdf){
    let local=false;
    try{const path=decodeURIComponent((s.url||'').split('#')[0]);local=location.protocol==='file:'&&path.startsWith('private-material/')&&!path.slice('private-material/'.length).split('/').includes('..')&&path.endsWith('.pdf')}catch(_){}
    box.append(local?link(title,s.url):node('span',title));
    box.append(node('small',`${s.filename||'本机研报PDF'} · 第${s.page_start||'?'}${s.page_end&&s.page_end!==s.page_start?'—'+s.page_end:''}页${local?'':' · 本机PDF未随静态站发布'}`));
  }else box.append(external(title,s.url));
  const meeting=ResearchWorkspace.meetingHref(s,asset||(section==='index'?$('reviewIndex').value:$('reviewAsset').value));
  if(meeting)box.append(link(' 阅读会议摘要 ↗',meeting));
  box.append(node('small',[s.kind,s.date,s.timestamp_label?'视频定位 '+s.timestamp_label:''].filter(Boolean).join(' · ')));
  return box;
}
function relativeMode(r){return r?.claim_scope==='macro_relative_proxy'||r?.bucket!=='宏观市场参考'&&$('reviewMeasure').value==='relative'}
function verdict(r,m=mode){
  const active=m==='current'?r.current||{}:r.expiry||{};
  if(m==='expiry'&&r.original_status==='未到期')return {text:'尚未到期',yes:false,no:false,other:true};
  const value=relativeMode(r)?active.excess_pct:active.return_pct,threshold=Number($('reviewNeutral').value)||0;
  if(value==null||![1,-1].includes(r.direction))return {text:'行情或方向不足，暂不能判断',yes:false,no:false,other:true};
  if(Math.abs(value)<=threshold)return {text:m==='current'?'目前基本持平':'基本持平',yes:false,no:false,other:true};
  const yes=r.direction*value>0;
  return {text:m==='current'?(yes?'目前方向符合':'目前方向不符合'):(yes?'方向符合':'方向不符合'),yes,no:!yes,other:false};
}
function updateCompanyOptions(){
  const select=$('reviewAsset'),chosen=select.value,sector=$('reviewSector').value;
  const assets=REVIEW.assets.filter(a=>!sector||a.sector===sector);
  select.replaceChildren();option(select,'',sector?'该行业有核验记录的公司':'全部有核验记录的公司');
  for(const a of assets)option(select,a.id,`${a.name} · ${a.id.split(':')[1]}`);
  select.value=assets.some(a=>a.id===chosen)?chosen:'';
}
function changeSector(){updateCompanyOptions();deepView=null;limit=24;renderActive()}
function matchingRows(){
  const q=$('reviewQuery').value.trim().toLocaleLowerCase(),asset=$('reviewAsset').value,sector=$('reviewSector').value,result=$('reviewOutcome').value,phase=$('reviewPhase').value;
  return REVIEW.rows.filter(r=>{
    if(asset&&r.entity_id!==asset||sector&&r.sector!==sector)return false;
    if(deepView&&!r.view_ids.includes(deepView))return false;
    const v=verdict(r),pending=r.original_status==='未到期';
    if(result==='yes'&&!v.yes||result==='no'&&!v.no||result==='pending'&&!pending||result==='other'&&!v.other)return false;
    if(phase==='pending'&&!pending||phase==='ended'&&pending)return false;
    return !q||[r.name,r.code,r.summary,r.sector,...r.sources.map(s=>s.title||''),...r.source_views.map(s=>s.summary||'')].join(' ').toLocaleLowerCase().includes(q);
  }).sort((a,b)=>b.view_date.localeCompare(a.view_date)||a.episode_id.localeCompare(b.episode_id));
}
function countRows(rows,m=mode){let yes=0,no=0,pending=0;for(const r of rows){const v=verdict(r,m);yes+=v.yes?1:0;no+=v.no?1:0;pending+=r.original_status==='未到期'?1:0}return {yes,no,pending,total:rows.length}}
function benchmarkLabel(id){const b=REVIEW.benchmarks?.[id];return b?b.name+' '+(b.formal_code||''):id||'观察基准'}
function caseCard(r,m=mode){
  const v=verdict(r,m),isIndexGoal=r.claim_scope==='macro_index_target';
  const a=node('article',null,'review-case'+(deepView&&r.view_ids.includes(deepView)?' is-focused':''));a.id='case-'+r.episode_id;
  const head=node('div',null,'review-case-head'),title=node('h3',r.name);title.append(node('small',r.code||r.sector||''));
  head.append(title,badge(isIndexGoal?'点位目标：查看进度及误差':v.text,isIndexGoal?'tone-pending':v.yes?'tone-positive':v.no?'tone-negative':'tone-neutral'));a.append(head);
  a.append(node('p',r.summary,'review-claim'),badge(r.date_verified?'观点日期已核验':'参考日代理 · 日期待核',r.date_verified?'tone-neutral':'tone-pending'));
  const c=r.current||{},e=r.expiry||{},active=m==='current'?c:e;
  const value=isIndexGoal?active.target_terminal_error_pct:relativeMode(r)?active.excess_pct:active.return_pct;
  if(r.price_context)a.append(ResearchWorkspace.referencePrice(r.price_context));
  a.append(node('span',isIndexGoal?'实际点位相对原目标的误差':relativeMode(r)?'与观察基准同端点的涨跌幅差（百分点）':m==='current'?'从观点后下一交易日到最新日':'按原期限观察的绝对价格变化','review-result-label'),node('b',pct(value),'review-result'));
  if(r.price_context){
    const context=r.price_context,entry=active.entry_date?{date:active.entry_date,price:active.entry_price}:context.after;
    const endDate=m==='current'?c.current_price_date:e.exit_date,endPrice=m==='current'?c.current_price:e.exit_price;
    a.append(ResearchWorkspace.pricePair(
      {label:'发表后起点',date:entry?.date,price:entry?.price},
      {label:m==='current'?'当前观察日':'截止日实际收盘',date:endDate,price:endPrice,status:!endDate?(m==='expiry'&&r.original_status==='未到期'?'尚未到期，不填未来价格':'暂无可用观察终点'):''},
      context.unit,`${active.price_basis||context.basis} · ${m==='current'?'当前观察':'按原期限观察'}${r.deadline?' · 原截止日 '+r.deadline:''}。`));
  }else{
    const facts=node('div',null,'review-facts');
    for(const [label,text] of [['观点参考日',r.view_date],['原定截止日',r.deadline],['实际观察起点',active.entry_date],['实际行情终点',m==='current'?c.current_price_date:e.exit_date]]){const x=node('span',label);x.append(node('b',text||'尚未形成完整区间'));facts.append(x)}a.append(facts);
  }
  if(active.benchmark_return_pct!=null)a.append(node('p',`观察基准：${benchmarkLabel(active.benchmark_id||r.benchmark_id)} · 基准变化 ${pct(active.benchmark_return_pct)} · 相对差值 ${price(active.excess_pct)} 个百分点；股票优先前复权、指数为价格指数，非严格总收益或完整评级核验。`,'review-reason'));
  if(r.price_target!=null){
    const raw=m==='current'?c.current_raw_close:e.raw_close;
    a.append(node('p',`原目标 ${price(r.price_target)}${r.bucket==='A股个股'?' 元':' 点'} · ${m==='current'?'最新':'到期'}实际收盘 ${price(raw)}`,'review-reason'));
    a.append(badge(m==='current'?(c.current_target_state||'目标口径待核'):r.original_status==='未到期'?'目标尚未到期':e.target_status==='可比较'?(e.target_terminal_met?'目标按期达到':'目标到期未达'):e.target_status||'目标口径待核','tone-pending'));
    if(m==='current'&&c.move_needed_to_target_pct!=null&&!c.current_target_met)a.append(node('p','到原目标还需 '+pct(c.move_needed_to_target_pct),'review-reason'));
    a.append(node('p','目标价进度独立展示，不与方向符合率混算。原综合核验记录：'+e.state+'。','review-reason'));
  }
  a.append(node('p',m==='current'?'当前是进展快照；原期限结论保留。':'期限状态：'+r.original_status,'review-reason'));
  if(r.bucket==='指数'){
    if(r.review_basis)a.append(node('p',r.review_basis,'review-reason'));
  }
  if(r.sources[0])a.append(sourceElement(r.sources[0],r.asset_id));
  const detail=node('details');detail.append(node('summary',`原观点及全部来源 · ${r.source_views.length}条原记录 / ${r.sources.length}个来源`),node('p','期限依据：'+r.deadline_basis,'review-reason'));
  for(const view of r.source_views){const group=node('div',null,'review-variant');group.append(node('code',view.id),node('p',view.summary),node('p',`日期依据：${view.date_basis||'待核'}；归属：${view.attribution||'转述归属待核'}`,'review-reason'));for(const s of view.sources)group.append(sourceElement(s,r.asset_id));detail.append(group)}
  a.append(detail);const actions=node('div',null,'review-actions');actions.append(link('查看原观点与走势 ↗',mainUrl(r.asset_id,r.view_ids[0])));a.append(actions);return a;
}
function targetSummary(rows){
  const targets=rows.filter(r=>r.price_target!=null),completed=targets.filter(r=>r.original_status!=='未到期'&&r.expiry.target_status==='可比较'&&r.expiry.target_terminal_met!=null);
  return `目标价单列：本次筛选含 ${targets.length} 次目标记录，${targets.filter(r=>r.original_status==='未到期').length} 次尚未到期；已到期且口径可比 ${completed.length} 次，其中 ${completed.filter(r=>r.expiry.target_terminal_met).length} 次按期达到。其余保留公司行动等待核原因。方向统计不要求达到目标价。`;
}
function renderEquity(){
  if(section!=='index')syncWorkspaceContext();
  const rows=matchingRows(),c=countRows(rows),n=c.yes+c.no;
  $('reviewModeCurrent').setAttribute('aria-pressed',String(mode==='current'));$('reviewModeExpiry').setAttribute('aria-pressed',String(mode==='expiry'));
  $('reviewModeNote').textContent=(mode==='current'?`行情截至 ${REVIEW.price_cutoff}；当前只是进展，不提前判定原期限最终结果。`:'按原截止日核对方向；目标价是否按期达到在下方单列。')+` 比较内容：${$('reviewMeasure').value==='relative'?'相对观察基准表现':'绝对涨跌方向'}；基本持平 ±${$('reviewNeutral').value||0} 个百分点。`;
  $('reviewMetrics').replaceChildren(metric('本次筛选的判断',c.total,'不是原始提及次数'),metric(mode==='current'?'目前方向符合':'到期方向符合',c.yes,n?`${(100*c.yes/n).toFixed(2)}% · 可比较 ${n} 次`:'暂无可比较结果'),metric('方向相反',c.no,`${c.total-n-c.pending*(mode==='expiry'?1:0)} 次持平或无法判断`),metric('原期限尚未结束',c.pending,'当前表现与最终结果分开'));
  $('reviewTargets').textContent=targetSummary(rows);
  $('reviewCount').textContent=`显示 ${Math.min(limit,rows.length)} / ${rows.length} 次判断 · 所有记录保留观点与来源`;
  const viewMatched=deepView&&REVIEW.rows.some(r=>r.view_ids.includes(deepView)),excluded=deepView&&REVIEW.excluded_views.find(r=>r.id===deepView);
  const unreviewedAsset=$('reviewAsset').value&&!REVIEW.assets.some(a=>a.id===$('reviewAsset').value);
  $('reviewDeepNote').hidden=(!deepView||Boolean(viewMatched))&&!unreviewedAsset;$('reviewDeepNote').replaceChildren();
  if(unreviewedAsset&&!deepView)$('reviewDeepNote').append(node('span','当前标的尚无已审阅的个股验证记录；不会展示其他公司的结果冒充。 '),link('返回当前标的资料',mainUrl($('reviewAsset').value)));
  if(deepView&&!viewMatched)$('reviewDeepNote').append(node('span',`这条观点尚未纳入可单独评分的个股记录。${excluded?'原因：'+excluded.reason:'可能属于宏观/行业主题或未形成明确价格判断。'} `),link('回到原观点',mainUrl(excluded?.entity_id||$('reviewAsset').value,deepView)));
  $('reviewCases').replaceChildren(...rows.slice(0,limit).map(r=>caseCard(r)));
  if(!rows.length)$('reviewCases').append(node('div','没有匹配的可评分判断。可重置筛选；仅提及或基本面讨论不会被自动判成对错。','review-empty'));
  $('reviewMore').hidden=limit>=rows.length;
  const asset=REVIEW.assets.find(a=>a.id===$('reviewAsset').value);
  $('reviewAssetNote').textContent=asset?`${asset.name}：关联原观点 ${asset.associated_views} 条，只有形成判断且经审阅的记录进入评分。`:`原始关联观点 ${REVIEW.facts.associated_views} 条；${REVIEW.facts.unscored_original_views} 条未作个股评分，保留原记录。`;
}
function matchingIndexRows(){const selected=$('reviewIndex').value;return REVIEW.indices.filter(r=>(!selected||r.entity_id===selected)&&(!deepView||r.view_ids.includes(deepView))).sort((a,b)=>b.view_date.localeCompare(a.view_date)||a.episode_id.localeCompare(b.episode_id))}
function renderIndices(){
  if(section==='index')syncWorkspaceContext();
  const rows=matchingIndexRows(),active=r=>indexMode==='current'?r.current:r.expiry;
  $('reviewIndexCurrent').setAttribute('aria-pressed',String(indexMode==='current'));$('reviewIndexExpiry').setAttribute('aria-pressed',String(indexMode==='expiry'));
  $('reviewIndexMetrics').replaceChildren(metric('本次筛选的判断',rows.length,'指数与个股分开计数'),metric('明确点位目标',rows.filter(r=>r.price_target!=null).length,'看点位误差，不与方向符合率混算'),metric('有可比区间行情',rows.filter(r=>active(r)?.return_pct!=null).length,'实际起止日期见各条记录'),metric('原期限尚未结束',rows.filter(r=>r.original_status==='未到期').length,'未到期只展示进度'));
  $('reviewIndexCount').textContent=`${new Set(rows.map(r=>r.entity_id)).size} 个指数 · ${rows.length} 次判断 · 保留原观点、期限及全部来源`;
  $('reviewIndexCases').replaceChildren(...rows.map(r=>caseCard(r,indexMode)));
  if(!rows.length){const empty=node('div','尚无匹配的已审阅指数核验记录。请选择其他指数或重置筛选。','review-empty');if(deepView)empty.append(link(' 查看原观点 ↗',mainUrl($('reviewIndex').value,deepView)));$('reviewIndexCases').append(empty)}
}
function industryRows(){
  const groups=new Map();for(const r of matchingRows()){if(!groups.has(r.sector))groups.set(r.sector,[]);groups.get(r.sector).push(r)}
  return [...groups].map(([name,rows])=>({name,current:countRows(rows,'current'),expiry:countRows(rows,'expiry')})).sort((a,b)=>b.expiry.total-a.expiry.total);
}
function renderIndustry(){
  $('reviewSectorRows').replaceChildren();
  for(const s of industryRows()){
    const tr=node('tr'),name=node('td'),button=node('button',s.name,'inline-asset-link');
    button.onclick=()=>{$('reviewSector').value=s.name;deepView=null;$('reviewAsset').value='';switchSection('equity');changeSector()};name.append(button);
    tr.append(name,...[s.expiry.total,`${s.current.yes} / ${s.current.yes+s.current.no}`,s.expiry.yes,s.expiry.no,s.expiry.pending].map(x=>node('td',x)));$('reviewSectorRows').append(tr);
  }
  if(!industryRows().length){const tr=node('tr'),td=node('td','没有匹配的行业判断，请重置筛选。');td.setAttribute('colspan','6');tr.append(td);$('reviewSectorRows').append(tr)}
  renderThemes();
}
function renderThemes(){const theme=$('reviewTheme').value;$('reviewThemeCases').replaceChildren(...REVIEW.themes.filter(r=>!theme||r.sector===theme).map(r=>caseCard(r,'expiry')))}
function macroMatches(r){const q=$('reviewMacroQuery').value.trim().toLowerCase();return !q||[r.name,r.metric,r.summary,...(r.sources||[]).map(s=>s.title)].join(' ').toLowerCase().includes(q)}
function renderMacro(){
  $('reviewEconomicRows').replaceChildren();
  for(const r of REVIEW.economic.filter(macroMatches)){
    const tr=node('tr'),first=node('td',`${r.view_date||'日期待核'} · ${r.metric}`),sources=node('td',r.status);
    for(const s of r.sources||[])sources.append(sourceElement(s));for(const url of r.actual_sources||[])sources.append(external('实际数据核验 ↗',url),node('br'));if(r.note)sources.append(node('p',r.note,'review-reason'));
    tr.append(first,node('td',pct(r.forecast_pct)),node('td',pct(r.actual_pct)),node('td',r.error_pp==null?'—':price(r.error_pp)),sources);$('reviewEconomicRows').append(tr);
  }
  $('reviewMacroCases').replaceChildren(...REVIEW.macro.filter(macroMatches).map(r=>caseCard(r,'expiry')));
  if(!REVIEW.macro.some(macroMatches)&&!REVIEW.economic.some(macroMatches))$('reviewMacroCases').append(node('p','没有匹配的宏观记录。','review-empty'));
}
function renderActive(){
  renderEquity();
  if(section==='index')renderIndices();else if(section==='industry')renderIndustry();else if(section==='macro')renderMacro();
  const count=section==='index'?matchingIndexRows().length:section==='macro'?REVIEW.macro.filter(macroMatches).length+REVIEW.economic.filter(macroMatches).length:matchingRows().length;
  $('reviewPoolCount').textContent=`${count} 次`;
  if(section==='industry')$('reviewAssetNote').textContent=`当前筛选 ${industryRows().length} 个行业、${count} 次个股判断。下方主题参考使用独立主题下拉框。`;
}
function switchSection(name){
  section=name;
  for(const [key,id] of [['equity','reviewEquity'],['index','reviewIndexPanel'],['industry','reviewIndustry'],['macro','reviewMacro']])$(id).hidden=key!==name;
  for(const [key,id] of [['equity','reviewTabEquity'],['index','reviewTabIndex'],['industry','reviewTabIndustry'],['macro','reviewTabMacro']])$(id).setAttribute('aria-selected',String(key===name));
  $('reviewTimeControls').hidden=['index','macro'].includes(name);$('reviewModeNote').hidden=['index','macro'].includes(name);
  $('reviewEquityFilters').hidden=['index','macro'].includes(name);$('reviewIndexFilter').hidden=name!=='index';
  $('reviewMeasureField').hidden=name==='macro';$('reviewNeutralField').hidden=name==='macro';
  $('reviewFacts').textContent=name==='index'?`${REVIEW.index_assets.length} 个指数 · ${REVIEW.indices.length} 次判断`:name==='macro'?'经济指标核验与市场配置观点分别列示，不用股价替代经济数据。':`${REVIEW.assets.length} 只有核验记录的A股 · ${REVIEW.facts.selected_original_views} 条原观点合并为 ${REVIEW.rows.length} 次判断`;
  const download=$('reviewDownload');if(download)download.textContent=name==='industry'?'导出当前行业汇总 ↓':name==='macro'?'导出当前宏观清单 ↓':'导出当前筛选清单 ↓';
  if(name==='macro')$('reviewAssetNote').textContent='使用右侧宏观搜索框筛选；导出包含当前匹配的经济指标与市场配置观点。';
  renderActive();
}
function resetFilters(){
  for(const id of ['reviewQuery','reviewAsset','reviewSector','reviewOutcome','reviewPhase','reviewMacroQuery','reviewTheme'])$(id).value='';
  updateCompanyOptions();$('reviewIndex').value='';deepView=null;limit=24;renderEquity();renderIndices();renderIndustry();renderMacro();switchSection(section);
}
function exportRows(){
  if(section==='industry')return [['行业','判断次数','当前方向符合','当前可比较','到期方向符合','到期方向相反','尚未到期','比较口径','持平阈值（百分点）'],...industryRows().map(r=>[r.name,r.expiry.total,r.current.yes,r.current.yes+r.current.no,r.expiry.yes,r.expiry.no,r.expiry.pending,$('reviewMeasure').value,$('reviewNeutral').value||0])];
  if(section==='macro')return [['类型','标的/指标','参考日期','预测/观点','实际值','单位','核验状态','来源标题','来源URL'],...REVIEW.economic.filter(macroMatches).map(r=>['经济指标',r.metric,r.view_date,r.forecast_pct,r.actual_pct,'%',r.status,r.sources.map(s=>s.title).join('；'),[...r.sources.map(s=>s.url),...(r.actual_sources||[])].join('；')]),...REVIEW.macro.filter(macroMatches).map(r=>['市场配置',r.name,r.view_date,r.summary,r.expiry.excess_pct??r.expiry.return_pct,r.expiry.excess_pct!=null?'百分点':'%',r.expiry.state,r.sources.map(s=>s.title).join('；'),r.sources.map(s=>s.url).join('；')])];
  const rows=section==='index'?matchingIndexRows():matchingRows(),m=section==='index'?indexMode:mode;
  return [['公司 / 指数','代码','观点日期','原观点转述','原截止日','当前绝对涨跌%','当前相对差值（百分点）','到期绝对涨跌%','到期相对差值（百分点）','本次显示状态','原综合核验状态','来源标题','来源URL'],...rows.map(r=>[r.name,r.code,r.view_date,r.summary,r.deadline,r.current?.return_pct,r.current?.excess_pct,r.expiry.return_pct,r.expiry.excess_pct,r.claim_scope==='macro_index_target'?'点位目标查看误差':verdict(r,m).text,r.expiry.state,r.sources.map(s=>s.title||'').join('；'),r.sources.map(s=>s.url||'').join('；')])];
}
function downloadRows(){
  const csv=exportRows().map(row=>row.map(v=>'"'+String(typeof v==='string'&&/^[=+@-]/.test(v)?"'"+v:v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
  const a=link('',URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'})));a.download='大摩观点验证_'+section+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function rememberReviewPage(){
  ResearchWorkspace.remember('review',{
    capture:()=>({mode,indexMode,section,limit,deepView}),
    restore:state=>{
      const values=state.controls||{},extra=state.extra||{};
      ResearchWorkspace.applyControls(values,['reviewSector']);updateCompanyOptions();
      if(values.reviewAsset&&![...$('reviewAsset').options].some(o=>o.value===values.reviewAsset))option($('reviewAsset'),values.reviewAsset,'当前标的 · 尚无已核验个股记录');
      ResearchWorkspace.applyControls(values);
      mode=extra.mode==='expiry'?'expiry':'current';indexMode=extra.indexMode==='expiry'?'expiry':'current';
      deepView=extra.deepView||null;limit=Math.max(24,Math.min(REVIEW.rows.length,Number(extra.limit)||24));
      switchSection(['equity','index','industry','macro'].includes(extra.section)?extra.section:'equity');
    }
  });
}
function setup(){
  const params=new URL(location.href).searchParams;mode=params.get('mode')==='expiry'?'expiry':'current';indexMode=mode;deepView=params.get('view');
  updateCompanyOptions();for(const s of REVIEW.sectors)option($('reviewSector'),s.name,s.name);for(const name of [...new Set(REVIEW.themes.map(r=>r.sector))].sort())option($('reviewTheme'),name,name);
  for(const a of REVIEW.index_assets)option($('reviewIndex'),a.id,`${a.name} · ${a.formal_code||a.id.split(':')[1]}`);
  const chosen=params.get('asset');
  if(chosen&&!chosen.startsWith('index:')){if(!REVIEW.assets.some(a=>a.id===chosen))option($('reviewAsset'),chosen,'当前标的 · 尚无已核验个股记录');$('reviewAsset').value=chosen}
  const located=deepView&&REVIEW.rows.find(r=>r.view_ids.includes(deepView));if(located)$('reviewAsset').value=located.entity_id;
  $('reviewFreshness').textContent=`核验 ${REVIEW.as_of} · 行情 ${REVIEW.price_cutoff}`;
  $('snapshotNote').textContent=ResearchWorkspace.snapshotNote(REVIEW.price_cutoff);
  $('reviewQuality').textContent=`本页是已收集资料的条件性核验。${REVIEW.rows.length} 次个股判断中，仅 ${REVIEW.rows.filter(r=>r.date_verified).length} 次观点日期已核验；其余按参考日代理观察。每次观察长度不同，“当前方向符合”不能当作统一期限的预测准确率。`;
  $('reviewMethodText').replaceChildren(...['同股、同日、同方向重复说法合成一次；不同日期重申仍保留，样本之间可能相关。','有明确期限按原期限；上下文可确认则记录依据，其余一个自然月。发表后下一实际交易日收盘起算。','方向、相对基准和目标价分别展示；原综合核验结果保留在目标卡片及导出中，未修改原研究记录。','相对表现为同端点涨跌幅差，基准是观察参照；不等同官方超配/低配评级的完整基准或总收益。',...REVIEW.limits].map(t=>node('p',t)));
  $('reviewSector').onchange=changeSector;
  for(const id of ['reviewAsset','reviewOutcome','reviewPhase','reviewMeasure','reviewNeutral'])$(id).onchange=()=>{deepView=null;limit=24;renderActive()};
  $('reviewQuery').oninput=()=>{deepView=null;limit=24;renderActive()};$('reviewMacroQuery').oninput=renderActive;
  $('reviewReset').onclick=resetFilters;$('reviewMore').onclick=()=>{limit+=24;renderEquity()};if($('reviewDownload'))$('reviewDownload').onclick=downloadRows;
  $('reviewModeCurrent').onclick=()=>{mode='current';limit=24;renderActive()};$('reviewModeExpiry').onclick=()=>{mode='expiry';limit=24;renderActive()};$('reviewTheme').onchange=renderThemes;
  $('reviewIndex').onchange=()=>{deepView=null;renderActive()};$('reviewIndexCurrent').onclick=()=>{indexMode='current';renderIndices()};$('reviewIndexExpiry').onclick=()=>{indexMode='expiry';renderIndices()};
  for(const [id,target] of [['reviewTabEquity','equity'],['reviewTabIndex','index'],['reviewTabIndustry','industry'],['reviewTabMacro','macro']])$(id).onclick=()=>{deepView=null;switchSection(target)};
  renderEquity();renderIndustry();renderMacro();
  const indexLocated=deepView&&REVIEW.indices.find(r=>r.view_ids.includes(deepView));
  if(indexLocated)$('reviewIndex').value=indexLocated.entity_id;
  else if(chosen?.startsWith('index:')){if(!REVIEW.index_assets.some(a=>a.id===chosen))option($('reviewIndex'),chosen,'当前指数 · 尚无核验记录');$('reviewIndex').value=chosen}
  switchSection(indexLocated||chosen?.startsWith('index:')?'index':'equity');$('reviewLoading').hidden=true;$('reviewApp').hidden=false;rememberReviewPage();
}
async function init(){try{const response=await fetch('assets/review.json?v=74dde78140b7');if(!response.ok)throw Error(response.status);REVIEW=await response.json();setup()}catch(e){$('reviewLoading').textContent='核验资料载入失败：'+e.message;$('reviewLoading').classList.add('error')}}
init();
