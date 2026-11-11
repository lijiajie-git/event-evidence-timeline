// 公告正文：读取、按段整理、定位引用、两版对比。纯前端。
// 正文是 PDF 转出来的，换行和空格是乱的；匹配时两边都去掉空白，并把全角逗号当半角（和组装脚本的校验口径一致）。

const cache = new Map();
export const textPath = (ref) => `data/raw/text/${encodeURIComponent(ref)}.txt`;

export async function loadText(ref) {
  if (!ref) return { ok: false, error: '证据没有公告编号' };
  if (cache.has(ref)) return cache.get(ref);
  const p = (async () => {
    try {
      const r = await fetch(textPath(ref));
      if (!r.ok) return { ok: false, error: r.status === 404 ? '正文文件不存在（404）' : `服务器返回 ${r.status}` };
      return { ok: true, paras: reflow(await r.text()) };
    } catch (e) { return { ok: false, error: '读取失败：' + e.message }; }
  })();
  cache.set(ref, p);
  return p;
}

// 把 PDF 的断行接回段落：上一行以句末标点结束、或下一行像条目开头，才分段
const END = /[。；：！？”」）)]$/;
const START = /^(第[一二三四五六七八九十]+[章节条]|[一二三四五六七八九十]+、|（[一二三四五六七八九十0-9]+）|\([0-9]+\)|[0-9]+[、.．]|特此公告|证券代码|董事会|本公司|重要内容提示|·|[A-Z]\.)/;
export function reflow(raw) {
  const all = raw.replace(/[\ue000-\uf8ff]/g, '·').replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  // 去掉页码和每页重复的页眉
  const head = all[0];
  const lines = all.filter((l, k) => !/^\d{1,3}$/.test(l) && !(k > 0 && l === head));
  const paras = [];
  for (const l of lines) {
    const prev = paras[paras.length - 1];
    if (!prev || END.test(prev) || START.test(l) || prev.length < 22) paras.push(l);
    else paras[paras.length - 1] = prev + (/[A-Za-z0-9]$/.test(prev) && /^[A-Za-z0-9]/.test(l) ? ' ' : '') + l;
  }
  return paras.map((p) => p.replace(/\s{2,}/g, ' '));
}

const norm1 = (c) => (c === '，' ? ',' : c);
export const norm = (s) => String(s || '').replace(/\s+/g, '').replace(/，/g, ',');

// 在段落里找引用。返回 [{p, from, to}]（可能跨段），找不到返回 null
export function locate(paras, quote) {
  const q = norm(quote);
  if (!q) return null;
  let flat = '';
  const map = [];
  paras.forEach((p, pi) => { for (let i = 0; i < p.length; i++) { if (/\s/.test(p[i])) continue; flat += norm1(p[i]); map.push([pi, i]); } });
  const at = flat.indexOf(q);
  if (at < 0) return null;
  const spans = [];
  for (let k = at; k < at + q.length; k++) {
    const [pi, ci] = map[k];
    const last = spans[spans.length - 1];
    if (last && last.p === pi) last.to = ci + 1; else spans.push({ p: pi, from: ci, to: ci + 1 });
  }
  return spans;
}

