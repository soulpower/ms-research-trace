'use strict';
/* Dated price panels shared only by pre-analysis and review. */
Object.assign(ResearchWorkspace, (() => {
  function displayPrice(value) {
    return value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  }
  function priceElement(tag, text, cls) {
    const element = document.createElement(tag);
    if (text != null) element.textContent = text;
    if (cls) element.className = cls;
    return element;
  }
  function referencePrice(context) {
    const box = priceElement('div', null, 'price-reference');
    const quote = context?.quote, unit = context?.unit || '';
    box.append(priceElement('span', '观点参考日 ' + (context?.reference_date || '待核')));
    if (!quote) {
      box.append(priceElement('small', '当日及邻近交易日无可用行情'));
      return box;
    }
    const label = {same_day:'当日收盘', previous:'前一可用交易日收盘', following:'后一可用交易日收盘'}[context.relation] || '邻近收盘';
    box.append(priceElement('span', label + (context.basis?.includes('前复权') ? '（前复权）' : '') + ' · ' + quote.date), priceElement('b', displayPrice(quote.price) + ' ' + unit));
    if (context.relation !== 'same_day') box.append(priceElement('small', '当日无可用行情，以上为实际采用日期'));
    if (quote.raw_price != null && Math.abs(quote.raw_price - quote.price) > 1e-8)
      box.append(priceElement('small', '同日不复权 ' + displayPrice(quote.raw_price) + ' ' + unit));
    return box;
  }
  function pricePair(left, right, unit, note) {
    const wrap = priceElement('div', null, 'price-comparison'), pair = priceElement('div', null, 'price-pair');
    pair.setAttribute('role', 'group');pair.setAttribute('aria-label', '实际日期与价格对照');
    for (const [index, point] of [left, right].entries()) {
      if (index) {const arrow=priceElement('span','→','price-arrow');arrow.setAttribute('aria-hidden','true');pair.append(arrow);}
      const cell=priceElement('div',null,'price-node');
      cell.append(priceElement('span',point.label,'price-node-label'),priceElement('b',displayPrice(point.price),'price-node-value'));
      if (point.price != null) cell.append(priceElement('small',unit || '','price-node-unit'));
      cell.append(priceElement('time',point.date || '暂无实际日期','price-node-date'));
      if (point.status) cell.append(priceElement('small',point.status,'price-node-status'));
      pair.append(cell);
    }
    wrap.append(pair);
    if(note)wrap.append(priceElement('p',note,'price-pair-note'));
    return wrap;
  }
  return {displayPrice, referencePrice, pricePair};
})());
