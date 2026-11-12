// 工作台。单独打开是完整产品；演示页把它放进 iPad，通过 window.WB.go() 驱动。
import {
  PATHS, load, esc, miss, val, addDays, md, cn, cnShort, bj, human, exact, rangeText, change,
  evidenceById, disclosedOf, eventDates, today, asOf, statusText, tierLabel, SRC_NAME, docName,
  timeLine, occurredText, priceWindow, initTheme, fatal, ref, refs, dayDiff, srcType, moneyText,
} from './core.js';
import { verify, describe, exampleSentences } from './verify.js';
import { loadText, locate, diffDocs, charDiff } from './source.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const embedded = new URLSearchParams(location.search).has('embed');
// embed=full：演示页电脑屏幕里放的整页（带顶栏和左栏）
const embedFull = new URLSearchParams(location.search).get('embed') === 'full';
if (embedded) document.documentElement.classList.add('embedded');
if (embedFull) document.documentElement.classList.add('embed-full');

let DATA = null, QA = null, QA_RES = null, RECHECK = null;
const S = { only: null, tableOpen: false, mergeOpen: false, view: 'event', eventId: null, D: null, claimMode: 'line', tiers: null, focus: null, qaId: null, ask: '', verifyText: '', openTrace: false, revOpen: false, revView: null };
let readyResolve; const ready = new Promise((r) => (readyResolve = r));
const listeners = [];
// 用户在工作台里做了什么（演示页右栏据此回放对应的离线记录）
const actionListeners = [];
let silent = false;
const emit = (a) => { if (!silent) actionListeners.forEach((f) => { try { f(a); } catch (err) { /* 外层出错不影响工作台 */ } }); };

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
  const rc = await load(PATHS.recheck);
  RECHECK = rc.ok && rc.data && Array.isArray(rc.data.items) ? rc.data : null;
  $('#gen').textContent = DATA.generated_at ? '数据生成于 ' + bj(DATA.generated_at).replace('（北京时间）', ' 北京时间') : '数据生成时间未记录';
  fromHash();
  if (!S.eventId || !ev()) S.eventId = DATA.events[0] && DATA.events[0].id;
  if (!S.D) S.D = today(DATA);
  bind();
  render();
  // 演示页“去试试”的深链接：#…&src=证据编号&sq=引用 打开原文；#…&da=证据&db=证据 打开两版对比
  const hp = new URLSearchParams(location.hash.slice(1));
  if (hp.get('src')) openSource(S.eventId, hp.get('src'), hp.get('sq') || '');
  else if (hp.get('da') && hp.get('db')) openDiff(S.eventId, hp.get('da'), hp.get('db'));
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
  document.documentElement.classList.toggle('only-mode', !!(embedded && S.only));
  $$('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === S.view)));
  renderSide();
  if (S.view === 'event') renderEvent();
  else if (S.view === 'qa') renderQA();
  else renderVerify();
  toHash();
  listeners.forEach((f) => f({ ...S }));
}

const shortName = (e) => (e.period ? `${e.period}${e.type || ''}` : (e.type || e.title || e.id)).replace(/\s+/g, ' ');
function renderSide() {
  const T = today(DATA);
  const rows = DATA.events.map((e) => {
    const a = asOf(e, T);
    return `<li><button class="evbtn" data-ev="${esc(e.id)}" ${S.view === 'event' && e.id === S.eventId ? 'aria-current="true"' : ''}>
      <span class="t">${esc(e.name)} · ${esc(shortName(e))}</span><span class="s">${esc(statusText(e, a) || '状态未抽取')}${e.status_since ? ' · ' + md(e.status_since) : ''}</span></button></li>`;
  }).join('');
  const feed = DATA.events.flatMap((e) => (e.notifications || []).map((n) => ({ ...n, e }))).sort((a, b) => (a.at < b.at ? 1 : -1));
  const li = (n) => `<li><button data-note-ev="${esc(n.e.id)}" data-note-at="${esc(n.at)}" data-note-id="${esc(n.evidence_id || '')}"><time>${md(n.at)} · ${esc(n.e.name)}</time>${esc(n.text.replace(/^状态变为「(.+?)」：.*$/, '$1'))}</button></li>`;
  $('#side').innerHTML = `<h3>事件</h3><ul class="evlist">${rows}</ul>
    <h3>最近变化</h3><ul class="feed">${feed.slice(0, 5).map(li).join('') || '<li class="empty">暂无</li>'}</ul>
    ${feed.length > 5 ? `<details class="feedmore"><summary>更早的 ${feed.length - 5} 条</summary><ul class="feed">${feed.slice(5).map(li).join('')}</ul></details>` : ''}`;
}

// ---------- 事件页 ----------
const HONEST = () => `<footer class="foot">
  <p>标准答案是另一个 Claude Opus 会话先盲标的，不是人工标注。</p>
  <p>网页不实时调用模型，问答是离线生成的。</p>
  <p>${esc(DATA.disclaimer || '只整理公开信息，不构成投资建议。')}</p></footer>`;

function chartRange(e) {
  const T = today(DATA);
  const dates = eventDates(e);
  const first = dates[0] || T, last = dates[dates.length - 1] || T;
  const start = addDays(first, -6);
  const end = dayDiff(last, T) > 40 ? addDays(last, 24) : T;
  return { T, dates, start, end };
}

function renderEvent() {
  const e = ev();
  if (!e) { $('#view').innerHTML = `<div class="wrap"><p class="empty">没有找到这个事件。</p></div>`; return; }
  const { T, dates, start } = chartRange(e);
  if (S.D < start) S.D = start;
  if (S.D > T) S.D = T;
  const a = asOf(e, S.D);
  const only = embedded && S.only ? S.only : null;
  const part = (id, html) => (!only || only.split(',').includes(id) ? html : '');
  $('#view').innerHTML = `<div class="wrap ${only ? 'only' : ''}">
    ${only ? '' : head(e, a)}
    ${part('lead', lead(e, a))}
    ${only && only.split(',').includes('lede') ? `<section class="lead solo"><p class="lede">${narrative(e, a)}</p></section>` : ''}
    ${part('chart', chart(e, a))}
    ${part('conflict', secConflicts(e, a))}
    ${part('evidence', secEvidence(e, a))}
    ${only ? '' : secPrices(e, a) + secPending(e) + HONEST()}
  </div>`;
  drawLanes(e, a);
}

