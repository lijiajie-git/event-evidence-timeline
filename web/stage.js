// 演示页。第一屏：一条真实的旧消息，红笔批注它后来被改了几次；右边痛点表、亮点、不做。
// 演示区：电脑屏幕里是工作台整页（workbench.html?embed=full），框选讲到的那一块，点击处有提示圈并真的触发操作。
// 右边解说只用离线处理记录里的真实数字；例子都从数据里挑，不写死事件编号。
import { PATHS, load, esc, md, change, evidenceById, disclosedOf, today, docName, srcType, moneyText } from './core.js';
import { exampleSentences, verify, describe } from './verify.js';
import { renderHighlights, renderEvalSection, renderProcess, renderAudit } from './sections.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, reduce ? Math.min(ms, 60) : ms));
const cut = (s, n = 40) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const money = (v, unit, key) => moneyText(v, unit, key) || '没给数字';
const who = (t) => `<span class="who">${esc(t)}</span>`;
const SCREEN_W = 572, LOGICAL_W = 1120;
const S0 = SCREEN_W / LOGICAL_W;

let DATA, QA, AUDIT, REPORT, W, WB, CH = [];
const P = { ci: 0, bi: 0, mode: 'idle', token: 0, scripting: false };

// ---------------- 选例子 ----------------
function pickExpire() {
  let best = null;
  DATA.events.forEach((e) => (e.claims || []).forEach((c) => {
    const vs = (c.versions || []).filter((v) => v.low != null && v.high != null);
    const flip = vs.length > 1 && /转/.test(change(vs[0], vs[vs.length - 1]));
    const score = vs.length * 2 + (flip ? 1 : 0);
    if (!best || score > best.score) best = { e, c, vs, score };
  }));
  return best && best.vs.length > 1 ? best : null;
}

