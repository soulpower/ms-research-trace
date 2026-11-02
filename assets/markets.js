'use strict';
const $=id=>document.getElementById(id);
const REVIEW_PAGE='review.html';
let DATA,selected,views=[],currentTab='overview',chartPoints=[],chartUi=null,hoverIndex=-1,viewsLimit=60;
let chartWindow=null,chartContext='',candleRows=[],gesture=null,wheelRemainder=0;
const activePointers=new Map();
const TONES=new Set(['正面','负面/谨慎','中性','混合','条件性','期限分歧','方向预测','仅提及','待核']);
const fmt=n=>n==null||!Number.isFinite(Number(n))?'—':Number(n).toLocaleString('zh-CN',{maximumFractionDigits:4});
const fmtPrice=n=>n==null||!Number.isFinite(Number(n))?'—':Number(n).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
function fmtAmount(value,unit){
  if(value==null||!Number.isFinite(Number(value)))return '缺失';
  const n=Number(value),scale=Math.abs(n)>=1e8?1e8:Math.abs(n)>=1e4?1e4:1;
  const currency=({'人民币元':'元','CNY':'元','HKD':'港元','USD':'美元'}[unit]||unit||'（单位待核）');
  return fmtPrice(n/scale)+(scale===1e8?'亿':scale===1e4?'万':'')+currency;
}
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
function option(select,value,text){const n=node('option',text);n.value=value;select.append(n);return n}
function svg(tag,attrs={},text){const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(text!=null)n.textContent=text;return n}
function safeLink(text,url){try{const u=new URL(url);if(u.protocol!=='https:')return node('span',text);const a=node('a',text);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';return a}catch(_){return node('span',text)}}
function resolveId(id){return DATA.asset_redirects?.[id]||id}
function toneFor(v){return TONES.has(v?.tone)?v.tone:TONES.has(v?.stance)?v.stance:'待核'}
function toneClass(tone){return 'tone-'+({'正面':'positive','负面/谨慎':'negative','中性':'neutral','混合':'mixed','条件性':'conditional','期限分歧':'mixed','方向预测':'direction','仅提及':'mention','待核':'pending'}[tone]||'pending')}
function pairRows(rows){return Array.isArray(rows)?rows.filter(r=>Array.isArray(r)&&r.length>=2&&r[0]&&Number.isFinite(Number(r[1]))).map(r=>[String(r[0]),Number(r[1])]).sort((a,b)=>a[0].localeCompare(b[0])):[]}
function priceAsset(e){return e?.kind==='行业'&&e.benchmark_id?DATA.entities.find(x=>x.id===e.benchmark_id)||e:e}
function allPrices(e){const asset=priceAsset(e);return pairRows(asset?.daily_prices?.length?asset.daily_prices:asset?.prices)}
function filteredAssets(){
  const q=$('query').value.trim().toLocaleLowerCase(),kind=$('kind').value,coverage=$('coverage').value;
  return DATA.entities.filter(e=>{
    const matchesKind=!kind||e.kind===kind;
    const text=[e.name,e.code,e.formal_code,e.instrument,e.industry,...(e.aliases||[]),...(e.search_terms||[])].filter(Boolean).join(' ').toLocaleLowerCase();
    const matchesQuery=!q||text.includes(q);
    const hasVideo=Number(e.video_views)>0,hasReport=Number(e.report_views)>0;
    const matchesCoverage=!coverage||coverage==='both'&&hasVideo&&hasReport||coverage==='video'&&hasVideo||coverage==='report'&&hasReport||coverage==='mention'&&!Number(e.view_count)&&Number(e.mention_passages)>0;
    return matchesKind&&matchesQuery&&matchesCoverage;
  });
}
function filter(preferred){
  const matches=filteredAssets();$('poolCount').textContent=`${matches.length} / ${DATA.entities.length}`;
  $('asset').replaceChildren();$('assetList').replaceChildren();$('empty').hidden=matches.length>0;$('detail').hidden=matches.length===0;
  if(!matches.length)return;
  const mobile=document.createDocumentFragment();
  for(const e of matches){
    const label=e.name+(e.formal_code?' · '+e.formal_code:e.code?' · '+e.code:'');option($('asset'),e.id,label);
    const b=node('button',null,'asset-button');b.type='button';b.dataset.assetId=e.id;
    const row=node('span',null,'asset-row');row.append(node('b',e.name),node('small',e.formal_code||e.kind));
    b.append(row,node('span',`提及 ${e.mention_count||0} 次 · 文稿 ${e.video_views||0} · 研报/摘要 ${e.report_views||0}`,'asset-meta'));
    b.onclick=()=>select(e.id);$('assetList').append(b);
  }
  const want=resolveId(preferred||selected?.id||'');
  select(matches.some(e=>e.id===want)?want:matches[0].id,selected?.id===want);
}
function badge(text,cls){return node('span',text,'badge '+(cls||''))}
function resetPointState(){if($('chartTooltip'))$('chartTooltip').hidden=true;hoverIndex=-1;if(chartUi){chartUi.line.setAttribute('visibility','hidden');chartUi.dot.setAttribute('visibility','hidden');chartUi.horizontal.setAttribute('visibility','hidden');chartUi.priceTag.setAttribute('visibility','hidden');chartUi.cursorValue=null}if($('chartTip'))$('chartTip').textContent='将鼠标移到图表可查看实际交易日及指标。'}
function setRangeToFull(){
  if(!selected)return;const rows=allPrices(selected);const first=rows[0]?.[0]||'2025-01-01',last=rows.at(-1)?.[0]||first;
  $('rangeStart').min=first;$('rangeStart').max=last;$('rangeEnd').min=first;$('rangeEnd').max=last;
  $('rangeStart').value=first;$('rangeEnd').value=last;
}
function renderSelected(id,keepRange=false){
  const canonical=resolveId(id);selected=DATA.entities.find(e=>e.id===canonical);if(!selected)return;
  $('reviewLink').href=REVIEW_PAGE+(['A股','指数'].includes(selected.kind)?'?asset='+encodeURIComponent(canonical):'');
  ResearchWorkspace.context(canonical);
  $('asset').value=canonical;viewsLimit=60;views=DATA.views.filter(v=>v.entity_id===canonical||(v.related_asset_ids||[]).includes(canonical)).sort((a,b)=>(b.view_date||'').localeCompare(a.view_date||'')||a.id.localeCompare(b.id));
  for(const b of document.querySelectorAll('[data-asset-id]'))b.setAttribute('aria-current',String(b.dataset.assetId===canonical));
  $('assetKind').textContent=[selected.kind,selected.subtype,selected.industry].filter(Boolean).join(' / ');
  $('assetName').textContent=selected.name;$('assetCode').textContent=selected.formal_code||selected.code||'';
  $('badges').replaceChildren();
  if(selected.video_views)$('badges').append(badge(`会议文稿线索 ${selected.video_views}条`,'source-video'));
  if(selected.report_views)$('badges').append(badge(`研报与摘要 ${selected.report_views}条`,'source-report'));
  if(!views.length)$('badges').append(badge('名称提及 · 尚无逐条整理线索','subtle'));
  if(selected.market_status)$('badges').append(badge(selected.market_status,'subtle'));
  const quote=priceAsset(selected),raw=allPrices(selected),last=raw.at(-1);const current=quote.latest_price!=null?Number(quote.latest_price):last?.[1];
  const currentDate=quote.latest_price_date||last?.[0];const unit=quote.unit||quote.currency||quote.quote_currency||'';
  $('priceLabel').textContent=selected.kind==='行业'?'参考指数最新历史点位':quote.kind==='指数'?'最新历史指数点位':quote.kind==='外汇'&&quote.subtype==='汇率指数'?'最新汇率指数点位':'最新历史收盘 / 报价';
  $('latest').textContent=current==null?'暂无行情':fmt(current);
  $('latestDate').textContent=currentDate?`${currentDate} · ${unit}${quote.name?' · '+quote.name:''}${quote.formal_code?' · '+quote.formal_code:''}`:(quote.price_error||quote.price_note||selected.benchmark_note||'缺失数据不补造');
  const viewDates=views.map(v=>v.view_date).filter(Boolean).sort();$('firstView').textContent=viewDates[0]||selected.first_view||'暂无核对观点';$('lastView').textContent=viewDates.at(-1)||selected.last_view||'—';
  $('viewTotal').textContent=`${views.length} 条观点与线索`;
  $('assetCoverage').textContent=`涉及文稿 ${selected.mention_videos||0} 期；按关联观点唯一ID统计提及 ${selected.mention_count||views.length} 次。${selected.kind==='行业'&&selected.aliases?.length?`已归并 ${selected.aliases.length} 个原始行业标签，可用原标签搜索。`:''}观点按唯一ID计数，提及不等于推荐。`;
  $('anchor').replaceChildren();option($('anchor'),'','全部可用历史');
  for(const v of views)option($('anchor'),v.id,`${v.view_date||'日期待核'} · ${v.source_type==='video'?'文稿':v.source_subtype==='local_pdf'?'研报PDF':'公开摘要'} · ${toneFor(v)}`);
  chartContext='';$('mode').value=priceAsset(selected).qfq_bars?.length?'qfq':'raw';$('mode').querySelector('[value="qfq"]').disabled=!priceAsset(selected).qfq_bars?.length;$('mode').querySelector('[value="adjusted"]').disabled=!pairRows(priceAsset(selected).adjusted_prices).length;
  $('sourceType').value='';$('tone').value='';$('attribution').value='';
  if(!keepRange)setRangeToFull();else {const x=allPrices(selected);$('rangeStart').value=$('rangeStart').value||x[0]?.[0]||'2025-01-01';$('rangeEnd').value=$('rangeEnd').value||x.at(-1)?.[0]||$('rangeStart').value}
  $('description').textContent=selected.description||`${selected.name}属于${selected.kind}，本页汇集已整理观点、第三方摘要及对应历史行情。观点摘要保留来源与适用范围；没有可靠行情的项目不补造价格。`;
  $('tracking').textContent=selected.tracking||'关注后续节目、正式报告及观点是否调整。';
  $('invalidation').textContent=selected.invalidation||'目标期限、价格基准和适用范围需回到原始材料核实。';
  $('descriptionEvidence').textContent=selected.description_evidence?'研究者归纳；证据范围：'+selected.description_evidence:'不补填未经核实的公司财务数据或指数成分资料。';
  renderBenchmarkAndRelated();renderViews();renderSources();draw();
  try{const url=new URL(location.href);url.searchParams.set('asset',canonical);if(url.searchParams.get('view')&&!views.some(v=>v.id===url.searchParams.get('view')))url.searchParams.delete('view');history.replaceState(null,'',url)}catch(_){}
  document.title=selected.name+' · 大摩观点观察';
}
function openAsset(id){
  if(!DATA.entities.some(e=>e.id===id))return;
  $('query').value='';$('kind').value='';$('coverage').value='';filter(id);
}
function renderBenchmarkAndRelated(){
  $('benchmarkInfo').replaceChildren();$('relatedAssets').replaceChildren();
  const byId=new Map(DATA.entities.map(e=>[e.id,e]));const benchmarkIds=[...(selected.benchmark_ids||[])];if(selected.benchmark_id)benchmarkIds.unshift(selected.benchmark_id);
  const unique=[...new Set(benchmarkIds)].filter(id=>byId.has(id));
  if(unique.length){
    const p=node('p',null,'benchmark-line');p.append(node('span',selected.kind==='行业'?'行业参考指数：':'观察基准：'));
    unique.forEach((id,i)=>{if(i)p.append(node('span','、'));const e=byId.get(id);const b=node('button',`${e.name}${e.formal_code?' · '+e.formal_code:''}`,'inline-asset-link');b.type='button';b.onclick=()=>openAsset(id);p.append(b)});
    if(selected.benchmark_note)p.append(node('span',' · '+selected.benchmark_note));
    $('benchmarkInfo').append(p);
  }else if(selected.kind==='行业')$('benchmarkInfo').textContent=selected.benchmark_note||'暂未找到覆盖范围足够匹配的公开行业指数；主题本身无直接报价。';
  const related=new Set(selected.related_asset_ids||[]);
  for(const v of views)for(const id of v.related_asset_ids||[])if(id!==selected.id)related.add(id);
  const valid=[...related].filter(id=>byId.has(id));
  if(valid.length){$('relatedAssets').append(node('span','相关证券与基准线索：','related-label'));for(const id of valid){const e=byId.get(id);const b=node('button',`${e.name}${e.formal_code?' · '+e.formal_code:''}`,'inline-asset-link');b.type='button';b.onclick=()=>openAsset(id);$('relatedAssets').append(b)}}
}
function selectedView(){return views.find(v=>v.id===$('anchor').value)}
function requestedRange(){return {start:$('rangeStart').value||'0000-01-01',end:$('rangeEnd').value||'9999-12-31'}}
function changeSeries(mode){if(mode==='qfq')return (priceAsset(selected).qfq_bars||[]).map(r=>[r[0],r[4]]);const asset=priceAsset(selected);return pairRows(mode==='adjusted'?asset.daily_adjusted_prices?.length?asset.daily_adjusted_prices:asset.adjusted_prices:allPrices(selected))}
function renderChange(){
  const mode=$('mode').value,series=changeSeries(mode),{start,end}=requestedRange();
  const rows=series.filter(r=>r[0]>=start&&r[0]<=end);const a=rows[0],b=rows.at(-1);
  if(rows.length<2){$('change').textContent='—';$('changeBasis').textContent=rows.length===1?`${a[0]} · 仅一个实际观测点，无法计算变化`:'当前区间无实际行情';$('rangeSummary').textContent=rows.length===1?`区间内只有 ${a[0]} 一个实际交易日，涨跌幅留空。`:'所选区间内没有可用历史行情。';return}
  if(a[1]<=0||!Number.isFinite(b[1]/a[1])){$('change').textContent='—';$('changeBasis').textContent=`${a[0]} → ${b[0]} · 起点价格不适合计算百分比`;$('rangeSummary').textContent=`实际数据：${a[0]} 至 ${b[0]}；价格口径 ${mode==='qfq'?'前复权':mode==='adjusted'?'供应商复权收盘':'原始收盘/点位'}。`;return}
  const pct=(b[1]/a[1]-1)*100;$('change').textContent=`${pct>0?'+':''}${pct.toFixed(2)}%`;$('change').className=pct>0?'positive':pct<0?'negative':'';
  $('changeBasis').textContent=`${a[0]} → ${b[0]} · ${mode==='qfq'?'前复权':mode==='adjusted'?'复权收盘':mode==='normalized'?'原始价格序列':'原始收盘 / 点位'}`;
  $('rangeSummary').textContent=`实际观测区间：${a[0]} 至 ${b[0]}；${rows.length} 个日收盘。${mode==='qfq'?'前复权':mode==='adjusted'?'按供应商复权序列计算。':mode==='normalized'?'归一图的涨跌幅仍按原始价格序列计算。':'按原始价格/点位计算。'}`;
}
function chartSeries(mode) {
  const {start, end} = requestedRange();
  const daily = pairRows(changeSeries(mode)).filter(row => row[0] >= start && row[0] <= end);
  if (!daily.length) return [];
  const weeks = new Map();
  for (const row of daily) {
    const week = Math.floor((Date.parse(row[0]) - Date.UTC(1970, 0, 5)) / (7 * 86400000));
    weeks.set(week, row);
  }
  // Include both exact endpoints before sampling. Normalization and the metric
  // therefore have the same underlying return even for a midweek date range.
  const sampled = mode === 'qfq' ? daily : [...new Map([daily[0], ...weeks.values(), daily.at(-1)].map(row => [row[0], row])).values()];
  return mode === 'normalized' ? sampled.map(([day, value]) => [day, daily[0][1] > 0 ? value / daily[0][1] * 100 : NaN]) : sampled;
}
function applyObservationAnchor() {
  const view = selectedView();
  if (!view?.view_date) return;
  const after = $('observationBasis').value !== 'same';
  const first = allPrices(selected).find(row => after ? row[0] > view.view_date : row[0] >= view.view_date);
  $('rangeStart').value = first?.[0] || view.view_date;
  ResearchWorkspace.context(selected.id, view.id);
}
function rawValueOnDate(day){const rows=allPrices(selected);let found=rows.find(r=>r[0]===day);if(found)return found[1];for(let i=rows.length-1;i>=0;i--)if(rows[i][0]<=day)return rows[i][1];return null}
function drawLine(){
  if(!selected)return;resetPointState();renderChange();const chart=$('chart');chart.replaceChildren();chartPoints=[];chartUi=null;
  const mode=$('mode').value,rows=chartSeries(mode),view=selectedView(),quote=priceAsset(selected),unit=quote.unit||quote.currency||quote.quote_currency||'';
  $('anchorNote').textContent=view?`观点参考日 ${view.view_date||'待核'}；${$('observationBasis').value==='same'?'资料观察：参考日当日或之后首个实际收盘':'发表后表现：严格在参考日之后的首个实际收盘，与事后验证起点一致'}。实际起点 ${rows[0]?.[0]||'暂无行情'}；不代表可交易执行价。`:'按上方手动日期区间显示。最新历史报价始终独立于观察区间。';
  $('priceNote').replaceChildren();$('priceNote').append(node('span',`${selected.kind==='行业'?`行业主题“${selected.name}”的观察基准，不代表原文推荐该指数。${selected.benchmark_note||''} `:''}${quote.price_note||selected.price_note||'行情来自已登记的直接报价序列。'} 单位：${unit||'待核'}；品种/代码：${quote.instrument||quote.formal_code||'无直接报价'}。${quote.price_quote_name?'行情品种名称：'+quote.price_quote_name+'。':''}${quote.price_provider?'行情来源：'+quote.price_provider+'。':''}${quote.price_retrieved_at?(quote.price_provider==='derived'?'计算时间：':'抓取时间：')+quote.price_retrieved_at+' UTC。':''}${quote.price_retrieval_time_note?'时间说明：'+quote.price_retrieval_time_note+'。':''}${quote.price_error?'最近刷新情况：'+quote.price_error+'。':''}${quote.price_history_note?'历史覆盖说明：'+quote.price_history_note:''}`));
  if(quote.qfq_error)$('priceNote').append(node('span',' 前复权刷新情况：'+quote.qfq_error+'。'));if(quote.qfq_basis)$('priceNote').append(node('span',' 前复权口径：'+quote.qfq_basis+'。'));if(quote.detail_error)$('priceNote').append(node('span',' 日K细节刷新：'+quote.detail_error+'。'));
  if(quote.amount_precision_note)$('priceNote').append(node('span',' 成交额：'+quote.amount_precision_note));
  for(const source of quote.price_source_urls||[]){if(source?.url)$('priceNote').append(document.createTextNode(' '),safeLink((source.label||'行情来源')+' ↗',source.url))}
  for(const [label,url] of [['实际日K来源',quote.price_source_url],['成交额来源',quote.amount_source_url],['前复权因子/价格来源',quote.qfq_source_url]])if(url)$('priceNote').append(document.createTextNode(' '),safeLink(label+' ↗',url));
  $('chartTitle').textContent=selected.kind==='行业'?`行业参考指数走势 · ${quote.name} ${quote.formal_code||quote.instrument||''}`:quote.kind==='指数'||quote.subtype==='汇率指数'?'指数实际点位走势':quote.kind==='外汇'?'汇率历史走势':'实际价格走势';
  $('priceRows').replaceChildren();const raw=allPrices(selected).filter(r=>r[0]>=requestedRange().start&&r[0]<=requestedRange().end);
  const barMap=new Map((quote.daily_bars||[]).map(r=>[r[0],r])),front=new Map((quote.qfq_bars||[]).map(r=>[r[0],r[4]]));
  for(const point of [...raw].reverse()){const r=barMap.get(point[0]);const tr=node('tr');tr.append(...[point[0],r?fmt(r[1]):'—',r?fmt(r[2]):'—',r?fmt(r[3]):'—',fmt(point[1]),r&&r[5]!=null?fmt(r[5]):'—',r&&r[6]!=null?fmt(r[6]):'—',fmt(front.get(point[0]))].map(x=>node('td',x)));$('priceRows').append(tr)}
  if(!rows.length){chart.append(svg('text',{x:500,y:145,'text-anchor':'middle',class:'empty-chart'},'所选区间暂无对应历史行情'));$('chartStatus').textContent=quote.price_error||quote.price_history_note||quote.price_note||selected.benchmark_note||'价格缺失；不以其他资产或目标价替代。';return}
  const values=rows.map(r=>r[1]).filter(Number.isFinite);
  if(!values.length){chart.append(svg('text',{x:500,y:145,'text-anchor':'middle',class:'empty-chart'},'该口径下没有可绘制的数据'));$('chartStatus').textContent='请切换原始收盘或调整日期范围。';return}
  const lo=Math.min(...values),hi=Math.max(...values),span=hi-lo||Math.max(Math.abs(hi)*.02,1),min=lo-span*.1,max=hi+span*.1;
  const first=Date.parse(rows[0][0]),last=Date.parse(rows.at(-1)[0]),x=day=>88+848*(Date.parse(day)-first)/(last-first||1),y=v=>250-215*(v-min)/(max-min);
  for(let i=0;i<5;i++){const val=min+(max-min)*i/4;chart.append(svg('line',{x1:88,x2:936,y1:y(val),y2:y(val),stroke:'#26364a'}),svg('text',{x:73,y:y(val)+4,'text-anchor':'end',fill:'#80929b','font-size':12},fmtPrice(val)))}
  if(rows.length>1){const line=rows.map((r,i)=>(i?'L':'M')+x(r[0])+','+y(r[1])).join(' ');chart.append(svg('path',{d:line+` L${x(rows.at(-1)[0])},250 L${x(rows[0][0])},250 Z`,fill:'#112d35'}),svg('path',{d:line,fill:'none',stroke:'#59cfcb','stroke-width':2.5,'stroke-linejoin':'round','stroke-linecap':'round'}))}
  for(let i=0;i<rows.length;i++){
    const [day,val]=rows[i];chartPoints.push({day,value:val,raw:rawValueOnDate(day),x:x(day),y:y(val)});
    const p=svg('circle',{cx:x(day),cy:y(val),r:rows.length===1?4:2.7,fill:'#177b83',opacity:rows.length===1?1:.25,class:'chart-observation'});chart.append(p);
  }
  for(const i of [...new Set([0,Math.floor((rows.length-1)/2),rows.length-1])])chart.append(svg('text',{x:x(rows[i][0]),y:282,'text-anchor':i===0?'start':i===rows.length-1?'end':'middle',fill:'#80929b','font-size':12},rows[i][0]));
  const line=svg('line',{x1:0,x2:0,y1:26,y2:250,stroke:'#78939a','stroke-width':1,'stroke-dasharray':'4 3','visibility':'hidden','pointer-events':'none'});
  const dot=svg('circle',{cx:0,cy:0,r:5,fill:'#d76b55',stroke:'#fff','stroke-width':2,'visibility':'hidden','pointer-events':'none'});
  chart.append(line,dot);chartUi=addCrosshair(chart,line,dot,{top:35,bottom:250,min,max});
  $('chartStatus').textContent=`${rows.length} 个实际${mode==='qfq'?'日':'采样'}收盘（保留区间端点） · ${rows[0][0]} 至 ${rows.at(-1)[0]} · ${mode==='normalized'?'区间起点 = 100':mode==='qfq'?'前复权':mode==='adjusted'?'供应商复权收盘':'原始收盘 / 点位'}。移动鼠标查看交易日及指标。`;
}
function addCrosshair(chart,line,dot,scale){
  const horizontal=svg('line',{x1:88,x2:936,y1:0,y2:0,stroke:'#a5bbd1','stroke-width':1,'stroke-dasharray':'4 3',visibility:'hidden','pointer-events':'none'});
  const priceTag=svg('g',{visibility:'hidden','pointer-events':'none'});
  const priceLabel=svg('text',{x:992,y:3,'text-anchor':'end',class:'crosshair-price','lengthAdjust':'spacingAndGlyphs'});
  priceTag.append(svg('rect',{x:938,y:-8,width:58,height:16,rx:2,fill:'#294c69',stroke:'#789bb9','stroke-width':.7}),priceLabel);
  chart.append(svg('line',{x1:936,x2:936,y1:scale.top,y2:scale.bottom,stroke:'#3e586f','pointer-events':'none'}),horizontal,priceTag);
  return {line,dot,horizontal,priceTag,priceLabel,scale,cursorValue:null};
}
function showCrosshairPrice(y){
  const ui=chartUi;if(!ui)return;
  const {top,bottom,min,max}=ui.scale;
  if(!Number.isFinite(y)||y<top||y>bottom){ui.horizontal.setAttribute('visibility','hidden');ui.priceTag.setAttribute('visibility','hidden');ui.cursorValue=null;return;}
  // Invert the visible price scale: this is the cursor level, independent of the day's close.
  ui.cursorValue=max-(y-top)/(bottom-top)*(max-min);
  ui.horizontal.setAttribute('y1',y);ui.horizontal.setAttribute('y2',y);ui.horizontal.setAttribute('visibility','visible');
  ui.priceTag.setAttribute('transform',`translate(0,${y})`);ui.priceLabel.textContent=fmtPrice(ui.cursorValue);ui.priceLabel.setAttribute('textLength',Math.min(50,ui.priceLabel.textContent.length*5));ui.priceTag.setAttribute('visibility','visible');
}
function pointFromEvent(ev){
  if(!chartPoints.length)return -1;const {x}=chartPosition(ev);
  let idx=0,dist=Infinity;for(let i=0;i<chartPoints.length;i++){const d=Math.abs(chartPoints[i].x-x);if(d<dist){idx=i;dist=d}}
  return idx;
}
function showPoint(index,cursorY=null){
  if(index<0||index>=chartPoints.length||!chartUi)return;hoverIndex=index;const p=chartPoints[index],mode=$('mode').value;
  chartUi.line.setAttribute('x1',p.x);chartUi.line.setAttribute('x2',p.x);chartUi.line.setAttribute('visibility','visible');
  chartUi.dot.setAttribute('cx',p.x);chartUi.dot.setAttribute('cy',p.y);chartUi.dot.setAttribute('visibility','visible');
  showCrosshairPrice(cursorY==null?p.y:cursorY);
  if(p.bar){const q=priceAsset(selected),r=p.bar;$('chartTip').textContent=`${p.day} · 开 ${fmtPrice(r[1])} 高 ${fmtPrice(r[2])} 低 ${fmtPrice(r[3])} 收 ${fmtPrice(r[4])} ${q.unit||q.currency||''} · 成交量 ${r[5]==null?'缺失':fmt(r[5])} ${q.volume_unit||''} · 成交额 ${fmtAmount(r[6],q.amount_unit)}${mode==='qfq'?' · 前复权':''}`;showTooltip(p);return}
  const quote=priceAsset(selected),unit=quote.unit||quote.currency||quote.quote_currency||'';
  const plotted=`${fmtPrice(p.value)}${mode==='normalized'?'（无量纲归一值）':(' '+unit)}`;
  const original=p.raw==null?'':`；对应原始价格 ${fmtPrice(p.raw)} ${unit}`;
  $('chartTip').textContent=`${p.day} · ${plotted}${mode==='normalized'?original:''}${mode==='qfq'?'前复权':mode==='adjusted'?' · 供应商复权收盘':''}。`;showTooltip(p);
}
function chartPosition(ev){
  const chart=$('chart');try{const p=chart.createSVGPoint();p.x=ev.clientX;p.y=ev.clientY;return p.matrixTransform(chart.getScreenCTM().inverse())}
  catch(_){const r=chart.getBoundingClientRect();return {x:(ev.clientX-r.left)*1000/r.width,y:(ev.clientY-r.top)*300/r.height}}
}
function chartX(ev){return chartPosition(ev).x}
function showTooltip(point){
  const tip=$('chartTooltip'),quote=priceAsset(selected),r=point.bar;
  const basis=$('mode').value==='qfq'?'前复权':$('mode').value==='raw'?'不复权 / 实际点位':$('mode').value==='normalized'?'归一值':'供应商调整价';
  tip.textContent=`${point.day} · ${basis}\n`+(r?`开盘  ${fmtPrice(r[1])}     最高  ${fmtPrice(r[2])}\n最低  ${fmtPrice(r[3])}     收盘  ${fmtPrice(r[4])} ${quote.unit||quote.currency||''}\n成交量  ${fmt(r[5])} ${quote.volume_unit||''}\n成交额  ${fmtAmount(r[6],quote.amount_unit)}`:`数值  ${fmtPrice(point.value)} ${$('mode').value==='normalized'?'（无量纲）\n原始价格 '+fmtPrice(point.raw):''} ${quote.unit||quote.currency||''}`);
  // Keep the popup on the opposite side of the selected candle, inside the chart.
  tip.style.left=point.x>500?'12px':'auto';tip.style.right=point.x>500?'auto':'calc(6.4% + 12px)';tip.hidden=false;
}
function boundedWindow(start,count,total){
  count=Math.max(1,Math.min(total,Math.round(count)));start=Math.max(0,Math.min(total-count,Math.round(start)));
  return {start,count};
}
function zoomChart(factor,anchor=.5){
  if(!chartWindow||!candleRows.length)return;
  wheelRemainder=0;const old=chartWindow,n=Math.max(Math.min(12,candleRows.length),Math.min(candleRows.length,Math.round(old.count*factor)));
  const a=Math.max(0,Math.min(1,anchor));chartWindow=boundedWindow(old.start+old.count*a-n*a,n,candleRows.length);renderCandles();
}
function handleChartWheel(ev){
  if(!chartWindow)return;ev.preventDefault();
  const dx=Number(ev.deltaX)||0,dy=Number(ev.deltaY)||0;
  if(!dx&&!dy)return;
  // Browsers share wheel events for mice and trackpads. Provide an explicit vertical
  // scroll mode rather than guessing hardware; horizontal gestures always pan.
  if(dy&&(ev.ctrlKey||($('wheelAction').value!=='pan'&&Math.abs(dy)>=Math.abs(dx)))){zoomChart(dy>0?1.2:1/1.2,(chartX(ev)-88)/848);return;}
  const width=$('chart').getBoundingClientRect().width*848/1000;
  const delta=Math.abs(ev.deltaX||0)>Math.abs(ev.deltaY||0)?ev.deltaX:ev.deltaY||0;
  const pixels=delta*(ev.deltaMode===1?16:ev.deltaMode===2?width:1);
  wheelRemainder+=pixels/width*chartWindow.count;
  const steps=Math.trunc(wheelRemainder);if(!steps)return;
  wheelRemainder-=steps;
  const next=boundedWindow(chartWindow.start+steps,chartWindow.count,candleRows.length);
  if(next.start===chartWindow.start){wheelRemainder=0;return;}
  chartWindow=next;renderCandles();
}
function setupChartInteraction(){
  const chart=$('chart');
  chart.addEventListener('pointerdown',ev=>{
    if(ev.button!=null&&ev.button!==0)return;
    activePointers.set(ev.pointerId,chartX(ev));
    if(ev.pointerType==='touch'){const i=pointFromEvent(ev);if(i>=0)showPoint(i,chartPosition(ev).y)}
    if(chartWindow){chart.setPointerCapture?.(ev.pointerId);const xs=[...activePointers.values()];wheelRemainder=0;gesture={x:chartX(ev),center:xs.reduce((a,b)=>a+b,0)/xs.length,window:{...chartWindow},moved:false};}
  });
  chart.addEventListener('pointermove',ev=>{
    if(activePointers.has(ev.pointerId))activePointers.set(ev.pointerId,chartX(ev));
    if(gesture&&chartWindow){
      const xs=[...activePointers.values()],delta=xs.length===2?(xs[0]+xs[1])/2-gesture.center:chartX(ev)-gesture.x;
      if(Math.abs(delta)>4||gesture.moved){gesture.moved=true;chartWindow=boundedWindow(gesture.window.start-delta/848*gesture.window.count,gesture.window.count,candleRows.length);renderCandles();return;}
    }
    const i=pointFromEvent(ev);if(i>=0)showPoint(i,chartPosition(ev).y)
  });
  const endGesture=ev=>{activePointers.delete(ev.pointerId);gesture=null;chart.releasePointerCapture?.(ev.pointerId);if(activePointers.size===1&&chartWindow){const x=[...activePointers.values()][0];gesture={x,center:x,window:{...chartWindow},moved:false}}};
  chart.addEventListener('pointerup',endGesture);chart.addEventListener('pointercancel',ev=>{endGesture(ev);activePointers.clear();resetPointState()});
  chart.addEventListener('pointerleave',()=>{if(!gesture)resetPointState()});
  chart.addEventListener('wheel',handleChartWheel,{passive:false});
  chart.addEventListener('dblclick',ev=>{ev.preventDefault();if(chartWindow){chartWindow=boundedWindow(0,candleRows.length,candleRows.length);renderCandles()}});
  chart.addEventListener('keydown',ev=>{
    if(!chartPoints.length)return;
    if(ev.key==='+'||ev.key==='='){ev.preventDefault();zoomChart(1/1.2)}
    else if(ev.key==='-'){ev.preventDefault();zoomChart(1.2)}
    else if(ev.key==='ArrowRight'||ev.key==='ArrowLeft'){ev.preventDefault();const i=Math.max(0,Math.min(chartPoints.length-1,(hoverIndex<0?0:hoverIndex)+(ev.key==='ArrowRight'?1:-1)));showPoint(i)}
    else if(ev.key==='Escape'){resetPointState()}
  });
  $('zoomIn').onclick=()=>zoomChart(1/1.2);$('zoomOut').onclick=()=>zoomChart(1.2);
  $('resetZoom').onclick=()=>{if(chartWindow){chartWindow=boundedWindow(0,candleRows.length,candleRows.length);renderCandles()}};
}

function setTab(name){currentTab=name;for(const b of document.querySelectorAll('[data-tab]')){const active=b.dataset.tab===name;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;$('panel-'+b.dataset.tab).hidden=!active}}
function sourceBlock(s,compact){
  const div=node('div',null,compact?'source-link':'source-item');div.append(node('span',s.kind||'来源','source-kind'),safeLink((s.title||'来源资料')+' ↗',s.url));
  const meeting=ResearchWorkspace.meetingHref(s,selected.id);if(meeting){const a=node('a','阅读会议摘要 ↗');a.href=meeting;div.append(a)}
  if(s.local_pdf&&location.protocol!=='file:')div.append(node('small','本机PDF未随静态站发布；保留标题与页码。'));
  div.append(node('p','资料日期：'+(s.date||'待核')+(s.page_start?' · PDF第'+s.page_start+(s.page_end!==s.page_start?'—'+s.page_end:'')+'页':''),'source-dates'));return div;
}
function renderViews(){
  const source=$('sourceType').value,tone=$('tone').value,attribution=$('attribution')?.value||'';
  const list=views.filter(v=>(!source||(source==='pdf'?v.source_subtype==='local_pdf':v.source_type===source))&&(!tone||toneFor(v)===tone)&&(!attribution||v.attribution===attribution))
    .sort((a,b)=>{const cmp=(a.view_date||'').localeCompare(b.view_date||'')||a.id.localeCompare(b.id);return $('order').value==='asc'?cmp:-cmp});
  $('loadMoreViews').hidden=list.length<=viewsLimit;$('viewsCount').textContent=`当前筛选 ${list.length} / ${views.length} 条，已显示 ${Math.min(list.length,viewsLimit)} 条 · 文稿 ${list.filter(v=>v.source_type==='video').length} 条 · 研报/摘要 ${list.filter(v=>v.source_type==='report').length} 条`;$('views').replaceChildren();
  if(!list.length){$('views').append(node('div',views.length?'当前筛选下没有观点，请调整来源或态度。':`该标的在 ${selected.mention_videos||0} 份文稿中有名称提及，尚无逐条整理观点。名称命中不自动生成推荐记录。`,'empty-card'));return}
  const byId=new Map(DATA.entities.map(e=>[e.id,e]));
  for(const v of list.slice(0,viewsLimit)){
    const a=node('article',null,'opinion'+(v.id===$('anchor').value?' selected':''));a.id='view-'+v.id;const heading=node('div',null,'opinion-heading');
    const date=node('div',v.view_date||'日期待核','opinion-date');date.append(node('small',v.date_basis||'参考日期口径待核'));
    const labels=node('div',null,'opinion-badges');labels.append(badge(toneFor(v),toneClass(toneFor(v))),badge(v.evidence_label||'来源口径待核',v.source_type==='video'?'source-video':'source-report'));
    if(v.mapping_status==='待核'||v.mapping_status==='可报价身份待核')labels.append(badge('标的身份待核','tone-pending'));
    else if(v.share_scope&&v.share_scope!=='不适用'&&v.share_class_verified===false)labels.append(badge('股别待核','tone-pending'));
    heading.append(date,labels);a.append(heading,node('p',v.summary||'观点转述待核'));
    if(v.target_text||v.target_value!=null||v.target_range)a.append(node('p','预测目标：'+(v.target_text||(v.target_range?v.target_range.join('–'):fmt(v.target_value)))+'；期限：'+(v.target_horizon||'未在选段确认')));
    a.append(node('p',v.scope||'观点归属与适用范围待核','opinion-scope'));
    for(const s of v.sources||[])a.append(sourceBlock(s,true));
    const detail=node('details');detail.append(node('summary','来源口径、标的归并与适用限制'));
    detail.append(node('p',`来源标的：${v.source_entity_name||v.entity_name||'未记录'}（${v.source_asset_kind||v.asset_kind||'类别待核'}）；映射：${v.mapping_method||'保留原始标的'}${v.mapping_basis?'；依据：'+v.mapping_basis:''}`));
    if(v.attribution||v.claim_type||v.confidence)detail.append(node('p',`归属：${v.attribution||'第三方摘要'}；类型：${v.claim_type||'摘要事件'}；文字理解置信度：${v.confidence||'未提供'}；股别：${v.share_scope||'待核'}`));
    if(v.source_subtopic)detail.append(node('p','原始行业子标签：'+v.source_subtopic+'；观点仍只计一次。'));
    if(v.limitations)detail.append(node('p',Array.isArray(v.limitations)?v.limitations.join('；'):v.limitations));
    if(v.mapping_status==='待核')detail.append(node('p','标的身份仍待核：'+(v.mapping_basis||'当前摘要不足以确认具体证券。')));
    if(v.reason_analysis)detail.append(node('p','原因归纳：'+v.reason_analysis));else if(v.reason_evidence)detail.append(node('p','原因证据范围：'+v.reason_evidence));
    for(const prior of v.prior_text_reviews||[]){const p=node('p',null,'prior-review');p.append(badge(prior.tone||'待核',toneClass(prior.tone||'待核')),node('span',` 既有文字精读 ${prior.id||''}：${prior.summary||'转述摘要待核'}${prior.date_basis?'；'+prior.date_basis:''}`));detail.append(p)}
    if(v.prior_text_review_id&&!(v.prior_text_reviews||[]).length)detail.append(node('p','关联既有文字精读：'+v.prior_text_review_id+'；作为去重溯源信息保留，不额外计数。'));
    const related=(v.related_asset_ids||[]).filter(id=>byId.has(id));
    if(related.length){const box=node('div',null,'opinion-related');box.append(node('span','相关证券/观察序列：'));for(const id of related){const e=byId.get(id);const b=node('button',`${e.name}${e.formal_code?' · '+e.formal_code:''}`,'inline-asset-link');b.type='button';b.onclick=()=>openAsset(id);box.append(b)}detail.append(box)}
    a.append(detail);const actions=node('div',null,'opinion-actions'),button=node('button','从这次观点开始观察 ↑','text-button');button.type='button';
    button.onclick=()=>{$('anchor').value=v.id;applyObservationAnchor();draw();renderViews();$('anchor').scrollIntoView({behavior:'smooth',block:'center'})};
    actions.append(node('span',v.id,'eyebrow'),button);if(['A股','指数'].includes(selected.kind)){const verify=node('a','查看这次观点的事后表现 ↗','text-button');verify.href=REVIEW_PAGE+'?asset='+encodeURIComponent(selected.id)+'&view='+encodeURIComponent(v.id);actions.append(verify)};a.append(actions);$('views').append(a);
  }
}
function renderSources(){
  const unique=new Map();for(const v of views)for(const s of v.sources||[])if(s.url&&!unique.has(s.url))unique.set(s.url,s);
  $('sources').replaceChildren();if(!unique.size){$('sources').append(node('p','尚无逐条整理线索及对应来源；名称筛查结果仍待人工核对。','muted'));return}
  for(const s of [...unique.values()].sort((a,b)=>(b.date||'').localeCompare(a.date||'')))$('sources').append(sourceBlock(s,false));
}
function viewsCsvRows(data) {
  const fields = ['观点ID','规范标的','规范标的ID','来源标的名称','来源标的ID','原始类别','归并方式','原始行业标签','参考日期','来源类别','观点归属','观点类型','态度标签','原始态度','置信度','观点转述','原因归纳','目标/期限','日期口径','股别/适用范围','证据状态','限制','来源标题','来源链接'];
  return [fields, ...data.views.map(v => [v.id,v.entity_name,v.entity_id,v.source_entity_name,v.source_entity_id,v.source_asset_kind||v.asset_kind,v.mapping_method,v.source_subtopic,v.view_date,v.source_type==='video'?'会议文稿分析':v.source_subtype==='local_pdf'?'研报PDF':'第三方摘要',v.attribution||'第三方摘要',v.claim_type,v.tone||'待核',v.stance,v.confidence,v.summary,v.reason_analysis||v.reason_evidence,v.target_text||v.target_horizon,v.date_basis,v.scope,v.evidence_label,Array.isArray(v.limitations)?v.limitations.join('；'):v.limitations||'',(v.sources||[]).map(s=>s.title).join('\n'),(v.sources||[]).map(s=>s.url).join('\n')])];
}
function csvDownload(name,rows){const csv='\ufeff'+rows.map(r=>r.map(x=>'"'+String(x??'').replaceAll('"','""')+'"').join(',')).join('\r\n');const a=node('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function datasetFactsText(){const total=DATA.transcript_coverage?.total;return `${Number.isInteger(total)?total+' 份会议文稿':'会议文稿'} · ${DATA.video_views||0} 条会议观点 · ${DATA.report_views||0} 条研报/摘要`}
function updateMethodText(){
  $('methodViewFacts').textContent=`合计 ${DATA.unique_view_count||0} 条唯一观点：文稿 ${DATA.video_views||0} 条，研报PDF ${DATA.pdf_views||0} 条，公开摘要 ${DATA.public_summary_views||0} 条。提及次数按每个标的关联的唯一观点ID统计。`;
  const coverage=DATA.transcript_coverage;if(coverage)$('methodViewFacts').textContent+=`文稿库共 ${coverage.total} 份（${Object.entries(coverage.by_channel).map(([name,count])=>name+' '+count+' 份').join('、')}），其中 ${coverage.with_linked_opinions} 份已关联结构化观点，${coverage.without_linked_opinions} 份暂无关联观点。份数不等同独立会议场次或全文分析完成数；历史首批深度分析 ${DATA.deep_analysis?.reviewed_transcripts||0} 份仅是早期批次。`;
  const first=DATA.price_range_start||'未取得',last=DATA.price_cutoff||'暂无历史数据';$('methodPriceRange').textContent=`已取得日行情范围为 ${first} 至 ${last}；日K展示实际日行情；收盘线按周采样并保留区间端点，区间变化与归一图共用同一基础序列。最新价使用各标的最新完成交易日。`;
}
function dailyBars(asset,mode='raw'){
  const rows=mode==='qfq'?asset.qfq_bars:asset.daily_bars;
  const actual=new Map((asset.daily_bars||[]).map(r=>[r[0],r]));return (rows||[]).filter(r=>Array.isArray(r)&&r.length>=7&&r.slice(1,5).every(v=>v!=null&&Number.isFinite(Number(v)))).map(r=>mode==='qfq'?[...r.slice(0,5),actual.get(r[0])?.[5]??null,actual.get(r[0])?.[6]??null]:r).sort((a,b)=>a[0].localeCompare(b[0]));
}
function renderDividends(){
  const quote=priceAsset(selected),box=$('dividends');box.replaceChildren();
  const {start,end}=requestedRange(),items=(quote.dividends||[]).filter(d=>d.date>=start&&d.date<=end).sort((a,b)=>b.date.localeCompare(a.date));
  box.append(node('p',quote.dividend_status||'当前供应商未提供可核验的分红事件；空白不代表没有分红。','chart-note'));
  for(const d of items){const p=node('p',`${d.date} · 每股现金分红 ${fmt(d.cash_per_share)} ${d.currency||quote.currency||''}（供应商事件日期）`);if(d.source_url)p.append(safeLink(' 来源 ↗',d.source_url));box.append(p)}
  if(quote.kind==='商品'||quote.kind==='指数'||quote.kind==='外汇')box.append(node('p','此品种不适用公司现金分红。指数点位不作为成分股分红明细。'));
}
function draw(){
  drawLine();renderDividends();
  const quote=priceAsset(selected),mode=$('mode').value,{start,end}=requestedRange();
  candleRows=dailyBars(quote,mode).filter(r=>r[0]>=start&&r[0]<=end);
  const key=[selected.id,mode,start,end,$('chartStyle').value].join('|');
  if(key!==chartContext){chartContext=key;chartWindow=null;gesture=null;wheelRemainder=0;activePointers.clear();}
  if($('chartStyle').value!=='candles'||mode==='normalized'||mode==='adjusted'||!candleRows.length){
    chartWindow=null;
    if($('chartStyle').value==='candles')$('chartStatus').textContent+=mode==='normalized'||mode==='adjusted'?' 当前口径采用收盘线展示。':' 当前没有该口径完整OHLC，显示真实收盘线。';
    for(const id of ['zoomIn','zoomOut','resetZoom'])$(id).disabled=true;return;
  }
  for(const id of ['zoomIn','zoomOut','resetZoom'])$(id).disabled=false;
  if(!chartWindow)chartWindow=boundedWindow(Math.max(0,candleRows.length-100),100,candleRows.length);
  renderCandles();
}
function renderCandles(){
  resetPointState();const quote=priceAsset(selected),mode=$('mode').value;
  const bars=candleRows.slice(chartWindow.start,chartWindow.start+chartWindow.count);if(!bars.length)return;
  const chart=$('chart');chart.replaceChildren();chartPoints=[];chartUi=null;hoverIndex=-1;
  const low=Math.min(...bars.map(r=>r[3])),high=Math.max(...bars.map(r=>r[2])),span=high-low||Math.max(high*.02,1),lo=low-span*.06,hi=high+span*.06;
  const x=i=>88+848*(i+.5)/bars.length,y=v=>203-175*(v-lo)/(hi-lo),width=Math.max(1,Math.min(56,848/bars.length*.72));
  for(let i=0;i<5;i++){const v=lo+(hi-lo)*i/4;chart.append(svg('line',{x1:88,x2:936,y1:y(v),y2:y(v),stroke:'#26364a'}),svg('text',{x:75,y:y(v)+4,'text-anchor':'end',fill:'#9aafc3','font-size':11},fmtPrice(v)))}
  const actualCloses=new Map(allPrices(selected));
  const useAmount=bars.some(r=>r[6]!=null&&Number.isFinite(r[6])&&r[6]>0),hasVolume=bars.some(r=>r[5]!=null&&r[5]>0),maxVol=Math.max(1,...bars.map(r=>Number(useAmount?r[6]:r[5])||0));
  bars.forEach((r,i)=>{const col=r[4]>=r[1]?'#f08b8b':'#63d6b1',px=x(i);chart.append(svg('line',{x1:px,x2:px,y1:y(r[2]),y2:y(r[3]),stroke:col,'stroke-width':1}));chart.append(svg('rect',{x:px-width/2,y:Math.min(y(r[1]),y(r[4])),width,height:Math.max(1,Math.abs(y(r[1])-y(r[4]))),fill:col}));const vol=useAmount?r[6]:r[5];if(vol!=null)chart.append(svg('rect',{x:px-width/2,y:270-48*vol/maxVol,width,height:48*vol/maxVol,fill:col,opacity:.5}));chartPoints.push({day:r[0],value:r[4],raw:actualCloses.get(r[0])??null,x:px,y:y(r[4]),bar:r})});
  chart.append(svg('text',{x:88,y:222,fill:'#9aafc3','font-size':10},useAmount?`成交额 · ${quote.amount_unit||quote.currency||'供应商单位'}`:hasVolume?`成交量 · ${quote.volume_unit||'供应商单位'}`:'成交量额缺失'));
  for(const i of [...new Set([0,Math.floor((bars.length-1)/2),bars.length-1])])chart.append(svg('text',{x:x(i),y:291,'text-anchor':i===0?'start':i===bars.length-1?'end':'middle',fill:'#9aafc3','font-size':11},bars[i][0]));
  const line=svg('line',{x1:0,x2:0,y1:24,y2:272,stroke:'#a5bbd1','stroke-dasharray':'4 3',visibility:'hidden','pointer-events':'none'}),dot=svg('circle',{cx:0,cy:0,r:4,fill:'#e7b46a',visibility:'hidden','pointer-events':'none'});chart.append(line,dot);chartUi=addCrosshair(chart,line,dot,{top:28,bottom:203,min:lo,max:hi});
  $('chartStatus').textContent=`显示 ${bars.length} / ${candleRows.length} 个真实日K · ${bars[0][0]} 至 ${bars.at(-1)[0]} · ${mode==='qfq'?'前复权':'不复权'} · ${quote.name} ${quote.formal_code||quote.instrument||''}。${useAmount?'':'成交额未取得，未用估算值填充。'}滚轮模式可切换缩放或平移，双指横滑/左右拖动平移，＋/−缩放；区间涨跌幅仍按上方日期范围计算。${mode==='raw'&&['A股','港股'].includes(quote.kind)?'前复权尚缺，当前回退不复权。':''}`;
}
async function refreshSelectedMarket(){
  const asset=priceAsset(selected),identity=asset.id,code=String(asset.formal_code||asset.code||'');let secid=null;
  if(asset.kind==='A股'&&/^\d{6}$/.test(code))secid=(code.startsWith('6')?'1.':/^[03]/.test(code)?'0.':null)+code;
  if(asset.kind==='港股'&&/^\d{5}$/.test(code))secid='116.'+code;
  const liveIndexes={'index:SSE':'1.000001','index:CSI300':'1.000300','index:SSE50':'1.000016','index:CSI1000':'1.000852','index:SZSE':'0.399001','index:CHINEXT':'0.399006','index:CSI_BANK':'0.399986'};
  if(liveIndexes[asset.id])secid=liveIndexes[asset.id];
  if(!secid||secid.startsWith('null')||asset.exclude_cached_price_series||/除牌|终止上市|退市/.test(asset.market_status||'')){$('marketRefreshStatus').textContent='此品种未配置浏览器直连接口。商品/海外/其他指数由构建采集器更新；本次没有向服务器发送请求。';return}
  const button=$('refreshSelected');button.disabled=true;$('marketRefreshStatus').textContent='正在请求东方财富 push2his.eastmoney.com；失败后尝试腾讯 web.ifzq.gtimg.cn，保留现有缓存…';
  const failures=[],cutoff=completedBrowserDay(asset);
  async function get(url){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);try{const r=await fetch(url,{signal:controller.signal});if(!r.ok)throw Error('HTTP '+r.status);return await r.json()}finally{clearTimeout(timer)}}
  function valid(rows){return rows.filter(r=>r[0]<=cutoff&&r.slice(1,5).every(v=>v!=null&&Number.isFinite(v)&&v>0)&&r[2]>=Math.max(r[1],r[4])&&r[3]<=Math.min(r[1],r[4])).sort((a,b)=>a[0].localeCompare(b[0]))}
  async function em(mode){
    const end=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}).replaceAll('-',''),u=new URL('https://push2his.eastmoney.com/api/qt/stock/kline/get');
    for(const [k,v] of Object.entries({secid,klt:101,fqt:mode,beg:20250101,end,fields1:'f1,f2,f3,f4,f5,f6',fields2:'f51,f52,f53,f54,f55,f56,f57'}))u.searchParams.set(k,v);
    const result=await get(u.href);if(String(result.data?.code)!==secid.split('.')[1])throw Error('证券代码校验失败');
    const bars=valid((result.data.klines||[]).map(line=>{const a=line.split(',');return [a[0],...a.slice(1,7).map(x=>x===''?null:Number(x))]}).map(a=>[a[0],a[1],a[3],a[4],a[2],a[5],a[6]]));
    if(!bars.length)throw Error('没有有效已完成日K');return {bars,url:u.href,name:result.data.name,provider:'东方财富公开日K'};
  }
  async function qq(mode){
    const symbol=secid.startsWith('116.')?'hk'+secid.split('.')[1]:(secid.startsWith('1.')?'sh':'sz')+secid.split('.')[1],u=new URL('https://web.ifzq.gtimg.cn/appstock/app/fqkline/get');
    u.searchParams.set('param',`${symbol},day,2025-01-01,${cutoff},640,${mode?'qfq':''}`);
    const result=await get(u.href),stock=result.data?.[symbol];if(result.code!==0||!stock)throw Error('腾讯证券代码或状态校验失败');
    const bars=valid((stock[mode?'qfqday':'day']||[]).map(r=>[String(r[0]),Number(r[1]),Number(r[3]),Number(r[4]),Number(r[2]),r[5]==null?null:Number(r[5]),null]));
    if(!bars.length)throw Error('腾讯没有返回该口径日K');return {bars,url:u.href,name:asset.name,provider:'腾讯公开日K'};
  }
  async function attempt(fn,label,mode){try{return await fn(mode)}catch(e){failures.push(label+'：'+(e.name==='AbortError'?'8秒超时':e.message));return null}}
  try{
    const raw=await attempt(em,'东方财富不复权',0)||await attempt(qq,'腾讯不复权',0);
    if(!raw)throw Error(failures.join('；'));
    let front=null;if(['A股','港股'].includes(asset.kind))front=raw.provider.startsWith('腾讯')?await attempt(qq,'腾讯前复权',1):await attempt(em,'东方财富前复权',1)||await attempt(qq,'腾讯前复权',1);
    // Preserve independently collected cash turnover; Tencent historical OHLC has no amount.
    const old=new Map((asset.daily_bars||[]).map(r=>[r[0],r]));
    for(const r of raw.bars)if(r[6]==null&&old.get(r[0])?.[6]!=null)r[6]=old.get(r[0])[6];
    if(!raw.provider.startsWith('腾讯'))asset.amount_unit=asset.kind==='港股'?'港元':'人民币元';
    asset.daily_bars=raw.bars;asset.daily_prices=raw.bars.map(r=>[r[0],r[4]]);asset.prices=asset.daily_prices;
    asset.latest_price_date=raw.bars.at(-1)[0];asset.latest_price=raw.bars.at(-1)[4];asset.price_source_url=raw.url;asset.price_provider=raw.provider+'（浏览器当前请求）';asset.price_quote_name=raw.name;asset.price_retrieved_at=new Date().toISOString();asset.price_error=null;
    if(front){asset.qfq_bars=front.bars;asset.qfq_basis=front.provider+'前复权完整窗口';asset.qfq_error=null}
    else if(['A股','港股'].includes(asset.kind))asset.qfq_error='本次前复权未更新；保留旧窗口，基准可能较旧';
    asset.volume_unit=asset.kind==='港股'?'股':'手（1手=100股，供应商日K口径）';
    const message=`已通过${raw.provider}更新至 ${asset.latest_price_date}。${raw.provider.startsWith('腾讯')?'腾讯未提供历史成交额，已有成交额保留，缺失日期留空。':''}${failures.length?'请求记录：'+failures.join('；')+'。':''}仅更新当前打开的页面内存；磁盘文件和分红事件由重新构建更新。`;
    ResearchWorkspace.markLive(asset.name,asset.latest_price_date);
    if(selected&&priceAsset(selected).id===identity){select(selected.id);$('snapshotNote').textContent=ResearchWorkspace.snapshotNote(DATA.price_cutoff);$('marketRefreshStatus').textContent=message}
  }catch(e){if(selected&&priceAsset(selected).id===identity)$('marketRefreshStatus').textContent='联网更新失败：'+e.message+'。浏览器无法区分跨域拦截与网络断开；公开接口也可能限流。此请求不使用东方财富连接器积分。已保留全部缓存，可运行构建命令从新浪等来源更新。'}finally{button.disabled=false}
}

function completedBrowserDay(asset){const now=new Date(),tz=['A股','港股','指数'].includes(asset.kind)?'Asia/Shanghai':'UTC';const parts=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now),o=Object.fromEntries(parts.map(p=>[p.type,p.value]));let day=new Date(`${o.year}-${o.month}-${o.day}T00:00:00Z`);if(Number(o.hour)<(asset.kind==='港股'?17:16))day.setUTCDate(day.getUTCDate()-1);return day.toISOString().slice(0,10)}