// 头部两行：标题；最早出处 · 证据构成 · 为什么算同一件事
function head(e, a) {
  const f = e.first_source;
  const counts = {}; a.evidence.forEach((x) => { const k = srcType(x); counts[k] = (counts[k] || 0) + 1; });
  const bits = [];
  if (f && f.disclosed && f.disclosed <= a.D) bits.push(`最早出处 <button class="lnk" data-tag-ids="${esc(f.evidence_id)}" data-tag-ev="${esc(e.id)}">${esc(docName(evidenceById(e, f.evidence_id)) || f.doc_no || '公告')}</button>，${md(f.disclosed)}`);
  ['公告', '媒体转述', '评论', '推测', '传闻'].forEach((k) => counts[k] && bits.push(`${k} ${counts[k]}`));
  if (a.conflicts.length) bits.push(`冲突 ${a.conflicts.length}`);
  bits.push(`<button class="lnk" data-merge aria-expanded="${!!S.mergeOpen}">为什么算同一件事 ›</button>`);
  const early = f && Array.isArray(f.earlier_media) ? f.earlier_media.filter((m) => (m.published_at || '').slice(0, 10) <= a.D) : [];
  return `<header class="ev-head">
    <h1>${esc(e.name)} · ${esc(e.title || shortName(e))}</h1>
    <p class="meta">${bits.join('<span class="dot">·</span>')}</p>
    ${S.mergeOpen ? `<div class="more-box"><p>${e.merge_reason ? tx(e, e.merge_reason) : val(e.merge_reason)}</p>${early.length ? `<p>${early.map((m) => `${esc(m.source)}在 ${esc(m.published_at)} 已经转述，比巨潮记的披露日早。`).join('')}</p>` : ''}</div>` : ''}
  </header>`;
}

// 叙述式结论：说清楚现在算数的是什么
const isProfit = (k) => /利润|净利|亏|盈/.test(k);
const money = (v, unit, key) => moneyText(v, unit, key);
function narrative(e, a) {
  if (!a.evidence.length) return `截至 ${cn(a.D)}，还没有相关的公告或报道。`;
  const nums = a.claims.map((c) => ({ c, vs: c.seen.filter((v) => v.low != null || v.high != null) })).filter((x) => x.vs.length);
  nums.sort((x, y) => y.vs.length - x.vs.length || (/转/.test(change(y.vs[0], y.vs[y.vs.length - 1])) ? 1 : 0) - (/转/.test(change(x.vs[0], x.vs[x.vs.length - 1])) ? 1 : 0));
  const top = nums[0];
  const st = a.status;
  const when = `截至 ${cnShort(a.D)}`;
  const b = (t) => `<b class="n">${esc(t)}</b>`;
  if (top && top.vs.length >= 2 && !(a.hist.length >= 4 && top.vs.length <= 2)) {
    const { c, vs } = top;
    const cur = c.current;
    let s = `${when}，${esc(e.name)}的${esc(c.key)}前后有 ${b(vs.length + ' 个版本')}，`;
    s += c.voided ? `交易终止后，这个数已经${b('作废')}。` : `现在算数的是${b(money(cur, c.unit, c.key) || '未抽取')}。`;
    if (/转/.test(change(vs[0], vs[vs.length - 1]))) s += `第一版还是${money(vs[0], c.unit, c.key)}。`;
    return s;
  }
  if (st) {
    const x = evidenceById(e, st.evidence_id);
    const before = a.hist.slice(-3, -1).map((h) => h.status);
    return `${when}，${esc(e.name)}这件事的状态是${b('「' + st.status + '」')}，依据 ${esc(docName(x))}（${md(st.at)}）${before.length ? `；此前是${before.map(esc).join('、')}` : ''}。`;
  }
  return `${when}，${esc(e.name)}共有 ${a.evidence.length} 条相关证据。`;
}
function lead(e, a) {
  const c = a.conclusion;
  const item = (x) => (typeof x === 'string' ? `<li>${tx(e, x)}</li>` : `<li>${tx(e, x.text)}${tags(e, x.evidence_ids)}</li>`);
  const block = (t, arr) => (Array.isArray(arr) && arr.length ? `<h4>${t}</h4><ul>${arr.map(item).join('')}</ul>` : '');
  // 右边栏：当前数字和事实句的原文
  const notes = [];
  const top = a.claims.filter((k) => k.current && k.current.quote).sort((x, y) => y.seen.length - x.seen.length)[0];
  if (top) notes.push({ q: top.current.quote, id: top.current.evidence_id });
  (c && Array.isArray(c.facts) ? c.facts : []).forEach((f) => { const id = f.evidence_ids && f.evidence_ids[0]; const x = id && evidenceById(e, id); if (x && x.quote && notes.length < 3 && !notes.some((n) => n.id === id)) notes.push({ q: x.quote, id }); });
  const all = (e.conclusions || []).filter((k) => k.as_of <= a.D).sort((x, y) => (x.as_of < y.as_of ? 1 : -1));
  const revs = S.revOpen ? `<ol class="revs" id="revs">${all.map((k) => { const x = evidenceById(e, k.evidence_id); const open = S.revView === k.as_of; return `<li class="${k === c ? 'now' : ''}"><button data-rev="${esc(k.as_of)}" aria-expanded="${open}">${md(k.as_of)}　因为 ${esc(docName(x))}</button>${open ? `<div class="revbody">${block('事实', k.facts)}${block('推断', k.inferences)}${block('还不确定', k.unknowns)}<button class="lnk" data-jump="${esc(k.as_of)}">回放到这一天 ›</button></div>` : ''}</li>`; }).join('')}</ol>` : '';
  return `<section class="lead" id="s-concl">
    <div class="lead-main">
      <p class="lede">${narrative(e, a)}</p>
      ${c ? `${block('事实', c.facts)}${block('推断', c.inferences)}${block('还不确定', c.unknowns)}` : ''}
      ${all.length > 1 ? `<p class="sub"><button class="lnk" data-revtoggle aria-expanded="${!!S.revOpen}">结论改过 ${all.length} 版 ›</button></p>${revs}` : ''}
    </div>
    <aside class="margin">${notes.map((n) => { const x = evidenceById(e, n.id); return `<blockquote><button data-src="${esc(n.id)}" data-q="${esc(n.q)}">“${esc(n.q)}”</button><cite>${esc(docName(x))} · ${md(disclosedOf(x))}</cite></blockquote>`; }).join('')}</aside>
  </section>`;
}

