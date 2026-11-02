/* Public releases keep private inputs out; only selected assets are fetched. */
var ResearchPublic=(()=>{
  const requests=new Map(),loaded=new Set();let sequence=0;
  async function json(url){
    if(!requests.has(url))requests.set(url,(async()=>{const response=await fetch(url);if(!response.ok)throw Error('HTTP '+response.status);return response.json()})().catch(e=>{requests.delete(url);throw e}));
    return requests.get(url);
  }
  async function ensure(data,id){
    if(loaded.has(id)||!data.public_assets[id])return;
    const payload=await json(data.public_assets[id]);
    if(payload.entity.id!==id)throw Error('标的身份校验失败');
    ResearchWorkspace.hydrate({entities:[payload.entity]});
    const entity=data.entities.find(e=>e.id===id);Object.assign(entity,payload.entity);
    const known=new Set(data.views.map(v=>v.id));for(const v of payload.views)if(!known.has(v.id)){data.views.push(v);known.add(v.id)}
    loaded.add(id);
  }
  async function asset(data,id){await ensure(data,id);const benchmark=data.entities.find(e=>e.id===id)?.benchmark_id;if(benchmark)await ensure(data,benchmark)}
  function status(text){const node=document.getElementById('publicLoadStatus');if(node)node.textContent=text}
  async function prepare(data){
    const ids=[new URL(location.href).searchParams.get('asset')||'cn:600004'];
    if(new URL(location.href).searchParams.get('_resume')==='1')try{
      const root=new URL('.',location.href),key='research-workspace:v1:'+root.origin+root.pathname;
      const memory=JSON.parse(sessionStorage.getItem(key)||'null')?.pages?.markets;
      if(memory?.extra?.selected)ids.push(memory.extra.selected);
    }catch(_){}
    await Promise.all(ids.map(id=>asset(data,data.asset_redirects?.[id]||id)));
  }
  function choose(data,id,render){
    const ticket=++sequence,benchmark=data.entities.find(e=>e.id===id)?.benchmark_id;
    if(loaded.has(id)&&(!benchmark||loaded.has(benchmark))){status('');render();return}
    status('正在加载所选标的的观点与行情…');
    asset(data,id).then(()=>{if(ticket!==sequence)return;status('');render()}).catch(e=>{if(ticket!==sequence)return;status('加载失败：'+e.message+'。请重新选择重试；未替换已有图表。')});
  }
  ResearchWorkspace.meetingHref=(source,assetId)=>{
    const id=source?.meeting_id||(source?.kind?.includes('会议')?source.id:null);
    if(!/^[\w-]{11}$/.test(id||''))return null;
    const q=new URLSearchParams({id});if(assetId)q.set('asset',assetId);return 'meeting-reports/detail.html?'+q;
  };
  return {index:()=>json('assets/markets.json?v=88d42963b44e'),prepare,choose,json};
})();
