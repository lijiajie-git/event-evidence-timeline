// 演示页：开场一张表讲痛点；舞台左边设备里是工作台（嵌入模式，只显示当前一块），右边每一步三行：
// 你看到什么、谁做的（规则 / 模型离线 / 浏览器）、核了什么。例子都从数据里挑，不写死事件编号。
import { PATHS, load, esc, md, change, evidenceById, disclosedOf, today, docName, asOf, srcType, human } from './core.js';
import { verify, describe, exampleSentences } from './verify.js';
import { loadText, locate, diffDocs, charDiff, norm } from './source.js';
import { renderHighlights, renderEvalSection, renderProcess, renderAudit } from './sections.js';

const $ = (s, r = document) => r.querySelector(s);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let DATA, QA, WB, CH = [], AUDIT = null, RECHECK = null, REPORT = null;
const P = { ci: 0, bi: 0, timer: null, mode: 'idle' };
const cut = (s, n = 46) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const isProfit = (k) => /利润|净利/.test(k);
function money(v, unit, key) {
  if (!v || (v.low == null && v.high == null)) return '没给数字';
  const lo = v.low ?? v.high, hi = v.high ?? v.low;
  if (unit === '%') return lo === hi ? `${lo}%` : `${lo}% 至 ${hi}%`;
  const A = Math.min(Math.abs(lo), Math.abs(hi)), Bv = Math.max(Math.abs(lo), Math.abs(hi));
  let body = A === Bv ? human(A, unit) : `${human(A, unit)}至 ${human(Bv, unit)}`;
  const m = body.match(/^(.*?) (亿|万)至 (.*) (亿|万)$/); if (m && m[2] === m[4]) body = `${m[1]} 至 ${m[3]} ${m[4]}`;
  if (unit === '万元') body += '元';
  return isProfit(key) ? `${(lo + hi) / 2 < 0 ? '亏损' : '盈利'} ${body}` : body;
}
const who = (t) => `<span class="who ${/模型/.test(t) ? 'model' : ''}">${esc(t)}</span>`;
const B = (see, how, check) => ({ see, how, check });

// ---------------- 主题：默认浅色，页脚可切 ----------------
function initStageTheme() {
  const btn = $('#theme'), root = document.documentElement;
  let saved = null; try { saved = localStorage.getItem('eet-theme'); } catch (e) { /* 忽略 */ }
  if (saved === 'dark') root.dataset.theme = 'dark';
  const label = () => { btn.textContent = root.dataset.theme === 'dark' ? '浅色' : '深色'; };
  btn.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    if (next === 'dark') root.dataset.theme = 'dark'; else delete root.dataset.theme;
    try { localStorage.setItem('eet-theme', next); } catch (e) { /* 忽略 */ }
    const doc = $('#ipad-frame').contentDocument; if (doc) { if (next === 'dark') doc.documentElement.dataset.theme = 'dark'; else delete doc.documentElement.dataset.theme; }
    label();
  });
  label();
}

// ---------------- 选例子 ----------------
function pickExpire() {
  let best = null;
  DATA.events.forEach((e) => (e.claims || []).forEach((c) => {
    const vs = (c.versions || []).filter((v) => v.low != null || v.high != null);
    const flip = vs.length > 1 && /转/.test(change(vs[0], vs[vs.length - 1]));
    const score = vs.length * 2 + (flip ? 1 : 0);
    if (!best || score > best.score) best = { e, c, vs, score };
  }));
  return best && best.vs.length > 1 ? best : null;
}

