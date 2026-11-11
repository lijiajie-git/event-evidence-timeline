// 消息查验：从一句话里读数字和单位，和 events.json 里各版本比对。纯前端，不调用模型。
// 返回 { steps: [...过程], matches: [...], event, numbers, verdict }，steps 给右侧"处理过程"用。

const UNIT = { '亿元': ['万元', 10000], '亿': ['万元', 10000], '万元': ['万元', 1], '万': ['万元', 1], '元': ['万元', 0.0001], '%': ['%', 1], '％': ['%', 1] };
const NUM_RE = /([-−－]?)(\d[\d,，]*(?:\.\d+)?)\s*(亿元|亿|万元|万|元|%|％)?/g;
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
  const [unit, f] = UNIT[n.unit] || [null, 1];
  // 写到几位小数，就按那一位四舍五入算容差
  return { unit, value: n.value * f, tol: 0.5 * Math.pow(10, -n.dec) * f + 1e-9 };
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
    steps.push({ t: '读数字', d: '没有读到带单位的数字（亿、万、元、%）。查验只比对数字。' });
    return { steps, matches: [], verdict: 'no-number', events: cands };
  }
  steps.push({ t: '读数字', d: nums.map((n) => n.text).join('；') });

  const lossWord = LOSS_RE.test(q);
  const hintKeys = HINTS.filter(([re]) => re.test(q)).flatMap(([, ks]) => ks);

  const matches = [];
  const conv = [];
  nums.forEach((n) => {
    const a = toUnit(n.a), b = n.b ? toUnit(n.b) : null;
    conv.push(`${n.text} → ${fmt(a.value, a.unit)}${b ? ' 至 ' + fmt(b.value, b.unit) : ''}（容差 ±${fmt(Math.max(a.tol, b ? b.tol : 0), a.unit)}）`);
    pool.forEach((ev) => (ev.claims || []).forEach((c) => {
      const unit = c.unit || (c.versions[0] && c.versions[0].unit);
      if (unit !== a.unit) return;
      (c.versions || []).forEach((v) => {
        if (v.low == null && v.high == null) return;
        const lo = Math.min(Math.abs(v.low), Math.abs(v.high)), hi = Math.max(Math.abs(v.low), Math.abs(v.high));
        let how = null, exact = false;
        if (b) {
          const x = Math.min(a.value, b.value), y = Math.max(a.value, b.value);
          const tx = a.value <= b.value ? a.tol : b.tol, ty = a.value <= b.value ? b.tol : a.tol;
          if (Math.abs(x - lo) <= tx && Math.abs(y - hi) <= ty) { how = '区间两端都对上'; exact = Math.abs(x - lo) < 1e-6 && Math.abs(y - hi) < 1e-6; }
        } else {
          if (lo === hi && Math.abs(a.value - lo) <= a.tol) { how = '数值对上'; exact = Math.abs(a.value - lo) < 1e-6; }
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

function fmt(n, unit) {
  if (unit === '%') return +n.toFixed(4) + '%';
  return (+n.toFixed(4)).toLocaleString('en-US', { maximumFractionDigits: 4 }) + ' 万元';
}

// 给页面的人话结论
export function describe(m, D) {
  const vs = m.claim.versions;
  const n = vs.indexOf(m.v) + 1;
  const cur = vs.find((v) => !v.valid_to || D < v.valid_to) || vs[vs.length - 1];
  return { n, total: vs.length, cur, isCurrent: cur === m.v };
}

// 用数据生成几个能查验的例句：每个有多版数字的指标，取第一版，写成媒体常见的说法
export function exampleSentences(data) {
  const out = [];
  ((data && data.events) || []).forEach((e) => (e.claims || []).forEach((c) => {
    const vs = (c.versions || []).filter((v) => v.low != null);
    if (vs.length < 2) return;
    const v = vs[0];
    const core = nameCore(e.name);
    const unit = c.unit || v.unit;
    const f = (n) => (unit === '万元' && Math.abs(n) >= 10000 ? +(Math.abs(n) / 10000).toFixed(2) + ' 亿' : unit === '%' ? Math.abs(n) + '%' : Math.abs(n).toLocaleString('en-US') + ' 万');
    const loss = v.low < 0 && /利润/.test(c.key);
    const a = Math.abs(v.low) < Math.abs(v.high) ? v.low : v.high, b = a === v.low ? v.high : v.low;
    const nums = v.low === v.high ? f(v.low) : `${f(a)}至 ${f(b)}`.replace(/(亿|万)至/, '$1至');
    const lead = loss ? (c.key.includes('扣非') ? '扣非预亏 ' : /归母|^净利润/.test(c.key) ? '预亏 ' : c.key + '亏损 ') : c.key + ' ';
    out.push({ ev: e.id, t: core + lead + nums });
  }));
  // 每个事件最多两句，事件之间交替
  const per = {}; out.forEach((x) => (per[x.ev] = per[x.ev] || []).push(x.t));
  const lists = Object.values(per).map((l) => l.slice(0, 2)), res = [];
  for (let i = 0; i < 2; i++) lists.forEach((l) => l[i] && res.push(l[i]));
  return [...new Set(res)];
}