// ---------- 对比 ----------
export function sentences(paras) {
  const out = [];
  paras.forEach((p) => { (p.match(/[^。；！？]+[。；！？]?/g) || [p]).forEach((s) => { const t = s.trim(); if (t) out.push(t); }); });
  return out;
}
function lcsOps(a, b, eq) {
  const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = eq(a[i], b[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ops = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) { ops.push(['=', a[i], b[j]]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) ops.push(['-', a[i++], null]);
    else ops.push(['+', null, b[j++]]);
  }
  while (i < n) ops.push(['-', a[i++], null]);
  while (j < m) ops.push(['+', null, b[j++]]);
  return ops;
}
// 两版对照：完全相同的句子只计数；其余句子按相似度两两配对（不要求顺序，
// 因为更正公告会把旧数字挪到“更正前”一段里）；配不上的单列“只在新版”“只在旧版”。
export function diffDocs(parasA, parasB) {
  const A = sentences(parasA), B = sentences(parasB);
  if (A.length * B.length > 250000) return null;
  const nA = A.map(norm), nB = B.map(norm);
  const pool = new Map(); nA.forEach((x, i) => { if (!pool.has(x)) pool.set(x, []); pool.get(x).push(i); });
  const usedA = new Set(), exactB = new Set();
  nB.forEach((x, j) => { const l = pool.get(x); if (l && l.length) { usedA.add(l.shift()); exactB.add(j); } });
  const restA = A.map((_, i) => i).filter((i) => !usedA.has(i)), restB = B.map((_, j) => j).filter((j) => !exactB.has(j));
  const cand = [];
  restA.forEach((i) => restB.forEach((j) => { const sc = sim(A[i], B[j]); if (sc >= 0.45) cand.push([sc, i, j]); }));
  cand.sort((x, y) => y[0] - x[0]);
  const pairB = new Map(), pairedA = new Set();
  cand.forEach(([, i, j]) => { if (!pairedA.has(i) && !pairB.has(j)) { pairedA.add(i); pairB.set(j, i); } });
  const rows = [];
  let same = 0;
  B.forEach((t, j) => {
    if (exactB.has(j)) { same++; const last = rows[rows.length - 1]; if (last && last.type === 'same') last.n++; else rows.push({ type: 'same', n: 1 }); return; }
    rows.push(pairB.has(j) ? { type: 'change', a: A[pairB.get(j)], b: t } : { type: 'change', a: null, b: t });
  });
  restA.filter((i) => !pairedA.has(i)).forEach((i) => rows.push({ type: 'change', a: A[i], b: null }));
  const changed = rows.filter((r) => r.type === 'change');
  return { rows, same, changed: changed.length, edited: changed.filter((r) => r.a && r.b).length, added: changed.filter((r) => !r.a).length, removed: changed.filter((r) => !r.b).length, totalA: A.length, totalB: B.length };
}
function grams(t) { const n = norm(t), g = new Set(); for (let i = 0; i < n.length - 1; i++) g.add(n.slice(i, i + 2)); return g; }
function sim(a, b) { const A = grams(a), B = grams(b); if (!A.size || !B.size) return 0; let k = 0; A.forEach((g) => B.has(g) && k++); return k / Math.min(A.size, B.size) * (Math.min(A.size, B.size) / Math.max(A.size, B.size)) ** 0.5; }
// 一对句子里，标出不同的字。返回 [[text, changed], ...] 两份
export function charDiff(a, b) {
  if (!a || !b) return [a ? [[a, true]] : [], b ? [[b, true]] : []];
  if (a.length * b.length > 1000000) return [[[a, true]], [[b, true]]];
  // 按“词”比：整个数字（含正负号、千分位、小数）算一个单位，其余逐字
  const tok = (t) => t.match(/[-−－]?\d[\d,，]*(?:\.\d+)?%?|\s+|./gu) || [];
  const ops = lcsOps(tok(a), tok(b), (x, y) => x === y || (/^\s+$/.test(x) && /^\s+$/.test(y)));
  const L = [], R = [];
  const push = (arr, t, c) => { const last = arr[arr.length - 1]; if (last && last[1] === c) last[0] += t; else arr.push([t, c]); };
  ops.forEach(([op, x, y]) => { if (op === '=') { push(L, x, false); push(R, y, false); } else if (op === '-') push(L, x, true); else push(R, y, true); });
  // 零碎的一两个相同字夹在改动中间时并进改动，读起来更整
  // 只差空白的不算改动
  const tidy = (arr) => arr.map(([t, c], i) => [t, (c && /\S/.test(t)) || (t.length <= 1 && arr[i - 1] && arr[i - 1][1] && arr[i + 1] && arr[i + 1][1])]);
  return [tidy(L), tidy(R)];
}
