// 演示页。第一屏：一条真实的旧消息，蓝笔批注它后来被改了几次；右边痛点表。
// 演示区：电脑屏幕里是工作台整页（workbench.html?embed=full）。顺序按一次使用走：
// 贴一句旧消息 → 查出是第几版 → 看各版本 → 点回原文 → 两版对比 → 回到某一天 → 问一句 → 另外几个例子 → 小结。
// 讲到哪块，镜头推到哪块；指针真的去点按钮。右边解说只用数据里的真实数字；例子从数据里挑，不写死事件编号。
import { PATHS, load, esc, md, change, evidenceById, disclosedOf, today, docName, moneyText } from './core.js';
import { exampleSentences, verify, describe } from './verify.js';
import { renderHighlights, renderEvalSection, renderProcess, renderAudit } from './sections.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, reduce ? Math.min(ms, 60) : ms));
const cut = (s, n = 40) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const money = (v, unit, key) => moneyText(v, unit, key) || '没给数字';
const who = (t) => `<span class="who">${esc(t)}</span>`;
const plain = (h) => String(h || '').replace(/<[^>]+>/g, '');
const mobile = () => innerWidth <= 1000;
// 屏幕里 1 个 CSS 像素在屏幕坐标里是多少：电脑外框里缩到 572/1120，手机上不缩
const S = () => (mobile() ? 1 : 572 / 1120);

let DATA, QA, AUDIT, REPORT, W, WB, CH = [];
const P = { ci: 0, bi: 0, mode: 'idle', token: 0, scripting: false };
const CAM = { K: 1, ox: 0, oy: 0 };

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
const sign = (v) => Math.sign((v.low ?? 0) + (v.high ?? 0));
const flipOf = (px) => px.vs.find((v) => sign(v) !== sign(px.vs[0])) || px.vs[1];
const ctxOf = (e) => `${e.name} · ${cut(e.title, 18)}`;