// ---------------- 第一屏 ----------------
function brief(px) {
  const auditN = AUDIT && AUDIT.summary ? AUDIT.summary.quotes_checked : null;
  const traps = REPORT && REPORT.traps && Array.isArray(REPORT.traps.cases) ? REPORT.traps.cases : [];
  const caught = traps.filter((t) => /拦住/.test(t.verdict || '') && !/放行|没拦住|未拦住/.test(t.verdict || '')).length;
  const sols = [
    ['消息会过期', '每个数字<b>保留各个版本</b>，标出哪天被哪份公告取代'],
    ['转述和原文对不上', '每句结论能<b>点回公告原文</b>，原句高亮'],
    ['观点的前提会失效', '前提被公告推翻的观点，<b>标出来</b>'],
    ['状态被说粗了', '<b>只按公告</b>认定状态，“未通过”和“终止”分开'],
    ['AI 的回答没法核对', '每句标<b>事实、推断、不确定</b>，引用逐字核对'],
  ];
  $('#sols').innerHTML = sols.map(([p, s]) => `<div class="sol" data-grow><span class="sol-p">${p}</span><i>→</i><span class="sol-s">${s}</span></div>`).join('');
  $('#hls').innerHTML = [
    ['核对', `${auditN != null ? auditN + ' 条' : '每条'}引用逐字回原文核对，对不上的不上线`],
    ['评测', `另一个模型独立标标准答案来评测${traps.length ? `；${traps.length} 个故意改坏数据的陷阱，管线拦住 ${caught} 个` : ''}`],
    ['回放', '可以回到任意一天，看当时的结论'],
  ].map(([k, v]) => `<div class="scp" data-grow><b>${k}</b><span>${esc(v)}</span></div>`).join('');
  $('#dur').textContent = `自动播放，约 ${Math.round(totalMs() / 1000)} 秒`;

  // 原件：最早那份公告里的两句，红笔批注后来的改动
  const paper = $('#paper');
  if (!px) { paper.innerHTML = '<p>没有可用的例子。</p>'; return; }
  const { e, c, vs } = px;
  const v1 = vs[0], ev1 = evidenceById(e, v1.evidence_id);
  const other = (e.claims || []).find((k) => k !== c && (k.versions || [])[0] && k.versions[0].evidence_id === v1.evidence_id && k.versions[0].quote);
  const tq = String(v1.quote || '');
  const m = tq.match(/-?[\d,，.]+万元(到|至)-?[\d,，.]+万元|-?[\d,，.]+(亿元|万元)/);
  const marked = m ? esc(tq.slice(0, m.index)) + `<span class="tgt" id="tgt">${esc(m[0])}</span>` + esc(tq.slice(m.index + m[0].length)) : esc(tq);
  const unit = c.unit || v1.unit;
  const notes = vs.slice(1).map((v, i) => {
    const last = i === vs.length - 2;
    const verb = /年报/.test(v.basis || '') && !last ? '年报' : i === 0 ? '改成' : last ? '再改' : '又改';
    return `<div class="off">${md(v.valid_from)} ${verb}：${last ? `<b>${esc(money(v, unit, c.key))}</b>，现在算这个` : esc(money(v, unit, c.key))}</div>`;
  }).join('');
  paper.innerHTML = `<button class="paper-skip" id="paper-skip" type="button">跳过批注</button>
    <div class="src">${esc(docName(ev1))} · ${esc(disclosedOf(ev1))} · ${esc(ev1.source || '')}</div>
    <h3>${esc(ev1.title || '')}</h3>
    ${other ? `<p>${esc(other.versions[0].quote)}</p>` : ''}
    <p>${marked}</p>
    <div class="notes" id="notes">${notes}</div>
    <svg class="paper-svg" id="pen"></svg>`;
  $('#paper-skip').onclick = () => drawPen(true);
}
let penDone = false;
async function drawPen(instant) {
  if (penDone && !instant) return;
  if (instant) penDone = true;
  const paper = $('#paper'), tgt = $('#tgt'), svg = $('#pen'), notes = $$('#notes > div');
  if (!tgt || !svg) return;
  const pr = paper.getBoundingClientRect(), r = tgt.getBoundingClientRect();
  const x = r.left - pr.left, y = r.top - pr.top, w = r.width, h = r.height;
  const cx = x + w / 2, cy = y + h / 2, rx = w / 2 + 10, ry = h / 2 + 5;
  // 手画的圈：起笔和收笔错开一点
  const circle = `M ${cx + rx * .2} ${cy - ry - 2} C ${cx + rx + 8} ${cy - ry}, ${cx + rx + 6} ${cy + ry + 2}, ${cx} ${cy + ry + 1} S ${cx - rx - 6} ${cy - ry + 3}, ${cx - rx * .1} ${cy - ry - 4}`;
  const nr = $('#notes').getBoundingClientRect();
  const lead = `M ${cx - 10} ${cy + ry + 2} C ${cx - 18} ${cy + ry + 20}, ${nr.left - pr.left + 4} ${nr.top - pr.top - 14}, ${nr.left - pr.left + 2} ${nr.top - pr.top + 2}`;
  if (!svg.childElementCount) svg.innerHTML = `<path pathLength="1" class="off" d="${circle}"/><path pathLength="1" class="off" d="${lead}"/>`;
  const paths = $$('path', svg);
  if (instant || reduce) { paths.forEach((p) => p.classList.remove('off')); notes.forEach((n) => n.classList.remove('off')); $$('[data-grow]').forEach((n) => n.classList.remove('off')); $('#paper-skip').classList.add('done'); return; }
  $$('[data-grow]').forEach((n) => n.classList.add('off'));
  await sleep(500); if (penDone) return;
  paths[0].classList.remove('off'); await sleep(750);
  paths[1].classList.remove('off'); await sleep(600);
  for (const n of notes) { if (penDone) return; n.classList.remove('off'); await sleep(650); }
  for (const n of $$('[data-grow]')) { if (penDone) return; n.classList.remove('off'); await sleep(110); }
  penDone = true; $('#paper-skip').classList.add('done');
}

