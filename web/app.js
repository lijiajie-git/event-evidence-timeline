// 工作台。单独打开是完整产品；演示页把它放进 iPad，通过 window.WB.go() 驱动。
import {
  PATHS, load, esc, miss, val, addDays, md, cn, cnShort, bj, human, exact, rangeText, change,
  evidenceById, disclosedOf, eventDates, today, asOf, statusText, tierLabel, SRC_NAME, docName,
  timeLine, occurredText, priceWindow, initTheme, fatal, ref, refs, dayDiff,
} from './core.js';
import { verify, describe, exampleSentences } from './verify.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const embedded = new URLSearchParams(location.search).has('embed');
if (embedded) document.documentElement.classList.add('embedded');

let DATA = null, QA = null, QA_RES = null;
const S = { view: 'event', eventId: null, D: null, claimMode: 'line', tiers: null, focus: null, qaId: null, ask: '', verifyText: '', openTrace: false };
let readyResolve; const ready = new Promise((r) => (readyResolve = r));
const listeners = [];

// ---------------- 启动 ----------------
async function init() {
  initTheme($('#theme'));
  const res = await load(PATHS.events);
  if (!res.ok || !res.data || !Array.isArray(res.data.events)) {
    fatal($('#view'), res.ok ? { path: res.path, error: '文件里没有 events 列表' } : res, '事件数据');
    $('#side').innerHTML = ''; readyResolve(false); return;
  }
  DATA = res.data;
  QA_RES = await load(PATHS.qa);
  QA = QA_RES.ok && QA_RES.data && Array.isArray(QA_RES.data.items) ? QA_RES.data : null;
  $('#gen').textContent = DATA.generated_at ? '数据生成于 ' + bj(DATA.generated_at).replace('（北京时间）', ' 北京时间') : '数据生成时间未记录';
  fromHash();
  if (!S.eventId || !ev()) S.eventId = DATA.events[0] && DATA.events[0].id;
  if (!S.D) S.D = today(DATA);
  bind();
  render();
  readyResolve(true);
}

const ev = (id = S.eventId) => DATA.events.find((e) => e.id === id);
const evOf = (eventId) => DATA.events.find((e) => e.id === eventId) || null;

function fromHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('e')) S.eventId = h.get('e');
  if (h.get('d') && /^\d{4}-\d{2}-\d{2}$/.test(h.get('d'))) S.D = h.get('d');
  if (['event', 'qa', 'verify'].includes(h.get('v'))) S.view = h.get('v');
  if (h.get('q')) S.verifyText = h.get('q');
}
function toHash() {
  const h = new URLSearchParams();
  h.set('v', S.view);
  if (S.view === 'event') { h.set('e', S.eventId); h.set('d', S.D); }
  if (S.view === 'verify' && S.verifyText) h.set('q', S.verifyText);
  history.replaceState(null, '', '#' + h.toString());
}

// ---------------- 渲染 ----------------
function render() {
  $$('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === S.view)));
  renderSide();
  if (S.view === 'event') renderEvent();
  else if (S.view === 'qa') renderQA();
  else renderVerify();
  toHash();
  listeners.forEach((f) => f({ ...S }));
}

function renderSide() {
  const groups = {};
  DATA.events.forEach((e) => { (groups[e.code] = groups[e.code] || { name: e.name, list: [] }).list.push(e); });
  const T = today(DATA);
  const watch = Object.entries(groups).map(([code, g]) => `<div class="stock"><div class="nm"><b>${esc(g.name)}</b>${esc(code)}</div>
    ${g.list.map((e) => { const a = asOf(e, T); return `<button class="evbtn" data-ev="${esc(e.id)}" ${S.view === 'event' && e.id === S.eventId ? 'aria-current="true"' : ''}>
      <span class="t">${esc(e.title || e.type || e.id)}</span><span class="s">${esc(statusText(e, a) || '状态未抽取')}${e.status_since ? ' · ' + md(e.status_since) : ''}</span></button>`; }).join('')}</div>`).join('');
  const feed = DATA.events.flatMap((e) => (e.notifications || []).map((n) => ({ ...n, e }))).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 40);
  $('#side').innerHTML = `<section><h3>关注</h3>${watch}</section>
    <section class="feedsec"><h3>变化通知</h3><ul class="feed">${feed.map((n) => `<li class="${S.view === 'event' && n.e.id === S.eventId && n.at > S.D ? 'future' : ''}"><button data-note-ev="${esc(n.e.id)}" data-note-at="${esc(n.at)}" data-note-id="${esc(n.evidence_id || '')}">
      <time>${esc(n.at)} · ${esc(n.e.name)}</time><span class="${n.type === '证据冲突' ? 'k' : ''}">${n.type === '证据冲突' ? '证据冲突：' : ''}${esc(n.text)}</span></button></li>`).join('') || '<li class="empty">暂无通知</li>'}</ul></section>`;
}

