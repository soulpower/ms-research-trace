/* Small shared data/navigation helpers. All paths stay relative for Pages subdirectories. */
var ResearchWorkspace = (() => {
  function hydrate(data) {
    for (const entity of data.entities || []) {
      for (const [target, source] of Object.entries(entity.series_refs || {})) {
        if ((target === 'daily_prices' && source === 'daily_bars') ||
            (target === 'daily_adjusted_prices' && source === 'qfq_bars')) {
          entity[target] = (entity[source] || []).map(row => [row[0], row[4]]);
        } else throw Error('Unknown price series reference');
      }
      delete entity.series_refs;
    }
    return data;
  }
  function params() {
    try { return new URL(location.href).searchParams; }
    catch (_) { return new URLSearchParams(); }
  }
  function context(asset, view) {
    if (!document.querySelectorAll) return;
    for (const anchor of document.querySelectorAll('.topbar [data-workspace-link]')) {
      if (!['markets', 'pre', 'review', 'meetings'].includes(anchor.dataset.workspaceLink)) continue;
      const base = anchor.getAttribute('href').split('?')[0].split('#')[0];
      const next = new URLSearchParams();
      if (asset) next.set('asset', asset);
      if (view && anchor.dataset.workspaceLink !== 'meetings') next.set('view', view);
      anchor.href = base + (next.size ? '?' + next : '');
    }
    for (const anchor of document.querySelectorAll('#meetingList .episode a[href], .report-toolbar > a')) {
      const base = anchor.getAttribute('href').split('?')[0];
      if (!/^(?:[\w-]{11}|index)\.html$/.test(base)) continue;
      anchor.href = base + (asset ? '?asset=' + encodeURIComponent(asset) : '');
    }
  }
  function meetingHref(source, asset) {
    if (!/^[\w-]{11}$/.test(source?.meeting_id || '')) return null;
    const q = new URLSearchParams();
    if (asset) q.set('asset', asset);
    return 'meeting-reports/' + source.meeting_id + '.html' + (q.size ? '?' + q : '');
  }
  function markLive(asset, priceDate) {
    try { sessionStorage.setItem('research-live-quote', JSON.stringify({asset, priceDate})); }
    catch (_) { /* Storage may be unavailable for file://; the persistent note remains. */ }
  }
  function snapshotNote(cutoff) {
    let text = '统计行情快照截至 ' + cutoff + '。首页联网更新只影响当前打开的页面；事前、事后统计需重新构建才会更新。';
    try {
      const live = JSON.parse(sessionStorage.getItem('research-live-quote') || 'null');
      if (live?.priceDate) text += ' 本标签页曾临时更新 ' + live.asset + ' 至 ' + live.priceDate + '，未写入统计快照。';
    } catch (_) {}
    return text;
  }
  return {hydrate, params, context, meetingHref, markLive, snapshotNote};
})();
/* Shared mobile filter disclosure; desktop keeps the full sidebar. */
(() => {
  function setup(){
    if (!document.querySelector) return;
    const sidebar=document.querySelector('.layout > .sidebar');
    const head=sidebar?.querySelector('.sidebar-head');
    if(!sidebar||!head)return;
    sidebar.id='workspaceFilters';
    sidebar.dataset.collapsed='true';
    const toggle=document.createElement('button');
    toggle.type='button';toggle.className='sidebar-toggle';
    toggle.setAttribute('aria-controls',sidebar.id);
    toggle.setAttribute('aria-expanded','false');
    toggle.setAttribute('aria-label','展开筛选');
    toggle.textContent='筛选 ＋';
    toggle.addEventListener('click',()=>{
      const expanded=sidebar.dataset.collapsed==='true';
      sidebar.dataset.collapsed=String(!expanded);
      toggle.setAttribute('aria-expanded',String(expanded));
      toggle.setAttribute('aria-label',expanded?'收起筛选':'展开筛选');
      toggle.textContent=expanded?'收起 −':'筛选 ＋';
    });
    head.append(toggle);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();

ResearchWorkspace.context(ResearchWorkspace.params().get('asset'), ResearchWorkspace.params().get('view'));