// 有效期泳道 + 回放：横轴是时间，每个指标一条带子；竖线是“截至”
function chart(e, a) {
  const { T, dates, end } = chartRange(e);
  const prev = [...dates].reverse().find((d) => d < S.D), next = dates.find((d) => d > S.D);
  return `<section class="chart" id="s-chart">
    <div class="lanes" id="lanes" aria-label="数字版本和状态的时间轴，点击或拖动设置截至日期"></div>
    <div class="replay" id="replay">
      <button data-jump="${prev || ''}" ${prev ? '' : 'disabled'} aria-label="上一次披露">‹ ${prev ? md(prev) : ''}</button>
      <span class="asof">截至 <b>${cn(S.D)}</b>${a.status ? `<span class="st">${esc(a.status.status)}</span>` : ''}</span>
      <button data-jump="${next || ''}" ${next ? '' : 'disabled'} aria-label="下一次披露">${next ? md(next) : ''} ›</button>
      <button data-jump="${T}" ${S.D === T ? 'disabled' : ''}>最新</button>
      ${a.claims.some((c) => c.all.length) ? `<button class="lnk tbl" data-tabletoggle aria-expanded="${!!S.tableOpen}">每一版的原文数字 ›</button>` : ''}
    </div>
    ${S.tableOpen ? `<div class="vtables">${a.claims.filter((c) => c.all.length).map((c) => claimTable(e, c, a)).join('')}</div>` : ''}
  </section>`;
}