function hero(px) {
  if (!px) { $('#hero-table').innerHTML = ''; return; }
  const { e, c, vs } = px; const unit = c.unit || vs[0].unit;
  const short = (x) => (x && x.title ? cut(x.title.replace(/^.*?(公司|关于)/, '').replace(/^关于/, ''), 15) : docName(x));
  $('#hero-table').innerHTML = `<table class="vtable"><caption>${esc(e.name)}的${esc(c.key)}，前后 ${vs.length} 个版本</caption>
    <thead><tr><th>披露日</th><th>来源</th><th>${esc(c.key)}</th></tr></thead><tbody>
    ${vs.map((v) => `<tr><td>${md(v.valid_from)}</td><td class="s">${esc(short(evidenceById(e, v.evidence_id)))}</td><td class="v">${esc(money(v, unit, c.key))}</td></tr>`).join('')}
    </tbody></table>`;
}

function chExpire(px) {
  if (!px) return null;
  const { e, c, vs } = px; const unit = c.unit || vs[0].unit;
  const beats = vs.map((v, i) => {
    const x = evidenceById(e, v.evidence_id);
    return { ms: i === 0 ? 4200 : 3400, go: { view: 'event', event: e.id, date: v.valid_from, only: 'lede,chart' },
      ...B(`${md(v.valid_from)} ${esc(docName(x))}：${esc(c.key)} <b>${esc(money(v, unit, c.key))}</b>`,
        i === 0 ? `${who('模型离线')}从公告正文抽出这个数` : `${who('规则')}把上一版标成“前值”，不删`,
        v.quote ? `原文“${esc(cut(v.quote, 34))}”逐字匹配通过` : '这一版没有原文引用') };
  });
  const cs = (e.conclusions || []);
  beats.push({ ms: 5600, go: { view: 'event', event: e.id, date: today(DATA), only: 'lead' },
    ...B(`现在算数的是 <b>${esc(money(vs[vs.length - 1], unit, c.key))}</b>，旧的几版还在图上`, `${who('模型离线')}按时点写结论，每版只用当天已披露的证据`, `结论写过 ${cs.length} 版，拖动“截至”能看回任一天`) });
  return { id: 'expire', name: '消息会过期', title: '消息会过期，但没人告诉你', beats };
}

async function chRetell(px) {
  let best = null;
  DATA.events.forEach((e) => (e.conflicts || []).forEach((c) => {
    const tiers = (c.quotes || []).map((q) => (evidenceById(e, q.evidence_id) || {}).source_tier);
    const mixed = tiers.includes('A') && tiers.some((t) => t && t !== 'A');
    const score = (mixed ? 2 : 0) + (/数字|口径/.test(c.kind || '') ? 1 : 0) - (/状态/.test(c.kind || '') ? 2 : 0);
    if (!best || score > best.score) best = { e, c, score };
  }));
  const beats = [];
  if (best) {
    const { e, c } = best;
    const at = c.first_seen || (c.evidence_ids || []).map((id) => disclosedOf(evidenceById(e, id))).sort().pop();
    beats.push({ ms: 6200, go: { view: 'event', event: e.id, date: at, only: 'conflict' },
      ...B(esc(cut(c.text, 60)), `${who('规则')}：低级别来源不能推翻高级别来源`, esc(cut(c.resolution || '', 54))) });
  }
  if (px) {
    const { e, vs } = px; const v = vs[vs.length - 1]; const x = evidenceById(e, v.evidence_id);
    if (x && x.src === 'ann' && x.ref && v.quote) {
      const t = await loadText(x.ref); const sp = t.ok ? locate(t.paras, v.quote) : null;
      const s = AUDIT && AUDIT.summary;
      beats.push({ ms: 5600, go: { view: 'event', event: e.id, date: today(DATA), only: 'lead', source: { event: e.id, evidence: x.id, quote: v.quote } },
        ...B(`点任何一个数字，打开${esc(docName(x))}正文，原句标黄`, `${who('浏览器')}两边去掉空白后逐字定位${sp ? `，在第 ${sp[0].p + 1} 段` : ''}`, s ? `全部 ${esc(s.quotes_checked)} 条引用都回原文核过，${esc(s.quotes_passed)} 条通过` : '引用都回原文核过') });
    }
    const anns = (e.evidence || []).filter((y) => y.src === 'ann' && y.ref && y.relation && y.relation.target);
    let pair = null;
    for (const b of anns) {
      const a = evidenceById(e, b.relation.target); if (!a || a.src !== 'ann' || !a.ref) continue;
      const [ta, tb] = await Promise.all([loadText(a.ref), loadText(b.ref)]); if (!ta.ok || !tb.ok) continue;
      const df = diffDocs(ta.paras, tb.paras); if (!df || !df.edited) continue;
      const score = df.edited / (df.edited + df.added + df.removed);
      if (!pair || score > pair.score) pair = { a, b, df, score };
    }
    if (pair) {
      let ex = '';
      pair.df.rows.some((r) => { if (r.type !== 'change' || !r.a || !r.b || /证券代码|编号/.test(r.a + r.b)) return false; const [L, R] = charDiff(r.a, r.b); const o = L.filter(([t, ch]) => ch && /\d/.test(t)).map(([t]) => t.trim()).join(' '), n = R.filter(([t, ch]) => ch && /\d/.test(t)).map(([t]) => t.trim()).join(' '); if (o && n) { ex = `${o} → ${n}`; return true; } return false; });
      beats.push({ ms: 6400, go: { view: 'event', event: e.id, date: today(DATA), only: 'lead', diff: { event: e.id, a: pair.a.id, b: pair.b.id } },
        ...B(`${esc(docName(pair.a))}和${esc(docName(pair.b))}并排，只给改动加底色`, `${who('浏览器')}逐句对比，整个数字算一个单位`, `${pair.df.same} 句相同，改了 ${pair.df.edited} 句${ex ? `，比如 <b>${esc(cut(ex, 30))}</b>` : ''}`) });
    }
  }
  return beats.length ? { id: 'retell', name: '转述对不上', title: '二手转述和一手对不上，要能点回原文', beats } : null;
}

