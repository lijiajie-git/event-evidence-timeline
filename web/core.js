// 两个页面共用：读数据（带兜底）、回放计算、格式化、缺失标记、主题。
// 只读 data/ 和 eval/ 下的 JSON，不写死任何事件内容。

export const PATHS = {
  events: 'data/events.json',
  qa: 'data/qa.json',
  audit: 'data/audit.json',
  report: 'eval/report.json',
  recheck: 'data/recheck.json',
};

// ---------- 读文件 ----------
// 返回 { ok, data, error, path }。不抛异常，调用方按 ok 决定显示什么。
export async function load(path) {
  try {
    const r = await fetch(path, { cache: 'no-cache' });
    if (!r.ok) return { ok: false, path, error: r.status === 404 ? '文件不存在（404）' : `服务器返回 ${r.status}` };
    const text = await r.text();
    try { return { ok: true, path, data: JSON.parse(text) }; }
    catch (e) { return { ok: false, path, error: '文件不是合法的 JSON：' + e.message }; }
  } catch (e) {
    const local = location.protocol === 'file:';
    return { ok: false, path, error: local ? '直接双击打开的页面读不到数据文件，请用静态服务器打开（python3 -m http.server）' : '网络请求失败：' + e.message };
  }
}

// ---------- 文本 ----------
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const has = (v) => v !== null && v !== undefined && v !== '' && v !== '未抽取';

// 缺失统一用这个，绝不留空白
export const MISS_TIP = {
  未抽取: '原文里可能有，但还没有抽取出来',
  未接入: '这个数据源还没有接入',
  未生成: '对应的数据文件还没有生成',
  来源未提供: '数据源不提供这个字段',
  未记录: '数据里没有记录这一项',
  不适用: '这类来源没有这一项',
};
export const miss = (word = '未抽取', tip) => `<span class="miss" title="${esc(tip || MISS_TIP[word] || '')}">${esc(word)}</span>`;
export const val = (v, word = '未抽取') => (has(v) ? esc(v) : miss(word));

// ---------- 日期 ----------
export const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
export const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
export const md = (d) => (d ? `${+d.slice(5, 7)}-${d.slice(8, 10)}` : '');
export const cn = (d) => { if (!d) return ''; const [y, m, dd] = d.split('-'); return `${y} 年 ${+m} 月 ${+dd} 日`; };
export const cnShort = (d) => { if (!d) return ''; const [, m, dd] = d.split('-'); return `${+m} 月 ${+dd} 日`; };
export const bj = (iso) => {
  if (!iso) return null;
  const t = new Date(iso); if (isNaN(t)) return null;
  return new Date(t.getTime() + 8 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') + '（北京时间）';
};

// ---------- 数字 ----------
const grp = (n, dec) => Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const decimals = (n) => { const s = String(n); const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };
const sgn = (n) => (n < 0 ? '−' : '');

// 原始单位精确值，用在表格和引用旁
export function exact(n, unit) {
  if (n == null || isNaN(n)) return null;
  if (unit === '%') return sgn(n) + grp(n, decimals(n)) + '%';
  return sgn(n) + grp(n, decimals(n)) + (unit ? ' ' + unit : '');
}
// 万元 → 人读的（≥1 亿用亿，两位小数）
export function human(n, unit) {
  if (n == null || isNaN(n)) return null;
  if (unit === '万元' && Math.abs(n) >= 10000) return sgn(n) + (Math.abs(n) / 10000).toFixed(2) + ' 亿';
  if (unit === '万元') return sgn(n) + grp(n, Math.min(decimals(n), 2)) + ' 万';
  if (unit === '%') return sgn(n) + grp(n, decimals(n)) + '%';
  return exact(n, unit);
}
export function rangeText(v, unit, mode = 'human') {
  if (!v || (v.low == null && v.high == null)) return null;
  const f = mode === 'exact' ? (n) => exact(n, unit) : (n) => human(n, unit);
  if (v.low === v.high || v.high == null || v.low == null) return f(v.low ?? v.high);
  const a = f(v.low), b = f(v.high);
  // 同单位只写一次：−1.30 ~ −1.04 亿
  const ua = a.match(/\s?(亿|万|万元|%)$/), ub = b.match(/\s?(亿|万|万元|%)$/);
  if (ua && ub && ua[1] === ub[1]) return a.slice(0, -ua[0].length) + ' ~ ' + b;
  return a + ' ~ ' + b;
}
export const mid = (v) => (v.low + v.high) / 2;
export function change(prev, cur) {
  if (!prev || !cur || prev.low == null || cur.low == null) return '';
  const a = mid(prev), b = mid(cur);
  if (a > 0 && b < 0) return '由盈转亏';
  if (a < 0 && b > 0) return '由亏转盈';
  if (Math.abs(b - a) <= Math.max(Math.abs(a), 1) * 0.005) return '基本不变';
  return b < a ? '下调' : '上调';
}

// ---------- 事件与回放 ----------
export const evidenceById = (ev, id) => (ev.evidence || []).find((x) => x.id === id) || null;
export const disclosedOf = (x) => (x && x.times && x.times.disclosed) || null;
export const claimUnit = (c) => c.unit || (c.versions && c.versions[0] && c.versions[0].unit) || '';

export function eventDates(ev) {
  return [...new Set((ev.evidence || []).map(disclosedOf).filter(Boolean))].sort();
}
export function today(events) { return ((events && events.generated_at) || new Date().toISOString()).slice(0, 10); }

// 截至 D 日能看到什么。D 当天披露的算已披露。
export function asOf(ev, D) {
  const evidence = (ev.evidence || []).filter((x) => disclosedOf(x) && disclosedOf(x) <= D)
    .sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));
  const ids = new Set(evidence.map((x) => x.id));
  const claims = (ev.claims || []).map((c) => {
    const all = c.versions || [];
    const seen = all.filter((v) => v.valid_from && v.valid_from <= D);
    const current = seen.find((v) => !v.valid_to || D < v.valid_to) || null;
    const voided = current && current.void_from && current.void_from <= D;
    return { key: c.key, unit: claimUnit(c), all, seen, current, voided };
  });
  const hist = (ev.status_history || []).filter((s) => s.at <= D);
  const status = hist.length ? hist[hist.length - 1] : null;
  const concl = (ev.conclusions || []).filter((c) => c.as_of <= D).sort((a, b) => (a.as_of < b.as_of ? -1 : 1));
  const conclusion = concl.length ? concl[concl.length - 1] : null;
  const conflicts = (ev.conflicts || []).filter((c) => {
    if (c.first_seen) return c.first_seen <= D;
    const ids2 = c.evidence_ids || (c.quotes || []).map((q) => q.evidence_id);
    return ids2.every((i) => ids.has(i));
  });
  const outdated = {};
  evidence.forEach((x) => {
    if (!x.outdated_by) return;
    const by = evidenceById(ev, x.outdated_by);
    const at = disclosedOf(by);
    if (at && at <= D) outdated[x.id] = { by, at, note: x.outdated_note };
  });
  const notifications = (ev.notifications || []).filter((n) => n.at <= D);
  return { D, evidence, ids, claims, status, hist, conclusion, conflicts, outdated, notifications };
}
export function sortKey(x) {
  const t = x.times || {};
  return (t.published_at || t.disclosed || '') + (x.src === 'ann' ? ' 1' : ' 0');
}