const LANE_MEM = { ev: null, seg: new Map(), cx: null };
function drawLanes(e, a) {
  const box = $('#lanes'); if (!box) return;
  if (LANE_MEM.ev !== e.id) { LANE_MEM.ev = e.id; LANE_MEM.seg = new Map(); LANE_MEM.cx = null; }
  const seen = new Map();
  const { T, start, end } = chartRange(e);
  const lanes = a.claims.filter((c) => c.all.some((v) => v.low != null || v.high != null)).slice(0, 6);
  const hist = e.status_history || [];
  const W = Math.max(box.clientWidth, 560), L = 112, R = 12, PW = W - L - R;
  const span = Math.max(1, dayDiff(start, end));
  const x = (d) => L + Math.min(1, Math.max(0, dayDiff(start, d) / span)) * PW;
  const big = embedded && S.only;
  const top = 26, sH = hist.length ? (big ? 56 : 48) : 0, lH = big ? 46 : 34, H = top + sH + lanes.length * lH + 8;
  box.classList.toggle('big', !!big);
  const g = [];
  // 月份
  for (let m = new Date(start.slice(0, 7) + '-01T00:00:00Z'); m.toISOString().slice(0, 10) <= end; m.setUTCMonth(m.getUTCMonth() + 1)) {
    const d = m.toISOString().slice(0, 10); if (d < start) continue;
    g.push(`<line x1="${x(d)}" x2="${x(d)}" y1="${top - 4}" y2="${H}" class="grid"/><text x="${x(d) + 3}" y="${top - 8}" class="mo">${m.getUTCMonth() + 1} 月</text>`);
  }
  // 状态
  if (hist.length) {
    g.push(`<text x="0" y="${top + 16}" class="ln">状态</text>`);
    hist.forEach((s, i) => {
      if (s.at > a.D) return;
      const X = x(s.at), now = a.status === s;
      g.push(`<g class="sm ${now ? 'now' : ''}"><title>${esc(s.at + ' ' + s.status)}</title><rect x="${X - 4}" y="${top + 8}" width="8" height="8" transform="rotate(45 ${X} ${top + 12})"/>
        ${now ? `<text x="${X > L + PW * .7 ? X - 10 : X + 10}" y="${top + 31}" class="sl" text-anchor="${X > L + PW * .7 ? 'end' : 'start'}">${esc(s.status)}</text>` : ''}</g>`);
    });
    g.push(`<line x1="${L}" x2="${L + PW}" y1="${top + sH - 6}" y2="${top + sH - 6}" class="rule"/>`);
  }
  // 指标带子
  lanes.forEach((c, i) => {
    const y = top + sH + i * lH;
    const bh = lH - 14, ty = y + 7 + bh / 2 + 4.5;
    g.push(`<text x="0" y="${ty}" class="ln">${esc(c.key.length > 8 ? c.key.slice(0, 8) + '…' : c.key)}<title>${esc(c.key)}</title></text>`);
    c.all.forEach((v) => {
      if (!v.valid_from || v.valid_from > a.D) return;
      const stop = v.valid_to && v.valid_to <= a.D ? v.valid_to : (a.D >= T ? end : a.D);
      const x0 = x(v.valid_from), x1 = Math.max(x(stop), x0 + 3);
      const isCur = v === c.current, isVoid = isCur && c.voided, has = v.low != null || v.high != null;
      const label = has ? rangeText(v, c.unit) : '没给数字';
      const fits = x1 - x0 > label.length * 7 + 14;
      const key = c.key + '|' + (v.v ?? v.valid_from), was = LANE_MEM.seg.get(key), w = x1 - x0;
      seen.set(key, w);
      const grow = was === undefined || Math.abs(was - w) > 0.5;
      g.push(`<g class="seg ${isVoid ? 'void' : isCur ? 'cur' : 'old'} ${grow ? 'grow' : ''}" style="--from:${was === undefined ? 0 : Math.min(1, was / w).toFixed(3)}" data-src="${esc(v.evidence_id)}" data-q="${esc(v.quote || '')}"><title>${esc(`${v.valid_from} ${label}：${v.quote || ''}`)}</title>
        <rect x="${x0}" y="${y + 7}" width="${x1 - x0}" height="${bh}" rx="1"/>${fits ? `<text x="${x0 + 7}" y="${ty}">${esc(label)}</text>` : isCur && x1 + label.length * 7 + 10 < L + PW ? `<text x="${x1 + 6}" y="${ty}" class="curlbl">${esc(label)}</text>` : ''}</g>`);
    });
  });
  // 截至线
  const cx = a.D >= T ? x(end) : x(a.D);
  const dx = LANE_MEM.cx == null ? 0 : LANE_MEM.cx - cx;
  g.push(`<g class="cur-g ${dx ? 'mv' : ''}" style="--dx:${dx.toFixed(1)}px"><line x1="${cx}" x2="${cx}" y1="${top - 20}" y2="${H}" class="cursor"/><text x="${cx}" y="${top - 12}" class="cl" text-anchor="${cx > L + PW - 40 ? 'end' : 'middle'}">${a.D >= T ? '今天' : md(a.D)}</text></g>`);
  LANE_MEM.cx = cx; LANE_MEM.seg = seen;
  box.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g.join('')}</svg>${lanes.length ? '' : '<p class="empty">这件事没有抽取数字，变化在状态和证据里。</p>'}`;
  const svg = box.querySelector('svg');
  const pick = (ev2) => {
    const r = svg.getBoundingClientRect(); const px = (ev2.clientX - r.left) * (W / r.width);
    if (px < L) return;
    let d = addDays(start, Math.round(((px - L) / PW) * span));
    if (px >= L + PW - 2 || d > T) d = T;
    if (d !== S.D) { S.D = d; emit({ type: 'date', event: S.eventId, date: S.D }); renderEvent(); toHash(); listeners.forEach((f) => f({ ...S })); }
  };
  let drag = false;
  svg.addEventListener('pointerdown', (ev2) => { if (ev2.target.closest('.seg')) return; drag = true; try { svg.setPointerCapture(ev2.pointerId); } catch (err) { /* 演示页模拟的拖动没有真实指针 */ } pick(ev2); });
  svg.addEventListener('pointermove', (ev2) => drag && pick(ev2));
  svg.addEventListener('pointerup', () => (drag = false));
}

function secConflicts(e, a) {
  if (!a.conflicts.length) return '';
  return `<section class="sec" id="s-conflict"><h2>对不上的地方</h2>
    ${a.conflicts.map((c) => `<div class="cf" id="cf-${esc(c.id)}"><p>${tx(e, c.text)}</p>
      ${(c.quotes || []).slice(0, 3).map((q) => { const x = evidenceById(e, q.evidence_id); return `<blockquote><button data-src="${esc(q.evidence_id)}" data-q="${esc(q.quote)}">“${esc(q.quote)}”</button><cite>${esc(srcType(x))} · ${esc(docName(x))}</cite></blockquote>`; }).join('')}
      ${c.resolution ? `<p class="res">${tx(e, c.resolution)}</p>` : ''}</div>`).join('')}</section>`;
}

const rawRange = (r) => (r.low === r.high || r.high == null ? exact(r.low, r.unit) : `${exact(r.low, '')} ~ ${exact(r.high, r.unit)}`);
function claimTable(e, c, a) {
  return `<div class="vt-wrap"><h5>${esc(c.key)}</h5><table class="vt"><tbody>
    ${c.all.filter((v) => v.valid_from <= a.D).map((v) => {
      const isCur = v === c.current;
      const x = evidenceById(e, v.evidence_id), by = v.superseded_by ? evidenceById(e, v.superseded_by) : null;
      const st = isCur && c.voided ? '已作废' : isCur ? '当前有效' : (v.valid_to && v.valid_to <= a.D ? `前值 · ${md(v.valid_to)} 被 ${docName(by)} 取代` : '');
      const num = v.low == null && v.high == null ? '没给数字' : v.low === v.high ? exact(v.low, c.unit) : `${exact(v.low, '')} ~ ${exact(v.high, c.unit)}`;
      return `<tr class="${isCur ? 'cur' : ''}"><td class="m">${md(v.valid_from)}</td><td><button class="lnk" data-src="${esc(v.evidence_id)}" data-q="${esc(v.quote || '')}">${esc(docName(x))}</button></td><td class="num">${esc(num)}${v.raw && v.raw.unit !== c.unit ? `<small>原文 ${esc(rawRange(v.raw))}</small>` : ''}</td><td class="st">${esc(st)}</td></tr>`;
    }).join('')}</tbody></table>${gapText(c, a)}</div>`;
}
function gapText(c, a) {
  const e = ev(); const raw = (e.claims || []).find((k) => k.key === c.key);
  const g = raw && raw.forecast_gap;
  if (!g || g.actual == null) return '';
  const hit = (raw.versions || []).find((v) => v.low === g.actual || v.high === g.actual);
  if (!hit || hit.valid_from > a.D) return '';
  const u = g.unit || c.unit;
  return `<p class="gap">首次预告 ${esc(rangeText({ low: g.first_low, high: g.first_high }, u))}，当前 ${esc(human(g.actual, u))}，${g.within_first_range ? '落在首次区间内' : `离首次区间较近的一端差 ${esc(human(g.gap_to_nearer_bound, u))}`}。</p>`;
}

// 证据：一行一条，点开看原文和四种时间
function diffTarget(e, x) {
  if (x.src !== 'ann' || !x.ref || !x.relation || !x.relation.target) return null;
  const t = evidenceById(e, x.relation.target);
  return t && t.src === 'ann' && t.ref ? t : null;
}
function secEvidence(e, a) {
  const rows = a.evidence.slice().reverse();
  const later = (e.evidence || []).length - rows.length;
  return `<section class="sec" id="s-evidence"><h2>证据</h2>
    <ol class="ev-rows">${rows.map((x) => evRow(e, x, a)).join('') || '<li class="empty">还没有。</li>'}</ol>
    ${later > 0 ? `<p class="later">之后还有 ${later} 条，往后回放可见。</p>` : ''}</section>`;
}
function evRow(e, x, a) {
  const t = x.times || {};
  const od = a.outdated[x.id];
  const dt = diffTarget(e, x);
  const occ = occurredText(t.occurred);
  const open = S.focus === x.id;
  return `<li id="ev-${esc(x.id)}" class="${od ? 'outdated' : ''} ${open ? 'focus' : ''}"><details ${open ? 'open' : ''}>
    <summary><span class="d">${md(disclosedOf(x))}</span><span class="k">${esc(srcType(x))}</span><span class="t">${tx(e, x.summary || x.title || '')}${od ? '<em>前提已不成立</em>' : ''}</span></summary>
    <div class="ev-more">
      <p class="src">${esc(x.src === 'ann' ? docName(x) + ' · ' : (x.source ? x.source + ' · ' : ''))}${val(x.title)}</p>
      ${x.quote || x.reason_quote ? `<blockquote>“${esc(x.quote || x.reason_quote)}”</blockquote>` : ''}
      ${od ? `<p class="od">${tx(e, od.note || '')}</p>` : ''}
      <p class="acts">${x.src === 'ann' && x.ref ? `<button class="lnk" data-src="${esc(x.id)}" data-q="${esc(x.quote || x.reason_quote || '')}">在正文里看 ›</button>` : ''}${dt ? `<button class="lnk" data-diff-a="${esc(dt.id)}" data-diff-b="${esc(x.id)}">和 ${esc(docName(dt))} 对比 ›</button>` : ''}${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${x.src === 'ann' ? '巨潮 PDF' : '原文链接'} ↗</a>` : ''}</p>
      <p class="times">${esc(x.source_tier ? x.source_tier + ' 级' : '')}${x.weight != null ? ' · 权重 ' + esc(x.weight) : ''} · 发生 ${occ ? esc(occ) : miss()} · 披露 ${esc(timeLine(x) || '') || miss()} · 抓取 ${bj(t.fetched) ? esc(bj(t.fetched).replace('（北京时间）', '')) : miss('未记录')} · 更新 ${updatedText(e, x)}</p>
    </div></details></li>`;
}
function updatedText(e, x) {
  const t = x.times || {};
  if (t.updated) return esc(bj(t.updated) || t.updated);
  const r = RECHECK && RECHECK.items.find((i) => i.event_id === e.id && i.evidence_id === x.id);
  if (!r) return miss('来源未提供');
  if (r.error) return `重抓失败`;
  return r.changed ? `<b>重抓发现正文有变化</b>` : `重抓比对未变`;
}

