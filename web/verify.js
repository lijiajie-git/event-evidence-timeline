// 消息查验：从一句话里读数字和单位，和 events.json 里各版本比对。纯前端，不调用模型。
// 返回 { steps: [...过程], matches: [...], event, numbers, verdict }，steps 给右侧"处理过程"用。

import { human } from './core.js';

// 输入和指标都换算到同一种基本单位再比：金额→元，股数→股，每股价格→元/股，比例→%
const DIM = {
  '亿元': ['money', 1e8], '亿': ['money', 1e8], '万元': ['money', 1e4], '万': ['money', 1e4], '元': ['money', 1],
  '亿股': ['shares', 1e8], '万股': ['shares', 1e4], '股': ['shares', 1],
  '元/股': ['price', 1], '元每股': ['price', 1], '%': ['pct', 1], '％': ['pct', 1],
};
const NUM_RE = /([-−－]?)(\d[\d,，]*(?:\.\d+)?)\s*(亿元|亿股|亿|万元|万股|万|元\/股|元每股|元|%|％|股)?/g;
const BASE = { money: '元', shares: '股', price: '元/股', pct: '%' };
const LINK_RE = /^\s*(至|到|~|～|-|—|–|－)\s*$/;
const LOSS_RE = /亏|负/;

// 通用财务词 → 指标名里的字。只用于在同一事件的多个指标里排先后，不决定是否匹配。
const HINTS = [
  [/扣非/, ['扣非']],
  [/归母|归属于|净利|预亏|预盈|亏损|盈利/, ['归母', '净利润']],
  [/营收|营业收入|收入/, ['营业收入']],
  [/利润总额/, ['利润总额']],
  [/作价|价格|对价|估值|收购|亿元收购|并购/, ['作价', '价格']],
  [/比例|股权|持股|%|％/, ['比例', '股权']],
];

function parseNumbers(text) {
  const raw = [];
  let m;
  NUM_RE.lastIndex = 0;
  while ((m = NUM_RE.exec(text))) {
    const digits = m[2].replace(/[,，]/g, '');
    const dec = (digits.split('.')[1] || '').length;
    raw.push({ text: m[0].trim(), neg: !!m[1], value: parseFloat(digits), dec, unit: m[3] || null, start: m.index, end: m.index + m[0].length });
  }
  // 年份、日期里的数字不算
  const nums = raw.filter((n) => !(n.unit == null && n.dec === 0 && n.value >= 1900 && n.value <= 2100) && !/^[年月日号]/.test(text.slice(n.end, n.end + 1)));
  // 区间：A 至 B，单位只写在后面的，前面借用
  const out = [];
  for (let i = 0; i < nums.length; i++) {
    const a = nums[i], b = nums[i + 1];
    const gap = b ? text.slice(a.end, b.start) : '';
    if (b && gap === '' && b.neg && /[-－—–]/.test(text[b.start])) b.neg = false; // 1.04-1.3亿 是区间，不是负数
    if (b && (LINK_RE.test(gap) || (gap === '' && !b.neg && /[-－—–]/.test(text[b.start])))) {
      if (!a.unit) a.unit = b.unit;
      out.push({ kind: 'range', a, b, text: text.slice(a.start, b.end) });
      i++;
    } else out.push({ kind: 'one', a, text: a.text });
  }
  return out.filter((x) => x.a.unit || (x.b && x.b.unit));
}

function toUnit(n) {
  const [dim, f] = DIM[n.unit] || [null, 1];
  // 写到几位小数，就按那一位四舍五入算容差
  return { dim, value: n.value * f, tol: 0.5 * Math.pow(10, -n.dec) * f + 1e-9 };
}

const nameCore = (name) => String(name || '').replace(/^\*?ST\s*/i, '').trim();

export function findEvent(text, events) {
  const hits = events.filter((e) => {
    const core = nameCore(e.name);
    return (e.code && text.includes(e.code)) || (core && text.includes(core)) || (core.length >= 2 && text.includes(core.slice(0, 2)));
  });
  return hits;
}