function chPremise() {
  let pick = null;
  DATA.events.forEach((e) => (e.evidence || []).forEach((x) => { if (!pick && x.outdated_by && evidenceById(e, x.outdated_by)) pick = { e, x, by: evidenceById(e, x.outdated_by) }; }));
  if (!pick) return null;
  const { e, x, by } = pick;
  return { id: 'premise', name: '前提会失效', title: '观点建立在会失效的前提上', beats: [
    { ms: 5000, go: { view: 'event', event: e.id, date: disclosedOf(x), only: 'evidence', focus: x.id },
      ...B(`${md(disclosedOf(x))} ${esc(x.source || '')}：“${esc(cut(x.quote || x.title, 24))}”`, `${who('模型离线')}把它标成“${esc(x.kind || '观点')}”，权重 ${esc(x.weight ?? '—')}`, '它默认交易会照计划推进') },
    { ms: 5800, go: { view: 'event', event: e.id, date: disclosedOf(by), only: 'evidence', focus: x.id },
      ...B(`${md(disclosedOf(by))} ${esc(docName(by))}：${esc(cut(by.summary || by.title, 30))}`, `${who('规则')}把那条观点标成“前提已不成立”，不删`, '回放到这天之前，它看起来还是一条正常的研报') },
  ] };
}