function secPrices(e, a) {
  const p = e.prices;
  const h = `<h2>披露前后股价</h2>`;
  if (!p || p.error) return `<section class="sec" id="s-prices">${h}<p class="empty">行情${miss('未接入')}${p && p.error ? '：' + esc(p.error) : ''}</p></section>`;
  const byDay = {};
  (p.markers || []).filter((m) => m.disclosed <= a.D).forEach((m) => { (byDay[m.first_trading_day] = byDay[m.first_trading_day] || []).push(m); });
  const cards = Object.entries(byDay).map(([day, ms]) => {
    const w = priceWindow(p, ms[0], a.D);
    const bar = w.find((b) => b.date === day);
    if (!w.length || !bar) return '';
    const cs = w.map((b) => b.close), mn = Math.min(...cs), mx = Math.max(...cs), r = mx - mn || 1;
    const X = (i) => 4 + (i / Math.max(1, w.length - 1)) * 152, Y = (v) => 30 - ((v - mn) / r) * 24;
    const k = w.indexOf(bar);
    const pct = bar.pct == null ? '' : (bar.pct > 0 ? '+' : bar.pct < 0 ? '−' : '') + Math.abs(bar.pct).toFixed(2) + '%';
    return `<li><span class="d">${md(day)}</span><svg viewBox="0 0 160 34" aria-hidden="true"><polyline points="${w.map((b, i) => X(i) + ',' + Y(b.close)).join(' ')}"/><circle cx="${X(k)}" cy="${Y(bar.close)}" r="3"/></svg><span class="v">${esc(bar.close)} 元 <small>${pct}</small></span><span class="w">${ms.map((m) => esc(docName(evidenceById(e, m.evidence_id)))).join('、')}</span></li>`;
  }).join('');
  return `<section class="sec" id="s-prices">${h}${cards ? `<ul class="px">${cards}</ul><p class="small">${esc(p.adjust || '')}，披露后首个交易日前后各 3 天</p>` : `<p class="empty">这一天之前没有价格片段。</p>`}</section>`;
}

function secPending(e) {
  const list = Array.isArray(e.pending) ? e.pending : null;
  if (list && !list.length) return '';
  return `<section class="sec" id="s-pending"><h2>还没做到</h2>${list ? `<ul class="pend">${list.map((p) => `<li>${tx(e, p)}</li>`).join('')}</ul>` : `<p class="empty">缺口清单${miss('未生成')}</p>`}</section>`;
}

// 证据编号换成来源类型文字链接；同类多条合并
function tags(e, ids) {
  if (!ids || !ids.length) return '';
  const groups = [];
  ids.forEach((id) => { const x = evidenceById(e, id); const t = srcType(x); let g = groups.find((k) => k.t === t); if (!g) groups.push(g = { t, ids: [] }); g.ids.push(id); });
  return groups.map((g) => `<button class="stag" data-tag-ids="${esc(g.ids.join(','))}" data-tag-ev="${esc(e.id)}" title="${esc(g.ids.map((id) => docName(evidenceById(e, id))).join('、'))}">${esc(g.t)}${g.ids.length > 1 ? ' · ' + g.ids.length : ''} ›</button>`).join('');
}

// 数据文字里夹带的内部编号（e1、n2、k7）换成给人看的名字；对不上证据的保持原样
const tx = (e, t) => esc(String(t == null ? '' : t)).replace(/(?<![A-Za-z0-9])([enkag]\d{1,2})(?![0-9A-Za-z])/g, (m) => (e && evidenceById(e, m) ? esc(nm(e, m)) : m));
// 给人看的证据名：公告编号，或“来源 日期”，不露内部编号
const nm = (e, id) => { const x = e && evidenceById(e, id); return !x ? id : x.src === 'ann' ? docName(x) : `${x.source || srcType(x)} ${md(disclosedOf(x))}`; };