// 文本里的状态名：没有 status_history 时退回到事件级字段
export function statusText(ev, a) {
  if (a.status) return a.status.status;
  if (!a.evidence.length) return '尚未披露';
  // 没有状态历史时，只在事件级状态生效之后才用它，免得回放时显示未来的状态
  return ev.status && (!ev.status_since || ev.status_since <= a.D) ? ev.status : null;
}

// ---------- 来源 ----------
export function tierLabel(x, weights) {
  const t = x.source_tier;
  const w = weights && weights[t];
  return { tier: t || null, label: x.tier_note || (w && w.label) || null, weight: x.weight ?? (w && w.w) ?? null };
}
export const SRC_NAME = { ann: '公告', news: '新闻', anomaly: '异动解读', report: '研报', qa: '互动问答' };
export function docName(x) {
  if (!x) return '未知证据';
  if (x.doc_no) return /^临|公告/.test(x.doc_no) ? x.doc_no : '公告 ' + x.doc_no;
  if (x.src === 'ann' && x.title) return x.title.replace(/^.*?(关于|公司)/, '').slice(0, 12);
  return x.source || x.id;
}
export function timeLine(x) {
  const t = x.times || {};
  let s = t.published_at || t.disclosed || null;
  if (s && t.precision === '日' && s.length === 10) s += '（精确到日）';
  return s;
}
export function occurredText(o) {
  if (!o) return null;
  if (o.start && o.end) return o.start === o.end ? o.start : `${o.start} 至 ${o.end}`;
  if (has(o.date)) return o.date;
  return null;
}

// ---------- 行情 ----------
export function priceWindow(prices, marker, D) {
  if (!prices || !Array.isArray(prices.bars)) return [];
  const bars = prices.bars.filter((b) => !D || b.date <= D);
  const i = bars.findIndex((b) => b.date === marker.first_trading_day);
  if (i < 0) return [];
  return bars.slice(Math.max(0, i - 3), i + 4).filter((b) => Math.abs(dayDiff(b.date, marker.first_trading_day)) <= 20);
}

// ---------- 主题 ----------
export function initTheme(btn) {
  const root = document.documentElement;
  let saved = null;
  try { saved = localStorage.getItem('eet-theme'); } catch (e) { /* 隐私模式 */ }
  if (saved === 'light' || saved === 'dark') root.dataset.theme = saved;
  // 默认浅色（纸色），深色只作为可切换项
  const isDark = () => root.dataset.theme === 'dark';
  const label = () => { btn.textContent = isDark() ? '浅色' : '深色'; btn.setAttribute('aria-label', isDark() ? '切换到浅色' : '切换到深色'); };
  btn.addEventListener('click', () => {
    root.dataset.theme = isDark() ? 'light' : 'dark';
    try { localStorage.setItem('eet-theme', root.dataset.theme); } catch (e) { /* 忽略 */ }
    label();
  });
  label();
}

// ---------- 页面级错误 ----------
export function fatal(el, res, what = '事件数据') {
  el.innerHTML = `<div class="fatal" role="alert">
    <h2>${esc(what)}没有加载成功</h2>
    <p>文件：<code>${esc(res.path)}</code></p>
    <p>原因：${esc(res.error)}</p>
    <p>页面不会显示任何结论，免得把过期或空白的内容当成正常结果。</p>
  </div>`;
}

// 证据编号 → 可点的引用标记
export const ref = (id) => `<button class="ref" data-ref="${esc(id)}" type="button">${esc(id)}</button>`;
export const refs = (ids) => (ids && ids.length ? ids.map(ref).join('') : '');

// 证据的来源类型（给人看的）：公告 / 媒体转述 / 评论 / 推测 / 传闻
export function srcType(x) {
  if (!x) return '证据';
  if (x.kind === '传闻') return '传闻';
  if (x.src === 'ann') return '公告';
  if (x.kind === '观点') return '评论';
  if (x.kind === '推测' || x.src === 'anomaly') return '推测';
  if (x.src === 'news' && x.kind === '事实') return '媒体转述';
  return SRC_NAME[x.src] || '证据';
}