// ---------------- 第一屏 ----------------
function brief(px) {
  const auditN = AUDIT && AUDIT.summary ? AUDIT.summary.quotes_checked : null;
  const traps = REPORT && REPORT.traps && Array.isArray(REPORT.traps.cases) ? REPORT.traps.cases : [];
  const caught = traps.filter((t) => /拦住/.test(t.verdict || '') && !/放行|没拦住|未拦住/.test(t.verdict || '')).length;
  const sols = [
    ['消息会过期', '每个数字保留各个版本，标出哪天被哪份公告取代'],
    ['转述和原文对不上', '每句结论能点回公告原文，原句高亮'],
    ['观点的前提会失效', '前提被公告推翻的观点，标出来'],
    ['状态被说粗了', '只按公告认定状态，“未通过”和“终止”分开'],
    ['AI 的回答没法核对', '每句标事实、推断、不确定，引用逐字核对'],
  ];
  $('#sols').innerHTML = `<thead><tr><th>问题</th><th>这里怎么做</th></tr></thead><tbody>${sols.map(([p, s]) => `<tr data-grow><td>${p}</td><td>${s}</td></tr>`).join('')}</tbody>`;
  const hl = [
    `${auditN != null ? auditN + ' 条' : '每条'}引用逐字回原文核过`,
    traps.length ? `${traps.length} 个改坏数据的陷阱拦住 ${caught} 个` : '',
    '可回到任意一天看当时的结论',
  ].filter(Boolean);
  $('#hls').innerHTML = `<p data-grow>${hl.map(esc).join('；')}。</p><p data-grow class="nodo">不预测涨跌，不给买卖建议，网页不实时调用模型。</p>`;

  // 原件：最早那份公告里的两句，蓝笔批注后来的改动
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
  const r = e.getBoundingClientRect(), s = S();
  const l = Math.max(0, r.left - pad), t = Math.max(0, r.top - pad), rr = Math.min(W.innerWidth, r.right + pad), b = Math.min(W.innerHeight, r.bottom + pad);
  if (b <= t || rr <= l) return null;
  return { x: l * s, y: t * s, w: (rr - l) * s, h: (b - t) * s };
}
// 框选：只压暗周围，墨蓝细线；镜头跟着推过去
function spot(sel, pad, cam = true) {
  const s = $('#spot'), r = sel ? rectOf(sel, pad) : null;
  if (!r) { s.classList.remove('on'); if (cam) camera(null); return; }
  Object.assign(s.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
  s.classList.add('on');
  if (cam) camera(r);
}
// 镜头：整台电脑放大并平移，让框选的那块落在画面中间。手机上不推。
function camera(r) {
  const box = $('#dev-box'), wrap = $('#dev-wrap');
  if (mobile() || !r) { box.style.transform = ''; return; }
  const W0 = wrap.clientWidth, H0 = wrap.clientHeight, bx = box.offsetLeft, by = box.offsetTop, K = CAM.K;
  const X = CAM.ox + r.x * K, Y = CAM.oy + r.y * K, w = r.w * K, h = r.h * K;
  const Z = Math.max(1, Math.min(1.9, (W0 * .94) / w, (H0 * .88) / h));
  if (Z < 1.08) { box.style.transform = ''; return; }
  const sw = 572 * K, sh = 356 * K;
  const fit = (C0, b, x, ww, o, len) => {
    let t = C0 / 2 - b - Z * (x + ww / 2);
    if (Z * len >= C0) t = Math.min(-b - Z * o, Math.max(C0 - b - Z * (o + len), t));
    else t = C0 / 2 - b - Z * (o + len / 2);
    return t;
  };
  const tx = fit(W0, bx, X, w, CAM.ox, sw), ty = fit(H0, by, Y, h, CAM.oy, sh);
  box.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${Z.toFixed(3)})`;
}
const CAM_MS = 900;
async function scrollTo(sel, offset = 90) {
  const e = el(sel); if (!e) return;
  const y = e.getBoundingClientRect().top + W.scrollY - offset;
  // 缩放后的 iframe 里浏览器自带的平滑滚动会被打断，这里自己逐帧滚
  const y0 = W.scrollY, y1 = Math.max(0, Math.min(y, D().documentElement.scrollHeight - W.innerHeight));
  if (reduce || Math.abs(y1 - y0) < 4) { W.scrollTo(0, y1); await sleep(60); return; }
  await new Promise((done) => { const t0 = performance.now(); const f = () => { const k = Math.min(1, (performance.now() - t0) / 520), e2 = 1 - Math.pow(1 - k, 3); W.scrollTo(0, y0 + (y1 - y0) * e2); k < 1 ? setTimeout(f, 16) : done(); }; f(); });
  await sleep(80);
}
// 指针：左右用先快后慢、上下用先慢后快，走出来是一段弧线
function ptr(x, y, show = true) {
  const p = $('#ptr');
  if (x != null) { p.style.left = x + 'px'; p.style.top = y + 'px'; }
  p.classList.toggle('on', show);
}
async function moveTo(e) {
  const r = e.getBoundingClientRect(), s = S();
  ptr((r.left + Math.min(r.width / 2, 40)) * s, (r.top + r.height / 2) * s);
  await sleep(660);
}
async function press(x, y) {
  const p = $('#ptr'), t = $('#tap');
  p.classList.add('down');
  t.style.left = x + 'px'; t.style.top = y + 'px';
  t.classList.remove('go'); void t.offsetWidth; t.classList.add('go');
  await sleep(140); p.classList.remove('down');
}
async function tap(sel) {
  const e = el(sel); if (!e) return false;
  await moveTo(e);
  const p = $('#ptr');
  await press(parseFloat(p.style.left), parseFloat(p.style.top));
  P.scripting = true; try { e.click(); } finally { P.scripting = false; }
  await sleep(320);
  return true;
}
async function type(sel, text) {
  const e = el(sel); if (!e) return;
  await tap(sel);
  e.focus(); e.value = '';
  for (const ch of text) { e.value += ch; await sleep(42); }
}
// 一直点“下一次披露”，直到截至日到达目标。框选不动，指针来回点
async function stepTo(date, tok) {
  for (let i = 0; i < 12 && WB.state.D < date; i++) {
    if (tok !== P.token) return;
    if (!(await tap('#replay button[aria-label="下一次披露"]'))) break;
    await sleep(260);
  }
}
// 拖着时间轴上的竖线回到某一天：用现在的竖线位置和一次试探算出日期和横坐标的比例，再分几步拖过去
const dnum = (d) => Date.parse(d + 'T00:00:00Z') / 864e5;
function curX() { const l = D().querySelector('#lanes .cursor'); return l ? +l.getAttribute('x1') : null; }
function pickAt(clientX) {
  const svg = D().querySelector('#lanes svg'); if (!svg) return;
  const r = svg.getBoundingClientRect();
  P.scripting = true;
  try { svg.dispatchEvent(new W.PointerEvent('pointerdown', { clientX, clientY: r.top + 30, pointerId: 1, bubbles: true })); svg.dispatchEvent(new W.PointerEvent('pointerup', { clientX, clientY: r.top + 30, pointerId: 1, bubbles: true })); }
  finally { P.scripting = false; }
}
async function dragTo(date, tok) {
  const svg0 = D().querySelector('#lanes svg'); if (!svg0) return;
  const toClient = (svg, x) => { const r = svg.getBoundingClientRect(); return r.left + x * (r.width / svg.viewBox.baseVal.width); };
  const x1 = curX(), d1 = WB.state.D;
  pickAt(toClient(svg0, x1 - 120));
  const x2 = curX(), d2 = WB.state.D;
  const k = (x1 - x2) / ((dnum(d1) - dnum(d2)) || 1), xt = x1 + (dnum(date) - dnum(d1)) * k;
  pickAt(toClient(D().querySelector('#lanes svg'), x1));
  const svg = D().querySelector('#lanes svg'), r = svg.getBoundingClientRect(), s = S(), y = r.top + 26;
  const cx0 = toClient(svg, x1), cx1 = toClient(svg, xt);
  ptr(cx0 * s, y * s); await sleep(660); if (tok !== P.token) return;
  await press(cx0 * s, y * s);
  $('#ptr').classList.add('drag');
  const n = reduce ? 1 : 14;
  for (let i = 1; i <= n; i++) {
    if (tok !== P.token) break;
    const t = i / n, e2 = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2, cx = cx0 + (cx1 - cx0) * e2;
    ptr(cx * s, y * s); pickAt(cx); await sleep(70);
  }
  $('#ptr').classList.remove('drag');
  if (WB.state.D !== date) { P.scripting = true; WB.go({ date }); P.scripting = false; }
}
// 新数字从图表那一格飞到右栏
function flyFrom(srcEl, dst) {
  if (!srcEl || !dst || reduce || mobile()) return;
  const fr = $('#frame').getBoundingClientRect(), s = fr.width / W.innerWidth, a = srcEl.getBoundingClientRect(), b = dst.getBoundingClientRect();
  if (!a.width || !b.width) return;
  const x0 = fr.left + a.left * s, y0 = fr.top + a.top * s, h0 = a.height * s;
  const f = document.createElement('div');
  f.className = 'fly'; f.innerHTML = dst.innerHTML;
  const fs = parseFloat(getComputedStyle(dst).fontSize);
  Object.assign(f.style, { left: b.left + 'px', top: b.top + 'px', fontSize: fs + 'px' });
  document.body.appendChild(f);
  const sc = Math.max(.35, Math.min(1, h0 / b.height));
  dst.classList.add('landing');
  const dx = x0 - b.left, dy = y0 - b.top;
  const an = f.animate([
    { transform: `translate(${dx}px, ${dy}px) scale(${sc})`, opacity: .2 },
    { transform: `translate(${dx * .45}px, ${dy * .45 - 46}px) scale(${(sc + 1) / 2})`, opacity: 1, offset: .5 },
    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
  ], { duration: 720, easing: 'cubic-bezier(.4, 0, .2, 1)' });
  an.onfinish = () => { f.remove(); dst.classList.remove('landing'); };
}
const segOf = (v) => () => [...D().querySelectorAll('#lanes g.seg')].find((g) => g.dataset.src === v.evidence_id && g.dataset.q === (v.quote || ''));
const segLabel = (v) => () => { const g = segOf(v)(); return g && (g.querySelector('text') || g.querySelector('rect')); };

// ---------------- 段落 ----------------
function chCheck(px, ex, res) {
  return { name: '查一句话', beats: [{
    ctx: px.e, act: 3600, h: '贴一句看到的消息，查它是第几版', rule: res, note: `${who('浏览器')}读数字、换单位，和收录的每一版比对。`,
    run: async () => {
      P.scripting = true; WB.go({ view: 'event', event: px.e.id, date: today(DATA), top: true }); P.scripting = false;
      W.scrollTo(0, 0); spot(null); ptr(300, 260, true); await sleep(300);
      await tap('[data-view="verify"]'); await sleep(250);
      spot('#vf', 8); await sleep(CAM_MS);
      await type('#vq', ex); await sleep(150); await tap('#vf button'); await sleep(350);
      spot('.vres', 6);
    } }] };
}

function chVersions(px) {
  const { e, c, vs } = px, unit = c.unit || vs[0].unit;
  const v1 = vs[0], flip = vs.find((v) => sign(v) !== sign(v1)) || vs[1], cur = vs[vs.length - 1];
  const val = (v) => `<b>${esc(money(v, unit, c.key))}</b>`;
  const line = (v) => `${md(v.valid_from)} ${esc(docName(evidenceById(e, v.evidence_id)))}：${val(v)}`;
  const prev = (list) => list.map((v) => `<div>${md(v.valid_from)} ${esc(money(v, unit, c.key))}</div>`).join('');
  const later = vs.filter((v) => v !== v1 && v !== flip && v !== cur).length;
  return { name: '看各版本', beats: [
    { ctx: e, act: 1500, h: `第一版：${c.key}是${sign(v1) > 0 ? '盈利' : '亏损'}`, rule: line(v1), note: `${who('模型离线')}从公告正文抽出这个数；原文逐字核对通过。`,
      run: async () => {
        await tap('.vres a[data-goto]'); await sleep(450);
        await scrollTo('#s-chart', 60); spot('#s-chart', 6); await sleep(CAM_MS);
        flyFrom(segLabel(v1)(), $('#s-rule b'));
      } },
    { ctx: e, act: 1300, h: sign(flip) !== sign(v1) ? `${md(flip.valid_from)} 公司更正，盈利翻成亏损` : '公司改了一次', rule: line(flip), prev: prev([v1]), note: `${who('规则')}把上一版标成前值，写明哪天被哪份公告取代，不删。`,
      run: async (tok) => { spot('#s-chart', 6, false); await stepTo(flip.valid_from, tok); await sleep(200); flyFrom(segLabel(flip)(), $('#s-rule b')); } },
    { ctx: e, act: 1100, h: '现在算数的是这一版', rule: line(cur), prev: prev(vs.slice(0, -1)), note: `中间还改过 ${later} 次，每一版都留着。`,
      run: async () => { spot('#s-chart', 6, false); await tap('#replay button[data-jump]:nth-of-type(3)'); await sleep(250); flyFrom(segLabel(cur)(), $('#s-rule b')); } },
  ] };
}

function chSource(px) {
  const a = AUDIT && AUDIT.summary ? AUDIT.summary : null;
  return { name: '点回原文', beats: [{
    ctx: px.e, act: 2300, h: '每句结论都能点回原句', rule: '点结论旁的引用，打开公告正文，原句高亮',
    note: `${who('浏览器')}去掉空白后逐字定位。${a ? `${a.quotes_checked} 条引用都回原文核过，${a.quotes_passed} 条通过。` : ''}`,
    run: async () => {
      await scrollTo('#s-concl', 70); spot('#s-concl', 6); await sleep(CAM_MS);
      // 挑一句有字的引用，优先挑这次更正公告里的那句
      const bs = [...D().querySelectorAll('.margin blockquote button')], zh = (b) => /[\u4e00-\u9fa5]{4}/.test(b.textContent);
      const q = bs.find((b) => b.dataset.src === flipOf(px).evidence_id && zh(b)) || bs.find(zh) || bs[0]; if (!q) return false;
      $('#s-rule').innerHTML = `“${esc(cut(q.textContent.replace(/[“”]/g, ''), 34))}”`;
      await tap(() => q); await sleep(600);
      spot('.drawer', 0); await sleep(CAM_MS); spot('.drawer mark.hit', 10);
    } }] };
}

function chDiff(px) {
  const keyRe = /扣非|扣除非经常性/.test(px.c.key) ? /扣除非经常性|扣非/ : new RegExp(px.c.key.slice(0, 2));
  const numeric = (t) => /^[-−]?[\d,，]*\d(\.\d+)?$/.test(t.trim()) && t.replace(/\D/g, '').length >= 2;
  const pick = () => {
    const rows = [...D().querySelectorAll('.drawer .drow:not(.same)')].filter((r) => !/证券代码|编号/.test(r.textContent));
    let best = null;
    rows.forEach((r) => {
      const ms = [...r.querySelectorAll('mark')].filter((mk) => numeric(mk.textContent) || /[\d.]+\s*(%|万元|亿元|元)|\d{4}\s*年\s*\d{1,2}\s*月/.test(mk.textContent));
      if (!ms.length) return;
      const s = ms.length + (keyRe.test(r.textContent) ? 10 : 0) + (/万元|亿元|%/.test(r.textContent) ? 3 : 0);
      if (!best || s > best.s) best = { r, s };
    });
    return best && best.r;
  };
  return { name: '两版对比', beats: [{
    ctx: px.e, act: 1900, h: '更正前后逐句对照，只给改动加底色', rule: '更正公告和原公告逐句对照', note: `${who('浏览器')}逐句对比，整个数字算一个单位。`,
    run: async () => {
      if (!el('.drawer .dact button[data-diff-a]')) return false;
      await tap('.drawer .dact button[data-diff-a]'); await sleep(800);
      const r = pick(); if (!r) { spot('.drawer', 0); return; }
      spot(() => r, 6);
      const o = r.querySelector('.old mark.was'), n = r.querySelector('.new mark.now');
      if (o && n) $('#s-rule').innerHTML = `<b>${esc(cut(o.textContent, 20))}</b> 改成 <b>${esc(cut(n.textContent, 20))}</b>`;
    } }] };
}

function chBack(px) {
  const { e, c, vs } = px, v1 = vs[0];
  const flip = vs.find((v) => sign(v) !== sign(v1)) || vs[1], date = flip.valid_from;
  const concl = (e.conclusions || []).filter((k) => k.as_of && k.as_of <= date).pop();
  const fact = concl && concl.facts && concl.facts[0] ? concl.facts[0].text : '';
  return { name: '拖回某一天', beats: [{
    ctx: e, act: 2900, h: `回到 ${md(date)}，看当天的结论`, rule: fact ? esc(cut(fact, 46)) : `截至 ${md(date)}`,
    note: `${who('浏览器')}只用那天及之前披露的证据；结论是${who('模型离线')}按时点写好的。`,
    run: async (tok) => {
      await scrollTo('#s-chart', 60); spot('#s-chart', 6); await sleep(CAM_MS);
      await dragTo(date, tok); await sleep(300);
      await scrollTo('#s-concl', 70); spot('#s-concl .lead-main', 6);
    } }] };
}

function chAsk(px) {
  if (!QA || !QA.items.length) return null;
  const fut = (i) => (i.trace || []).flatMap((t) => t.excluded || []).filter((x) => /晚于|之后才/.test(x.reason || '')).length;
  const mine = QA.items.filter((i) => i.event_id === px.e.id && !(i.answer || []).some((x) => x.kind === '不回答'));
  const q = mine.find((i) => /现在还/.test(i.question)) || mine.sort((a, b) => fut(b) - fut(a))[0] || QA.items[0];
  return { name: '问一句', beats: [{
    ctx: px.e, act: 2300, h: '每句标事实、推断、不确定，挂着来源', rule: `“${esc(cut(q.question, 30))}”`,
    note: `${who('模型离线')}生成，网页只读；推理过程用了哪些证据、排除了哪些，都有记录。`,
    run: async () => {
      W.scrollTo(0, 0); spot(null); await sleep(500);
      await tap('[data-view="qa"]'); await sleep(250);
      await tap(`[data-qa="${q.id}"]`); await sleep(400);
      spot('#answer', 6);
    } }] };
}

function chMore(px) {
  const beats = [];
  const e0 = px.e;
  const cf = (e0.conflicts || []).find((c) => /数字/.test(c.kind || '')) || (e0.conflicts || [])[0];
  if (cf) {
    const at = cf.first_seen || (cf.evidence_ids || []).map((id) => disclosedOf(evidenceById(e0, id))).sort().pop() || today(DATA);
    const key = String(cf.text || '').slice(0, 8);
    beats.push({ ctx: e0, act: 1400, h: '两份公告的数字不一致，单列出来', rule: esc(cut(cf.text, 60)), note: `${who('规则')}不替你挑一个，两边原文都列出来。`,
      run: async () => { P.scripting = true; WB.go({ view: 'event', event: e0.id, date: at, top: true }); P.scripting = false; await sleep(250);
        await scrollTo('#s-conflict', 60); spot(() => [...D().querySelectorAll('#s-conflict .cf')].find((x) => x.textContent.includes(key)) || el('#s-conflict'), 6); } });
  }
  const no = QA && QA.items.find((i) => i.event_id === e0.id && (i.answer || []).some((x) => x.kind === '不回答'));
  if (no) beats.push({ ctx: e0, act: 1400, h: '买卖和涨跌不回答', rule: `“${esc(cut(no.question, 24))}”`, note: '只给已经披露的事实，并挂来源。',
    run: async () => { W.scrollTo(0, 0); spot(null); await sleep(400); await tap('[data-view="qa"]'); await sleep(200); await tap(`[data-qa="${no.id}"]`); await sleep(400); spot('#answer', 6); } });

  let pm = null;
  DATA.events.forEach((e) => (e.evidence || []).forEach((x) => { if (!pm && x.outdated_by && evidenceById(e, x.outdated_by)) pm = { e, x, by: evidenceById(e, x.outdated_by) }; }));
  let st = null;
  DATA.events.forEach((e) => {
    const h = e.status_history || [], codes = h.map((s) => s.code || '');
    const score = (codes.includes('未通过') && codes.includes('终止') ? 30 : 0) + h.length;
    if (h.length >= 3 && (!st || score > st.score)) st = { e, h, score };
  });
  const next = (pm && pm.e) || (st && st.e);
  if (next && next !== e0) beats.push({ ctx: next, act: 300, h: `换一个例子：${next.name}`, rule: esc(next.title || ''), note: '下面两段都在这件事上。',
    run: async () => { P.scripting = true; WB.go({ view: 'event', event: next.id, date: today(DATA), top: true }); P.scripting = false; W.scrollTo(0, 0); await sleep(250); spot('.ev-head', 8); } });
  if (pm) {
    const { e, x, by } = pm;
    beats.push({ ctx: e, act: 1800, h: '观点的前提会失效', rule: `${md(disclosedOf(x))} ${esc(x.source || '')}：“${esc(cut(x.quote || x.title, 18))}”`,
      note: `${md(disclosedOf(by))} ${esc(docName(by))}推翻了它的前提。${who('规则')}把观点标成“前提已不成立”，观点保留。`,
      run: async () => { P.scripting = true; WB.go({ view: 'event', event: e.id, date: disclosedOf(by), focus: x.id }); P.scripting = false; await sleep(400); spot('#ev-' + x.id, 6); } });
  }
  if (st) {
    const { e, h } = st, tail = h.slice(-3);
    beats.push({ ctx: e, act: 1600, h: '状态被说粗了', rule: tail.map((s) => `${md(s.at)} <b>${esc(s.status)}</b>`).join('，'),
      note: '只按公告认定。媒体说“被否”，状态是“未通过”，到公司公告终止那天才算终止。',
      run: async () => { P.scripting = true; WB.go({ view: 'event', event: e.id, date: today(DATA), top: true }); P.scripting = false; await sleep(250); await scrollTo('#s-chart', 60); spot('#s-chart', 6); } });
  }
  return beats.length ? { name: '另外几个例子', beats } : null;
}

function chEnd() {
  return { name: '小结', beats: [{
    act: 700, end: true, h: '刚才看到的',
    rule: '一句旧消息查出是第几版；各版本都留着，能点回原文；回到哪天就只看那天的证据。',
    note: '<span class="end-btns"><a href="#eval" id="to-eval">看评测 ↓</a><a href="workbench.html">自己操作工作台</a></span>',
    run: async () => { ptr(null, null, false); spot(null); P.scripting = true; WB.go({ view: 'event', event: DATA.events[0].id, date: today(DATA), top: true }); P.scripting = false; W.scrollTo(0, 0); revealSections(); } }] };
}

// ---------------- 播放 ----------------
// 停留时间按字数算：动作先做完，再留阅读时间
const dwell = (b) => Math.max(2200, Math.min(4600, 1000 + plain(b.h + b.rule + b.note).length * 36));
const beatMs = (b) => (b.act || 0) + dwell(b);
function remainMs() { let ms = 0; CH.forEach((c, i) => c.beats.forEach((b, j) => { if (i > P.ci || (i === P.ci && j >= P.bi)) ms += beatMs(b); })); return ms; }
function totalMs() { return CH.reduce((s, c) => s + c.beats.reduce((t, b) => t + beatMs(b), 0), 0); }
function narrate(c, b) {
  const s = $('#side'); s.classList.add('fade');
  setTimeout(() => {
    $('#s-tag').textContent = c.name; $('#s-h').textContent = b.h; $('#s-rule').innerHTML = b.rule; $('#s-note').innerHTML = b.note;
    $('#s-prev').innerHTML = b.prev || '';
    if (b.ctx) $('#ctx').textContent = ctxOf(b.ctx);
    const te = $('#to-eval'); if (te) te.onclick = (ev) => { ev.preventDefault(); revealSections(); $('#eval').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); };
    void s.offsetWidth; s.classList.remove('fade');
  }, reduce ? 0 : 180);
}
function rail() {
  $('#rail-steps').innerHTML = CH.map((c, i) => `<button data-ch="${i}" class="${i === P.ci ? 'is-on' : i < P.ci ? 'is-past' : ''}">${esc(c.name)}</button>`).join('');
  const total = CH.reduce((s, c) => s + c.beats.length, 0), done = CH.slice(0, P.ci).reduce((s, c) => s + c.beats.length, 0) + P.bi;
  $('#play-fill').style.width = (done / total * 100) + '%';
}
function setMode(m) {
  if (m) P.mode = m;
  $('#st-main').dataset.mode = P.mode;
  const s = Math.ceil(remainMs() / 1000);
  $('#mode').textContent = { auto: '播放中', paused: '已暂停', hand: '你在操作', done: '演示结束', idle: '准备播放' }[P.mode];
  $('#remain').textContent = P.mode === 'auto' || P.mode === 'paused' ? `还剩 ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '';
  $('#play').textContent = P.mode === 'auto' ? '暂停' : P.mode === 'done' ? '重播' : P.mode === 'idle' ? '播放' : '继续';
  if (P.mode === 'hand' || P.mode === 'done') ptr(null, null, false);
}
async function show(ci, bi) {
  const tok = ++P.token;
  P.ci = ci; P.bi = bi;
  const c = CH[ci], b = c.beats[bi];
  narrate(c, b); rail(); setMode();
  let r;
  try { r = await b.run(tok); } catch (err) { /* 屏幕里找不到元素时跳过这一拍 */ console.warn(err); }
  if (tok !== P.token) return;
  if (b.end) { finish(); return; }
  if (P.mode === 'auto') { await sleep(r === false ? 0 : dwell(b)); if (tok === P.token && P.mode === 'auto') advance(); }
}
function advance() {
  const c = CH[P.ci];
  if (P.bi + 1 < c.beats.length) show(P.ci, P.bi + 1);
  else if (P.ci + 1 < CH.length) show(P.ci + 1, 0);
  else finish();
}
function finish() {
  P.token++; setMode('done'); spot(null); ptr(null, null, false);
  $('#play-fill').style.width = '100%';
  $('#rail-steps').querySelectorAll('button').forEach((b) => { b.classList.remove('is-on'); b.classList.add('is-past'); });
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
  if (e) $('#ctx').textContent = ctxOf(e);
  $('#s-tag').textContent = '你在操作'; $('#s-h').textContent = t[0]; $('#s-rule').innerHTML = t[1]; $('#s-note').innerHTML = t[2]; $('#s-prev').innerHTML = '';
}