export function verify(text, data) {
  const events = (data && data.events) || [];
  const steps = [];
  const q = String(text || '').trim();
  if (!q) return { steps, matches: [], verdict: 'empty' };

  const cands = findEvent(q, events);
  steps.push({ t: '找事件', d: cands.length ? `按股票名称和代码，对上了：${cands.map((e) => e.name + '（' + e.code + '）').join('、')}` : `句子里没有认出已收录的股票，改为在全部 ${events.length} 个事件里比对` });
  const pool = cands.length ? cands : events;

  const nums = parseNumbers(q);
  if (!nums.length) {
    steps.push({ t: '读数字', d: '没有读到带单位的数字（亿元、万元、元、股、元/股、%）。查验只比对数字。' });
    return { steps, matches: [], verdict: 'no-number', events: cands };
  }
  steps.push({ t: '读数字', d: nums.map((n) => n.text).join('；') });

  const lossWord = LOSS_RE.test(q);
  const hintKeys = HINTS.filter(([re]) => re.test(q)).flatMap(([, ks]) => ks);

  const matches = [];
  const conv = [];
  nums.forEach((n) => {
    const a = toUnit(n.a), b = n.b ? toUnit(n.b) : null;
    conv.push(`${n.text} → ${fmt(a.value, a.dim)}${b ? ' 至 ' + fmt(b.value, a.dim) : ''}（容差 ±${fmt(Math.max(a.tol, b ? b.tol : 0), a.dim)}）`);
    pool.forEach((ev) => (ev.claims || []).forEach((c) => {
      const unit = c.unit || (c.versions[0] && c.versions[0].unit);
      const cd = DIM[unit];
      if (!cd || cd[0] !== a.dim) return;
      (c.versions || []).forEach((v) => {
        if (v.low == null || v.high == null) return;
        const lo = Math.min(Math.abs(v.low), Math.abs(v.high)) * cd[1], hi = Math.max(Math.abs(v.low), Math.abs(v.high)) * cd[1];
        let how = null, exact = false;
        if (b) {
          const x = Math.min(a.value, b.value), y = Math.max(a.value, b.value);
          const tx = a.value <= b.value ? a.tol : b.tol, ty = a.value <= b.value ? b.tol : a.tol;
          if (Math.abs(x - lo) <= tx && Math.abs(y - hi) <= ty) { how = '区间两端都对上'; exact = Math.abs(x - lo) < 1e-6 * Math.max(1, lo) && Math.abs(y - hi) < 1e-6 * Math.max(1, hi); }
        } else {
          if (lo === hi && Math.abs(a.value - lo) <= a.tol) { how = '数值对上'; exact = Math.abs(a.value - lo) < 1e-6 * Math.max(1, lo); }
          else if (lo !== hi && (Math.abs(a.value - lo) <= a.tol || Math.abs(a.value - hi) <= a.tol)) how = '只对上区间的一端';
        }
        if (!how) return;
        const negV = v.low < 0 || v.high < 0;
        const signNote = negV && !(n.a.neg || lossWord) ? '原文是负数（亏损），你的句子里没写正负' : (!negV && (n.a.neg) ? '原文是正数，你的句子里写成了负数' : '');
        const hint = hintKeys.some((k) => c.key.includes(k)) ? 1 : 0;
        const score = (how === '区间两端都对上' || how === '数值对上' ? 2 : 1) + hint + (signNote ? -0.5 : 0);
        matches.push({ ev, claim: c, v, how, exact, signNote, score, input: n.text });
      });
    }));
  });
  steps.push({ t: '换算单位', d: conv.join('；') });

  if (!matches.length) {
    const tried = pool.flatMap((e) => (e.claims || []).map((c) => `${e.name}${c.key}（${c.versions.length} 版）`));
    steps.push({ t: '比对', d: `和 ${tried.length} 个指标的各版本逐个比对，没有一版对得上。比对过：${tried.join('、') || '无'}` });
    return { steps, matches: [], verdict: 'no-match', events: cands, numbers: nums };
  }
  matches.sort((x, y) => y.score - x.score);
  const best = matches.filter((m) => m.score === matches[0].score);
  steps.push({ t: '比对', d: `对上 ${matches.length} 处，按"两端都对上 > 只对一端"和指标名排序，取最好的 ${best.length} 处` });
  return { steps, matches: best, others: matches.slice(best.length), verdict: 'match', events: cands, numbers: nums };
}

function fmt(n, dim) { return human(n, BASE[dim] || '') || String(n); }

// 给页面的人话结论
export function describe(m, D) {
  const vs = m.claim.versions;
  const n = vs.indexOf(m.v) + 1;
  const cur = vs.find((v) => !v.valid_to || D < v.valid_to) || vs[vs.length - 1];
  return { n, total: vs.length, cur, isCurrent: cur === m.v };
}

// 例句：挑四条最有代表性的（首个业绩事件的归母、扣非，收购作价，另一个事件的营业收入），
// 每条都按指标自己的单位写，并且都能在查验里对上第一版
export function exampleSentences(data) {
  const evs = (data && data.events) || [];
  const nums = (c) => (c.versions || []).filter((v) => v.low != null && v.high != null);
  const find = (e, re, min = 1) => (e.claims || []).find((c) => re.test(c.key) && nums(c).length >= min);
  const picks = [];
  const first = evs.find((e) => find(e, /归母/, 2));
  if (first) { picks.push([first, find(first, /归母/, 2)]); const k = find(first, /扣非/, 2); if (k) picks.push([first, k]); }
  const deal = evs.find((e) => find(e, /作价/)); if (deal) picks.push([deal, find(deal, /作价/)]);
  const rev = evs.find((e) => e !== first && find(e, /^营业收入$/, 2)); if (rev) picks.push([rev, find(rev, /^营业收入$/, 2)]);
  return picks.map(([e, c]) => sentence(e, c, nums(c)[0]));
}
function sentence(e, c, v) {
  const core = nameCore(e.name);
  const unit = c.unit || v.unit;
  const A = Math.min(Math.abs(v.low), Math.abs(v.high)), B = Math.max(Math.abs(v.low), Math.abs(v.high));
  const body = A === B ? human(A, unit) : `${human(A, unit)}至 ${human(B, unit)}`;
  if (/利润/.test(c.key) && v.low < 0) return `${core}${/扣非/.test(c.key) ? '扣非' : ''}预亏 ${body}`;
  return `${core}${c.key.replace(/（.*?）/g, '')} ${body}`;
}
