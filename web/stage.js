// 演示页：左边 iPad 里跑工作台（workbench.html?embed），右边回放后台处理过程。
// 每一段的例子都从数据里挑，不写死事件编号；数据变了，演示跟着变。
import {
  PATHS, load, esc, miss, md, rangeText, change, evidenceById, disclosedOf, today, docName, bj,
} from './core.js';
import { verify, describe, exampleSentences } from './verify.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

let DATA, QA, WB, CH = [];
const P = { ci: 0, bi: 0, auto: false, timer: null, mode: 'idle', chapterOnly: false, t0: 0 };

// ---------------- 主题：外层默认深色，切换时 iPad 一起切 ----------------
function initStageTheme() {
  const btn = $('#theme'), root = document.documentElement;
  let saved = null; try { saved = localStorage.getItem('eet-stage-theme'); } catch (e) { /* 忽略 */ }
  if (saved === 'light') root.dataset.theme = 'light';
  const label = () => { btn.textContent = root.dataset.theme === 'light' ? '深色' : '浅色'; };
  btn.addEventListener('click', () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next === 'light' ? 'light' : '';
    if (next === 'dark') delete root.dataset.theme;
    try { localStorage.setItem('eet-stage-theme', next); localStorage.setItem('eet-theme', next); } catch (e) { /* 忽略 */ }
    const doc = $('#ipad-frame').contentDocument; if (doc) doc.documentElement.dataset.theme = next;
    label();
  });
  label();
}

// ---------------- 选例子 ----------------
const evName = (e, x) => (x ? (x.src === 'ann' ? docName(x) : `${x.source || docName(x)}`) : '未知证据');
const tierOf = (x) => (x && x.source_tier ? x.source_tier + ' 级' : '级别未抽取');
const L = (k, t, r = '', cls = '') => ({ k, t, r, cls });
const take = (t) => ({ take: true, t });

function overview() {
  const ev = DATA.events;
  const all = ev.flatMap((e) => e.evidence || []);
  const n = (f) => all.filter(f).length;
  const versions = ev.flatMap((e) => (e.claims || []).flatMap((c) => c.versions || []));
  const bars = ev.reduce((s, e) => s + ((e.prices && !e.prices.error && e.prices.bars) ? e.prices.bars.length : 0), 0);
  const conf = ev.reduce((s, e) => s + (e.conflicts || []).length, 0);
  const outd = n((x) => x.outdated_by);
  const concl = ev.reduce((s, e) => s + (e.conclusions || []).length, 0);
  const first = ev[0];
  return {
    id: 'intro', name: '总览', eyebrow: '00 · 先看全貌',
    title: '同一件事，被说了几遍，改了几次',
    lede: `收录了 <b>${ev.length}</b> 个真实事件。一件事会以公告、快讯、评论、研报、异动解读的形式反复出现，数字还会被公司自己改。工作台是用户看到的页面；“后台做了什么”回放这些内容是怎么来的。`,
    beats: [{
      ms: 6200, go: { view: 'event', event: first.id, date: today(DATA), top: true },
      log: [
        L('抓取', `巨潮资讯网公告 <b>${n((x) => x.src === 'ann')}</b> 条`, '规则'),
        L('抓取', `扶摇接口：新闻 <b>${n((x) => x.src === 'news')}</b> 条，异动解读 <b>${n((x) => x.src === 'anomaly')}</b> 条，日 K 线 <b>${bars}</b> 根`, '规则'),
        L('抽取', `大模型在本地读正文：<b>${versions.length}</b> 个数字版本，<b>${concl}</b> 份分时点结论，每条带原文引用`, '模型'),
        L('校验', '每条引用拿回原文逐字匹配；结论不能引用"截至日"之后的证据。有一条不通过就不生成数据文件', '通过', 'ok'),
        L('发现', `证据冲突 <b>${conf}</b> 处，前提被后来事实推翻的观点 <b>${outd}</b> 条`, '规则'),
        take('下面每一段讲一个痛点，例子都来自真实公告。演示会自己往下走；你在工作台里点任何地方，它就停下来交给你。'),
      ],
    }],
  };
}