// ---------- 事件页 ----------
function renderEvent() {
  const e = ev();
  if (!e) { $('#view').innerHTML = `<div class="wrap"><p class="empty">没有找到这个事件。</p></div>`; return; }
  const T = today(DATA);
  const dates = eventDates(e);
  const start = addDays(dates[0] || T, -3);
  if (S.D < start) S.D = start;
  if (S.D > T) S.D = T;
  const a = asOf(e, S.D);
  const tiersHere = [...new Set((e.evidence || []).map((x) => x.source_tier).filter(Boolean))].sort();
  if (!S.tiers) S.tiers = new Set(tiersHere);

  // 轨道只画到最后一次披露后两周；更晚的日子（直到今天）收进最右端那一格
  const lastD = dates[dates.length - 1] || T;
  const end = dayDiff(lastD, T) > 20 ? addDays(lastD, 14) : T;
  const span = Math.max(1, dayDiff(start, end));
  const pos = (d) => Math.min(100, (dayDiff(start, d) / span) * 100);
  const prev = [...dates].reverse().find((d) => d < S.D), next = dates.find((d) => d > S.D);
  const st = statusText(e, a);

  $('#view').innerHTML = `<div class="wrap">
    <header class="ev-head">
      <div class="kicker">${esc(e.code || '代码未抽取')} ${esc(e.name || '')} · ${val(e.type)}${e.period ? ' · ' + esc(e.period) : ''}</div>
      <h1>${esc(e.title || '标题未抽取')}</h1>
      <p class="merge"><b>为什么算同一件事</b>${val(e.merge_reason)}</p>
    </header>
    <div class="replay" id="replay">
      <div class="row1"><span class="lbl">截至</span><span class="date">${cn(S.D)}</span>
        <span class="st">${st ? `状态 <b>${esc(st)}</b>` : miss('状态未抽取')}${a.status && a.status.at ? `<span class="muted">（${md(a.status.at)} 起）</span>` : ''}</span>
        <span class="ctl"><button data-jump="${prev || ''}" ${prev ? '' : 'disabled'} title="上一次披露（←）">← ${prev ? md(prev) : ''}</button><button data-jump="${next || ''}" ${next ? '' : 'disabled'} title="下一次披露（→）">${next ? md(next) : ''} →</button><button data-jump="${T}" ${S.D === T ? 'disabled' : ''}>最新</button></span></div>
      <div class="track" title="拖动回放到任意一天">
        <span class="base"></span><span class="fill" style="width:${pos(S.D)}%"></span>
        ${dates.map((d) => { const big = (e.evidence || []).some((x) => disclosedOf(x) === d && x.source_tier === 'A'); return `<span class="tick ${big ? '' : 'low'} ${d > S.D ? 'after' : ''}" style="left:${pos(d)}%" title="${d}"></span>`; }).join('')}
        <span class="knob" style="left:${pos(S.D)}%"></span>
        <span class="end" style="left:0">${md(start)}</span><span class="end" style="right:0">${end < T ? `${md(end)} 之后 … 今天 ${md(T)}` : md(T) + ' 今天'}</span>
        <input type="range" min="0" max="${span + (end < T ? 1 : 0)}" step="1" value="${S.D > end ? span + 1 : dayDiff(start, S.D)}" aria-label="回放日期">
      </div>
      <nav class="subnav">
        <a href="#s-concl">结论</a><a href="#s-conflict">冲突${a.conflicts.length ? `<i>${a.conflicts.length}</i>` : ''}</a><a href="#s-claims">数字版本</a><a href="#s-evidence">证据 ${a.evidence.length}</a><a href="#s-prices">披露前后股价</a><a href="#s-pending">还没做到</a>
      </nav>
    </div>
    ${secConclusion(e, a)}
    ${secConflicts(e, a)}
    ${secClaims(e, a)}
    ${secEvidence(e, a, tiersHere)}
    ${secPrices(e, a)}
    ${secPending(e)}
    <footer class="foot">
      ${DATA.weight_rule ? `<p>来源规则：${esc(DATA.weight_rule)}</p>` : ''}
      ${DATA.time_note ? `<p>时间口径：${esc(DATA.time_note)}</p>` : ''}
      <p>说法、数字和结论由大模型在本地离线抽取，每条引用都和原文逐字核对后才写进数据文件；网页只读这份文件，不调用模型。</p>
      <p>${esc(DATA.disclaimer || '不构成投资建议。')}</p>
    </footer>
  </div>`;
  const inp = $('.track input');
  inp.addEventListener('input', () => { S.D = +inp.value > span ? T : addDays(start, +inp.value); renderEvent(); toHash(); $('.track input').focus(); listeners.forEach((f) => f({ ...S })); });
}

function secConclusion(e, a) {
  const c = a.conclusion;
  if (!a.evidence.length) return `<section class="sec" id="s-concl"><h2>截至这一天的结论</h2><p class="empty">${cn(a.D)} 之前还没有相关的公告或报道。</p></section>`;
  if (!Array.isArray(e.conclusions)) return `<section class="sec" id="s-concl"><h2>截至这一天的结论</h2><div class="notice">分时点结论${miss('未生成')}。下面的证据和数字仍可查看。</div></section>`;
  if (!c) return `<section class="sec" id="s-concl"><h2>截至这一天的结论</h2><div class="notice">这一天已有 ${a.evidence.length} 条证据，但还没有对应的分时点结论（${miss('未生成')}）。</div></section>`;
  const list = (arr, cls) => (arr && arr.length ? `<ol class="${cls}">${arr.map((x) => typeof x === 'string' ? `<li>${esc(x)}</li>` : `<li>${esc(x.text)}${refs(x.evidence_ids)}</li>`).join('')}</ol>` : `<p class="empty" style="padding:2px 0">无</p>`);
  const basis = evidenceById(e, c.evidence_id);
  return `<section class="sec" id="s-concl"><h2>截至这一天的结论<small>写于 ${esc(c.as_of)}，依据 ${esc(docName(basis))}${ref(c.evidence_id)}</small></h2>
    <div class="concl">
      <h4>事实</h4>${list(c.facts, 'fact')}
      <h4>推断</h4>${list(c.inferences, 'inf')}
      <h4>还不确定</h4>${list(c.unknowns, 'unk')}
      <div class="basis">事实只来自公告和交易所文件；推断写明了依据；不确定的地方不补全。结论只引用截至 ${esc(c.as_of)} 已经出现的证据。</div>
    </div></section>`;
}