// ---------------- 屏幕里的操作 ----------------
const D = () => W.document;
function el(sel) { return typeof sel === 'function' ? sel() : D().querySelector(sel); }
function rectOf(sel, pad = 6) {
  const e = el(sel); if (!e) return null;
  const r = e.getBoundingClientRect();
  const l = Math.max(0, r.left - pad), t = Math.max(0, r.top - pad), rr = Math.min(W.innerWidth, r.right + pad), b = Math.min(W.innerHeight, r.bottom + pad);
  if (b <= t || rr <= l) return null;
  return { x: l * S0, y: t * S0, w: (rr - l) * S0, h: (b - t) * S0 };
}
function spot(sel, pad) {
  const s = $('#spot'), r = sel ? rectOf(sel, pad) : null;
  if (!r) { s.classList.remove('on'); return; }
  Object.assign(s.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
  s.classList.add('on');
}
async function scrollTo(sel, offset = 90) {
  const e = el(sel); if (!e) return;
  const y = e.getBoundingClientRect().top + W.scrollY - offset;
  // 缩放后的 iframe 里浏览器自带的平滑滚动会被打断，这里自己逐帧滚
  const y0 = W.scrollY, y1 = Math.max(0, Math.min(y, D().documentElement.scrollHeight - W.innerHeight));
  if (reduce || Math.abs(y1 - y0) < 4) { W.scrollTo(0, y1); await sleep(60); return; }
  await new Promise((done) => { const t0 = performance.now(); const f = () => { const k = Math.min(1, (performance.now() - t0) / 520), e2 = 1 - Math.pow(1 - k, 3); W.scrollTo(0, y0 + (y1 - y0) * e2); k < 1 ? setTimeout(f, 16) : done(); }; f(); });
  await sleep(80);
}
async function tap(sel) {
  const e = el(sel); if (!e) return false;
  const r = e.getBoundingClientRect();
  const t = $('#tap');
  t.style.left = (r.left + r.width / 2) * S0 + 'px'; t.style.top = (r.top + r.height / 2) * S0 + 'px';
  t.classList.remove('go'); void t.offsetWidth; t.classList.add('go');
  await sleep(380);
  P.scripting = true; try { e.click(); } finally { P.scripting = false; }
  await sleep(380);
  return true;
}
async function type(sel, text) {
  const e = el(sel); if (!e) return;
  e.focus(); e.value = '';
  for (const ch of text) { e.value += ch; await sleep(55); }
}
// 一直点“下一次披露”，直到截至日到达目标（每一下都是真的点击）
async function stepTo(date, tok) {
  for (let i = 0; i < 12 && WB.state.D < date; i++) {
    if (tok !== P.token) return;
    if (!(await tap('#replay button:nth-of-type(2)'))) break;
    spot('#replay', 4);
    await sleep(120);
  }
}

// ---------------- 段落 ----------------
function chExpire(px) {
  if (!px) return null;
  const { e, c, vs } = px, unit = c.unit || vs[0].unit;
  const beats = vs.map((v, i) => ({
    ms: 3200,
    h: i === 0 ? '每个数字保留各个版本' : i === vs.length - 1 ? '新版出来，旧版变成前值' : '公司改了一次',
    rule: `${md(v.valid_from)} ${esc(docName(evidenceById(e, v.evidence_id)))}：${esc(c.key)} <b>${esc(money(v, unit, c.key))}</b>`,
    note: i === 0 ? `${who('模型离线')}从公告正文抽出这个数；原文逐字核对通过。` : `${who('规则')}把上一版标成前值，写明哪天被哪份公告取代，不删。`,
    run: async (tok) => {
      if (i === 0) { WB.go({ view: 'event', event: e.id, date: v.valid_from, top: true }); await sleep(200); await scrollTo('#s-chart', 70); }
      else { spot('#replay', 4); await stepTo(v.valid_from, tok); }
      spot('#s-chart', 4);
    },
  }));
  beats.push({
    ms: 4200, h: '现在算数的是哪一版，一句话说清',
    rule: `现在是 <b>${esc(money(vs[vs.length - 1], unit, c.key))}</b>`,
    note: `${who('模型离线')}按时点写结论，每版只用当天已披露的证据；这件事的结论写过 ${(e.conclusions || []).length} 版。`,
    run: async () => { await scrollTo('#s-concl', 80); spot('#s-concl .lead-main', 6); },
  });
  return { name: '消息会过期', beats };
}

function chRetell(px) {
  const beats = [];
  let best = null;
  DATA.events.forEach((e) => (e.conflicts || []).forEach((c) => {
    const tiers = (c.quotes || []).map((q) => (evidenceById(e, q.evidence_id) || {}).source_tier);
    const score = (tiers.includes('A') && tiers.some((t) => t && t !== 'A') ? 2 : 0) + (/数字|口径/.test(c.kind || '') ? 1 : 0) - (/状态/.test(c.kind || '') ? 2 : 0);
    if (!best || score > best.score) best = { e, c, score };
  }));
  if (best) {
    const { e, c } = best;
    const at = c.first_seen || (c.evidence_ids || []).map((id) => disclosedOf(evidenceById(e, id))).sort().pop();
    beats.push({ ms: 4600, h: '对不上的地方单列出来', rule: esc(cut(c.text, 64)), note: `${who('规则')}：低级别来源不能推翻高级别来源。${esc(cut(c.resolution || '', 40))}`,
      run: async () => { WB.go({ view: 'event', event: e.id, date: at, top: true }); await sleep(200); await scrollTo('#s-conflict', 70); spot('#s-conflict .cf', 4); } });
  }
  if (px) {
    const { e } = px;
    const a = AUDIT && AUDIT.summary ? AUDIT.summary : null;
    beats.push({ ms: 4600, h: '每句结论能点回公告原文', rule: '点右边栏的引用，打开公告正文，原句高亮',
      note: `${who('浏览器')}去掉空白后逐字定位。${a ? `${a.quotes_checked} 条引用都回原文核过，${a.quotes_passed} 条通过。` : ''}`,
      run: async () => { WB.go({ view: 'event', event: e.id, date: today(DATA), top: true }); await sleep(250); spot('.margin blockquote', 4); await sleep(500); await tap('.margin blockquote button'); await sleep(700); spot('.drawer mark.hit', 6); } });
    beats.push({ ms: 5200, h: '两版公告并排，只给改动加底色', rule: '更正公告和原公告逐句对照', note: `${who('浏览器')}逐句对比，整个数字算一个单位。`,
      run: async () => {
        if (!el('.drawer .dact button[data-diff-a]')) return;
        spot('.drawer .dact', 4); await sleep(400); await tap('.drawer .dact button[data-diff-a]'); await sleep(900);
        const row = () => [...D().querySelectorAll('.drawer .drow:not(.same)')].find((r) => !/证券代码|编号/.test(r.textContent) && [...r.querySelectorAll('mark')].some((mk) => /\d/.test(mk.textContent)));
        spot(row, 4);
        const r = row(); if (r) { const o = r.querySelector('.old mark.was'), n = r.querySelector('.new mark.now'); if (o && n) $('#s-rule').innerHTML = `<b>${esc(o.textContent)}</b> → <b>${esc(n.textContent)}</b>`; }
      } });
  }
  return beats.length ? { name: '转述对不上', beats } : null;
}

function chPremise() {
  let pick = null;
  DATA.events.forEach((e) => (e.evidence || []).forEach((x) => { if (!pick && x.outdated_by && evidenceById(e, x.outdated_by)) pick = { e, x, by: evidenceById(e, x.outdated_by) }; }));
  if (!pick) return null;
  const { e, x, by } = pick;
  return { name: '前提会失效', beats: [
    { ms: 4200, h: '观点先照常列出', rule: `${md(disclosedOf(x))} ${esc(x.source || '')}：“${esc(cut(x.quote || x.title, 20))}”`, note: `${who('模型离线')}标成“${esc(x.kind || '观点')}”，按规则权重 ${esc(x.weight ?? '—')}。`,
      run: async () => { WB.go({ view: 'event', event: e.id, date: disclosedOf(x), focus: x.id }); await sleep(350); spot('#ev-' + x.id, 4); } },
    { ms: 5200, h: '前提被公告推翻，标出来', rule: `${md(disclosedOf(by))} ${esc(docName(by))}：${esc(cut(by.summary || by.title, 26))}`, note: `${who('规则')}把那条观点标成“前提已不成立”，观点保留。`,
      run: async (tok) => {
        await scrollTo('#replay', 80); spot('#replay', 4); await stepTo(disclosedOf(by), tok);
        WB.go({ focus: x.id }); await sleep(350); spot('#ev-' + x.id, 4);
      } },
  ] };
}

function chStatus() {
  let pick = null;
  DATA.events.forEach((e) => {
    const h = e.status_history || [], codes = h.map((s) => s.code || '');
    const score = (codes.includes('未通过') && codes.includes('终止') ? 30 : 0) + h.length;
    if (h.length >= 3 && (!pick || score > pick.score)) pick = { e, h, score };
  });
  if (!pick) return null;
  const { e, h } = pick, tail = h.slice(-3);
  return { name: '状态说粗了', beats: tail.map((s, i) => ({
    ms: 3400, h: i === 0 ? '状态只按公告认定' : i === tail.length - 1 ? '到这一天才算终止' : '下一步还不是终止',
    rule: `${md(s.at)} <b>${esc(s.status)}</b>`, note: `依据 ${esc(docName(evidenceById(e, s.evidence_id)))}。${i === 0 ? '媒体的“否决”“被否”不改变状态。' : ''}`,
    run: async (tok) => {
      if (i === 0) { WB.go({ view: 'event', event: e.id, date: s.at, top: true }); await sleep(250); await scrollTo('#s-chart', 70); }
      else { spot('#replay', 4); await stepTo(s.at, tok); }
      spot('#s-chart', 4);
    } })) };
}

function chQA() {
  if (!QA || !QA.items.length) return null;
  const fut = (i) => (i.trace || []).flatMap((t) => t.excluded || []).filter((x) => /晚于|之后才/.test(x.reason || '')).length;
  const q = QA.items.slice().sort((a, b) => fut(b) - fut(a))[0];
  const no = QA.items.find((i) => (i.answer || []).some((x) => x.kind === '不回答'));
  const beats = [
    { ms: 5600, h: '每句标事实、推断、不确定', rule: `“${esc(cut(q.question, 26))}”`, note: `${who('模型离线')}生成，每句挂来源${fut(q) ? `；截至 ${esc(q.as_of)}，排除了 ${fut(q)} 份更晚的公告` : ''}。`,
      run: async () => { W.scrollTo(0, 0); spot('.tabs', 3); await tap('[data-view="qa"]'); await sleep(300); spot(`[data-qa="${q.id}"]`, 3); await tap(`[data-qa="${q.id}"]`); await sleep(500); spot('#answer', 4); } },
    { ms: 4600, h: '推理过程留了记录', rule: '用了哪些证据、排除了哪些、为什么', note: `${who('模型离线')}生成的记录，网页只读。`,
      run: async () => { spot('.trace summary', 3); await tap('.trace summary'); await sleep(400); await scrollTo('.trace', 120); spot('.trace', 4); } },
  ];
  if (no) beats.push({ ms: 4200, h: '买卖和涨跌不回答', rule: `“${esc(cut(no.question, 22))}”`, note: '只给已经披露的事实，并挂来源。',
    run: async () => { W.scrollTo(0, 0); spot(`[data-qa="${no.id}"]`, 3); await tap(`[data-qa="${no.id}"]`); await sleep(500); spot('#answer', 4); } });
  return { name: '回答可核对', beats };
}

function chVerify() {
  const ex = exampleSentences(DATA)[0];
  if (!ex) return null;
  const r = verify(ex, DATA);
  let res = '没有匹配到';
  if (r.verdict === 'match') { const m = r.matches[0]; const d = describe(m, today(DATA)); const by = m.v.superseded_by ? evidenceById(m.ev, m.v.superseded_by) : null; res = `第 ${d.n} 版，${md(m.v.valid_to)} 被 ${esc(docName(by))} 取代；现在是 <b>${esc(money(d.cur, m.claim.unit, m.claim.key))}</b>`; }
  return { name: '查一句话', beats: [
    { ms: 5600, h: '贴一句看到的话，查它是第几版', rule: res, note: `${who('浏览器')}读数字、换单位，和每一版比对；对不上就直说。`,
      run: async () => { W.scrollTo(0, 0); spot('.tabs', 3); await tap('[data-view="verify"]'); await sleep(300); spot('#vf', 4); await type('#vq', ex); await sleep(200); await tap('#vf button'); await sleep(450); spot('.vres', 4); } },
  ] };
}

// ---------------- 播放 ----------------
function totalMs() { return CH.reduce((s, c) => s + c.beats.reduce((t, b) => t + b.ms + 1800, 0), 0); }
function remainMs() { let ms = 0; CH.forEach((c, i) => c.beats.forEach((b, j) => { if (i > P.ci || (i === P.ci && j >= P.bi)) ms += b.ms + 1800; })); return ms; }
function narrate(c, b) {
  const s = $('#side'); s.classList.add('fade');
  setTimeout(() => { $('#s-tag').textContent = c.name; $('#s-h').textContent = b.h; $('#s-rule').innerHTML = b.rule; $('#s-note').innerHTML = b.note; s.classList.remove('fade'); }, reduce ? 0 : 200);
}
function rail() {
  $('#rail-steps').innerHTML = CH.map((c, i) => `<button data-ch="${i}" class="${i === P.ci ? 'is-on' : i < P.ci ? 'is-past' : ''}">${esc(c.name)}</button>`).join('');
  const total = CH.reduce((s, c) => s + c.beats.length, 0), done = CH.slice(0, P.ci).reduce((s, c) => s + c.beats.length, 0) + P.bi;
  $('#play-fill').style.width = (done / total * 100) + '%';
}
function setMode(m) {
  if (m) P.mode = m;
  $('#play').dataset.mode = P.mode;
  const s = Math.ceil(remainMs() / 1000);
  $('#mode').textContent = { auto: '自动播放中', paused: '已暂停', hand: '你在操作，演示已停', done: '演示结束', idle: '进入演示区后自动播放' }[P.mode];
  $('#remain').textContent = P.mode === 'auto' || P.mode === 'paused' ? `还剩 ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '';
  $('#play-act').textContent = P.mode === 'auto' ? '暂停' : P.mode === 'done' ? '重播' : P.mode === 'idle' ? '开始' : '继续';
}
async function show(ci, bi) {
  const tok = ++P.token;
  P.ci = ci; P.bi = bi;
  const c = CH[ci], b = c.beats[bi];
  narrate(c, b); rail(); setMode();
  try { await b.run(tok); } catch (err) { /* 屏幕里找不到元素时跳过这一拍 */ }
  if (tok !== P.token) return;
  if (P.mode === 'auto') { await sleep(b.ms); if (tok === P.token && P.mode === 'auto') advance(); }
}
function advance() {
  const c = CH[P.ci];
  if (P.bi + 1 < c.beats.length) show(P.ci, P.bi + 1);
  else if (P.ci + 1 < CH.length) show(P.ci + 1, 0);
  else finish();
}
function finish() {
  P.token++; setMode('done'); spot(null);
  $('#play-fill').style.width = '100%';
  $('#rail-steps').querySelectorAll('button').forEach((b) => { b.classList.remove('is-on'); b.classList.add('is-past'); });
  $('#s-tag').textContent = '演示结束'; $('#s-h').textContent = '屏幕里就是完整的工作台'; $('#s-rule').innerHTML = '可以直接在屏幕里点，或者全屏打开'; $('#s-note').innerHTML = '<a href="workbench.html" style="color:var(--amber)">打开工作台 →</a>';
  WB.go({ view: 'event', event: DATA.events[0].id, date: today(DATA), top: true });
  revealSections();
}
function start(fromStart) { setMode('auto'); show(fromStart ? 0 : P.ci, fromStart ? 0 : P.bi); }
function pause() { P.token++; setMode('paused'); }
let revealed = false;
function revealSections() {
  if (revealed) return; revealed = true;
  $$('.sec.later').forEach((s, i) => setTimeout(() => { s.classList.add('show'); countUp(s); }, reduce ? 0 : 250 + i * 350));
}
function countUp(sec) {
  if (sec.dataset.counted) return; sec.dataset.counted = '1';
  $$('.score td.p', sec).forEach((td) => {
    const txt = td.textContent.trim(), m = txt.match(/^(\d+(?:\.\d+)?)(%|\/\d+)?$/);
    if (!m || reduce) return;
    const target = parseFloat(m[1]), dec = (m[1].split('.')[1] || '').length, t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / 900), v = target * (1 - Math.pow(1 - k, 3)); td.textContent = v.toFixed(dec) + (m[2] || ''); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}

// ---------------- 你点一下：停下来，右边照实说这一步 ----------------
function onUser(a) {
  if (P.scripting) return;
  if (P.mode === 'auto') { P.token++; setMode('hand'); }
  spot(null);
  const e = a.event ? DATA.events.find((x) => x.id === a.event) : null;
  const t = {
    source: ['原文', '这句引用回原文核过', `${who('浏览器')}去掉空白后逐字定位`],
    diff: ['两版对比', '只给改动加底色', `${who('浏览器')}逐句对比`],
    date: ['回放', `截至 ${md(a.date)}`, `${who('浏览器')}只用那天及之前披露的证据；结论是${who('模型离线')}按时点写好的`],
    rev: ['结论改过几版', '每版只用当天已披露的证据', `${who('模型离线')}按时点写`],
    qa: ['问答', '每句挂了来源', `${who('模型离线')}生成，推理过程留了记录`],
    verify: ['查验', `“${esc(cut(a.text, 24))}”`, `${who('浏览器')}读数字、换单位、逐版比对`],
    ask: ['查验', `“${esc(cut(a.text, 24))}”`, `${who('浏览器')}先比数字，再找最接近的预置问题`],
    nav: ['工作台', e ? esc(cut(e.name + ' · ' + e.title, 28)) : '切换', `${who('模型离线')}判断哪些证据是同一件事`],
    view: ['工作台', '切换视图', '网页只读数据文件'],
    glossary: ['口径', '状态、类型、级别的意思', '固定口径'],
  }[a.type];
  if (!t) return;
  $('#s-tag').textContent = '你在操作'; $('#s-h').textContent = t[0]; $('#s-rule').innerHTML = t[1]; $('#s-note').innerHTML = t[2];
}

// ---------------- 电脑外框缩放 ----------------
function fit() {
  const box = $('#dev-box'), dev = $('#dev'), wrap = $('#dev-wrap');
  if (innerWidth <= 1000) { box.style.width = box.style.height = ''; dev.style.transform = ''; return; }
  const DW = 740, DH = 448;
  const r = wrap.getBoundingClientRect();
  const k = Math.max(.6, Math.min(r.width / DW, (r.height - 10) / DH, 1.9));
  box.style.width = DW * k + 'px'; box.style.height = DH * k + 'px';
  dev.style.transform = `scale(${k})`;
}

// ---------------- 启动 ----------------
async function init() {
  const [ev, qa, au, rp, pr, rc] = await Promise.all([load(PATHS.events), load(PATHS.qa), load(PATHS.audit), load(PATHS.report), load('data/process.json'), load(PATHS.recheck)]);
  AUDIT = au.ok ? au.data : null; REPORT = rp.ok ? rp.data : null;
  QA = qa.ok && qa.data && Array.isArray(qa.data.items) ? qa.data : null;
  renderProcess($('#ai-body'), pr);
  renderEvalSection($('#eval-body'), rp, ev.ok ? ev.data : null);
  $('#audit-body').innerHTML = au.ok ? renderAudit(au.data) : '<p class="absent">核查记录未生成</p>';
  if (!ev.ok || !ev.data || !Array.isArray(ev.data.events) || !ev.data.events.length) {
    $('#paper').innerHTML = `<p>事件数据没有加载成功：${esc(ev.path)}（${esc(ev.error || '')}）</p>`;
    $('#st-main').innerHTML = `<div class="fatal" role="alert"><h2>事件数据没有加载成功</h2><p>${esc(ev.path)}：${esc(ev.error || '文件里没有事件')}。演示不会用假数据顶替。</p></div>`;
    $$('.sec.later').forEach((s) => s.classList.add('show'));
    return;
  }
  DATA = ev.data;
  renderHighlights($('#flow'), { events: DATA, audit: au, recheck: rc, qa });
  const px = pickExpire();
  CH = [chExpire(px), chRetell(px), chPremise(), chStatus(), chQA(), chVerify()].filter(Boolean);
  brief(px);
  requestAnimationFrame(() => drawPen(false));

  const frame = $('#frame');
  await new Promise((r) => (frame.contentWindow && frame.contentWindow.WB ? r() : frame.addEventListener('load', r, { once: true })));
  W = frame.contentWindow; WB = W.WB;
  if (!WB || !(await WB.ready)) { $('#s-h').textContent = '屏幕里的工作台没有加载成功'; return; }
  ['pointerdown', 'keydown', 'wheel'].forEach((t) => W.document.addEventListener(t, () => { if (!P.scripting && P.mode === 'auto') { P.token++; setMode('hand'); spot(null); } }, { passive: true }));
  if (WB.onAction) WB.onAction(onUser);

  addEventListener('resize', fit); fit();
  rail(); setMode('idle');
  narrate(CH[0], { h: '演示会自己往下走', rule: '屏幕里是完整的工作台，讲到哪块就框出哪块', note: '在屏幕里点任何地方，演示就停下来交给你。' });
  $('#play').onclick = () => (P.mode === 'auto' ? pause() : P.mode === 'done' ? start(true) : start(P.mode === 'idle'));
  $('#go-demo').onclick = () => { $('#demo').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); setTimeout(() => { if (P.mode !== 'auto') start(P.mode === 'idle' || P.mode === 'done'); }, reduce ? 0 : 600); };
  $('#prev').onclick = () => { const was = P.mode; if (P.bi > 0) P.bi--; else if (P.ci > 0) { P.ci--; P.bi = 0; } setMode(was === 'auto' ? 'auto' : 'paused'); show(P.ci, P.bi); };
  $('#next').onclick = () => { const was = P.mode; if (P.ci + 1 < CH.length) { setMode(was === 'auto' ? 'auto' : 'paused'); show(P.ci + 1, 0); } else finish(); };
  $('#replay').onclick = () => start(true);
  $('#end-btn').onclick = () => finish();
  $('#rail-steps').onclick = (e2) => { const b = e2.target.closest('[data-ch]'); if (!b) return; setMode(P.mode === 'auto' ? 'auto' : 'paused'); show(+b.dataset.ch, 0); };
  setInterval(() => { if (P.mode === 'auto') setMode(); }, 1000);
  // 进入演示区自动开始一次
  const io = new IntersectionObserver((ents) => { if (ents.some((x) => x.isIntersecting) && P.mode === 'idle' && !reduce) { start(true); io.disconnect(); } }, { threshold: 0.6 });
  io.observe($('#demo'));
  // 没看演示直接往下滚的人，滚到哪节就显示哪节
  const io2 = new IntersectionObserver((ents) => ents.forEach((x) => { if (x.isIntersecting) { x.target.classList.add('show'); countUp(x.target); io2.unobserve(x.target); } }), { threshold: 0.15 });
  $$('.sec.later').forEach((s) => io2.observe(s));
  if (reduce) revealSections();
  // ?at=段.步：直接停在某一步（截图用）
  const at = (new URLSearchParams(location.search).get('at') || '').match(/^(\d+)\.(\d+)$/);
  if (at && CH[+at[1] - 1] && CH[+at[1] - 1].beats[+at[2] - 1]) {
    io.disconnect(); setMode('paused'); $('#demo').scrollIntoView();
    const ci = +at[1] - 1, bi = +at[2] - 1;
    for (let j = 0; j < bi; j++) { /* 让屏幕状态跟上：从这一段第一步依次跑到目标步 */ await CH[ci].beats[j].run(P.token); }
    show(ci, bi);
  }
}
init();