function chExpire() {
  let best = null;
  DATA.events.forEach((e) => (e.claims || []).forEach((c) => {
    const vs = (c.versions || []).filter((v) => v.low != null || v.high != null);
    if (!best || vs.length > best.vs.length) best = { e, c, vs };
  }));
  if (!best || best.vs.length < 2) return null;
  const { e, c, vs } = best;
  const unit = c.unit || vs[0].unit;
  const flips = (e.claims || []).map((k) => { const ns = (k.versions || []).filter((v) => v.low != null); return ns.length > 1 && /转/.test(change(ns[0], ns[ns.length - 1])) ? `${k.key}${change(ns[0], ns[ns.length - 1])}` : ''; }).filter(Boolean);
  return {
    id: 'expire', name: '消息会过期', eyebrow: '01 · 消息会过期，但没人告诉你',
    title: `${e.name}的${c.key}，前后改了 ${vs.length - 1} 次`,
    lede: `第一次看到的数字，几个月后可能已经不算数了。公司发了更正，但转载过的旧消息不会自己更新。`,
    beats: vs.map((v, i) => {
      const x = evidenceById(e, v.evidence_id);
      const log = [
        L('读取', `${esc(evName(e, x))}（${esc(v.valid_from)}）${x && x.title ? '：' + esc(x.title.slice(0, 26)) : ''}`, '规则'),
        L('抽取', `${esc(c.key)} <b>${esc(rangeText(v, unit, 'exact'))}</b>${v.basis ? '，' + esc(v.basis) : ''}`, '模型'),
        L('校验', v.quote ? `原文 <q>${esc(v.quote)}</q>` : `原文引用${miss('未记录')}`, v.quote ? '逐字匹配' : '缺引用', v.quote ? 'ok' : 'bad'),
      ];
      if (i > 0) log.push(L('关联', `第 ${i} 版的有效期截到 ${esc(v.valid_from)}，标为“被取代”，保留不删`, '规则'));
      if (i === vs.length - 1) log.push(take(`${md(vs[0].valid_from)} 看到“${esc(rangeText(vs[0], unit))}”的人，${md(vs[1].valid_from)} 之后手里就是旧数了${flips.length ? `；同一件事里，${esc(flips.join('、'))}` : ''}。页面上旧版不删，只是变淡；蓝色是那一天算数的版本。`));
      return { ms: i === vs.length - 1 ? 6500 : 3600, go: { view: 'event', event: e.id, date: v.valid_from, section: 's-claims', claimMode: 'line' }, log };
    }),
  };
}

function chRetell() {
  let best = null;
  DATA.events.forEach((e) => (e.conflicts || []).forEach((c) => {
    const tiers = (c.quotes || []).map((q) => (evidenceById(e, q.evidence_id) || {}).source_tier);
    const mixed = tiers.some((t) => t === 'A') && tiers.some((t) => t && t !== 'A');
    const score = (mixed ? 2 : 0) + (/数字|口径/.test(c.kind || '') ? 1 : 0) + (/日期/.test(c.kind || '') ? .5 : 0) - (/状态/.test(c.kind || '') ? 1 : 0);
    if (!best || score > best.score) best = { e, c, score };
  }));
  if (!best) return null;
  const { e, c } = best;
  const at = c.first_seen || (c.evidence_ids || []).map((id) => disclosedOf(evidenceById(e, id))).sort().pop();
  return {
    id: 'retell', name: '转述对不上', eyebrow: '02 · 二手转述和一手对不上',
    title: `${e.name}：${c.kind || '说法不一致'}`,
    lede: '快讯、评论写的数字和日期，跟公告原文不一定一样。差得不多，就更难发现。',
    beats: [
      { ms: 4600, go: { view: 'event', event: e.id, date: at, selector: '#cf-' + c.id },
        log: (c.quotes || []).map((q) => { const x = evidenceById(e, q.evidence_id); return L('比对', `${esc(evName(e, x))}（${tierOf(x)}）<q>${esc(q.quote)}</q>`, '规则'); }) },
      { ms: 6500, go: {},
        log: [DATA.weight_rule ? L('规则', esc(DATA.weight_rule), '规则') : null,
          L('处理', esc(c.resolution || '未写处理方式'), esc(c.resolved_by || ''), c.resolved_by === '推断' ? 'bad' : 'ok'),
          take(esc(c.text || ''))].filter(Boolean) },
    ],
  };
}

