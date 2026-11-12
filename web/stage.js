// 演示页。第一屏：一条真实的旧消息，蓝笔批注它后来被改了几次；右边痛点表。
// 演示区：电脑屏幕里是工作台整页（workbench.html?embed=full）。顺序按一次使用走：
// 贴一句旧消息 → 查出是第几版 → 看各版本 → 点回原文 → 两版对比 → 回到某一天 → 问一句 → 另外几个例子 → 小结。
// 讲到哪块，镜头推到哪块；指针真的去点按钮。右边解说只用数据里的真实数字；例子从数据里挑，不写死事件编号。
import { PATHS, load, esc, md, change, evidenceById, disclosedOf, today, docName, moneyText } from './core.js';
import { exampleSentences, verify, describe } from './verify.js';
import { renderHighlights, renderEvalSection, renderProcess, renderAudit } from './sections.js';
import { renderHL } from './highlights.js';

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

let DATA, QA, AUDIT, REPORT, W, WB, CH = [], EXAMPLE = '';
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
  const words = [['data', '数据先过一遍'], ['audit', '每句都能核'], ['eval', '独立评测'], ['hands', '能自己查']];
  $('#hls').innerHTML = `<p data-grow class="hl-words"><span>亮点</span>${words.map(([id, t]) => `<a href="#hl-${id}">${t}</a>`).join('')}</p><p data-grow class="nodo">不预测涨跌，不给买卖建议，网页不实时调用模型。</p>`;
  void hl;

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
// 用纸内的排版位置（offsetLeft/offsetTop 累加）算圈和引线，不受纸的轻微旋转和页面滚动影响
function offIn(el, root) { let x = 0, y = 0; for (let n = el; n && n !== root; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; } return { x, y }; }
function penPlace() {
  const paper = $('#paper'), tgt = $('#tgt'), notes = $('#notes'), paths = $$('#pen path');
  if (!paper || !tgt || !notes || paths.length < 2) return;
  // 目标文字可能折行：取第一行的框
  const r0 = tgt.getClientRects()[0];
  const o = offIn(tgt, paper);
  const x = o.x, y = o.y, w = r0 ? r0.width : tgt.offsetWidth, h = r0 ? r0.height : tgt.offsetHeight;
  const cx = x + w / 2, cy = y + h / 2, rx = w / 2 + 10, ry = h / 2 + 5;
  // 手画的圈：起笔和收笔错开一点
  paths[0].setAttribute('d', `M ${cx + rx * .2} ${cy - ry - 2} C ${cx + rx + 8} ${cy - ry}, ${cx + rx + 6} ${cy + ry + 2}, ${cx} ${cy + ry + 1} S ${cx - rx - 6} ${cy - ry + 3}, ${cx - rx * .1} ${cy - ry - 4}`);
  const n = offIn(notes, paper);
  paths[1].setAttribute('d', `M ${cx - 10} ${cy + ry + 2} C ${cx - 18} ${cy + ry + 20}, ${n.x + 4} ${n.y - 14}, ${n.x + 2} ${n.y + 2}`);
}
async function drawPen(instant) {
  if (penDone && !instant) return;
  if (instant) penDone = true;
  const paper = $('#paper'), tgt = $('#tgt'), svg = $('#pen'), notes = $$('#notes > div');
  if (!tgt || !svg) return;
  if (document.fonts && !instant) await document.fonts.ready;
  if (!svg.childElementCount) {
    svg.innerHTML = '<path pathLength="1" class="off"/><path pathLength="1" class="off"/>';
    penPlace();
    // 窗口宽度变了、字体晚到了，纸里的文字会挪位置：跟着重算
    new ResizeObserver(penPlace).observe(paper);
    if (document.fonts) document.fonts.ready.then(penPlace);
  }
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
function el(sel) { return typeof sel === 'function' ? sel() : sel[0] === '@' ? document.querySelector(sel.slice(1)) : D().querySelector(sel); }
function rectOf(sel, pad = 6) {
  const e = el(sel); if (!e) return null;
  if (e.ownerDocument === document) {
    // 评测板（选择器以 @ 开头）：按它自己的缩放换算成屏幕坐标
    const b = $('#evb').getBoundingClientRect(), r = e.getBoundingClientRect();
    const k = mobile() ? 1 : 572 / b.width;
    return { x: (r.left - b.left - pad) * k, y: (r.top - b.top - pad) * k, w: (r.width + pad * 2) * k, h: (r.height + pad * 2) * k };
  }
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
  e.focus({ preventScroll: true }); e.value = '';
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

// ---------------- 评测：屏幕里换成一块评测板，镜头逐块推过去 ----------------
// 文案来自评测窗口（共享笔记 评测-演示文案-2026-11-11.md）；数字全部从 eval/report.json 读：
// first_pass.summary（首次抽取成绩，冻结快照）、first_pass.summary_blind_gold、groups、gold_check、traps.cases、summary_by_split、events。
// 顶层 summary 是修订后的测试集，不当主数字。
const pct = (m) => (m && m.den ? Math.round(m.num / m.den * 1000) / 10 + '%' : '—');
const fpSum = () => (REPORT && REPORT.first_pass && REPORT.first_pass.summary) || null;
const M = (k) => { const f = fpSum(); return f && f[k] ? f[k] : null; };
const nd = (k, src) => { const m = src ? (src[k] || null) : M(k); return m ? `${m.num}/${m.den}` : '未生成'; };
const trapCls = (c) => (/管线拦住/.test(c.verdict || '') ? 'caught' : /放行/.test(c.verdict || '') ? (c.eval_detects ? 'found' : 'leak') : 'na');
// 模型判断类的指标（没有人工复核），在板上标一个“判断”
const JUDGE = /证据类型|来源级别|合并|分开|状态|冲突/;
function buildBoard() {
  const box = $('#evb'); if (!box) return;
  const r = REPORT;
  if (!r || !fpSum()) { box.innerHTML = '<div class="evb-in"><header><h3>评测</h3><p>eval/report.json 里没有首次抽取成绩（first_pass），这里不显示分数。</p></header></div>'; return; }
  const groups = r.groups || { results: [], process: [] };
  const evs = Array.isArray(r.events) ? r.events : [];
  const split = r.summary_by_split || {}, tN = ((split['测试集'] || {}).events || []).length, dN = ((split['开发集'] || {}).events || []).length;
  const dev = evs.filter((e) => e.split === '开发集'), test = r.first_pass.test_events || [];
  const gc = r.gold_check || {};
  const cases = (r.traps && Array.isArray(r.traps.cases)) ? r.traps.cases : [];
  const n = (k) => cases.filter((c) => trapCls(c) === k).length;
  const row = (k, i) => {
    const m = M(k); if (!m) return '';
    return `<div class="mr ${m.num < m.den ? 'bad' : ''}" style="--i:${i}"><span class="mk">${esc(k)}${JUDGE.test(k) ? '<small>判断</small>' : ''}</span><i class="bar"><u style="--v:${(m.num / m.den).toFixed(4)}"></u></i><span class="mn"><b data-to="${m.num}">${m.num}</b>/${m.den}</span><em>${pct(m)}</em></div>`;
  };
  const proc = groups.process || [];
  const nm = (e) => esc(cut(String(e.name || '').replace(/\s+/g, ' '), 24));
  box.innerHTML = `<div class="evb-in">
    <header><h3>评测</h3><p>标准答案由另一个 Claude Opus 会话先盲标；主数字是每个事件第一次抽取、没参考评测意见时的成绩。</p></header>
    <div class="evb-grid">
      <section id="evb-gold"><h4>标准答案<small>${evs.length} 个事件</small></h4>
        <ol>${evs.map((e, i) => `<li style="--i:${i}"><i class="tk"></i><span>${nm(e)}</span></li>`).join('')}</ol>
        <p class="big"><b data-to="${gc.passed ?? 0}">${gc.passed ?? '—'}</b><span> / ${gc.total ?? '—'} 处数字和引用回原文核对通过</span></p></section>
      <section id="evb-res"><h4>结果对不对<small>首次抽取 · ${test.length} 个事件</small></h4>
        ${(groups.results || []).map(row).join('')}</section>
      <section id="evb-proc"><h4>过程对不对<small>同一批事件</small></h4>
        <div id="evb-p1">${proc.slice(0, 2).map(row).join('')}</div>
        <div id="evb-p2">${proc.slice(2).map((k, i) => row(k, i + 2)).join('')}
        <div class="tl" aria-hidden="true"><i class="ln"></i>${[6, 17, 29, 41, 52, 68, 80, 92].map((x, i) => `<i class="dot ${x > 60 ? 'future' : ''}" style="left:${x}%;--i:${i}"></i>`).join('')}<i class="asof" style="left:60%"></i><span class="tl-a" style="left:60%">截至这天</span><span class="tl-b">更晚披露的证据不进当时的结论</span></div></div></section>
      <section id="evb-trap"><h4>改坏数据的陷阱<small>${cases.length} 个</small></h4>
        <div class="cells">${cases.map((c, i) => `<span class="c ${trapCls(c)}" style="--i:${i}" title="${esc(c.title || '')}">${esc(c.id || '')}</span>`).join('')}</div>
        <p class="lg"><span><i class="c caught"></i>管线拦住 ${n('caught')}</span><span><i class="c found"></i>只有评测发现 ${n('found')}</span>${n('na') + n('leak') ? `<span><i class="c na"></i>其他 ${n('na') + n('leak')}</span>` : ''}</p>
        <p class="lg2">${cases.filter((c) => trapCls(c) === 'found').map((c) => esc(c.title)).join('；')}</p></section>
    </div>
    <footer id="evb-split"><span class="sp t">测试集 ${tN} 个事件</span><span class="sp d">开发集 ${dN} 个：${dev.map((e) => '事件 ' + esc(e.no)).join('、')}</span><small>${esc(r.gold_note || '')}</small></footer>
  </div>`;
}
function boardGo(id) {
  const t = $(id); if (!t) return;
  const sec = t.closest('section') || t;
  [t, sec].forEach((x) => { x.classList.remove('go'); void x.offsetWidth; x.classList.add('go'); });
  $$('[data-to]', t).forEach((b) => {
    const to = +b.dataset.to; if (reduce || !to) { b.textContent = to; return; }
    const t0 = performance.now(), f = () => { const k = Math.min(1, (performance.now() - t0) / 1100); b.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) setTimeout(f, 30); }; f();
  });
}
function chEval() {
  if (!REPORT || !fpSum()) return null;
  const r = REPORT, fp = r.first_pass, cases = (r.traps && r.traps.cases) || [];
  const caught = cases.filter((c) => trapCls(c) === 'caught').length, found = cases.filter((c) => trapCls(c) === 'found').length;
  const gc = r.gold_check || {}, evs = r.events || [], dev = evs.filter((e) => e.split === '开发集');
  const split = r.summary_by_split || {}, tN = ((split['测试集'] || {}).events || []).length, dN = ((split['开发集'] || {}).events || []).length;
  const cite = M('引用挂对证据') || {};
  const ctxText = `评测 · ${r.events_total ?? evs.length} 个事件`;
  const beat = (id, i, h, rule, note, act = 1500) => ({
    act, ctxText, h, rule, note,
    run: async () => {
      ptr(null, null, false);
      if (i === 0) { $$('#evb .go').forEach((x) => x.classList.remove('go')); spot(null); await sleep(600); }
      spot('@' + id, 10); await sleep(CAM_MS); boardGo(id);
    } });
  return { name: '评测', board: true, beats: [
    beat('#evb-gold', 0, '标准答案先盲标，标完才打开抽取结果',
      `${r.events_total ?? evs.length} 个事件，${gc.passed}/${gc.total} 处数字和引用回原文核对通过`,
      '标注者是另一个 Claude Opus 会话，非人工；类型、状态等判断没人复核。', 2100),
    beat('#evb-res', 1, '结果对：数字、版本、状态逐项和答案比',
      `数值 ${nd('数值抽取精确匹配')}，版本链 ${nd('版本链')}，状态 ${nd('事件状态')}`,
      `${(fp.test_events || []).length} 个事件第一次抽取时的成绩，抽取时没参考过评测意见。`),
    beat('#evb-p1', 2, '每句话都要点得回原文，而且挂对那一条',
      `引用逐字匹配 ${nd('引用逐字匹配')}，挂对证据 ${nd('引用挂对证据')}`,
      `挂对是指数字确实出自那条证据；该引的版本召回 ${cite.recall_num ?? '—'}/${cite.recall_den ?? '—'}。`),
    beat('#evb-p2', 3, '回放某一天时，只用那天之前的证据',
      `未用到未来 ${nd('回放未用到未来证据')}，事实推断没混 ${nd('事实和推断没混')}`,
      `冲突找出 ${nd('冲突找出来了')}；按最初盲标的答案算是 ${nd('冲突找出来了', fp.summary_blind_gold || {})}，分歧逐条回原文裁决。`),
    beat('#evb-trap', 4, `故意改坏 ${cases.length} 处，看管线能不能拦住`,
      `管线拦住 ${caught} 个，另 ${found} 个只有评测能发现`,
      '仍放行的是首次出处、年份、报告期、漏版本，记为已知缺口。'),
    beat('#evb-split', 5, '改过的事件移进开发集，不再算独立成绩',
      `测试集 ${tN} 个事件，开发集 ${dN} 个（${dev.map((e) => '事件 ' + esc(e.no)).join('、')}）`,
      '现在测试集全对，是因为出错的被移走了；主数字仍用首次成绩。', 1000),
  ] };
}

function chEnd() {
  return { name: '小结', beats: [{
    act: 700, end: true, h: '刚才看到的',
    rule: '一句旧消息查出是第几版；各版本都留着，能点回原文；回到哪天就只看那天的证据。',
    note: '<span class="end-btns"><a href="#hl" id="to-eval">看亮点 ↓</a><a href="workbench.html">自己操作工作台</a></span>',
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
    if (b.ctx) $('#ctx').textContent = ctxOf(b.ctx); else if (b.ctxText) $('#ctx').textContent = b.ctxText;
    const te = $('#to-eval'); if (te) te.onclick = (ev) => { ev.preventDefault(); revealSections(); $('#hl').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); };
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
  $('#evb').classList.toggle('on', !!c.board);
  let r;
  try { r = await b.run(tok); } catch (err) { /* 屏幕里找不到元素时跳过这一拍 */ console.warn(err); }
  if (tok !== P.token) return;
  if (b.end) {
    const wasAuto = P.mode === 'auto';
    finish();
    // 自动播完：小结留一会儿，再滚到亮点页（人已经往别处滚了就不动）
    if (wasAuto) { await sleep(dwell(b)); const r = $('#demo').getBoundingClientRect(); if (P.mode === 'done' && Math.abs(r.top) < innerHeight * .5) $('#hl').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); }
    return;
  }
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
  const evb = $('#evb');
  if (mobile()) {
    box.style.width = box.style.height = ''; dev.style.transform = '';
    // 手机上评测板按屏幕宽度整体缩小
    const sc = $('#screen').clientWidth / 1120;
    evb.style.transform = `scale(${sc})`; evb.style.height = $('#screen').clientHeight / sc + 'px';
    return;
  }
  evb.style.transform = evb.style.height = '';
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
  const [ev, qa, au, rp, pr, rc, hj] = await Promise.all([load(PATHS.events), load(PATHS.qa), load(PATHS.audit), load(PATHS.report), load('data/process.json'), load(PATHS.recheck), load('data/highlights.json')]);
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
    EXAMPLE = ex;
    const r = ex ? verify(ex, DATA) : null;
    let res = '没有匹配到';
    if (r && r.verdict === 'match') { const m = r.matches[0]; const d = describe(m, today(DATA)); const by = m.v.superseded_by ? evidenceById(m.ev, m.v.superseded_by) : null; res = `第 ${d.n} 版，${md(m.v.valid_to)} 被${esc(docName(by))}取代；现在是 <b>${esc(money(d.cur, m.claim.unit, m.claim.key))}</b>`; }
    CH = [chCheck(px, ex, res), chVersions(px), chBack(px), chSource(px), chDiff(px), chAsk(px), chMore(px), chEval(), chEnd()].filter(Boolean);
  } else CH = [chMore({ e: DATA.events[0] }), chEval(), chEnd()].filter(Boolean);
  brief(px);
  buildBoard();
  requestAnimationFrame(() => drawPen(false));
  renderHL($('#hl-body'), { hl: hj.ok ? hj.data : null, recheck: rc.ok ? rc.data : null, report: REPORT, px, example: EXAMPLE });

  const frame = $('#frame');
  await new Promise((r) => (frame.contentWindow && frame.contentWindow.WB ? r() : frame.addEventListener('load', r, { once: true })));
  W = frame.contentWindow; WB = W.WB;
  if (!WB || !(await WB.ready)) { $('#s-h').textContent = '屏幕里的工作台没有加载成功'; return; }
  ['pointerdown', 'keydown', 'wheel'].forEach((t) => W.document.addEventListener(t, (ev2) => { if (!P.scripting && ev2.isTrusted && P.mode === 'auto') { P.token++; setMode('hand'); spot(null); } }, { passive: true }));
  if (WB.onAction) WB.onAction(onUser);
  // 评测板上点一下：停下演示，收起评测板，把屏幕交给人
  $('#evb').addEventListener('pointerdown', () => { if (P.mode === 'auto') { P.token++; setMode('hand'); } spot(null); $('#evb').classList.remove('on'); });

  addEventListener('resize', fit); fit();
  rail(); setMode('idle');
  if (px) $('#ctx').textContent = ctxOf(px.e);
  narrate(CH[0], { h: '演示会自己往下走', rule: '屏幕里是完整的工作台，讲到哪块就推近哪块', note: '在屏幕里点任何地方，演示就停下来交给你。' });
  $('#play').onclick = () => (P.mode === 'auto' ? pause() : P.mode === 'done' ? start(true) : start(P.mode === 'idle'));
  $('#go-demo').onclick = () => { $('#demo').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); setTimeout(() => { if (P.mode !== 'auto') start(P.mode === 'idle' || P.mode === 'done'); }, reduce ? 0 : 600); };
  $('#prev').onclick = () => { const was = P.mode; const ci = P.bi > 0 ? P.ci : Math.max(0, P.ci - 1); setMode(was === 'auto' ? 'auto' : 'paused'); show(ci, 0); };
  $('#next').onclick = () => { const was = P.mode; if (P.ci + 1 < CH.length) { setMode(was === 'auto' ? 'auto' : 'paused'); show(P.ci + 1, 0); } else finish(); };
  $('#end-btn').onclick = () => { finish(); $('#hl').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); };
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
