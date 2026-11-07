'use strict';
(async()=>{
  const root=document.getElementById('summaryRoot'),q=new URL(location.href).searchParams;
  const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e};
  const link=(title,url)=>{const e=node('a',title);e.href=url;return e};
  try{
    const meetings=await ResearchPublic.json('../assets/meetings.json?v=4bb51c22c5cc');
    const id=q.get('id');
    if(id){
      const entry=meetings.find(e=>e.video_id===id);if(!entry)throw Error('未找到会议摘要');
      const detail=await ResearchPublic.json('../'+entry.detail);
      const toolbar=node('div',null,'report-toolbar');toolbar.append(link('← 返回会议摘要列表','index.html'));root.append(toolbar,node('h2',entry.title),node('p',[entry.upload_date,entry.channel,entry.meeting_date].filter(Boolean).join(' · '),'scope-note'));
      const source=link('公开来源 ↗',entry.url);source.target='_blank';source.rel='noopener noreferrer';root.append(source);
      for(const v of detail.views){const card=node('article',null,'review-case');card.id='summary-'+v.id;card.append(node('p',v.summary),node('small',[v.view_date,v.tone,v.attribution,v.scope].filter(Boolean).join(' · ')));root.append(card)}
      if(!detail.views.length)root.append(node('p','本期尚无可展示的关联观点摘要。'));
      ResearchWorkspace.remember('meeting-summary',{alias:'meetings'});
    }else{
      const query=document.getElementById('meetingQuery'),channel=document.getElementById('meetingChannel');let limit=24;
      for(const c of [...new Set(meetings.map(e=>e.channel))])channel.append(new Option(c,c));
      function render(){root.replaceChildren();const matches=meetings.filter(e=>(!channel.value||e.channel===channel.value)&&e.title.toLowerCase().includes(query.value.trim().toLowerCase())).sort((a,b)=>(b.upload_date||'').localeCompare(a.upload_date||''));
        document.getElementById('meetingCount').textContent=matches.length+' 期 · 已显示 '+Math.min(limit,matches.length)+' 期';
        for(const e of matches.slice(0,limit)){const card=node('article',null,'episode');card.dataset.id=e.video_id;card.append(node('p',[e.upload_date,e.channel].filter(Boolean).join(' · '),'scope-note'),link(e.title,'detail.html?id='+encodeURIComponent(e.video_id)),node('p',e.count+' 条重点观点'));root.append(card)}
        if(!matches.length)root.append(node('p','没有符合条件的会议摘要。'));
        if(matches.length>limit){const more=node('button','继续显示','button secondary');more.onclick=()=>{limit+=24;render()};root.append(more)}
      }
      query.oninput=channel.onchange=()=>{limit=24;render()};render();
      ResearchWorkspace.remember('meeting-list',{alias:'meetings',capture:()=>({limit}),restore:s=>{ResearchWorkspace.applyControls(s.controls);limit=s.extra?.limit||24;render()}});
    }
  }catch(e){root.textContent='摘要加载失败：'+e.message}
})();