function chPremise() {
  let pick = null;
  DATA.events.forEach((e) => (e.evidence || []).forEach((x) => { if (!pick && x.outdated_by && evidenceById(e, x.outdated_by)) pick = { e, x, by: evidenceById(e, x.outdated_by) }; }));
  if (!pick) return null;
  const { e, x, by } = pick;
  const same = (e.evidence || []).filter((y) => y.outdated_by === x.outdated_by && y.id !== x.id);
  return {
    id: 'premise', name: '前提会失效', eyebrow: '03 · 观点建立在会失效的前提上',
    title: `“${x.quote || x.title}”之后发生了什么`,
    lede: '研报和评论的判断，往往默认事情会按原计划走。前提变了，观点还挂在网上，没人回头标注。',
    beats: [
      { ms: 4800, go: { view: 'event', event: e.id, date: disclosedOf(x), focus: x.id },
        log: [L('读取', `${esc(x.source || '')}（${tierOf(x)}，${esc(x.times && x.times.disclosed || '')}）<q>${esc(x.quote || x.title || '')}</q>`, '规则'),
          L('分类', `标为“${esc(x.kind || '未分类')}”，权重 ${esc(x.weight ?? '未记录')}：这是判断，不是进展`, '模型')] },
      { ms: 6800, go: { view: 'event', event: e.id, date: disclosedOf(by), focus: x.id },
        log: [L('读取', `${esc(evName(e, by))}（${esc(disclosedOf(by))}）：${esc(by.summary || by.title || '')}`, '规则'),
          L('关联', esc(x.outdated_note || '前提不再成立'), '前提失效', 'bad'),
          same.length ? L('关联', `同一份公告还推翻了：${same.map((y) => esc(y.source || y.id) + '“' + esc(y.quote || y.title || '') + '”').join('；')}`, '前提失效', 'bad') : null,
          take(`观点不删，标上“前提已失效”。回放到 ${md(disclosedOf(by))} 之前，它看起来还是一条正常的研报。`)].filter(Boolean) },
    ],
  };
}

function chStatus() {
  let pick = null;
  DATA.events.forEach((e) => {
    const c = (e.conflicts || []).find((k) => /状态/.test(k.kind || ''));
    const h = e.status_history || [];
    const score = (c ? 10 : 0) + h.length;
    if (h.length >= 3 && (!pick || score > pick.score)) pick = { e, c, h, score };
  });
  if (!pick) return null;
  const { e, c, h } = pick;
  const tail = h.slice(-3);
  const media = c ? (c.quotes || []).map((q) => ({ q, x: evidenceById(e, q.evidence_id) })).find((o) => o.x && o.x.source_tier !== 'A') : null;
  return {
    id: 'status', name: '状态说粗了', eyebrow: '04 · 状态被说粗了',
    title: tail.map((s) => s.status).join(' → '),
    lede: '“审核未通过”不等于“交易终止”。标题为了好读会把几步并成一步，可中间那几天的状态完全不同。',
    beats: tail.map((s, i) => {
      const x = evidenceById(e, s.evidence_id);
      const log = [];
      if (i === 0 && media) log.push(L('对照', `${esc(media.x.source || '')}（${tierOf(media.x)}，${esc(disclosedOf(media.x))}）<q>${esc(media.q.quote)}</q>`, '规则'));
      log.push(L('状态', `${esc(s.at)} <b>${esc(s.status)}</b> ← ${esc(evName(e, x))}`, '公告', 'ok'));
      if (i === tail.length - 1) log.push(take(esc((c && c.resolution) || '状态只按公告和交易所文件走，媒体的概括不改变状态。')));
      return { ms: i === tail.length - 1 ? 6800 : 3600, go: { view: 'event', event: e.id, date: s.at, focus: s.evidence_id }, log };
    }),
  };
}

