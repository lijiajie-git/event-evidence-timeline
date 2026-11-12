// 演示页“亮点”一屏：四组，文字和数字直接读 data/highlights.json（由 pipeline/build_highlights.py 算出），不改写。
// 每组右边的小图用真实数据画：重抓记录（data/recheck.json）、公告正文（data/raw/text/）、评测报告（eval/report.json）。
// 滚到哪一组，那一组的图动一遍；系统开了“减少动态效果”就直接显示结果。
import { esc, evidenceById, disclosedOf, moneyText, docName } from './core.js';
import { loadText, locate } from './source.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function renderHL(box, { hl, recheck, report, px, example }) {
  if (!hl || !Array.isArray(hl.groups) || !hl.groups.length) {
    box.innerHTML = '<p class="absent">亮点数据未生成（data/highlights.json）。</p>';
    return;
  }
  box.innerHTML = hl.groups.map((g) => {
    const pts = Array.isArray(g.points) ? g.points : [];
    // 每条只显示一句 text；detail 和出处点开这一条才看到
    const li = (p) => (p.detail || p.source)
      ? `<li><details><summary>${esc(p.text)}</summary><p>${esc(p.detail || '')}${p.source ? `<small>出处：${esc(p.source)}</small>` : ''}</p></details></li>`
      : `<li><span class="pt">${esc(p.text)}</span></li>`;
    return `<article class="hg" id="hl-${esc(g.id)}" data-g="${esc(g.id)}">
      <div class="hg-t">
        <h3>${esc(g.title)}</h3>
        <p class="hg-line">${esc(g.line || '')}</p>
        <ul class="pts">${pts.map(li).join('')}</ul>
      </div>
      <div class="hg-f" aria-hidden="true">${figure(g, { recheck, report, px, example })}</div>
    </article>`;
  }).join('');
  // 公告原文那张图要读正文文件，异步填进去
  fillAudit(box, px);
  const io = new IntersectionObserver((ents) => ents.forEach((x) => {
    if (!x.isIntersecting) return;
    x.target.classList.add('go'); io.unobserve(x.target);
    if (x.target.dataset.g === 'audit') requestAnimationFrame(() => linkLine(x.target));
    countIn(x.target);
  }), { threshold: 0.35 });
  $$('.hg', box).forEach((a) => (reduce ? (a.classList.add('go'), countIn(a)) : io.observe(a)));
  addEventListener('resize', () => $$('.hg[data-g="audit"]', box).forEach(linkLine));
}

const bars = (g) => (g.points || []).filter((p) => p.num != null && p.den).map((p, i) => {
  const label = String(p.text).split(/[：:，,。]/)[0];
  return `<div class="hb" style="--i:${i}"><span>${esc(label)}</span><i><u style="--v:${(p.num / p.den).toFixed(4)}"></u></i><b><em data-to="${p.num}">${p.num}</em>/${p.den}</b></div>`;
}).join('');

function figure(g, ctx) {
  if (g.id === 'data') return figData(g, ctx);
  if (g.id === 'audit') return figAudit(g, ctx);
  if (g.id === 'eval') return figEval(g, ctx);
  if (g.id === 'hands') return figHands(g, ctx);
  return bars(g);
}

// 进料：两个入口，三道检查，再进抽取；下面每份公告一格，重抓后逐个打勾
function figData(g, { recheck }) {
  const items = recheck && Array.isArray(recheck.items) ? recheck.items : [];
  const gates = ['留指纹', '比时间戳', '不执行指令'];
  const gx = (i) => 190 + i * 112;
  const svg = `<svg class="feed" viewBox="0 0 600 150">
    <g class="in"><rect x="2" y="16" width="118" height="38" rx="2"/><text x="61" y="40">巨潮资讯网</text></g>
    <g class="in"><rect x="2" y="96" width="118" height="38" rx="2"/><text x="61" y="120">扶摇接口</text></g>
    <path class="wire w0" pathLength="1" d="M120 35 C 150 35, 150 75, 176 75"/>
    <path class="wire w1" pathLength="1" d="M120 115 C 150 115, 150 75, 176 75"/>
    ${gates.map((t, i) => `<g class="gate" style="--i:${i}"><rect x="${gx(i) - 14}" y="56" width="92" height="38" rx="2"/><text x="${gx(i) + 32}" y="80">${t}</text></g>`).join('')}
    ${gates.map((_, i) => `<path class="wire w${i + 2}" pathLength="1" d="M${i ? gx(i) - 36 : 176} 75 L ${gx(i) - 14} 75"/>`).join('')}
    <path class="wire w5" pathLength="1" d="M${gx(2) + 78} 75 L 528 75"/>
    <g class="out"><rect x="528" y="56" width="70" height="38" rx="2"/><text x="563" y="80">抽取</text></g>
  </svg>`;
  const cells = items.length ? `<div class="cells64">${items.map((x, i) => `<span class="${x.error ? 'err' : x.changed ? 'chg' : 'ok'}" style="--i:${i}" title="${esc(x.event_id)} ${esc(x.evidence_id)}"></span>`).join('')}</div>
    <p class="fcap">重抓 ${recheck.checked ?? items.length} 份公告：有变化 ${recheck.changed ?? 0} 份，失败 ${recheck.failed ?? 0} 份</p>` : '<p class="fcap">重抓记录未生成</p>';
  return svg + cells;
}