function chStatus() {
  let pick = null;
  DATA.events.forEach((e) => {
    const cs = (e.conflicts || []).filter((k) => /状态/.test(k.kind || ''));
    const media = (k) => (k.quotes || []).some((q) => { const y = evidenceById(e, q.evidence_id); return y && y.source_tier && y.source_tier !== 'A'; });
    const c = cs.find(media) || cs[0];
    const h = e.status_history || [];
    const codes = h.map((x) => x.code || '');
    const score = (c ? 10 : 0) + (c && media(c) ? 20 : 0) + (codes.includes('未通过') && codes.includes('终止') ? 30 : 0) + h.length;
    if (h.length >= 3 && (!pick || score > pick.score)) pick = { e, h, score, media: c && (c.quotes || []).map((q) => ({ q, y: evidenceById(e, q.evidence_id) })).find((o) => o.y && o.y.source_tier !== 'A') };
  });
  if (!pick) return null;
  const { e, h, media } = pick;
  const tail = h.slice(-3);
  const codes = h.map((x) => x.code || '');
  return { id: 'status', name: '状态说粗了', title: codes.includes('未通过') && codes.includes('终止') ? '“审核未通过”不等于“交易终止”' : '状态被说粗了', beats: tail.map((s, i) => ({
    ms: i === tail.length - 1 ? 5200 : 3800, go: { view: 'event', event: e.id, date: s.at, only: 'lede,chart' },
    ...B(`${md(s.at)} <b>${esc(s.status)}</b>`, `${who('规则')}：状态只按公司公告和交易所文件认定`,
      i === 0 && media ? `同一天媒体标题已经写“${esc(cut(media.q.quote, 16))}”` : `依据 ${esc(docName(evidenceById(e, s.evidence_id)))}`) })) };
}

function chQA() {
  if (!QA || !QA.items.length) return { id: 'qa', name: '摘要能核对', title: 'AI 的回答要能逐句核对', beats: [{ ms: 5000, go: { view: 'qa' }, ...B('预置问答还没有生成', '—', `<code>${esc(PATHS.qa)}</code> 不存在`) }] };
  const fut = (i) => (i.trace || []).flatMap((t) => t.excluded || []).filter((x) => /晚于|之后才/.test(x.reason || '')).length;
  const q = QA.items.slice().sort((a, b) => fut(b) - fut(a))[0];
  const no = QA.items.find((i) => (i.answer || []).some((x) => x.kind === '不回答'));
  const kinds = {}; (q.answer || []).forEach((s) => (kinds[s.kind] = (kinds[s.kind] || 0) + 1));
  const beats = [{ ms: 6400, go: { view: 'qa', qa: q.id, openTrace: true, only: 'answer' },
    ...B(`“${esc(cut(q.question, 26))}”`, `${who('模型离线')}回答，每句标${Object.keys(kinds).map(esc).join('、')}并挂来源`, fut(q) ? `截至 ${esc(q.as_of)}，排除了 ${fut(q)} 份更晚的公告` : '每句都过了证据和时间检查') }];
  if (no) beats.push({ ms: 5200, go: { view: 'qa', qa: no.id, openTrace: false, only: 'answer' }, ...B(`“${esc(cut(no.question, 26))}”`, '买卖和涨跌类问题不回答', '只给已经披露的事实，并挂来源') });
  return { id: 'qa', name: '摘要能核对', title: 'AI 的回答要能逐句核对', beats };
}

function chVerify() {
  const ex = exampleSentences(DATA)[0];
  if (!ex) return null;
  const r = verify(ex, DATA);
  let res = '没有匹配到';
  if (r.verdict === 'match') { const m = r.matches[0]; const d = describe(m, today(DATA)); const by = m.v.superseded_by ? evidenceById(m.ev, m.v.superseded_by) : null; res = `第 ${d.n} 版${d.isCurrent ? '，仍然有效' : `，${md(m.v.valid_to)} 被${esc(docName(by))}取代；现在是 <b>${esc(money(d.cur, m.claim.unit, m.claim.key))}</b>`}`; }
  return { id: 'verify', name: '查一句话', title: '贴一句看到的话，看它还算不算数', beats: [{ ms: 7000, go: { view: 'verify', verify: ex, only: null }, ...B(`“${esc(ex)}”`, `${who('浏览器')}读数字、换单位，和每一版比对`, res) }] };
}