function chQA() {
  const base = { id: 'qa', name: '摘要能核对', eyebrow: '05 · AI 摘要没法核对', title: '每一句回答都挂着证据', lede: '一般的 AI 摘要读起来很顺，但哪句是公告原话、哪句是它猜的，看不出来；问“当时”的情况，它还会把后来的消息掺进去。' };
  if (!QA || !QA.items.length) {
    return { ...base, beats: [{ ms: 6000, go: { view: 'qa' }, log: [L('读取', `<code>${esc(PATHS.qa)}</code>`, '未生成', 'bad'), take('预置问答还没有生成。生成以后，这一段会回放一个问题从定位事件、取证据到逐句校验的全过程。')] }] };
  }
  const future = (i) => (i.trace || []).flatMap((t) => t.excluded || []).filter((x) => /晚于|之后才/.test(x.reason || '')).length;
  const items = QA.items.filter((i) => Array.isArray(i.trace));
  const q = items.slice().sort((x, y) => future(y) - future(x))[0] || QA.items[0];
  const tr = Array.isArray(q.trace) ? q.trace : [];
  const sent = Array.isArray(q.answer) ? q.answer : [];
  const kinds = {}; sent.forEach((x) => (kinds[x.kind] = (kinds[x.kind] || 0) + 1));
  const traceLog = [];
  tr.forEach((t, i) => {
    traceLog.push(L(`第${i + 1}步`, `<b>${esc(t.step || '')}</b> ${esc(t.detail || '')}${t.used && t.used.length ? `；用了 ${t.used.map(esc).join('、')}` : ''}`,
      t.checks && t.checks.length ? (t.checks.every((c) => c.pass) ? '校验通过' : '有未通过') : '', t.checks && t.checks.some((c) => !c.pass) ? 'bad' : 'ok'));
    (t.excluded || []).forEach((x) => traceLog.push(L('排除', `${esc(x.id)}：${esc(x.reason)}`, /晚于|之后才/.test(x.reason || '') ? '未来证据' : '不采用', /晚于|之后才/.test(x.reason || '') ? 'bad' : '')));
  });
  const nFuture = future(q);
  const beats = [
    { ms: 4000, go: { view: 'qa', qa: q.id, openTrace: false, ask: '' }, log: [L('问题', esc(q.question || ''), '预置'), L('时点', `截至 ${esc(q.as_of || '未记录')}${nFuture ? `，之后披露的 ${nFuture} 条证据一律不用` : ''}`, '规则')] },
    { ms: 5600 + traceLog.length * 600, go: { view: 'qa', qa: q.id, openTrace: true, selector: '.trace' },
      log: [...traceLog, take(`回答 ${sent.length} 句：${Object.entries(kinds).map(([k, n]) => `${esc(k)} ${n} 句`).join('，')}。每句挂证据编号，点编号看原文。${nFuture ? `回到 ${esc(q.as_of)} 问，${nFuture} 条更晚的公告被明确排除，不会“事后诸葛亮”。` : ''}`)] },
  ];
  // 买卖类问题：先说明不回答，再给已披露的事实
  const no = QA.items.find((i) => (i.answer || []).some((x) => x.kind === '不回答'));
  if (no) {
    const refuse = no.answer.find((x) => x.kind === '不回答');
    const facts = no.answer.filter((x) => x.kind !== '不回答');
    beats.push({ ms: 6400, go: { view: 'qa', qa: no.id, openTrace: false },
      log: [L('问题', esc(no.question || ''), '预置'), L('不回答', esc(refuse.text), '边界', 'bad'),
        ...facts.map((x) => L(esc(x.kind || ''), esc(x.text), (x.evidence_ids || []).map(esc).join(' '))),
        take('买卖和涨跌不回答，但已经披露的事实照样给出，并挂上证据。')] });
  }
  return { ...base, title: q.question || base.title, beats };
}

function chVerify() {
  const ex = exampleSentences(DATA)[0];
  if (!ex) return null;
  const r = verify(ex, DATA);
  const log = r.steps.map((s) => L(s.t.slice(0, 4), esc(s.d), '浏览器'));
  if (r.verdict === 'match') {
    const m = r.matches[0]; const d = describe(m, today(DATA));
    const by = m.v.superseded_by ? evidenceById(m.ev, m.v.superseded_by) : null;
    log.push(L('结论', `第 <b>${d.n}</b> 版（共 ${d.total} 版）${d.isCurrent ? '，仍是现行版本' : `，${esc(m.v.valid_to || '')} 被 ${esc(docName(by))} 取代；现在算数的是 <b>${esc(rangeText(d.cur, m.claim.unit))}</b>`}`, '浏览器', 'ok'));
  }
  log.push(take('这一步就在你的浏览器里算，不调用模型。换一句你自己看到的消息试试；对不上，它会直说对不上。'));
  return {
    id: 'verify', name: '查一句话', eyebrow: '06 · 自己查一句',
    title: `“${ex}”还算数吗？`,
    lede: '贴一句看到的话，页面读出数字和单位，和每一版比对，告诉你这是第几版、哪天被谁取代、现在算数的是多少。',
    beats: [{ ms: 7600, go: { view: 'verify', verify: ex }, log }],
  };
}

function chEnd() {
  return {
    id: 'end', name: '自己试', eyebrow: '演示结束',
    title: '演示里的工作台就是完整产品',
    lede: '可以直接在工作台里点：换事件、拖“截至”回放、点证据编号看原文、在“消息查验”里输入一句话。',
    beats: [{ ms: 1, go: { view: 'event', event: DATA.events[0].id, date: today(DATA), top: true },
      log: [L('入口', `<a href="workbench.html">全屏打开工作台 →</a>`), L('入口', `<a href="#audit">核查记录：每次构建拦下了什么 →</a>`), L('入口', `<a href="#eval">评测成绩单 →</a>`), L('入口', `<a href="#how">为什么网页不实时调模型 →</a>`)] }],
  };
}