// 核对：一段公告原文，被引用的那句高亮，数字和右边的抽取结果连线；下面是两条核对进度
function figAudit(g, { px }) {
  if (!px) return bars(g);
  const { e, c, vs } = px, v = vs[0], x = evidenceById(e, v.evidence_id);
  return `<div class="au">
    <div class="au-doc" data-ref="${esc(x && x.ref || '')}" data-q="${esc(v.quote || '')}"><p class="au-h">${esc(docName(x))} · ${esc(disclosedOf(x) || '')}</p><p class="au-load">正在读公告正文…</p></div>
    <div class="au-chip"><small>抽取结果 · ${esc(c.key)} 第 1 版</small><b>${esc(moneyText(v, c.unit || v.unit, c.key) || '')}</b></div>
    <svg class="au-line"><path pathLength="1" d=""/></svg>
  </div>${bars(g)}`;
}
async function fillAudit(box, px) {
  const doc = $('.au-doc', box); if (!doc || !px) return;
  const ref = doc.dataset.ref, q = doc.dataset.q;
  const r = await loadText(ref);
  const head = doc.querySelector('.au-h').outerHTML;
  if (!r.ok) { doc.innerHTML = `${head}<p class="au-load">${esc(r.error)}</p>`; return; }
  const spans = locate(r.paras, q);
  if (!spans) { doc.innerHTML = `${head}<p class="au-load">未能在正文中定位这句引用</p>`; return; }
  const p0 = spans[0].p, p1 = spans[spans.length - 1].p;
  // 正文转出来时数字和单位之间常有空格，按允许空白的写法找
  const NUM = /-?[\d,，.]+\s*万元\s*(到|至)\s*-?[\d,，.]+\s*万元|-?[\d,，.]+\s*(亿元|万元)/;
  const paras = [];
  for (let pi = Math.max(0, p0 - 1); pi <= Math.min(r.paras.length - 1, p1 + 1); pi++) {
    const p = r.paras[pi], sp = spans.filter((s) => s.p === pi);
    if (!sp.length) { paras.push(`<p>${esc(cutMid(p, 90))}</p>`); continue; }
    const a = sp[0].from, b = sp[sp.length - 1].to;
    let mid = esc(p.slice(a, b));
    const m = p.slice(a, b).match(NUM);
    if (m) { const k = m.index, num = m[0]; mid = esc(p.slice(a, a + k)) + `<span class="au-n">${esc(num)}</span>` + esc(p.slice(a + k + num.length, b)); }
    paras.push(`<p>${esc(cutL(p.slice(0, a), 40))}<mark>${mid}</mark>${esc(cutR(p.slice(b), 40))}</p>`);
  }
  doc.innerHTML = head + paras.join('');
  const art = doc.closest('.hg'); if (art && art.classList.contains('go')) linkLine(art);
}
const cutMid = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);
const cutL = (s, n) => (s.length > n ? '…' + s.slice(-n) : s);
const cutR = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);
// 数字（原文里）和抽取结果（右边）之间画一条线
function linkLine(art) {
  const wrap = $('.au', art), n = $('.au-n', art) || $('.au-doc mark', art), chip = $('.au-chip', art), svg = $('.au-line', art);
  if (!wrap || !n || !chip || !svg) return;
  const rs = [...n.getClientRects()], w = wrap.getBoundingClientRect(), b = chip.getBoundingClientRect();
  // 数字可能折行：从最靠右的那一段的右端连出去，线不压在正文上
  const a = rs.length ? rs.reduce((m, r) => (r.right > m.right ? r : m)) : n.getBoundingClientRect();
  svg.setAttribute('viewBox', `0 0 ${w.width} ${w.height}`);
  const x0 = a.right - w.left + 3, y0 = a.top + a.height / 2 - w.top, x1 = b.left - w.left, y1 = b.top + b.height / 2 - w.top;
  svg.querySelector('path').setAttribute('d', `M ${x0} ${y0} C ${x0 + 30} ${y0}, ${x1 - 30} ${y1}, ${x1 - 4} ${y1}`);
  art.classList.add('linked');
}