// ---------------- 播放 ----------------
const total = () => CH.reduce((s, c) => s + c.beats.length, 0);
const index = () => CH.slice(0, P.ci).reduce((s, c) => s + c.beats.length, 0) + P.bi;
const three = (b) => `<div><dt>你看到</dt><dd>${b.see}</dd></div><div><dt>谁做的</dt><dd>${b.how}</dd></div><div><dt>核了什么</dt><dd>${b.check}</dd></div>`;
function paint(b, c) {
  $('#ch').textContent = `${P.ci + 1} / ${CH.length}`;
  $('#ai-title').textContent = c.title;
  $('#three').innerHTML = three(b);
  $('#ch-name').innerHTML = `<small>${P.ci + 1} / ${CH.length}</small>${esc(c.name)}`;
  $('#prog').style.width = ((index() + 1) / total() * 100) + '%';
}
function setMode() {
  $('#play').textContent = P.mode === 'auto' ? '暂停' : P.mode === 'done' ? '重播' : '播放';
  $('#prev').disabled = P.ci === 0 && P.bi === 0;
  $('#next').disabled = P.ci >= CH.length - 1;
  $('#hint').textContent = P.mode === 'hand' ? '你在操作，演示已停。点“播放”接着看。' : P.mode === 'done' ? '演示结束。左边可以随便点，右边会讲这一步是怎么来的。' : '';
}
function show(ci, bi) {
  P.ci = ci; P.bi = bi;
  const c = CH[ci], b = c.beats[bi];
  if (b.go && WB) WB.go(b.go);
  paint(b, c); setMode();
}
function schedule() { clearTimeout(P.timer); if (P.mode === 'auto') P.timer = setTimeout(advance, CH[P.ci].beats[P.bi].ms); }
function advance() {
  const c = CH[P.ci];
  if (P.bi + 1 < c.beats.length) show(P.ci, P.bi + 1);
  else if (P.ci + 1 < CH.length) show(P.ci + 1, 0);
  else { P.mode = 'done'; setMode(); if (WB) WB.go({ view: 'event', event: DATA.events[0].id, date: today(DATA), only: null, top: true }); return; }
  schedule();
}
function stop(mode) { clearTimeout(P.timer); P.mode = mode; setMode(); }

