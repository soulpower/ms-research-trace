'use strict';
const $=id=>document.getElementById(id);
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e};
const pct=x=>x==null?'—':`${x>0?'+':''}${Number(x).toFixed(2)}%`;
const MAIN_PAGE='index.html';
const REVIEW_PAGE='review.html';
let PRE,limit=24,requestedAsset='',contextView='';
const controls=['kind','sector','asset','window','evidence','dates','signal','threshold','query','repetitions'];
function baseRows(){
  return PRE.rows.filter(r=>(!$('kind').value||($('kind').value==='指数'?r.kind==='指数':r.kind!=='指数'))&&(!$('sector').value||r.sector===$('sector').value)&&($('evidence').value==='all'||r.audited));
}
function options(){
  const chosen=$('asset').value||requestedAsset;
  $('asset').replaceChildren(new Option('全部有事件的标的',''));
  for(const r of [...new Map(baseRows().map(r=>[r.entity_id,r])).values()].sort((a,b)=>a.name.localeCompare(b.name,'zh')))$('asset').append(new Option(r.name+' · '+(r.code||r.entity_id),r.entity_id));
  if(chosen===requestedAsset&&chosen&&![...$('asset').options].some(o=>o.value===chosen)){
    const asset=PRE.assets?.find(r=>r.id===chosen);
    if(asset)$('asset').append(new Option(asset.name+' · 当前口径暂无事件',asset.id));
  }
  $('asset').value=[...$('asset').options].some(o=>o.value===chosen)?chosen:'';
}
function filtered(){
  const q=$('query').value.trim().toLowerCase();
  return baseRows().filter(r=>(!$('asset').value||r.entity_id===$('asset').value)&&(!$('dates').value||r.date_verified===($('dates').value==='verified'))&&(!$('signal').value||r.signal_type===$('signal').value)&&($('repetitions').value!=='exclude'||r.signal_type!=='重复重申')&&(!q||[r.name,r.code,r.summary,...r.sources.map(s=>s.title)].join(' ').toLowerCase().includes(q)));
}
function metric(label,value,note){const e=node('div');e.append(node('small',label),node('b',value),node('span',note));return e}
function trend(r){const x=r.windows[$('window').value]?.return_pct,t=Number($('threshold').value);return x==null?'行情不足':Math.abs(x)<=t?'走势不明显':x*r.direction>0?'顺势':'逆势'}
function directionBadge(direction){return node('span',direction===1?'看多':direction===-1?'看空':'方向不明','badge pre-label '+(direction===1?'pre-bullish':direction===-1?'pre-bearish':'pre-unknown'))}
function trendBadge(label){return node('span',label,'badge pre-label '+({'顺势':'pre-follow','逆势':'pre-contrarian','走势不明显':'pre-flat','行情不足':'pre-unknown'}[label]||'pre-unknown'))}
function chart(r){
  const wrap=node('div'),rows=r.chart;
  if(rows.length<2)return node('p','暂无足够历史点位','chart-note');
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 600 180');svg.setAttribute('class','pre-chart');svg.setAttribute('role','img');svg.setAttribute('aria-label','观点前后真实收盘走势，阴影为所选事前窗口，虚线为观点参考日');
  const lo=Math.min(...rows.map(x=>x[1])),hi=Math.max(...rows.map(x=>x[1])),range=hi-lo||1;
  const x=i=>30+i/(rows.length-1)*540,y=p=>140-(p-lo)/range*110;
  const add=(tag,attrs,text)=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text)e.textContent=text;svg.append(e);return e};
  const window=r.windows[$('window').value],left=rows.findIndex(p=>p[0]===window.start),right=rows.findIndex(p=>p[0]===window.end);
  if(left>=0&&right>=left)add('rect',{x:x(left),y:18,width:Math.max(2,x(right)-x(left)),height:128,fill:'#284957',opacity:'.55'});
  add('path',{d:rows.map((p,i)=>(i?'L':'M')+x(i)+','+y(p[1])).join(' '),fill:'none',stroke:'#77c9c2','stroke-width':'2'});
  let pos=rows.findIndex(p=>p[0]>=r.date),marker;
  if(pos<0)marker=x(rows.length-1)+5;else marker=rows[pos][0]===r.date?x(pos):pos?((x(pos)+x(pos-1))/2):x(0)-5;
  add('line',{x1:marker,x2:marker,y1:15,y2:145,stroke:'#dcc087','stroke-dasharray':'4 4'});
  for(let i=0;i<rows.length;i++){const c=add('circle',{cx:x(i),cy:y(rows[i][1]),r:'4',fill:'transparent'}),t=document.createElementNS(ns,'title');t.textContent=rows[i][0]+' · '+rows[i][1].toFixed(2);c.append(t)}
  add('text',{x:'30',y:'166'},rows[0][0]+' → '+rows.at(-1)[0]+' · '+r.basis+' · '+(r.unit||'单位见标的'));
  wrap.append(svg,node('p',`阴影：所选 ${$('window').value} 交易日窗口 ${window.start||'行情不足'} → ${window.end||'—'}。虚线：参考日 ${r.date}，非交易日位于相邻观测之间；鼠标停留在点上查看真实日期和价格。`,'chart-note'));
  return wrap;
}
function eventDetails(r){
  const detail=node('details'),body=node('div');
  detail.append(node('summary','走势、原观点与全部来源'),body);
  let loading=false,loaded=false;
  detail.addEventListener('toggle',async ()=>{
    if(!detail.open||loaded||loading)return;
    loading=true;
    try{
      let full=r;
      if(r.detail_file){
        body.textContent='正在加载走势与来源…';
        const data=await ResearchPublic.json(r.detail_file);
        if(!data[r.id])throw Error('事件明细校验失败');
        full={...r,...data[r.id]};
      }
      renderEventDetails(body,full);
      loaded=true;
    }catch(e){body.textContent='载入失败：'+e.message+'。收起后重新展开可重试。';}
    finally{loading=false;}
  });
  return detail;
}
function renderEventDetails(detail,r){
  detail.replaceChildren(chart(r));
  for(const v of r.views)detail.append(node('p',v.summary),node('small',`${v.id} · ${v.date_basis||'日期依据待核'} · ${v.attribution||'归属待核'}`));
  for(const source of r.sources){
    if(source.url?.startsWith('https://')){const link=node('a',source.title||source.id);link.href=source.url;link.target='_blank';link.rel='noreferrer';detail.append(link,node('br'))}
    else detail.append(node('p',(source.title||source.filename||source.id)+' · 原始资料不随公开版发布'));
    const meeting=ResearchWorkspace.meetingHref(source,r.entity_id);
    if(meeting){const link=node('a','阅读会议摘要 ↗');link.href=meeting;detail.append(link,node('br'))}
  }
}
function card(r){
  const a=node('article',null,'review-case'+(contextView&&r.views.some(v=>v.id===contextView)?' is-focused':'')),head=node('div',null,'review-case-head'),labels=node('div',null,'pre-labels');
  a.id='pre-'+r.id;
  labels.append(directionBadge(r.direction),trendBadge(trend(r)));head.append(node('h3',r.name+' '+(r.code||'')),labels);
  a.append(head,node('p',r.summary,'review-claim'),node('p',r.date+' · '+r.signal_type+' · '+(r.audited?'已审阅方向':'措辞候选，待复核')+' · '+(r.date_verified?'日期已核验':'按参考日观察，日期待核'),'chart-note'));
  const w=r.windows[$('window').value],unit=r.price_context?.unit||r.unit||'';
  a.append(ResearchWorkspace.referencePrice(r.price_context),node('span',`观点前 ${$('window').value} 交易日变化`,'review-result-label'),node('b',pct(w.return_pct),'review-result'));
  a.append(ResearchWorkspace.pricePair(
    {label:'窗口起点',date:w.start,price:w.start_price},
    {label:'观点前收盘',date:w.end,price:w.end_price},unit,
    `${r.basis} · 涨跌幅按上述两点计算${w.status==='可计算'?'':' · '+w.status}。`));
  if(w.excess_pct!=null)a.append(node('p',`观察基准 ${r.benchmark.name} ${r.benchmark.code||r.benchmark.id}：${pct(w.benchmark_return_pct)}；相对差值 ${Number(w.excess_pct).toFixed(2)} 个百分点。`,'review-reason'));
  const later=r.future_start;
  a.append(node('p',r.future_end?`观点后20交易日：${later.date} ${ResearchWorkspace.displayPrice(later.price)} → ${r.future_end.date} ${ResearchWorkspace.displayPrice(r.future_end.price)} ${unit} · ${pct(r.future_return_pct)}`:`观点后20交易日未完整${later?'；已见起点 '+later.date+' · '+ResearchWorkspace.displayPrice(later.price)+' '+unit:'或行情不足'}。`,'review-reason'));
  const detail=eventDetails(r);
  if(r.review_expiry)a.append(node('p',`原综合核验（含目标要求）${r.deadline||'待核'}：${r.review_expiry.state}；截至当前：${r.review_current?.state||'暂无'}。`,'review-reason'));
  if(r.price_source){const link=node('a','实际行情来源 ↗');link.href=r.price_source;link.target='_blank';link.rel='noreferrer';detail.append(link)}
  a.append(detail);
  const original=node('a','查看原观点与行情 →');original.href=MAIN_PAGE+'?asset='+encodeURIComponent(r.entity_id)+'&view='+encodeURIComponent(r.views[0]?.id||'');
  const actions=node('div',null,'review-actions');actions.append(original);
  if(r.audited){const review=node('a','事后验证 →');review.href=REVIEW_PAGE+'?asset='+encodeURIComponent(r.entity_id)+'&view='+encodeURIComponent(r.views[0]?.id||'');actions.append(review)}
  else actions.append(node('span','候选待复核，尚未纳入事后验证','chart-note'));
  a.append(actions);return a;
}
function render(){
  const rows=filtered(),w=$('window').value,usable=rows.filter(r=>r.windows[w].return_pct!=null),follow=usable.filter(r=>trend(r)==='顺势'),contra=usable.filter(r=>trend(r)==='逆势'),den=follow.length+contra.length;
  ResearchWorkspace.context($('asset').value,contextView);
  $('pool').textContent=rows.length+' 次';
  $('metrics').replaceChildren(metric('去重后的观点事件',rows.length,'同日同向来源已归并'),metric('此前行情可计算',usable.length,rows.length-usable.length+' 次行情不足'),metric('顺势比例',den?(100*follow.length/den).toFixed(2)+'%':'—','分母 '+den+' 次，排除震荡'),metric('逆势比例',den?(100*contra.length/den).toFixed(2)+'%':'—','阈值 ±'+$('threshold').value+'%'));
  $('preQuality').textContent=`当前筛选 ${rows.length} 次：看多 ${rows.filter(r=>r.direction===1).length}、看空 ${rows.filter(r=>r.direction===-1).length}；日期已核验 ${rows.filter(r=>r.date_verified).length} 次、重复重申 ${rows.filter(r=>r.signal_type==='重复重申').length} 次、方向变化 ${rows.filter(r=>r.signal_type==='方向变化').length} 次。顺势描述表态前走势，不能据此证明追涨杀跌或研究动机。${rows.some(r=>r.signal_type==='方向变化')?'':'本次没有同一标的已记录的方向变化，无法检验其反复转向行为。'}`;
  $('matrix').replaceChildren();
  for(const [name,dir,sign] of [['涨后看多',1,1],['跌后看空',-1,-1],['跌后看多',1,-1],['涨后看空',-1,1]]){
    const count=usable.filter(r=>r.direction===dir&&(sign===1?r.windows[w].return_pct>Number($('threshold').value):r.windows[w].return_pct < -Number($('threshold').value))).length;
    const e=node('div',name,'pre-cell'),labels=node('div',null,'pre-labels');labels.append(directionBadge(dir),trendBadge(dir===sign?'顺势':'逆势'));e.append(node('b',count),labels);$('matrix').append(e);
  }
  const compared=usable.filter(r=>r.future_return_pct!=null&&Math.abs(r.windows[w].return_pct)>Number($('threshold').value)),hit=compared.filter(r=>r.direction*r.future_return_pct>0).length,base=compared.filter(r=>r.windows[w].return_pct*r.future_return_pct>0).length;
  $('comparison').textContent=compared.length?`同一批 ${compared.length} 个完整样本：观点方向符合 ${hit} 次（${(100*hit/compared.length).toFixed(2)}%）；简单顺势规则符合 ${base} 次（${(100*base/compared.length).toFixed(2)}%）。统一按观点后20交易日观察。`:'暂无足够的共同完整事后区间，不能比较简单规则。';
  const median=a=>{a.sort((a,b)=>a-b);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2:null};
  const xs=usable.map(r=>r.windows[w].return_pct),ys=usable.map(r=>r.direction),mx=xs.reduce((a,b)=>a+b,0)/xs.length,my=ys.reduce((a,b)=>a+b,0)/ys.length;
  const covariance=xs.reduce((a,x,i)=>a+(x-mx)*(ys[i]-my),0),div=Math.sqrt(xs.reduce((a,x)=>a+(x-mx)**2,0)*ys.reduce((a,y)=>a+(y-my)**2,0));
  $('balance').textContent=`可计算样本：看多 ${ys.filter(x=>x===1).length}，看空 ${ys.filter(x=>x===-1).length}；看多前期中位涨跌 ${pct(median(usable.filter(r=>r.direction===1).map(r=>r.windows[w].return_pct)))}，看空 ${pct(median(usable.filter(r=>r.direction===-1).map(r=>r.windows[w].return_pct)))}；相关系数 ${div?(covariance/div).toFixed(3):'无法计算（方向或行情无变化）'}。小样本和方向不均衡需结合分布阅读，不据此认定研究动机。`;
  $('count').textContent=`显示 ${Math.min(limit,rows.length)} / ${rows.length} 次事件`;$('cases').replaceChildren(...rows.slice(0,limit).map(card));
  if(!rows.length)$('cases').append(node('p','没有符合筛选的事件，可重置筛选；未形成方向判断的资料仍在观点汇总中保留。','review-empty'));
  $('more').hidden=rows.length<=limit;
}
function rememberPrePage(){
  ResearchWorkspace.remember('pre',{
    capture:()=>({limit,requestedAsset,contextView}),
    restore:state=>{
      const values=state.controls||{},extra=state.extra||{};
      ResearchWorkspace.applyControls(values,controls.filter(id=>id!=='asset'));
      requestedAsset=extra.requestedAsset||values.asset||'';contextView=extra.contextView||'';
      $('asset').value='';options();ResearchWorkspace.applyControls(values,['asset']);
      limit=Math.max(24,Math.min(PRE.rows.length,Number(extra.limit)||24));render();
    }
  });
}
async function init(){
  try{
    const r=await fetch('assets/pre.json?v=7a22184e326a');if(!r.ok)throw Error(r.status);PRE=await r.json();
    $('preFreshness').textContent='行情快照 '+PRE.price_cutoff;$('snapshotNote').textContent=ResearchWorkspace.snapshotNote(PRE.price_cutoff);
    $('coverage').textContent=`本页纳入 ${PRE.scope.reviewed_events} 次已审阅方向事件，以及 ${PRE.scope.candidate_events} 次待复核措辞候选；另有 ${PRE.scope.unscored_views} 条观点保留未评分原因。已审阅事件中仅 ${PRE.scope.verified_date_events} 次日期已核验，其余按参考日观察，上传延迟可能造成假性滞后。`;
    const params=ResearchWorkspace.params(),view=params.get('view'),found=PRE.rows.find(r=>r.views.some(v=>v.id===view));
    requestedAsset=found?.entity_id||params.get('asset')||'';contextView=view||'';
    if(requestedAsset&&!PRE.assets?.some(a=>a.id===requestedAsset)){
      const original=node('a','返回原标的资料');original.href=MAIN_PAGE+'?asset='+encodeURIComponent(requestedAsset);
      $('preContextNote').append(node('span','当前标的不属于本页股票/指数范围，以下显示全库事件。 '),original);
      requestedAsset='';contextView='';
    }
    if(found&&!found.audited)$('evidence').value='all';
    for(const x of [...new Set(PRE.rows.map(r=>r.sector))].sort())$('sector').append(new Option(x,x));
    options();
    if(view&&!found){
      const note=$('preContextNote');
      const fallback='当前原观点未形成可用的事前方向事件。可在观点汇总中继续查看原资料。';
      const showReason=rows=>{
        const reason=rows.find(r=>r.id===view)?.reason;
        if(reason)note.textContent='当前原观点未形成可用的事前方向事件：'+reason+'。可在观点汇总中继续查看原资料。';
      };
      note.textContent=fallback;
      if(PRE.excluded)showReason(PRE.excluded);
      else if(PRE.excluded_file)ResearchPublic.json(PRE.excluded_file).then(rows=>{
        if(contextView===view&&note.textContent===fallback)showReason(rows);
      }).catch(()=>{});
    }
    for(const id of controls)$(id).addEventListener(id==='query'?'input':'change',()=>{limit=24;contextView='';$('preContextNote').textContent='';if(['kind','sector','evidence'].includes(id)){requestedAsset='';options()}render()});
    $('reset').onclick=()=>{for(const id of controls)$(id).value=({window:'40',evidence:'reviewed',threshold:'3'}[id]||'');requestedAsset='';contextView='';$('preContextNote').textContent='';limit=24;options();render()};
    $('more').onclick=()=>{limit+=24;render()};$('method').replaceChildren(...PRE.method.map(t=>node('p',t)));
    $('excluded').textContent=Object.entries(PRE.scope.unscored_reasons).map(([s,n])=>`${s}：${n} 条`).join('；');
    if(found){const events=filtered();limit=Math.max(24,events.findIndex(r=>r.id===found.id)+1)}
    render();rememberPrePage();
  }catch(e){$('coverage').textContent='载入失败：'+e.message}
}
init();