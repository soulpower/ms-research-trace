/* Public releases keep private inputs out; only selected assets are fetched. */
var ResearchPublic=(()=>{
  const requests=new Map(),packets=new Map();let sequence=0,searchReady=false;
  async function json(url){
    if(!requests.has(url))requests.set(url,(async()=>{const response=await fetch(url);if(!response.ok)throw Error('HTTP '+response.status);return response.json()})().catch(e=>{requests.delete(url);throw e}));
    return requests.get(url);
  }
  async function ensure(data,id){
    if(packets.has(id)||!data.public_assets[id])return;
    const payload=await json(data.public_assets[id]);
    if(payload.entity.id!==id)throw Error('标的身份校验失败');
    if(packets.has(id))return;
    ResearchWorkspace.hydrate({entities:[payload.entity]});
    const entity=data.entities.find(e=>e.id===id);Object.assign(entity,payload.entity);
    const known=new Set(data.views.map(v=>v.id));
    for(const v of payload.views)if(!known.has(v.id)){data.views.push(v);known.add(v.id)}
    packets.set(id,payload);
  }
  function status(message){
    const target=document.getElementById('publicLoadStatus');
    if(target)target.textContent=message;
  }
  function index(){
    const query=new URL(location.href).searchParams;
    const fallback=document.body?.dataset.defaultMarket;
    if(fallback&&query.get('_resume')!=='1'&&(!query.has('asset')||query.get('asset')==='cn:600004')){
      json(fallback).catch(()=>{}); // Selection will retry if the speculative request fails.
    }
    return json('assets/markets.json?v=8f892014cb86');
  }
  function choose(data,id,render){
    const ticket=++sequence,benchmark=data.entities.find(e=>e.id===id)?.benchmark_id;
    if(packets.has(id)&&(!benchmark||packets.has(benchmark))){status('');return render()}
    status('正在加载所选标的的观点与行情…');
    return Promise.all([ensure(data,id),benchmark&&ensure(data,benchmark)]).then(()=>{
      if(ticket!==sequence)return;
      status('');return render();
    }).catch(e=>{if(ticket===sequence)status('加载失败：'+e.message+'。请重新选择重试。')});
  }
  async function search(data){
    if(searchReady||!data.search_file)return false;
    const terms=await json(data.search_file);
    if(searchReady)return false;
    for(const entity of data.entities)if(terms[entity.id])entity.search_terms=terms[entity.id];
    searchReady=true;
    return true;
  }
  function opinions(refs){
    const groups=new Map();
    for(const ref of refs)if(ref.detail_file){
      const group=groups.get(ref.detail_file)||[];
      group.push(ref);groups.set(ref.detail_file,group);
    }
    if(!groups.size)return null;
    return Promise.all([...groups].map(async ([url,group])=>{
      const rows=new Map((await json(url)).map(row=>[row.id,row]));
      for(const ref of group){
        const full=rows.get(ref.id);
        if(!full)throw Error('观点明细校验失败');
        Object.assign(ref,full);
        delete ref.detail_file;
      }
    }));
  }
  function sources(id){const url=packets.get(id)?.sources_file;return url?json(url):null}
  ResearchWorkspace.meetingHref=(source,assetId)=>{
    const id=source?.meeting_id||(source?.kind?.includes('会议')?source.id:null);
    if(!/^[\w-]{11}$/.test(id||''))return null;
    const q=new URLSearchParams({id});if(assetId)q.set('asset',assetId);return 'meeting-reports/detail.html?'+q;
  };
  return {index,choose,json,search,opinions,sources,cancel:()=>{sequence++;status('')},views:id=>packets.get(id)?.views};
})();