// ---------------- 你点一下，右边三行讲这一步 ----------------
const metric = (name) => { const fp = REPORT && REPORT.first_pass && REPORT.first_pass.summary && REPORT.first_pass.summary[name]; return fp && fp.den > 0 ? `首次抽取 ${fp.num}/${fp.den}` : null; };
async function explain(a) {
  const e = a.event ? DATA.events.find((x) => x.id === a.event) : null;
  if (a.type === 'source' || (a.type === 'nav' && a.focus)) {
    const x = e && evidenceById(e, a.evidence || a.focus); if (!x) return null;
    const q = a.quote || x.quote || '';
    const checks = AUDIT && Array.isArray(AUDIT.checks) ? AUDIT.checks.filter((c) => c.event_id === e.id && c.evidence_id === x.id) : [];
    const hit = checks.find((c) => norm(c.quote) === norm(q)) || checks[0];
    const rc = RECHECK && Array.isArray(RECHECK.items) ? RECHECK.items.find((r) => r.event_id === e.id && r.evidence_id === x.id) : null;
    return { title: `${srcType(x)} · ${docName(x)}`, ...B(`“${esc(cut(q, 40))}”`, `${who('模型离线')}抽出这句；${who('规则')}定为 ${esc(x.source_tier || '?')} 级`, `${hit ? (hit.pass ? '逐字回原文核过，通过' : '逐字核对未通过') : '没有单独的核查记录'}${rc ? `；重抓比对正文${rc.changed ? '有变化' : '未变'}` : ''}`) };
  }
  if (a.type === 'diff') {
    const A = e && evidenceById(e, a.a), Bb = e && evidenceById(e, a.b); if (!A || !Bb) return null;
    const [ta, tb] = await Promise.all([loadText(A.ref), loadText(Bb.ref)]);
    const df = ta.ok && tb.ok ? diffDocs(ta.paras, tb.paras) : null;
    return { title: '两版公告对比', ...B(`${esc(docName(A))} → ${esc(docName(Bb))}`, `${who('浏览器')}逐句对比`, df ? `${df.same} 句相同，改了 ${df.edited} 句，增 ${df.added} 删 ${df.removed}` : '正文没读到') };
  }
  if (a.type === 'date' || a.type === 'rev') {
    if (!e) return null;
    const s = asOf(e, a.date || today(DATA)); const later = (e.evidence || []).length - s.evidence.length;
    const m = metric('回放未用到未来证据');
    return { title: `回放到 ${md(a.date)}`, ...B(`只看 ${md(a.date)} 及之前的 ${s.evidence.length} 条证据${later ? `，之后 ${later} 条不参与` : ''}`, `${who('浏览器')}按日期筛；结论是${who('模型离线')}按时点写好的`, `结论不引用截至日之后的证据${m ? `（${m}）` : ''}`) };
  }
  if (a.type === 'qa') {
    const q = QA && QA.items.find((i) => i.id === a.id); if (!q) return null;
    const ex = (q.trace || []).flatMap((t) => t.excluded || []);
    return { title: cut(q.question, 30), ...B(`截至 ${esc(q.as_of || '—')} 的回答，${(q.answer || []).length} 句`, `${who('模型离线')}生成，${(q.trace || []).length} 步留了记录`, ex.length ? `排除了 ${ex.length} 条证据，原因都写在记录里` : '每句都挂了来源') };
  }
  if (a.type === 'verify' || a.type === 'ask') {
    const r = verify(a.text || '', DATA);
    return { title: '消息查验', ...B(`“${esc(cut(a.text, 30))}”`, `${who('浏览器')}读数字、换单位、逐版比对`, r.verdict === 'match' ? `对上了 ${r.matches.length} 处` : r.verdict === 'no-number' ? '没读到带单位的数字' : '没有匹配到，直说') };
  }
  if (a.type === 'nav' && e) {
    const m = metric('该合并的合并了');
    return { title: e.name, ...B(esc(cut(e.title, 34)), `${who('模型离线')}判断这些证据是同一件事`, m ? `合并判断：${m}` : '合并理由写在页面上') };
  }
  if (a.type === 'glossary') return { title: '口径说明', ...B('状态、类型、级别的意思', '固定口径', '页面上的词都按这里用') };
  return null;
}
let tok = 0;
async function onUser(a) {
  const t = ++tok;
  if (P.mode === 'auto') stop('hand'); else if (P.mode !== 'hand') { P.mode = 'hand'; setMode(); }
  const x = await explain(a);
  if (!x || t !== tok) return;
  $('#ch').textContent = '你在操作';
  $('#ai-title').textContent = x.title;
  $('#three').innerHTML = three(x);
}

// ---------------- 设备缩放 ----------------
function fit() {
  const box = $('#ipad-box'), dev = $('#ipad');
  if (innerWidth <= 1000) { box.style.width = box.style.height = ''; dev.style.transform = ''; return; }
  const W = 860 + 26, H = 620 + 26;
  const g = $('.st-grid').getBoundingClientRect();
  const s = Math.max(.5, Math.min(1, (g.height - 40) / H, (Math.min(innerWidth, 1440) - 2 * Math.max(16, innerWidth * .03) - 48 - 330) / W));
  box.style.width = W * s + 'px'; box.style.height = H * s + 'px'; dev.style.transform = `scale(${s})`;
}