// ---------------- 电脑外框缩放 ----------------
function fit() {
  const box = $('#dev-box'), dev = $('#dev'), wrap = $('#dev-wrap');
  box.style.transform = '';
  if (mobile()) { box.style.width = box.style.height = ''; dev.style.transform = ''; return; }
  const DW = 740, DH = 448;
  const r = wrap.getBoundingClientRect();
  const k = Math.max(.6, Math.min(r.width / DW, (r.height - 10) / DH, 1.9));
  box.style.width = DW * k + 'px'; box.style.height = DH * k + 'px';
  dev.style.transform = `scale(${k})`;
  // 屏幕左上角在 dev-box 里的位置（镜头推近要用）
  const br = box.getBoundingClientRect(), fr = $('#frame').getBoundingClientRect();
  CAM.K = k; CAM.ox = fr.left - br.left; CAM.oy = fr.top - br.top;
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
  if (px) {
    // 查验用的那句话：首屏那张纸上被圈出来的第一版
    const exs = exampleSentences(DATA);
    const ex = exs.find((s) => { const r = verify(s, DATA); return r.verdict === 'match' && r.matches[0].claim === px.c && r.matches[0].v === px.vs[0]; }) || exs[0];
    const r = ex ? verify(ex, DATA) : null;
    let res = '没有匹配到';
    if (r && r.verdict === 'match') { const m = r.matches[0]; const d = describe(m, today(DATA)); const by = m.v.superseded_by ? evidenceById(m.ev, m.v.superseded_by) : null; res = `第 ${d.n} 版，${md(m.v.valid_to)} 被${esc(docName(by))}取代；现在是 <b>${esc(money(d.cur, m.claim.unit, m.claim.key))}</b>`; }
    CH = [chCheck(px, ex, res), chVersions(px), chBack(px), chSource(px), chDiff(px), chAsk(px), chMore(px), chEnd()].filter(Boolean);
  } else CH = [chMore({ e: DATA.events[0] }), chEnd()].filter(Boolean);
  brief(px);
  requestAnimationFrame(() => drawPen(false));

  const frame = $('#frame');
  await new Promise((r) => (frame.contentWindow && frame.contentWindow.WB ? r() : frame.addEventListener('load', r, { once: true })));
  W = frame.contentWindow; WB = W.WB;
  if (!WB || !(await WB.ready)) { $('#s-h').textContent = '屏幕里的工作台没有加载成功'; return; }
  ['pointerdown', 'keydown', 'wheel'].forEach((t) => W.document.addEventListener(t, (ev2) => { if (!P.scripting && ev2.isTrusted && P.mode === 'auto') { P.token++; setMode('hand'); spot(null); } }, { passive: true }));
  if (WB.onAction) WB.onAction(onUser);

  addEventListener('resize', fit); fit();
  rail(); setMode('idle');
  if (px) $('#ctx').textContent = ctxOf(px.e);
  narrate(CH[0], { h: '演示会自己往下走', rule: '屏幕里是完整的工作台，讲到哪块就推近哪块', note: '在屏幕里点任何地方，演示就停下来交给你。' });
  $('#play').onclick = () => (P.mode === 'auto' ? pause() : P.mode === 'done' ? start(true) : start(P.mode === 'idle'));
  $('#go-demo').onclick = () => { $('#demo').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); setTimeout(() => { if (P.mode !== 'auto') start(P.mode === 'idle' || P.mode === 'done'); }, reduce ? 0 : 600); };
  $('#prev').onclick = () => { const was = P.mode; const ci = P.bi > 0 ? P.ci : Math.max(0, P.ci - 1); setMode(was === 'auto' ? 'auto' : 'paused'); show(ci, 0); };
  $('#next').onclick = () => { const was = P.mode; if (P.ci + 1 < CH.length) { setMode(was === 'auto' ? 'auto' : 'paused'); show(P.ci + 1, 0); } else finish(); };
  $('#end-btn').onclick = () => { finish(); $('#eval').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); };
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
    io.disconnect(); setMode('paused'); $('#demo').scrollIntoView(); fit();
    const ci = +at[1] - 1, bi = +at[2] - 1;
    for (let i = 0; i <= ci; i++) for (let j = 0; j < (i < ci ? CH[i].beats.length : bi); j++) { try { await CH[i].beats[j].run(P.token); } catch (err) { console.warn(err); } }
    show(ci, bi);
  }
}
init();