// 评测：抽取结果和盲标答案逐项比，一格一项，对不上的标出来；下面 20 个陷阱
function figEval(g, { report }) {
  const fp = report && report.first_pass;
  if (!fp || !fp.summary) return bars(g);
  const e1 = fp.event1 && fp.event1.summary;
  const rows = [
    ['数值', fp.summary['数值抽取精确匹配'], '首次抽取'],
    ['版本链', fp.summary['版本链'], '首次抽取'],
    e1 && e1['数值抽取精确匹配'] ? ['数值', e1['数值抽取精确匹配'], '第一个事件第一版'] : null,
  ].filter((r) => r && r[1]);
  let k = 0;
  const grid = rows.map(([name, m, tag]) => `<div class="ev-row"><span class="ev-l">${esc(name)}<small>${esc(tag)}</small></span>
    <span class="ev-cells">${Array.from({ length: m.den }, (_, i) => `<i class="${i < m.num ? 'ok' : 'no'}" style="--i:${k++}"></i>`).join('')}</span>
    <b>${m.num}/${m.den}</b></div>`).join('');
  const cases = report.traps && Array.isArray(report.traps.cases) ? report.traps.cases : [];
  const caught = (c) => /管线拦住/.test(c.verdict || '');
  const cards = cases.map((c, i) => `<span class="tc ${caught(c) ? 'in' : 'out'}" style="--i:${i}" title="${esc(c.title || '')}：${esc(c.verdict || '')}">${esc(c.id || '')}</span>`).join('');
  const outs = cases.filter((c) => !caught(c));
  return `<p class="fcap top">抽取结果和盲标答案逐项比，一格一项</p>${grid}
    <div class="tcs">${cards}</div>
    <p class="fcap">管线拦住 ${cases.length - outs.length} 个；没拦住 ${outs.length} 个：${outs.map((c) => `${esc(c.id)} ${esc(c.verdict)}`).join('；')}</p>`;
}

// 自己动手：四个小操作，各带一个“去试试”
function figHands(g, { px, example }) {
  const pts = g.points || [];
  const name = (i) => esc(String((pts[i] || {}).text || '').replace(/[。.]$/, ''));
  let links = ['workbench.html', 'workbench.html', 'workbench.html', 'workbench.html#v=verify'];
  if (px) {
    const { e, vs } = px, v1 = vs[0], flip = vs.find((v) => Math.sign((v.low ?? 0) + (v.high ?? 0)) !== Math.sign((v1.low ?? 0) + (v1.high ?? 0))) || vs[1];
    const base = `v=event&e=${encodeURIComponent(e.id)}&d=${flip.valid_from}`;
    links = [`workbench.html#${base}`,
      `workbench.html#${base}&src=${encodeURIComponent(flip.evidence_id)}&sq=${encodeURIComponent(flip.quote || '')}`,
      `workbench.html#${base}&da=${encodeURIComponent(v1.evidence_id)}&db=${encodeURIComponent(flip.evidence_id)}`,
      `workbench.html#v=verify${example ? '&q=' + encodeURIComponent(example) : ''}`];
  }
  const minis = [
    `<div class="mini m-date"><i class="lane"><u></u><u></u><u></u></i><i class="cur"></i></div>`,
    `<div class="mini m-src"><i></i><i class="hit"></i><i></i></div>`,
    `<div class="mini m-diff"><span><i></i><i class="d"></i><i></i></span><span><i></i><i class="d"></i><i></i></span></div>`,
    `<div class="mini m-ask"><i class="box"><em>${esc(example || '')}</em></i><i class="res"></i></div>`,
  ];
  return `<div class="hands">${minis.map((m, i) => `<a class="hand" style="--i:${i}" href="${links[i]}">${m}<b>${name(i)}</b><span>去试试 →</span></a>`).join('')}</div>`;
}

function countIn(art) {
  $$('[data-to]', art).forEach((b) => {
    const to = +b.dataset.to; if (reduce || !to) return;
    const t0 = performance.now(), f = () => { const k = Math.min(1, (performance.now() - t0) / 1200); b.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) setTimeout(f, 30); }; f();
  });
}