// ---------------- 启动 ----------------
async function init() {
  initStageTheme();
  const [rp, pr, au, rc, ev, qa] = await Promise.all([load(PATHS.report), load('data/process.json'), load(PATHS.audit), load(PATHS.recheck), load(PATHS.events), load(PATHS.qa)]);
  REPORT = rp.ok ? rp.data : null; AUDIT = au.ok ? au.data : null; RECHECK = rc.ok ? rc.data : null;
  QA = qa.ok && qa.data && Array.isArray(qa.data.items) ? qa.data : null;
  renderProcess($('#ai-body'), pr);
  renderEvalSection($('#eval-body'), rp, ev.ok ? ev.data : null);
  $('#audit-body').innerHTML = au.ok ? renderAudit(au.data) : `<p class="absent">核查记录未生成：<code>${esc(PATHS.audit)}</code></p>`;
  if (!ev.ok || !ev.data || !Array.isArray(ev.data.events) || !ev.data.events.length) {
    const r = ev.ok ? { path: ev.path, error: '文件里没有事件' } : ev;
    $('#stage').innerHTML = `<div class="fatal" role="alert"><h2>事件数据没有加载成功</h2><p>文件：<code>${esc(r.path)}</code></p><p>原因：${esc(r.error)}</p><p>演示不会用假数据顶替。</p></div>`;
    $('#stage').style.display = 'block'; $('.rail').hidden = true; $('#hero-table').innerHTML = ''; $('#flow').innerHTML = '';
    return;
  }
  DATA = ev.data;
  renderHighlights($('#flow'), { events: DATA, audit: au, recheck: rc, qa });
  const px = pickExpire();
  hero(px);
  CH = [chExpire(px), await chRetell(px), chPremise(), chStatus(), chQA(), chVerify()].filter(Boolean);

  const frame = $('#ipad-frame');
  await new Promise((r) => (frame.contentWindow && frame.contentWindow.WB ? r() : frame.addEventListener('load', r, { once: true })));
  WB = frame.contentWindow.WB;
  if (!WB || !(await WB.ready)) { $('#ai-title').textContent = '设备里的工作台没有加载成功'; return; }
  try { if (localStorage.getItem('eet-theme') === 'dark') frame.contentDocument.documentElement.dataset.theme = 'dark'; } catch (e) { /* 忽略 */ }
  const hand = () => { if (P.mode === 'auto') stop('hand'); };
  ['pointerdown', 'keydown', 'wheel'].forEach((t) => frame.contentDocument.addEventListener(t, hand, { passive: true }));
  if (WB.onAction) WB.onAction((a) => onUser(a));
  $('#prev').addEventListener('click', () => { const was = P.mode; stop('paused'); if (P.bi > 0) show(P.ci, P.bi - 1); else if (P.ci > 0) show(P.ci - 1, 0); if (was === 'auto') { P.mode = 'auto'; setMode(); schedule(); } });
  $('#next').addEventListener('click', () => { const was = P.mode; stop('paused'); if (P.ci + 1 < CH.length) show(P.ci + 1, 0); if (was === 'auto') { P.mode = 'auto'; setMode(); schedule(); } });
  $('#play').addEventListener('click', () => {
    if (P.mode === 'auto') stop('paused');
    else if (P.mode === 'done') { P.mode = 'auto'; show(0, 0); schedule(); }
    else { P.mode = 'auto'; show(P.ci, P.bi); schedule(); }
  });
  addEventListener('resize', fit); fit();
  show(0, 0); stop('paused');
  // ?at=段.步 直接停在某一步（截图、分享用）
  const at = (new URLSearchParams(location.search).get('at') || '').match(/^(\d+)\.(\d+)$/);
  if (at && CH[+at[1] - 1] && CH[+at[1] - 1].beats[+at[2] - 1]) { show(+at[1] - 1, +at[2] - 1); if (!new URLSearchParams(location.search).has('ns')) { document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, $('#demo').getBoundingClientRect().top + scrollY - 52); } return; }
  if (reduce) return;
  // 进入演示区再自动播放
  const io = new IntersectionObserver((ents) => { if (ents.some((x) => x.isIntersecting) && P.mode === 'paused' && P.ci === 0 && P.bi === 0) { P.mode = 'auto'; show(0, 0); schedule(); io.disconnect(); } }, { threshold: 0.55 });
  io.observe($('#demo'));
}
init();