function secConflicts(e, a) {
  if (!Array.isArray(e.conflicts)) return `<section class="sec" id="s-conflict"><h2>证据冲突</h2><div class="notice">冲突检测${miss('未生成')}。</div></section>`;
  const later = e.conflicts.length - a.conflicts.length;
  return `<section class="sec" id="s-conflict"><h2>证据冲突<small>${a.conflicts.length ? a.conflicts.length + ' 处' : '截至这一天没有发现'}${later > 0 ? `，之后还会出现 ${later} 处` : ''}</small></h2>
    ${a.conflicts.map((c) => `<div class="cf" id="cf-${esc(c.id)}"><div class="h">${esc(c.kind || '冲突')}<span>${c.resolved_by ? '处理方式：' + esc(c.resolved_by) : ''}${c.first_seen ? ' · ' + esc(c.first_seen) + ' 发现' : ''}</span></div>
      <p>${esc(c.text)}</p>
      <div class="qs">${(c.quotes || []).map((q) => { const x = evidenceById(e, q.evidence_id); const t = x ? tierLabel(x, DATA.weights) : {}; return `<div class="q">“${esc(q.quote)}”<small>${esc(docName(x))} · ${t.tier ? esc(t.tier) + ' 级' : ''}${ref(q.evidence_id)}</small></div>`; }).join('')}</div>
      <p class="res"><b>${c.resolved_by === '推断' ? '怎么处理（推断）' : '怎么处理'}</b>${val(c.resolution)}</p></div>`).join('')}</section>`;
}

function secClaims(e, a) {
  const head = `<h2>数字版本<small>被更正的数字不删，留着看它往哪边变</small><span class="seg" role="group"><button data-mode="line" aria-pressed="${S.claimMode === 'line'}">数轴</button><button data-mode="table" aria-pressed="${S.claimMode === 'table'}">表格</button></span></h2>`;
  if (!Array.isArray(e.claims) || !e.claims.length) return `<section class="sec" id="s-claims">${head}<div class="notice">这个事件没有抽取数字（${miss('未抽取')}），变化体现在状态和证据里。</div></section>`;
  const body = a.claims.map((c) => (S.claimMode === 'table' ? claimTable(e, c, a) : claimLine(e, c, a))).join('');
  return `<section class="sec" id="s-claims">${head}<p class="note">${S.claimMode === 'line' ? '每个指标一根数轴，虚线是 0。横条是区间，圆点是单一数值；颜色越淡越早被取代，蓝色是截至这一天算数的版本，虚线框是已作废。' : '原单位，不四舍五入。'}</p>${body}</section>`;
}

function verLabel(e, v) {
  const x = evidenceById(e, v.evidence_id);
  return `${md(v.valid_from)}<small>${esc(docName(x))}</small>`;
}
function claimLine(e, c, a) {
  const nums = c.all.filter((v) => v.low != null || v.high != null);
  const vals = nums.flatMap((v) => [v.low ?? v.high, v.high ?? v.low]).concat(0);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.05; const L = lo - pad, H = hi + pad;
  const x = (n) => ((n - L) / (H - L)) * 100;
  const seenNums = c.seen.filter((v) => v.low != null || v.high != null);
  const rows = c.seen.map((v, i) => {
    const isCur = v === c.current;
    const isVoid = isCur && c.voided;
    const older = c.seen.length - 1 - i;
    const cls = isVoid ? 'void' : isCur ? 'cur' : older === 1 ? 'o2' : '';
    const has = v.low != null || v.high != null;
    const l = v.low ?? v.high, h = v.high ?? v.low;
    const mark = !has ? `<span class="nonum">没给数字</span>` : l === h ? `<span class="dot" style="left:${x(l)}%"></span>` : `<span class="bar" style="left:${x(Math.min(l, h))}%;width:${Math.abs(x(h) - x(l))}%"></span>`;
    const stTxt = isVoid ? `作废：${v.void_from ? md(v.void_from) + ' 起' : ''}` : (v.basis || '');
    return `<div class="vrow ${cls}" data-focus="${esc(v.evidence_id)}" title="${esc(v.quote || '')}">
      <span class="d">${verLabel(e, v)}</span>
      <span class="val">${has ? esc(rangeText(v, c.unit)) : '—'}<small>${esc(stTxt)}</small></span>
      <span class="cell"><span class="zero" style="left:${x(0)}%"></span>${mark}</span></div>`;
  }).join('');
  const ticks = []; [Math.min(...vals), 0, Math.max(...vals)].forEach((n) => { if (!ticks.some((t) => Math.abs(x(t) - x(n)) < 18)) ticks.push(n); });
  const later = c.all.length - c.seen.length;
  const lastTwo = seenNums.slice(-2);
  const ch = lastTwo.length === 2 ? change(lastTwo[0], lastTwo[1]) : '';
  const vsFirst = seenNums.length > 2 ? change(seenNums[0], seenNums[seenNums.length - 1]) : '';
  const notes = c.seen.filter((v) => v.note).map((v) => `${md(v.valid_from)} 这一版：${esc(v.note)}`);
  return `<div class="claim" data-claim="${esc(c.key)}"><h5>${esc(c.key)}<span>${c.seen.length ? c.seen.length + ' 版' : '尚未披露'}${ch ? '，最近一次' + ch : ''}</span>${/转/.test(vsFirst) && !/转/.test(ch) ? `<span class="flip">较第一版${vsFirst}</span>` : ''}${c.voided ? '<span class="flip">交易终止，数字作废</span>' : ''}</h5>
    ${rows || '<p class="empty" style="padding:0">这一天还没有任何版本。</p>'}
    ${seenNums.length ? `<div class="axis"><span></span><span></span><span class="cell">${ticks.map((n) => `<span class="${x(n) < 8 ? 'l' : x(n) > 92 ? 'r' : ''}" style="left:${x(n)}%">${n === 0 ? '0' : esc(human(n, c.unit))}</span>`).join('')}</span></div>` : ''}
    ${notes.length ? `<p class="vnote">${notes.join('<br>')}</p>` : ''}
    ${later > 0 ? `<p class="later">之后还有 ${later} 版，回放到更晚的日期可见。</p>` : ''}</div>`;
}
function claimTable(e, c, a) {
  return `<div class="claim" data-claim="${esc(c.key)}"><h5>${esc(c.key)}<span>单位：${esc(c.unit || '未记录')}</span></h5><div class="tblwrap"><table class="vt">
    <thead><tr><th>版本</th><th>披露日</th><th>来源</th><th class="num">数值</th><th>依据</th><th>状态</th></tr></thead><tbody>
    ${c.all.map((v) => {
      const seen = v.valid_from <= a.D;
      if (!seen) return `<tr><td>第 ${esc(v.v ?? '')} 版</td><td colspan="5" class="muted">尚未披露</td></tr>`;
      const isCur = v === c.current;
      const x = evidenceById(e, v.evidence_id), by = v.superseded_by ? evidenceById(e, v.superseded_by) : null;
      let st = '';
      if (isCur && c.voided) st = `作废（${md(v.void_from)} 起）`;
      else if (isCur) st = '现行';
      else if (v.valid_to && v.valid_to <= a.D) st = `${md(v.valid_to)} 被 ${esc(docName(by))} 取代`;
      const num = v.low == null && v.high == null ? '没给数字' : v.low === v.high ? exact(v.low, '') : `${exact(v.low, '')} ~ ${exact(v.high, '')}`;
      return `<tr class="${isCur ? 'cur' : ''}"><td>第 ${esc(v.v ?? '')} 版</td><td class="m">${esc(v.valid_from)}</td><td>${esc(docName(x))}${ref(v.evidence_id)}</td><td class="num ${isCur ? '' : 'old'}">${num}</td><td>${val(v.basis)}</td><td>${st}</td></tr>`;
    }).join('')}</tbody></table></div></div>`;
}