// ---------------- 播放 ----------------
function renderRail() {
  $('#steps').innerHTML = CH.map((c, i) => `<button data-ch="${i}" class="${i === P.ci ? 'on' : i < P.ci ? 'done' : ''}"><i>${String(i).padStart(2, '0')}</i>${esc(c.name)}</button>`).join('');
}
function remaining() {
  let ms = 0;
  CH.forEach((c, i) => c.beats.forEach((b, j) => { if (i > P.ci || (i === P.ci && j > P.bi)) ms += b.ms; }));
  return Math.round(ms / 1000);
}
function setMode() {
  const m = $('#mode'), btn = $('#play');
  const s = remaining();
  if (P.mode === 'auto') { m.textContent = `自动播放 · 还剩 ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; btn.textContent = '暂停'; btn.classList.remove('primary'); }
  else if (P.mode === 'chapter') { m.textContent = '播放这一段'; btn.textContent = '暂停'; btn.classList.remove('primary'); }
  else if (P.mode === 'hand') { m.textContent = '你在操作，演示已停'; btn.textContent = '继续演示'; btn.classList.add('primary'); }
  else if (P.mode === 'done') { m.textContent = '演示结束'; btn.textContent = '重播'; btn.classList.add('primary'); }
  else { m.textContent = '已暂停'; btn.textContent = '继续演示'; btn.classList.add('primary'); }
}
function line(o) {
  if (!o) return '';
  if (o.take) return `<li class="take">${o.t}</li>`;
  return `<li><span class="k">${esc(o.k)}</span><span class="t">${o.t}</span><span class="r ${o.cls || ''}">${o.r || ''}</span></li>`;
}
let stagger = [];
function show(ci, bi, instantPrev = false) {
  stagger.forEach(clearTimeout); stagger = [];
  const chChanged = ci !== P.ci || !$('#ai-title').textContent;
  P.ci = ci; P.bi = bi;
  const c = CH[ci], b = c.beats[bi];
  if (chChanged || instantPrev) {
    $('#ai-eyebrow').textContent = c.eyebrow;
    $('#ai-title').textContent = c.title;
    $('#ai-lede').innerHTML = c.lede;
    $('#log').innerHTML = c.beats.slice(0, bi).flatMap((x) => x.log).map(line).join('');
  }
  if (b.go && Object.keys(b.go).length) WB.go(b.go);
  const lines = b.log || [];
  const step = reduce ? 0 : Math.min(650, (b.ms * 0.55) / Math.max(1, lines.length));
  lines.forEach((o, i) => stagger.push(setTimeout(() => { $('#log').insertAdjacentHTML('beforeend', line(o)); const lg = $('#log'); lg.scrollTop = lg.scrollHeight; }, i * step)));
  renderRail(); setMode();
  progress(b.ms);
}
let raf = 0;
function progress(ms) {
  cancelAnimationFrame(raf);
  const el = $('#steps .on'); if (!el) return;
  const c = CH[P.ci]; const total = c.beats.reduce((s, b) => s + b.ms, 0) || 1;
  const done = c.beats.slice(0, P.bi).reduce((s, b) => s + b.ms, 0);
  const t0 = performance.now();
  const tick = (t) => {
    const k = P.mode === 'auto' || P.mode === 'chapter' ? Math.min(1, (done + (t - t0)) / total) : (done + ms) / total;
    el.style.setProperty('--p', k.toFixed(3));
    if ((P.mode === 'auto' || P.mode === 'chapter') && k < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}
function schedule() {
  clearTimeout(P.timer);
  if (P.mode !== 'auto' && P.mode !== 'chapter') return;
  P.timer = setTimeout(advance, CH[P.ci].beats[P.bi].ms);
}
function advance() {
  const c = CH[P.ci];
  if (P.bi + 1 < c.beats.length) { show(P.ci, P.bi + 1); schedule(); return; }
  if (P.mode === 'chapter') { P.mode = 'paused'; setMode(); return; }
  if (P.ci + 1 < CH.length) { show(P.ci + 1, 0); if (P.ci === CH.length - 1) { P.mode = 'done'; setMode(); return; } schedule(); return; }
  P.mode = 'done'; setMode();
}
function startAuto(fromStart) {
  P.mode = 'auto';
  if (fromStart) show(0, 0); else show(P.ci, P.bi, true);
  schedule();
}
function stop(mode) {
  clearTimeout(P.timer); cancelAnimationFrame(raf);
  if (stagger.length && CH[P.ci]) { stagger.forEach(clearTimeout); stagger = []; $('#log').innerHTML = CH[P.ci].beats.slice(0, P.bi + 1).flatMap((x) => x.log).map(line).join(''); }
  P.mode = mode; setMode();
}

// ---------------- iPad 缩放 ----------------
function fit() {
  const box = $('#ipad-box'), dev = $('#ipad');
  if (innerWidth <= 1000) { box.style.width = box.style.height = ''; dev.style.transform = ''; return; }
  const W = 1024 + 32, H = 700 + 32;
  const grid = $('.st-grid').getBoundingClientRect();
  const availH = grid.height - 18 - 12 - 26 - 30;
  const availW = innerWidth - 2 * Math.max(16, innerWidth * .024) - Math.max(20, innerWidth * .024) - 360;
  const s = Math.max(.42, Math.min(1, availH / H, availW / W));
  box.style.width = W * s + 'px'; box.style.height = H * s + 'px';
  dev.style.transform = `scale(${s})`;
}

// ---------------- 下面几段：核查记录、成绩单 ----------------
const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
const scalar = (v) => v == null || ['string', 'number', 'boolean'].includes(typeof v);
function cell(v) {
  if (v === true) return '<span class="ok">通过</span>';
  if (v === false) return '<span class="bad">未通过</span>';
  if (v == null) return miss('未记录');
  if (isObj(v) && 'numerator' in v && 'denominator' in v) return ratio(v);
  if (!scalar(v)) { const s = JSON.stringify(v); return esc(s.length > 140 ? s.slice(0, 140) + '…' : s); }
  return esc(v);
}
function ratio(v) {
  const p = v.denominator ? (v.numerator / v.denominator * 100).toFixed(1) + '%' : '—';
  return `${esc(v.numerator)}/${esc(v.denominator)}<small>${p}</small>`;
}
function table(rows) {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].slice(0, 8);
  const body = rows.slice(0, 40).map((r) => `<tr>${cols.map((c) => `<td class="${typeof r[c] === 'number' ? 'n' : ''}">${cell(r[c])}</td>`).join('')}</tr>`).join('');
  return `<div class="tw"><table class="g"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>${rows.length > 40 ? `<p class="lede">还有 ${rows.length - 40} 行，见原文件。</p>` : ''}`;
}
function anyJSON(o) {
  if (Array.isArray(o)) return o.length && o.every(isObj) ? table(o) : `<p>${o.length ? o.map(esc).join('、') : miss('空')}</p>`;
  if (!isObj(o)) return `<p>${cell(o)}</p>`;
  const ent = Object.entries(o);
  const sc = ent.filter(([, v]) => scalar(v) || (isObj(v) && 'numerator' in v));
  const rest = ent.filter(([, v]) => !(scalar(v) || (isObj(v) && 'numerator' in v)));
  return (sc.length ? `<dl class="kv">${sc.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="${typeof v === 'string' && v.length > 14 ? 'txt' : ''}">${isObj(v) ? ratio(v) : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? esc(bj(v) || v) : cell(v)}</dd></div>`).join('')}</dl>` : '')
    + rest.map(([k, v]) => `<h3 class="sub">${esc(k)}</h3>${anyJSON(v)}`).join('');
}
const pct = (v) => (v == null || isNaN(v) ? '—' : (v * 100).toFixed(v === 1 ? 0 : 1) + '%');
const nd = (o) => (o && o.den != null ? `${esc(o.num)}/${esc(o.den)}` : miss('未记录'));
const kvs = (rows) => `<dl class="kv">${rows.map(([k, v, small]) => `<div><dt>${esc(k)}</dt><dd>${v}${small ? `<small>${small}</small>` : ''}</dd></div>`).join('')}</dl>`;

function renderAudit(a) {
  if (!isObj(a) || !isObj(a.summary)) return anyJSON(a);
  const s = a.summary;
  const has = (k) => k in s;
  const checks = Array.isArray(a.checks) ? a.checks : [];
  const failed = checks.filter((c) => c.pass === false);
  return kvs([
    has('quotes_checked') && ['引用逐字核对', `${esc(s.quotes_passed ?? '?')}/${esc(s.quotes_checked)}`, '通过'],
    has('quotes_blocked') && ['被拦下的引用', esc(s.quotes_blocked)],
    has('qa_items') && ['问答', esc(s.qa_items), '题'],
    has('qa_evidence_time_checks') && ['问答证据时序检查', esc(s.qa_evidence_time_checks), '次'],
    has('builds_recorded') && ['记录的构建', esc(s.builds_recorded), `被拦 ${esc(s.builds_blocked ?? 0)} 次`],
    a.generated_at && ['最近一次', esc((bj(a.generated_at) || '').replace('（北京时间）', '')), '北京时间'],
  ].filter(Boolean))
  + (Array.isArray(a.rules) ? `<h3 class="sub">规则</h3><ol class="lede" style="padding-left:1.3em;margin-bottom:12px">${a.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>` : '')
  + (a.note ? `<p class="lede">${esc(a.note)}</p>` : '')
  + (Array.isArray(a.history) && a.history.length ? `<h3 class="sub">构建历史</h3>${table(a.history.map((h) => ({ 时间: (bj(h.at) || h.at || '').replace('（北京时间）', ''), 结果: h.ok, 核对引用: h.quotes_checked, 被拦下: Array.isArray(h.blocked) ? h.blocked.length : h.blocked })))}` : '')
  + (checks.length ? `<details><summary class="lede" style="cursor:pointer">逐条看 ${checks.length} 条引用${failed.length ? `（${failed.length} 条未通过）` : ''}</summary>${table(checks.map((c) => ({ 事件: c.event_id, 位置: c.where, 引用: c.quote, 结果: c.pass })))}</details>` : '');
}

function renderEval(r) {
  if (!isObj(r) || !isObj(r.summary)) return anyJSON(r);
  const S = r.summary, G = r.groups || { 指标: Object.keys(S) };
  const traps = r.traps && Array.isArray(r.traps.cases) ? r.traps.cases : [];
  const caught = traps.filter((t) => /拦住/.test(t.verdict || '') && !/没拦住|未拦住/.test(t.verdict || '')).length;
  const gname = { results: '结果对不对', process: '过程守没守规矩' };
  let html = r.gold_note ? `<div class="absent" style="margin-bottom:18px"><b>先说清楚标准答案：</b>${esc(r.gold_note)}</div>` : '';
  html += kvs([
    ['已打分的事件', `${esc(r.events_scored ?? '?')}/${esc(r.events_total ?? '?')}`, '其余还没标注'],
    r.gold_check && ['标准答案自查', `${esc(r.gold_check.passed)}/${esc(r.gold_check.total)}`, '逐字可复核的部分'],
    traps.length && ['陷阱用例', `${caught}/${traps.length}`, '被管线拦住'],
    r.generated_at && ['生成于', esc((bj(r.generated_at) || '').replace('（北京时间）', '')), '北京时间'],
  ].filter(Boolean));
  html += Object.entries(G).map(([g, names]) => `<h3 class="sub">${esc(gname[g] || g)}</h3><div class="tw"><table class="g"><thead><tr><th>指标</th><th>分子/分母</th><th>比例</th><th>补充</th></tr></thead><tbody>
    ${names.map((n) => { const o = S[n] || {}; return `<tr><td>${esc(n)}</td><td class="n">${nd(o)}</td><td class="n ${o.value != null && o.value < 0.9 ? 'bad' : ''}">${pct(o.value)}</td><td>${o.recall != null ? `召回 ${esc(o.recall_num)}/${esc(o.recall_den)}（${pct(o.recall)}）` : ''}</td></tr>`; }).join('')}</tbody></table></div>`).join('');
  if (traps.length) {
    html += `<h3 class="sub">陷阱用例：故意改坏数据，看谁能发现</h3><div class="tw"><table class="g"><thead><tr><th>编号</th><th>改了什么</th><th>管线</th><th>评测发现了吗</th><th>结论</th></tr></thead><tbody>
      ${traps.map((t) => `<tr><td class="n">${esc(t.id)}</td><td><b>${esc(t.title || '')}</b><br>${esc(t.changed || '')}</td><td>${esc(t.pipeline || '')}</td><td>${t.eval_detects === true ? '发现了' : t.eval_detects === false ? '<span class="bad">没发现</span>' : miss('未记录')}</td><td class="${/放行|没拦住|未拦住|没发现/.test(t.verdict || '') ? 'bad' : ''}">${esc(t.verdict || '')}</td></tr>`).join('')}</tbody></table></div>`;
  }
  const fails = (r.events || []).flatMap((e) => Object.entries(e.results || {}).flatMap(([m, o]) => (o.failures || []).map((f) => ({ 事件: e.name || e.id, 指标: m, 代码: f.code, 问题: f.what || '', 抽到: f.got || '', 应为: f.expect || '', 位置: [f.claim, f.version && 'v' + f.version, f.side].filter(Boolean).join(' ') })))) ;
  if (fails.length) html += `<details><summary class="lede" style="cursor:pointer">逐条看 ${fails.length} 处扣分</summary>${table(fails)}</details>`;
  if (Array.isArray(r.unmatched_extractions) && r.unmatched_extractions.length) html += `<p class="lede">还没有标准答案、没打分的抽取：${r.unmatched_extractions.map((x) => `<code>${esc(x)}</code>`).join('、')}</p>`;
  return html;
}

async function addRecheck() {
  const res = await load(PATHS.recheck);
  const box = $('#audit-body');
  if (!res.ok) { box.insertAdjacentHTML('beforeend', `<h3 class="sub">重抓比对</h3><div class="absent">重抓比对${miss('未生成')}：<code>${esc(PATHS.recheck)}</code>（${esc(res.error)}）</div>`); return; }
  const r = res.data;
  const items = Array.isArray(r.items) ? r.items : [];
  box.insertAdjacentHTML('beforeend', `<h3 class="sub">重抓比对：公告发出后有没有被悄悄改过</h3>
    ${kvs([['重抓的公告', esc(r.checked ?? items.length), '份'], ['正文有变化', esc(r.changed ?? items.filter((i) => i.changed).length), '份'], ['重抓失败', esc(r.failed ?? 0), '份'], r.checked_at && ['比对时间', esc((bj(r.checked_at) || '').replace('（北京时间）', '')), '北京时间']].filter(Boolean))}
    ${r.note ? `<p class="lede">${esc(r.note)}</p>` : ''}
    ${items.length ? `<details><summary class="lede" style="cursor:pointer">逐份看 ${items.length} 份公告的正文指纹</summary>${table(items.map((i) => ({ 事件: i.event_id, 证据: i.evidence_id, 首次指纹: i.old, 重抓指纹: i.new, 有变化: i.changed ? '是' : '否', 错误: i.error || '' })))}</details>` : ''}`);
}

async function fillReport(sel, path, name, fn) {
  const res = await load(path);
  let html;
  if (!res.ok) html = `<div class="absent">${esc(name)}${miss('未生成')}：<code>${esc(path)}</code>（${esc(res.error)}）。生成后这里会直接显示，不需要改页面。</div>`;
  else { try { html = fn(res.data); } catch (e) { html = `<div class="absent">${esc(name)}的格式和页面预期不同，按原样列出：</div>` + anyJSON(res.data); } }
  $(sel).innerHTML = html;
}

// ---------------- 启动 ----------------
async function init() {
  initStageTheme();
  fillReport('#audit-body', PATHS.audit, '核查记录', renderAudit).then(addRecheck);
  fillReport('#eval-body', PATHS.report, '评测成绩单', renderEval);
  const res = await load(PATHS.events);
  if (!res.ok || !res.data || !Array.isArray(res.data.events) || !res.data.events.length) {
    const r = res.ok ? { path: res.path, error: '文件里没有事件' } : res;
    $('#stage').innerHTML = `<div class="fatal" role="alert"><h2>事件数据没有加载成功</h2><p>文件：<code>${esc(r.path)}</code></p><p>原因：${esc(r.error)}</p><p>演示不会用假数据顶替。</p></div>`;
    $('#stage').style.display = 'block'; $('.rail').hidden = true;
    return;
  }
  DATA = res.data;
  const q = await load(PATHS.qa);
  QA = q.ok && q.data && Array.isArray(q.data.items) ? q.data : null;
  $('#gen').textContent = DATA.generated_at ? `数据 ${bj(DATA.generated_at).replace('（北京时间）', ' 北京时间')}` : '';
  CH = [overview(), chExpire(), chRetell(), chPremise(), chStatus(), chQA(), chVerify(), chEnd()].filter(Boolean);
  renderRail();

  const frame = $('#ipad-frame');
  await new Promise((r) => (frame.contentWindow && frame.contentWindow.WB ? r() : frame.addEventListener('load', r, { once: true })));
  WB = frame.contentWindow.WB;
  if (!WB || !(await WB.ready)) { $('#ai-title').textContent = 'iPad 里的工作台没有加载成功'; return; }
  try { const t = localStorage.getItem('eet-stage-theme'); if (t) frame.contentDocument.documentElement.dataset.theme = t; } catch (e) { /* 忽略 */ }

  // 一碰就交给人
  const hand = () => { if (P.mode === 'auto' || P.mode === 'chapter') stop('hand'); };
  ['pointerdown', 'keydown', 'wheel'].forEach((t) => frame.contentDocument.addEventListener(t, hand, { passive: true }));
  $('#steps').addEventListener('click', (e) => { const b = e.target.closest('[data-ch]'); if (!b) return; stop('chapter'); P.mode = 'chapter'; show(+b.dataset.ch, 0); schedule(); });
  $('#prev').addEventListener('click', () => { const was = P.mode; stop('paused'); if (P.bi > 0) show(P.ci, P.bi - 1, true); else if (P.ci > 0) show(P.ci - 1, 0); if (was === 'auto') { P.mode = 'auto'; schedule(); setMode(); } });
  $('#next').addEventListener('click', () => { const was = P.mode; stop('paused'); if (P.ci + 1 < CH.length) show(P.ci + 1, 0); if (was === 'auto') { P.mode = 'auto'; schedule(); setMode(); } });
  $('#play').addEventListener('click', () => {
    if (P.mode === 'auto' || P.mode === 'chapter') stop('paused');
    else if (P.mode === 'done') startAuto(true);
    else { P.mode = 'auto'; setMode(); progress(CH[P.ci].beats[P.bi].ms); advance(); }
  });
  addEventListener('resize', fit); fit();
  show(0, 0);
  if (reduce) { stop('paused'); return; }
  P.mode = 'auto'; setMode(); schedule();
}
init();