function rememberMarketPage(){
  ResearchWorkspace.remember('markets',{
    capture:()=>({selected:selected?.id,tab:currentTab,viewsLimit,chartWindow}),
    restore:state=>{
      const values=state.controls||{},extra=state.extra||{};
      ResearchWorkspace.applyControls(values,['query','kind','coverage']);
      filter(resolveId(extra.selected||values.asset||''));
      ResearchWorkspace.applyControls(values,['anchor','observationBasis','rangeStart','rangeEnd','mode','chartStyle','wheelAction','sourceType','tone','attribution','order']);
      viewsLimit=Math.max(60,Math.min(DATA.views.length,Number(extra.viewsLimit)||60));
      renderViews();draw();
      if(extra.chartWindow&&candleRows.length&&chartWindow){chartWindow=boundedWindow(extra.chartWindow.start,extra.chartWindow.count,candleRows.length);renderCandles()}
      setTab(['overview','prices','sources'].includes(extra.tab)?extra.tab:'overview');
      ResearchWorkspace.context(selected?.id,$('anchor').value||null);
    }
  });
}
async function init(){
  try{
    DATA=await ResearchPublic.index();await ResearchPublic.prepare(DATA);ResearchWorkspace.hydrate(DATA);
    $('freshness').textContent=`构建快照 · ${DATA.incremental_feed?.latest_delivery?'资料补充 '+DATA.incremental_feed.latest_delivery.batch+' · ':''}行情截至 ${DATA.price_cutoff||'暂无'}`;
    $('snapshotNote').textContent=ResearchWorkspace.snapshotNote(DATA.price_cutoff);
    $('datasetFacts').textContent=datasetFactsText();
    const coverage=DATA.transcript_coverage;$('transcriptCoverageNote').textContent=coverage?`其中 ${coverage.with_linked_opinions} 份已关联观点，${coverage.without_linked_opinions} 份暂无关联观点。`:'';
    updateMethodText();
    for(const kind of [...new Set(DATA.entities.map(e=>e.kind))].sort())option($('kind'),kind,kind);
    $('query').oninput=()=>filter();$('kind').onchange=()=>filter();$('coverage').onchange=()=>filter();$('asset').onchange=()=>select($('asset').value);
    $('resetAssets').onclick=()=>{for(const id of ['query','kind','coverage'])$(id).value='';filter()};
    $('anchor').onchange=()=>{applyObservationAnchor();renderViews();draw()};
    $('observationBasis').onchange=()=>{applyObservationAnchor();draw()};
    $('rangeStart').onchange=()=>{$('anchor').value='';renderViews();draw()};$('rangeEnd').onchange=draw;$('resetRange').onclick=()=>{$('anchor').value='';setRangeToFull();renderViews();draw()};
    $('mode').onchange=draw;for(const id of ['sourceType','tone','attribution','order'])$(id).onchange=()=>{viewsLimit=60;renderViews()};$('loadMoreViews').onclick=()=>{viewsLimit+=60;renderViews()};

    const tabs=[...document.querySelectorAll('[data-tab]')];for(const b of tabs){b.onclick=()=>setTab(b.dataset.tab);b.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const i=tabs.indexOf(b);const next=tabs[e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];setTab(next.dataset.tab);next.focus()}}
    setupChartInteraction();$('chartStyle').onchange=draw;$('refreshSelected').onclick=refreshSelectedMarket;
    const params=new URL(location.href).searchParams,initial=params.get('asset')||'cn:600004',wantedView=params.get('view');filter(resolveId(initial));setTab(currentTab);$('loading').hidden=true;$('app').hidden=false;
    if(wantedView&&views.some(v=>v.id===wantedView)){const ordered=[...views].sort((a,b)=>(b.view_date||'').localeCompare(a.view_date||'')||b.id.localeCompare(a.id));viewsLimit=Math.max(60,ordered.findIndex(v=>v.id===wantedView)+1);$('anchor').value=wantedView;applyObservationAnchor();renderViews();draw();$('view-'+wantedView)?.scrollIntoView({block:'center'})}
    rememberMarketPage();
  }catch(e){$('loading').textContent='资料加载失败：'+e.message;$('loading').classList.add('error')}
}
init();
function select(id,keepRange=false){ResearchPublic.choose(DATA,resolveId(id),()=>renderSelected(id,keepRange));}