function secEvidence(e, a, tiersHere) {
  const counts = {}; a.evidence.forEach((x) => (counts[x.source_tier] = (counts[x.source_tier] || 0) + 1));
  const shown = a.evidence.filter((x) => !x.source_tier || S.tiers.has(x.source_tier)).slice().reverse();
  const later = (e.evidence || []).length - a.evidence.length;
  const W = DATA.weights || {};
  return `<section class="sec" id="s-evidence"><h2>证据时间线<small>新的在上 · 截至这一天 ${a.evidence.length} 条${later > 0 ? `，之后还有 ${later} 条` : ''}</small></h2>
    <div class="filters">来源级别 ${tiersHere.map((t) => `<label title="${esc(W[t] ? W[t].label + '，权重 ' + W[t].w : '')}"><input type="checkbox" data-tier="${esc(t)}" ${S.tiers.has(t) ? 'checked' : ''}>${esc(t)} ${W[t] ? esc(W[t].label) : ''} <span class="muted">${counts[t] || 0}</span></label>`).join('')}</div>
    <ol class="tl">${shown.map((x) => item(e, x, a)).join('') || '<li class="empty">没有符合筛选的证据。</li>'}</ol></section>`;
}
function item(e, x, a) {
  const t = x.times || {};
  const tl = tierLabel(x, DATA.weights);
  const rel = x.relation || {};
  const target = rel.target ? evidenceById(e, rel.target) : null;
  const od = a.outdated[x.id];
  const clock = t.precision === '分钟' && t.published_at && t.published_at.length > 10 ? t.published_at.slice(11, 16) : (t.precision === '日' ? '精确到日' : '');
  const occ = occurredText(t.occurred);
  return `<li class="item t-${esc(x.source_tier || 'x')} ${od ? 'is-outdated' : ''} ${S.focus === x.id ? 'focus' : ''}" id="ev-${esc(x.id)}">
    <div class="when">${md(disclosedOf(x))}<small>${esc(clock)}</small></div><span class="pin"></span>
    <div class="body">
      <div class="tags"><b>${val(x.kind)}</b><span>${tl.tier ? esc(tl.tier) + ' 级 · ' + esc(tl.label || '') : miss('来源级别未抽取')}${tl.weight != null ? ' · 权重 ' + esc(tl.weight) : ''}</span>
        <span>${esc(SRC_NAME[x.src] || x.src || '')}${x.source ? ' · ' + esc(x.source) : ''}</span>
        ${rel.type ? `<span class="rel">${esc(rel.type)}${target ? ' ' + esc(docName(target)) + ref(rel.target) : ''}</span>` : ''}<span class="m">${esc(x.id)}</span></div>
      <h4>${esc(x.doc_no && x.src === 'ann' ? docName(x) + '　' : '')}${val(x.title)}</h4>
      ${x.summary ? `<p>${esc(x.summary)}</p>` : x.reason ? `<p>${esc(x.reason)}</p>` : `<p>${miss('要点未抽取')}</p>`}
      ${od ? `<div class="outd"><b>前提已失效</b>${esc(od.note || '')}${ref(od.by.id)}</div>` : ''}
      <div class="quote">${x.quote || x.reason_quote ? `原文：“${esc(x.quote || x.reason_quote)}”` : `原文引用 ${miss()}`}${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">打开原文 ↗</a>` : ` ${miss('链接未记录', '数据里没有原文链接')}`}</div>
      <div class="times">
        <span>发生<i>${occ ? esc(occ) : miss()}</i>${t.occurred && t.occurred.note && occ ? `<span class="muted">（${esc(t.occurred.note)}）</span>` : ''}</span>
        <span>披露<i>${esc(timeLine(x) || '') || miss()}</i></span>
        ${x.src === 'ann' ? `<span>落款<i>${t.signed ? esc(t.signed) : miss()}</i></span>` : ''}
        <span>抓取<i>${bj(t.fetched) ? esc(bj(t.fetched)) : miss('未记录')}</i></span>
        <span>更新<i>${t.updated ? esc(bj(t.updated) || t.updated) : miss('来源未提供')}</i></span>
      </div>
    </div></li>`;
}

function secPrices(e, a) {
  const p = e.prices;
  const h = `<h2>披露前后股价<small>只摆事实，不解读涨跌原因</small></h2>`;
  if (!p) return `<section class="sec" id="s-prices">${h}<div class="notice">行情${miss('未接入')}，这个事件没有价格数据。</div></section>`;
  if (p.error) return `<section class="sec" id="s-prices">${h}<div class="notice">行情没有取到：${esc(p.error)}。所以这里不显示任何价格。</div></section>`;
  const byDay = {};
  (p.markers || []).filter((m) => m.disclosed <= a.D).forEach((m) => { (byDay[m.first_trading_day] = byDay[m.first_trading_day] || []).push(m); });
  const cards = Object.entries(byDay).map(([day, ms]) => {
    const w = priceWindow(p, ms[0], a.D);
    const bar = w.find((b) => b.date === day);
    if (!w.length || !bar) return `<div class="pxc"><div class="h"><b>${md(ms[0].disclosed)} ${ms.map((m) => esc(docName(evidenceById(e, m.evidence_id)))).join('、')}</b></div><p class="muted">首个交易日 ${esc(day)} 的价格${miss('未接入', '这一天不在已取的行情片段里')}</p></div>`;
    const cs = w.map((b) => b.close), mn = Math.min(...cs), mx = Math.max(...cs), r = mx - mn || 1;
    const X = (i) => 6 + (i / Math.max(1, w.length - 1)) * 228, Y = (v) => 40 - ((v - mn) / r) * 34;
    const k = w.indexOf(bar);
    const pct = bar.pct == null ? null : (bar.pct > 0 ? '+' : bar.pct < 0 ? '−' : '') + Math.abs(bar.pct).toFixed(2) + '%';
    const halt = ms[0].first_trading_day !== ms[0].disclosed ? `（${md(ms[0].disclosed)} 披露，${md(day)} 起首个交易日）` : '';
    return `<div class="pxc"><div class="h"><b>${md(ms[0].disclosed)} ${ms.map((m) => esc(docName(evidenceById(e, m.evidence_id)))).join('、')}</b><span>${ms.map((m) => ref(m.evidence_id)).join('')}</span></div>
      <svg viewBox="0 0 240 46" preserveAspectRatio="none" aria-label="收盘价"><line x1="${X(k)}" x2="${X(k)}" y1="0" y2="46" stroke="var(--line)" stroke-dasharray="2 2"/>
        <polyline fill="none" stroke="var(--ink-2)" stroke-width="1.5" vector-effect="non-scaling-stroke" points="${w.map((b, i) => X(i) + ',' + Y(b.close)).join(' ')}"/>
        <circle cx="${X(k)}" cy="${Y(bar.close)}" r="3.5" fill="var(--cur)"/></svg>
      <div class="r"><span>${md(day)} 收盘 <b>${esc(bar.close)}</b> 元</span><span>较前日 <b>${pct || miss('未记录')}</b></span></div>
      <div class="r muted"><span>${w.length} 个交易日：${md(w[0].date)}–${md(w[w.length - 1].date)}</span><span>${bar.turnover != null ? '成交额 ' + (bar.turnover / 1e8).toFixed(2) + ' 亿' : ''}</span></div>
      ${halt ? `<div class="muted">${halt}</div>` : ''}</div>`;
  }).join('');
  return `<section class="sec" id="s-prices">${h}${cards ? `<div class="px">${cards}</div>` : `<p class="empty">截至这一天还没有披露，没有对应的价格片段。</p>`}
    <p class="pxnote">${esc(p.adjust || '复权方式未记录')} · ${esc(p.note || '')} · 来源：${esc(p.source || '未记录')} · 抓取 ${bj(p.fetched) ? esc(bj(p.fetched)) : miss('未记录')}。价格只是同一时间发生的事实，不代表公告导致了涨跌。</p></section>`;
}

function secPending(e) {
  const list = Array.isArray(e.pending) ? e.pending : null;
  return `<section class="sec" id="s-pending"><h2>还没做到<small>缺的东西写在这里，不假装完整</small></h2>
    ${list ? (list.length ? `<ul class="pend">${list.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '<p class="empty">没有登记的缺口。</p>') : `<div class="notice">缺口清单${miss('未生成')}。</div>`}</section>`;
}

// ---------- 问答 ----------
function renderQA() {
  const items = QA ? QA.items : [];
  if (!S.qaId && items.length) S.qaId = items[0].id;
  const cur = items.find((q) => q.id === S.qaId);
  const groups = {};
  items.forEach((q) => { const e = evOf(q.event_id); const k = e ? e.name + ' · ' + (e.title || '') : '未关联事件'; (groups[k] = groups[k] || []).push(q); });
  $('#view').innerHTML = `<div class="wrap">
    <form class="ask" id="askf"><input id="askq" placeholder="问一个已收录事件的问题，或贴一句看到的消息" value="${esc(S.ask)}" autocomplete="off"><button>查</button></form>
    <p class="honest">这里没有接实时大模型：网页放不了模型密钥。能回答的是下面这些离线生成、逐句挂了证据的预置问题；你自己输入的话，会先做数字查验，再按关键词找最接近的预置问题。</p>
    <div id="askres"></div>
    ${QA ? `<div class="qa-grid"><ul class="qlist">${Object.entries(groups).map(([g, qs]) => `<li class="g">${esc(g)}</li>${qs.map((q) => `<li><button data-qa="${esc(q.id)}" ${q.id === S.qaId ? 'aria-current="true"' : ''}>${esc(q.question)}</button></li>`).join('')}`).join('')}</ul>
      <div>${cur ? answer(cur) : '<p class="empty">选一个问题。</p>'}</div></div>`
      : `<div class="notice">预置问答${miss('未生成')}：<code class="m">${esc(PATHS.qa)}</code> ${esc(QA_RES && QA_RES.error ? QA_RES.error : '')}。现在只能做数字查验。</div>`}
  </div>`;
  if (S.ask) runAsk(S.ask);
}
function answer(q) {
  const e = evOf(q.event_id);
  const ans = Array.isArray(q.answer) ? q.answer : [];
  const tr = Array.isArray(q.trace) ? q.trace : null;
  return `<div class="answer" id="answer" data-event="${esc(q.event_id || '')}"><p class="qq">${esc(q.question)}</p>
    <div class="meta">${e ? esc(e.name) + ' · ' : ''}截至 ${q.as_of ? esc(q.as_of) : miss('未记录')} · 离线生成，逐句挂证据</div>
    ${ans.length ? `<ol class="sent">${ans.map((s) => `<li><span class="kind k-${esc(s.kind)}">${s.kind ? esc(s.kind) : miss('未标')}</span><span>${esc(s.text)}${refs(s.evidence_ids)}</span></li>`).join('')}</ol>` : `<p>${miss('回答未生成')}</p>`}
    <details class="trace" ${S.openTrace ? 'open' : ''}><summary>它是怎么得出这个回答的（${tr ? tr.length + ' 步' : '未生成'}）</summary>
      ${tr ? `<ol>${tr.map((t) => `<li><b>${esc(t.step)}</b> ${esc(t.detail || '')}
        ${t.used && t.used.length ? `<div class="x">用了：${refs(t.used)}</div>` : ''}
        ${t.excluded && t.excluded.length ? `<div class="x">排除：${t.excluded.map((x) => `${ref(x.id)} ${esc(x.reason)}`).join('；')}</div>` : ''}
        ${t.checks && t.checks.length ? `<div class="x">校验：${t.checks.map((c) => `${esc(c.name)} <span class="${c.pass ? 'ok' : 'bad'}">${c.pass ? '通过' : '未通过'}</span>`).join('；')}</div>` : ''}</li>`).join('')}</ol>` : `<p class="x">${miss('推理过程未生成')}</p>`}
    </details></div>`;
}
function runAsk(text) {
  const box = $('#askres'); if (!box) return;
  const r = verify(text, DATA);
  let html = '';
  if (r.verdict === 'match') html += verifyCards(r, true);
  const scored = (QA ? QA.items : []).map((q) => {
    const kws = Array.isArray(q.keywords) ? q.keywords : [];
    let s = kws.filter((k) => k && text.includes(k)).length * 2;
    const qs = q.question || '';
    for (let i = 0; i < text.length - 1; i++) if (qs.includes(text.slice(i, i + 2))) s += 0.3;
    return { q, s };
  }).filter((x) => x.s >= 1).sort((a, b) => b.s - a.s).slice(0, 3);
  if (scored.length) html += `<p class="honest" style="margin-top:10px">最接近的预置问题：</p><div class="chips">${scored.map((x) => `<button data-qa="${esc(x.q.id)}">${esc(x.q.question)}</button>`).join('')}</div>`;
  if (!html) html = `<div class="vres none"><h3>这里回答不了这个问题。</h3><p>这里没有接实时模型，只能回答预置问题和做数字版本查验。${r.verdict === 'no-match' ? '你给的数字和已收录的各版本都对不上。' : r.verdict === 'no-number' ? '句子里没有读到带单位的数字。' : ''}</p></div>`;
  box.innerHTML = html;
}

// ---------- 查验 ----------
function renderVerify() {
  const ex = exampleSentences(DATA);
  $('#view').innerHTML = `<div class="wrap">
    <form class="ask" id="vf"><input id="vq" placeholder="贴一句看到的消息，例如某公司预亏多少、收购作价多少" value="${esc(S.verifyText)}" autocomplete="off"><button>查验</button></form>
    <p class="honest">从你的句子里读出数字和单位（亿、万、元、%），换算后和已收录的每一版数字比对，按你写到的小数位允许四舍五入。全部在浏览器里算，不调用模型；对不上就说对不上。</p>
    <div class="chips">${ex.map((t) => `<button data-vex="${esc(t)}">${esc(t)}</button>`).join('')}</div>
    <div id="vres">${S.verifyText ? '' : '<p class="empty">输入一句话，或点上面的例子。</p>'}</div></div>`;
  if (S.verifyText) $('#vres').innerHTML = verifyCards(verify(S.verifyText, DATA), false);
}
function verifyCards(r, compact) {
  const T = today(DATA);
  const steps = `<ol class="vsteps">${r.steps.map((s) => `<li><b>${esc(s.t)}</b>${esc(s.d)}</li>`).join('')}</ol>`;
  if (r.verdict !== 'match') {
    const msg = r.verdict === 'no-number' ? '没有读到带单位的数字。' : r.verdict === 'empty' ? '没有输入。' : '没有匹配到。';
    return `<div class="vres none"><h3>${msg}</h3><p>${r.verdict === 'no-match' ? '已收录的各版本里没有和它对得上的数字。这不代表消息是假的，只是这里没有对应的版本，可能是没收录的事件或口径。' : '查验只比对数字。'}</p>${compact ? '' : steps}</div>`;
  }
  return r.matches.map((m) => {
    const e = m.ev, c = m.claim, v = m.v;
    const d = describe(m, T);
    const x = evidenceById(e, v.evidence_id);
    const by = v.superseded_by ? evidenceById(e, v.superseded_by) : null;
    const curX = evidenceById(e, d.cur.evidence_id);
    let st;
    if (v.status === 'void' || (v.void_from && v.void_from <= T)) st = `<p>这一版 ${md(v.void_from)} 起作废${v.note ? '：' + esc(v.note) : ''}</p>`;
    else if (d.isCurrent) st = `<p>目前仍是现行版本。</p>`;
    else st = `<p><b>${esc(v.valid_to)}</b> 被 ${esc(docName(by))}${by ? ref(by.id) : ''} 取代。</p>`;
    const cur = d.isCurrent ? '' : `<p>现在算数的是 <span class="big">${esc(rangeText(d.cur, c.unit))}</span>（第 ${d.cur.v ?? '?'} 版，${esc(docName(curX))}，${esc(d.cur.valid_from)}${d.cur.status === 'void' ? '，已作废' : ''}）。</p>`;
    const notes = [];
    if (m.how === '只对上区间的一端') notes.push('只对上了区间的一端，可能不是同一个说法。');
    if (!m.exact && m.how !== '只对上区间的一端') notes.push(`你写的“${esc(m.input)}”是四舍五入后的写法，原文是 ${esc(rangeText(v, c.unit, 'exact'))}。`);
    if (m.signNote) notes.push(esc(m.signNote) + '。');
    return `<div class="vres"><h3>这是${esc(e.name)}${esc(c.key)}的第 ${d.n} 版（共 ${d.total} 版）。</h3>
      <p>出自 ${esc(docName(x))}${ref(v.evidence_id)}，${esc(v.valid_from)} 披露${v.basis ? '，' + esc(v.basis) : ''}。原文：“${esc(v.quote || '')}”</p>
      ${st}${cur}${notes.length ? `<p class="muted">${notes.join(' ')}</p>` : ''}
      <p><a href="#" data-goto="${esc(e.id)}" data-gd="${esc(v.valid_from)}">在时间线上看这一版 →</a></p>
      ${compact ? '' : steps}</div>`;
  }).join('');
}

// ---------------- 交互 ----------------
let peekEl = null;
function closePeek() { if (peekEl) { peekEl.remove(); peekEl = null; } }
function peek(id, btn) {
  closePeek();
  const host = btn.closest('[data-event]');
  const e = (host && evOf(host.dataset.event)) || ev();
  const x = e && evidenceById(e, id);
  peekEl = document.createElement('div');
  peekEl.className = 'peek'; peekEl.setAttribute('role', 'dialog');
  if (!x) peekEl.innerHTML = `<button class="x" aria-label="关闭">×</button><p>证据 ${esc(id)} 在数据里没有找到。</p>`;
  else {
    const tl = tierLabel(x, DATA.weights);
    peekEl.innerHTML = `<button class="x" aria-label="关闭">×</button><div class="tags">${esc(x.id)} · ${val(x.kind)} · ${tl.tier ? esc(tl.tier) + ' 级 ' + esc(tl.label || '') : ''} · ${esc(timeLine(x) || '')}</div>
      <h4>${esc(x.src === 'ann' ? docName(x) + ' ' : (x.source ? x.source + '：' : ''))}${val(x.title)}</h4><p>${x.summary ? esc(x.summary) : miss('要点未抽取')}</p>
      ${x.quote ? `<p class="muted">原文：“${esc(x.quote)}”</p>` : ''}
      <div class="act">${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">打开原文 ↗</a>` : ''}<a href="#" data-goto="${esc(e.id)}" data-gd="${esc(disclosedOf(x))}" data-gf="${esc(x.id)}">在时间线上看</a></div>`;
  }
  document.body.appendChild(peekEl);
  const r = btn.getBoundingClientRect(), w = peekEl.offsetWidth, h = peekEl.offsetHeight;
  let left = Math.min(Math.max(12, r.left - 20), innerWidth - w - 12);
  let top = r.bottom + 8; if (top + h > innerHeight - 12) top = Math.max(12, r.top - h - 8);
  peekEl.style.left = left + 'px'; peekEl.style.top = top + 'px';
}

function scrollToSel(sel, flash = true) {
  const el = typeof sel === 'string' ? $(sel) : sel;
  if (!el) return;
  // 不用 scrollIntoView：放在 iPad（iframe）里时它会连外层页面一起滚
  const top = $('.top'), rp = $('#replay');
  const off = (top ? top.offsetHeight : 0) + (rp && S.view === 'event' && !el.closest('#replay') && getComputedStyle(rp).position === 'sticky' ? rp.offsetHeight : 0) + 10;
  const y = el.getBoundingClientRect().top + scrollY - off;
  // 演示里用瞬移：平滑滚动在缩放过的 iframe 里会被下一拍打断
  scrollTo({ top: Math.max(0, y), behavior: embedded || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  if (flash) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
}

function bind() {
  document.addEventListener('click', (ev2) => {
    const t = ev2.target;
    if (peekEl && !t.closest('.peek') && !t.closest('.ref')) closePeek();
    const b = t.closest('button, a');
    if (!b) return;
    if (b.matches('.peek .x')) return closePeek();
    if (b.dataset.view) { S.view = b.dataset.view; render(); scrollTo(0, 0); return; }
    if (b.dataset.ev) { go({ view: 'event', event: b.dataset.ev, date: today(DATA), top: true }); return; }
    if (b.dataset.noteEv) { go({ view: 'event', event: b.dataset.noteEv, date: b.dataset.noteAt, focus: b.dataset.noteId || null, section: b.dataset.noteId ? null : 's-conflict' }); return; }
    if (b.dataset.jump) { S.D = b.dataset.jump; renderEvent(); toHash(); listeners.forEach((f) => f({ ...S })); return; }
    if (b.dataset.mode) { S.claimMode = b.dataset.mode; renderEvent(); scrollToSel('#s-claims', false); return; }
    if (b.dataset.ref) { ev2.preventDefault(); peek(b.dataset.ref, b); return; }
    if (b.dataset.qa) { S.view = 'qa'; S.qaId = b.dataset.qa; S.ask = ''; render(); scrollToSel('#answer', false); return; }
    if (b.dataset.vex) { S.verifyText = b.dataset.vex; renderVerify(); toHash(); listeners.forEach((f) => f({ ...S })); return; }
    if (b.dataset.goto) { ev2.preventDefault(); closePeek(); go({ view: 'event', event: b.dataset.goto, date: b.dataset.gd || null, focus: b.dataset.gf || null, section: b.dataset.gf ? null : 's-claims' }); return; }
    if (b.closest('.subnav') && b.hash) { ev2.preventDefault(); scrollToSel(b.hash, false); }
  });
  document.addEventListener('change', (ev2) => {
    const t = ev2.target;
    if (t.dataset.tier) { t.checked ? S.tiers.add(t.dataset.tier) : S.tiers.delete(t.dataset.tier); renderEvent(); scrollToSel('#s-evidence', false); }
  });
  document.addEventListener('submit', (ev2) => {
    ev2.preventDefault();
    if (ev2.target.id === 'vf') { S.verifyText = $('#vq').value.trim(); renderVerify(); toHash(); }
    if (ev2.target.id === 'askf') { S.ask = $('#askq').value.trim(); runAsk(S.ask); }
    listeners.forEach((f) => f({ ...S }));
  });
  document.addEventListener('click', (ev2) => { const r = ev2.target.closest('.vrow'); if (r && r.dataset.focus) go({ focus: r.dataset.focus }); });
  addEventListener('keydown', (k) => {
    if (S.view !== 'event' || k.target.closest('input, textarea') || k.metaKey || k.ctrlKey) return;
    const dates = eventDates(ev());
    if (k.key === 'ArrowLeft') { const p = [...dates].reverse().find((d) => d < S.D); if (p) { S.D = p; renderEvent(); toHash(); } }
    if (k.key === 'ArrowRight') { const n = dates.find((d) => d > S.D); S.D = n || today(DATA); renderEvent(); toHash(); }
    if (k.key === 'Escape') closePeek();
  });
  addEventListener('hashchange', () => { const before = JSON.stringify([S.view, S.eventId, S.D]); fromHash(); if (JSON.stringify([S.view, S.eventId, S.D]) !== before) render(); });
  // 当前小节高亮
  addEventListener('scroll', () => {
    const links = $$('.subnav a'); if (!links.length) return;
    let on = null; links.forEach((a) => { const s = $(a.hash); if (s && s.getBoundingClientRect().top < 170) on = a; });
    links.forEach((a) => a.classList.toggle('on', a === on));
  }, { passive: true });
}

// 演示页用的接口：所有参数都可选
function go(o = {}) {
  closePeek();
  if (o.view) S.view = o.view;
  if (o.event && evOf(o.event)) { if (o.event !== S.eventId) S.tiers = null; S.eventId = o.event; }
  if (o.date) S.D = o.date;
  if (o.claimMode) S.claimMode = o.claimMode;
  if ('focus' in o) S.focus = o.focus;
  else if (o.section || o.selector || o.top || o.event) S.focus = null;
  if (o.qa) S.qaId = o.qa;
  if ('openTrace' in o) S.openTrace = !!o.openTrace;
  if ('verify' in o) S.verifyText = o.verify || '';
  if ('ask' in o) S.ask = o.ask || '';
  if (o.view === 'event' && !o.date && !S.D) S.D = today(DATA);
  render();
  requestAnimationFrame(() => {
    if (o.top) scrollTo({ top: 0 });
    else if (S.focus && S.view === 'event' && $('#ev-' + CSS.escape(S.focus))) scrollToSel('#ev-' + CSS.escape(S.focus));
    else if (o.section) scrollToSel('#' + o.section, o.flash !== false);
    else if (o.selector) scrollToSel(o.selector, o.flash !== false);
  });
}

window.WB = { ready, go, get state() { return { ...S }; }, get data() { return DATA; }, get qa() { return QA; }, on: (f) => listeners.push(f) };
init();