// ---------- 问答 ----------
function renderQA() {
  const items = QA ? QA.items : [];
  if (!S.qaId && items.length) S.qaId = items[0].id;
  const cur = items.find((q) => q.id === S.qaId);
  const groups = {};
  items.forEach((q) => { const e = evOf(q.event_id); const k = e ? e.name + ' · ' + (e.title || '') : '未关联事件'; (groups[k] = groups[k] || []).push(q); });
  if (embedded && S.only === 'answer' && cur) { $('#view').innerHTML = `<div class="wrap only">${answer(cur)}</div>`; return; }
  $('#view').innerHTML = `<div class="wrap">
    <form class="ask" id="askf"><input id="askq" placeholder="问一个已收录事件的问题，或贴一句看到的消息" value="${esc(S.ask)}" autocomplete="off"><button>查</button></form>
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
    <div class="meta">${e ? esc(e.name) + ' · ' : ''}截至 ${q.as_of ? esc(q.as_of) : miss('未记录')}</div>
    ${ans.length ? `<ol class="sent">${ans.map((s, i) => `<li class="k-${esc(s.kind)}" style="--i:${i}"><span class="kind k-${esc(s.kind)}">${s.kind ? esc(s.kind) : miss('未标')}</span><span>${tx(e, s.text)}${e ? tags(e, s.evidence_ids) : ''}</span></li>`).join('')}</ol>` : `<p>${miss('回答未生成')}</p>`}
    <details class="trace" ${S.openTrace ? 'open' : ''}><summary>它是怎么得出这个回答的（${tr ? tr.length + ' 步' : '未生成'}）</summary>
      ${tr ? `<ol>${tr.map((t) => `<li><b>${esc(t.step)}</b> ${tx(e, t.detail || '')}
        ${t.used && t.used.length ? `<div class="x">用了：${t.used.map((id) => esc(nm(e, id))).join('、')}</div>` : ''}
        ${t.excluded && t.excluded.length ? `<div class="x">排除：${t.excluded.map((x) => `${esc(nm(e, x.id))}（${tx(e, x.reason)}）`).join('；')}</div>` : ''}
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
    <p class="honest">只做数字比对，不调用模型；对不上就直说。</p>
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
    else if (d.isCurrent) st = `<p>这一版目前是“当前有效”。</p>`;
    else st = `<p><b>${esc(v.valid_to)}</b> 被 ${esc(docName(by))} 取代。</p>`;
    const cur = d.isCurrent ? '' : `<p>现在算数的是 <span class="big">${esc(rangeText(d.cur, c.unit))}</span>（第 ${d.cur.v ?? '?'} 版，${esc(docName(curX))}，${esc(d.cur.valid_from)}${d.cur.status === 'void' ? '，已作废' : ''}）。</p>`;
    const notes = [];
    if (m.how === '只对上区间的一端') notes.push('只对上了区间的一端，可能不是同一个说法。');
    if (!m.exact && m.how !== '只对上区间的一端') notes.push(`你写的“${esc(m.input)}”是四舍五入后的写法，原文是 ${esc(rangeText(v, c.unit, 'exact'))}。`);
    if (m.signNote) notes.push(esc(m.signNote) + '。');
    return `<div class="vres"><h3>这是${esc(e.name)}${esc(c.key)}的第 ${d.n} 版（共 ${d.total} 版）。</h3>
      <p>出自 <button class="lnk" data-src="${esc(v.evidence_id)}" data-q="${esc(v.quote || '')}" data-src-ev="${esc(e.id)}">${esc(docName(x))}</button>，${esc(v.valid_from)} 披露${v.basis ? '，' + esc(v.basis) : ''}。原文：“${esc(v.quote || '')}”</p>
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
    peekEl.innerHTML = `<button class="x" aria-label="关闭">×</button><div class="tags">${val(x.kind)} · ${tl.tier ? esc(tl.tier) + ' 级 ' + esc(tl.label || '') : ''} · ${esc(timeLine(x) || '')}</div>
      <h4>${esc(x.src === 'ann' ? docName(x) + ' ' : (x.source ? x.source + '：' : ''))}${val(x.title)}</h4><p>${x.summary ? esc(x.summary) : miss('要点未抽取')}</p>
      ${x.quote ? `<p class="muted">原文：“${esc(x.quote)}”</p>` : ''}
      <div class="act">${x.src === 'ann' && x.ref ? `<button data-src="${esc(x.id)}" data-q="${esc(x.quote || '')}" data-src-ev="${esc(e.id)}">看正文</button>` : ''}${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">打开原文 ↗</a>` : ''}<a href="#" data-goto="${esc(e.id)}" data-gd="${esc(disclosedOf(x))}" data-gf="${esc(x.id)}">在时间线上看</a></div>`;
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
    if (b.dataset.view) { closeDrawer(); S.view = b.dataset.view; emit({ type: 'view', view: S.view }); render(); scrollTo(0, 0); return; }
    if (b.dataset.ev) { go({ view: 'event', event: b.dataset.ev, date: today(DATA), top: true }); return; }
    if (b.dataset.noteEv) { go({ view: 'event', event: b.dataset.noteEv, date: b.dataset.noteAt, focus: b.dataset.noteId || null, section: b.dataset.noteId ? null : 's-conflict' }); return; }
    if (b.dataset.jump) { S.D = b.dataset.jump; emit({ type: 'date', event: S.eventId, date: S.D }); renderEvent(); toHash(); listeners.forEach((f) => f({ ...S })); return; }
    if (b.dataset.mode) { S.claimMode = b.dataset.mode; renderEvent(); scrollToSel('#s-claims', false); return; }
    if (b.dataset.ref) { ev2.preventDefault(); peek(b.dataset.ref, b); return; }
    if (b.dataset.qa) { closeDrawer(); S.view = 'qa'; S.qaId = b.dataset.qa; S.ask = ''; emit({ type: 'qa', id: S.qaId }); render(); scrollToSel('#answer', false); return; }
    if (b.dataset.vex) { S.verifyText = b.dataset.vex; emit({ type: 'verify', text: S.verifyText }); renderVerify(); toHash(); listeners.forEach((f) => f({ ...S })); return; }
    if (b.dataset.tagIds) { ev2.preventDefault(); const ids = b.dataset.tagIds.split(','); const e0 = evOf(b.dataset.tagEv) || ev(); const x = evidenceById(e0, ids[0]); openSource(e0.id, ids[0], x && (x.quote || x.reason_quote), b.dataset.sibs ? b.dataset.sibs.split(',') : ids); return; }
    if (b.dataset.gl) { ev2.preventDefault(); openGlossary(b.dataset.gl); return; }
    if (b.dataset.src) { ev2.preventDefault(); const evId = b.dataset.srcEv || (b.closest('[data-event]') && b.closest('[data-event]').dataset.event) || S.eventId; closePeek(); openSource(evId, b.dataset.src, b.dataset.q); return; }
    if (b.dataset.diffA) { openDiff(S.eventId, b.dataset.diffA, b.dataset.diffB); return; }
    if (b.matches('[data-drawer-close]')) { closeDrawer(); return; }
    if (b.hasAttribute('data-merge')) { S.mergeOpen = !S.mergeOpen; renderEvent(); return; }
    if (b.hasAttribute('data-tabletoggle')) { S.tableOpen = !S.tableOpen; renderEvent(); scrollToSel('#s-chart', false); return; }
    if (b.hasAttribute('data-revtoggle')) { S.revOpen = !S.revOpen; emit({ type: 'rev', event: S.eventId, date: S.D }); renderEvent(); scrollToSel('#s-concl', false); return; }
    if (b.dataset.rev) { S.revView = S.revView === b.dataset.rev ? null : b.dataset.rev; emit({ type: 'rev', event: S.eventId, date: S.D, as_of: b.dataset.rev }); renderEvent(); scrollToSel('#revs', false); return; }
    if (b.dataset.goto) { ev2.preventDefault(); closePeek(); go({ view: 'event', event: b.dataset.goto, date: b.dataset.gd || null, focus: b.dataset.gf || null, section: b.dataset.gf ? null : 's-chart' }); return; }
    if (b.closest('.subnav') && b.hash) { ev2.preventDefault(); scrollToSel(b.hash, false); }
  });
  document.addEventListener('change', (ev2) => {
    const t = ev2.target;
    if (t.dataset.diffsel) { const a = $('[data-diffsel="a"]').value, b = $('[data-diffsel="b"]').value; openDiff(S.eventId, a, b); return; }
    if (t.dataset.tier) { t.checked ? S.tiers.add(t.dataset.tier) : S.tiers.delete(t.dataset.tier); renderEvent(); scrollToSel('#s-evidence', false); }
  });
  document.addEventListener('submit', (ev2) => {
    ev2.preventDefault();
    if (ev2.target.id === 'vf') { S.verifyText = $('#vq').value.trim(); emit({ type: 'verify', text: S.verifyText }); renderVerify(); toHash(); }
    if (ev2.target.id === 'askf') { S.ask = $('#askq').value.trim(); emit({ type: 'ask', text: S.ask }); runAsk(S.ask); }
    listeners.forEach((f) => f({ ...S }));
  });
  document.addEventListener('click', (ev2) => { const r = ev2.target.closest('.seg'); if (r && r.dataset.src) openSource(S.eventId, r.dataset.src, r.dataset.q); });
  addEventListener('resize', () => { if (S.view === 'event') { const e = ev(); if (e) drawLanes(e, asOf(e, S.D)); } });
  addEventListener('keydown', (k) => {
    if (k.key === 'Escape') { closePeek(); closeDrawer(); return; }
    if (S.view !== 'event' || k.target.closest('input, textarea, select') || k.metaKey || k.ctrlKey) return;
    const dates = eventDates(ev());
    if (k.key === 'ArrowLeft') { const p = [...dates].reverse().find((d) => d < S.D); if (p) { S.D = p; renderEvent(); toHash(); emit({ type: 'date', event: S.eventId, date: S.D }); } }
    if (k.key === 'ArrowRight') { const n = dates.find((d) => d > S.D); S.D = n || today(DATA); renderEvent(); toHash(); emit({ type: 'date', event: S.eventId, date: S.D }); }
    if (k.key === 'Escape') { closePeek(); closeDrawer(); }
  });
  addEventListener('hashchange', () => { const before = JSON.stringify([S.view, S.eventId, S.D]); fromHash(); if (JSON.stringify([S.view, S.eventId, S.D]) !== before) render(); });
  // 当前小节高亮
  addEventListener('scroll', () => {
    const links = $$('.subnav a'); if (!links.length) return;
    let on = null; links.forEach((a) => { const s = $(a.hash); if (s && s.getBoundingClientRect().top < 170) on = a; });
    links.forEach((a) => a.classList.toggle('on', a === on));
  }, { passive: true });
}

// ---------------- 正文抽屉：定位引用、两版对比 ----------------
let drawerEl = null, drawerToken = 0;
function drawer() {
  if (!drawerEl) {
    drawerEl = document.createElement('aside');
    drawerEl.className = 'drawer'; drawerEl.setAttribute('role', 'dialog'); drawerEl.setAttribute('aria-label', '公告正文');
    document.body.appendChild(drawerEl);
  }
  drawerEl.hidden = false; document.body.classList.add('has-drawer');
  return drawerEl;
}
function closeDrawer() { if (drawerEl) { drawerEl.hidden = true; drawerEl.innerHTML = ''; } document.body.classList.remove('has-drawer'); drawerToken++; }
const dHead = (title, sub) => `<div class="dhead"><div><b>${title}</b><small>${sub}</small></div><button data-drawer-close aria-label="关闭">×</button></div>`;

async function openSource(eventId, evId, quote, siblings) {
  closePeek();
  const e = evOf(eventId) || ev(), x = e && evidenceById(e, evId);
  const d = drawer(), tok = ++drawerToken;
  emit({ type: 'source', event: e && e.id, evidence: evId, quote });
  // 同一个标签下有几条证据时，抽屉顶上列出来，可以切换
  const sib = siblings && siblings.length > 1 ? `<div class="sibs">${siblings.map((id) => { const y = evidenceById(e, id); return `<button data-tag-ids="${esc(id)}" data-tag-ev="${esc(e.id)}" data-sibs="${esc(siblings.join(','))}" aria-current="${id === evId}">${esc(docName(y))}<small>${esc(disclosedOf(y) || '')}</small></button>`; }).join('')}</div>` : '';
  if (!x) { d.innerHTML = dHead('没有找到这条证据', esc(evId)) + `<div class="dbody"><p class="empty">数据里没有证据 ${esc(evId)}。</p></div>`; return; }
  const pdf = x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${x.src === 'ann' ? '巨潮 PDF' : '原文链接'} ↗</a>` : miss('链接未记录');
  const head = dHead(esc(x.src === 'ann' ? docName(x) : (x.source || x.id)), `${esc(srcType(x))} · ${esc(x.title || '')} · ${esc(timeLine(x) || '')}`) + sib;
  if (x.src !== 'ann' || !x.ref) {
    d.innerHTML = head + `<div class="dbody"><p class="dnote">这是${esc(SRC_NAME[x.src] || '非公告')}，仓库里没有全文，只有标题、摘要里的这一句和原文链接。</p>
      <h3 class="dtitle">${val(x.title)}</h3>${x.summary ? `<p>${esc(x.summary)}</p>` : ''}${quote || x.quote ? `<p><mark class="hit">${esc(quote || x.quote)}</mark></p>` : ''}<p>${pdf}</p></div>`;
    return;
  }
  d.innerHTML = head + `<div class="dbody"><p class="empty">正在读取正文…</p></div>`;
  const t = await loadText(x.ref);
  if (tok !== drawerToken) return;
  if (!t.ok) { d.innerHTML = head + `<div class="dbody"><p class="dnote">正文没有读到：${esc(t.error)}。可以直接看 ${pdf}</p></div>`; return; }
  const spans = quote ? locate(t.paras, quote) : null;
  const marks = {}; (spans || []).forEach((sp) => (marks[sp.p] = marks[sp.p] || []).push(sp));
  const html = t.paras.map((p, i) => {
    if (!marks[i]) return `<p>${esc(p)}</p>`;
    let out = '', k = 0; marks[i].forEach((sp) => { out += esc(p.slice(k, sp.from)) + `<mark class="hit">${esc(p.slice(sp.from, sp.to))}</mark>`; k = sp.to; });
    return `<p class="hitp">${out + esc(p.slice(k))}</p>`;
  }).join('');
  const status = !quote ? '' : spans ? `<p class="dnote ok">已在正文里定位到这句引用（去掉空白后逐字匹配），黄色底是原句。</p>` : `<p class="dnote bad">未能在正文中定位这句引用：“${esc(quote)}”。可以对照 ${pdf}。</p>`;
  const dt = diffTarget(e, x);
  d.innerHTML = head + `<div class="dbody">${status}<p class="dact">${pdf}${dt ? `<button data-diff-a="${esc(dt.id)}" data-diff-b="${esc(x.id)}">和 ${esc(docName(dt))} 对比正文</button>` : ''}<span class="muted">正文由 PDF 转出，段落按标点重排过</span></p><div class="doc">${html}</div></div>`;
  const m = d.querySelector('mark.hit');
  if (m) { const body = d.querySelector('.dbody'); body.scrollTop = Math.max(0, m.offsetTop - body.clientHeight / 3); }
}

function openGlossary(section) {
  closePeek();
  const g = DATA && DATA.glossary;
  const d = drawer(); drawerToken++;
  emit({ type: 'glossary', section });
  if (!g || !Array.isArray(g.sections)) { d.innerHTML = dHead('口径说明', '') + `<div class="dbody"><p class="dnote">口径说明${miss('未生成')}。</p></div>`; return; }
  d.innerHTML = dHead('口径说明', `页面上的状态、类型、级别、时间都按这里的意思用${g.updated ? ' · 更新于 ' + esc(g.updated) : ''}`) + `<div class="dbody gloss">${g.sections.map((sec) => `<section data-gsec="${esc(sec.title)}" class="${sec.title === section ? 'on' : ''}"><h3>${esc(sec.title)}</h3>${sec.note ? `<p class="dnote">${esc(sec.note)}</p>` : ''}<dl>${(sec.items || []).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></section>`).join('')}</div>`;
  const t = section && [...d.querySelectorAll('[data-gsec]')].find((x) => x.dataset.gsec === section);
  if (t) d.querySelector('.dbody').scrollTop = t.offsetTop - 12;
}

async function openDiff(eventId, aId, bId) {
  closePeek();
  emit({ type: 'diff', event: eventId, a: aId, b: bId });
  const e = evOf(eventId) || ev(), A = evidenceById(e, aId), B = evidenceById(e, bId);
  const d = drawer(), tok = ++drawerToken;
  const anns = (e.evidence || []).filter((x) => x.src === 'ann' && x.ref);
  const sel = (name, cur) => `<select data-diffsel="${name}">${anns.map((x) => `<option value="${esc(x.id)}" ${x.id === cur ? 'selected' : ''}>${esc(docName(x))}（${esc(disclosedOf(x))}）</option>`).join('')}</select>`;
  const head = dHead('两版公告对比', '只标出不同的地方；完全相同的句子只计数');
  if (!A || !B) { d.innerHTML = head + `<div class="dbody"><p class="empty">找不到要对比的公告。</p></div>`; return; }
  d.innerHTML = head + `<div class="dbody"><p class="empty">正在读取两份正文…</p></div>`;
  const [ta, tb] = await Promise.all([loadText(A.ref), loadText(B.ref)]);
  if (tok !== drawerToken) return;
  const pick = `<p class="dact pick">旧 ${sel('a', A.id)} → 新 ${sel('b', B.id)}</p>`;
  if (!ta.ok || !tb.ok) { d.innerHTML = head + `<div class="dbody">${pick}<p class="dnote bad">正文没有读到：${esc((!ta.ok ? ta : tb).error)}</p></div>`; return; }
  const df = diffDocs(ta.paras, tb.paras);
  if (!df) { d.innerHTML = head + `<div class="dbody">${pick}<p class="dnote">两份正文太长，这里不做逐句对比。</p></div>`; return; }
  const seg = (arr, cls) => arr.map(([t, c]) => (c ? `<mark class="${cls}">${esc(t)}</mark>` : esc(t))).join('');
  const rows = df.rows.map((r) => {
    if (r.type === 'same') return `<div class="drow same"><span>${r.n} 句相同</span></div>`;
    const [L, Rr] = charDiff(r.a, r.b);
    return `<div class="drow"><div class="old">${r.a ? seg(L, 'was') : '<span class="muted">（旧版没有这一句）</span>'}</div><div class="new">${r.b ? seg(Rr, 'now') : '<span class="muted">（新版删掉了这一句）</span>'}</div></div>`;
  }).join('');
  d.innerHTML = head + `<div class="dbody">${pick}
    <p class="dnote">${esc(docName(A))}（${esc(disclosedOf(A))}）→ ${esc(docName(B))}（${esc(disclosedOf(B))}）：${df.same} 句相同，${df.edited} 句改了内容，新增 ${df.added} 句，删去 ${df.removed} 句。</p>
    <div class="dcols"><b>旧：${esc(docName(A))}</b><b>新：${esc(docName(B))}</b></div>${rows}</div>`;
  const firstNum = [...d.querySelectorAll('.drow:not(.same)')].find((r) => !/证券代码|编号/.test(r.textContent) && [...r.querySelectorAll('mark')].some((m) => /\d/.test(m.textContent)));
  if (firstNum) { const body = d.querySelector('.dbody'); body.scrollTop = Math.max(0, firstNum.offsetTop - 120); }
}

// 演示页用的接口：所有参数都可选
function go(o = {}) {
  closePeek();
  if (o.view) S.view = o.view;
  if (o.event && evOf(o.event)) { if (o.event !== S.eventId) { S.tiers = null; S.revOpen = false; S.revView = null; } S.eventId = o.event; }
  if (o.date) S.D = o.date;
  if (o.claimMode) S.claimMode = o.claimMode;
  if ('focus' in o) S.focus = o.focus;
  else if (o.section || o.selector || o.top || o.event) S.focus = null;
  if (o.qa) S.qaId = o.qa;
  if ('openTrace' in o) S.openTrace = !!o.openTrace;
  if ('verify' in o) S.verifyText = o.verify || '';
  if ('ask' in o) S.ask = o.ask || '';
  if (o.view === 'event' && !o.date && !S.D) S.D = today(DATA);
  if ('revOpen' in o) S.revOpen = !!o.revOpen;
  if ('only' in o) S.only = o.only || null;
  if ('tableOpen' in o) S.tableOpen = !!o.tableOpen;
  if ('revView' in o) S.revView = o.revView;
  if (!o.source && !o.diff && (o.view || o.event || o.date || o.close)) closeDrawer();
  emit({ type: 'nav', view: S.view, event: S.eventId, date: S.D, focus: S.focus });
  render();
  if (o.source) openSource(o.source.event || S.eventId, o.source.evidence, o.source.quote);
  if (o.diff) openDiff(o.diff.event || S.eventId, o.diff.a, o.diff.b);
  requestAnimationFrame(() => {
    if (o.top) scrollTo({ top: 0 });
    else if (S.focus && S.view === 'event' && $('#ev-' + CSS.escape(S.focus))) scrollToSel('#ev-' + CSS.escape(S.focus));
    else if (o.section) scrollToSel('#' + o.section, o.flash !== false);
    else if (o.selector) scrollToSel(o.selector, o.flash !== false);
  });
}

window.WB = { ready, go: (o) => { silent = true; try { go(o); } finally { silent = false; } }, get state() { return { ...S }; }, get data() { return DATA; }, get qa() { return QA; }, on: (f) => listeners.push(f), onAction: (f) => actionListeners.push(f) };
init();
