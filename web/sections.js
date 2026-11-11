// 演示页下半部分：亮点（图）、评测成绩单（图）、我怎么用 AI 的（分工图）。
// 数字全部从数据文件读；文件没有或字段缺失时写“未生成”“还没有打分”。
import { esc, miss, bj } from './core.js';

const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
const pct = (v) => (v == null || isNaN(v) ? '—' : (v * 100).toFixed(v === 1 ? 0 : 1) + '%');
const bjs = (iso) => (bj(iso) || '').replace('（北京时间）', ' 北京时间');
const absent = (name, res) => `<div class="absent">${esc(name)}${miss('未生成')}：<code>${esc(res.path)}</code>（${esc(res.error || '格式不对')}）。生成后这里会直接显示，不需要改页面。</div>`;

// ---------------- 亮点 ----------------
export function renderHighlights(el, { events, audit, recheck, qa }) {
  const ev = (events && events.events) || [];
  const all = ev.flatMap((e) => e.evidence || []);
  const n = (f) => all.filter(f).length;
  const versions = ev.flatMap((e) => (e.claims || []).flatMap((c) => c.versions || [])).length;
  const concl = ev.reduce((s, e) => s + (e.conclusions || []).length, 0);
  const states = ev.reduce((s, e) => s + (e.status_history || []).length, 0);
  const conf = ev.reduce((s, e) => s + (e.conflicts || []).length, 0);
  const outd = n((x) => x.outdated_by);
  const bars = ev.reduce((s, e) => s + (e.prices && !e.prices.error && Array.isArray(e.prices.bars) ? e.prices.bars.length : 0), 0);
  const A = audit && audit.ok && isObj(audit.data) ? audit.data : null;
  const sm = A && isObj(A.summary) ? A.summary : null;
  const R = recheck && recheck.ok && isObj(recheck.data) ? recheck.data : null;
  const Q = qa && qa.ok && qa.data && Array.isArray(qa.data.items) ? qa.data.items.length : null;
  const node = (tag, title, big, small, cls = '') => `<li class="fn ${cls}"><i>${tag}</i><b>${title}</b><span class="big">${big}</span><span class="sm">${small}</span></li>`;
  const flow = `<ol class="fflow">
    ${node('规则', '抓取', `${n((x) => x.src === 'ann')}<small>份公告</small>`, `新闻 ${n((x) => x.src === 'news')} 条 · 异动解读 ${n((x) => x.src === 'anomaly')} 条 · 日 K 线 ${bars} 根`)}
    ${node('模型 · 离线', '抽取', `${versions}<small>个数字版本</small>`, `${concl} 份分时点结论${Q != null ? ` · ${Q} 道问答` : ''} · 每条带原文引用`, 'model')}
    ${node('规则', '校验', sm ? `${esc(sm.quotes_passed)}/${esc(sm.quotes_checked)}<small>条引用通过</small>` : miss('未生成'), sm ? `被拦下 ${esc(sm.quotes_blocked ?? 0)} 条 · 时序检查 ${esc(sm.qa_evidence_time_checks ?? '—')} 次 · 不通过就不生成文件` : '核查记录未生成')}
    ${node('规则', '组装', `${ev.length}<small>个事件</small>`, `${states} 次状态变化 · ${conf} 处冲突 · ${outd} 条观点前提已不成立`)}
    ${node('浏览器', '页面', '只读<small>数据文件</small>', '回放、查验、两版对比都在浏览器里算，不调用模型', 'page')}
  </ol>`;
  const checks = A && Array.isArray(A.checks) ? A.checks : [];
  const rc = R && Array.isArray(R.items) ? R.items : [];
  const grid = (items, ok, title, label) => `<div class="sq"><div class="sqh"><b>${title}</b><span>${label}</span></div><div class="sqs">${items.map((x) => `<i class="${ok(x) ? 'y' : 'n'}" title="${esc(x.t)}"></i>`).join('')}</div></div>`;
  el.innerHTML = `${flow}
    <div class="sqrow">
      ${checks.length ? grid(checks.map((c) => ({ ok: c.pass, t: `${c.where}：${c.quote}` })), (x) => x.ok, '每条引用都回原文核过', `${checks.filter((c) => c.pass).length}/${checks.length} 通过 · 每格一条，悬停看原句`) : `<div class="sq">${absent('核查记录', audit || { path: 'data/audit.json' })}</div>`}
      ${rc.length ? grid(rc.map((r) => ({ ok: !r.changed && !r.error, t: `${r.evidence_id}：${r.old} → ${r.new}` })), (x) => x.ok, '公告发出后有没有被悄悄改过', `重抓 ${rc.length} 份，正文有变化 ${rc.filter((r) => r.changed).length} 份${R.checked_at ? ' · ' + esc(bjs(R.checked_at)) : ''}`) : `<div class="sq">${absent('重抓比对', recheck || { path: 'data/recheck.json' })}</div>`}
    </div>`;
}

// ---------------- 评测 ----------------
export function renderEvalSection(el, res, events) {
  if (!res || !res.ok || !isObj(res.data)) { el.innerHTML = absent('评测成绩单', res || { path: 'eval/report.json' }); return; }
  const r = res.data;
  const names = Object.fromEntries(((events && events.events) || []).map((e) => [e.id, `${e.name} · ${e.title || e.type || ''}`]));
  const split = isObj(r.summary_by_split) ? r.summary_by_split : (isObj(r.summary) ? { 全部: { summary: r.summary } } : {});
  const splitNames = Object.keys(split);
  const groups = isObj(r.groups) ? r.groups : { 指标: Object.keys((split[splitNames[0]] || {}).summary || {}) };
  const gname = { results: '结果对不对', process: '过程守没守规矩' };
  const scored = (o) => o && o.den > 0;
  const bar = (o) => (scored(o) ? `<span class="mb"><span class="mbf ${o.value < 1 ? 'low' : ''}" style="width:${Math.max(2, o.value * 100)}%"></span></span><span class="mv">${pct(o.value)}</span><span class="mn">${esc(o.num)}/${esc(o.den)}</span>` : '<span class="mnone">还没有打分</span>');
  const splitDesc = splitNames.map((k) => {
    const ids = (split[k] && split[k].events) || [];
    const evNotes = (r.events || []).filter((e) => e.split === k && e.split_note).map((e) => e.split_note);
    return `<div class="split"><b>${esc(k)}</b><span>${ids.length ? `${ids.length} 个事件：${ids.map((id) => esc(names[id] || id)).join('；')}` : '还没有事件'}</span>${evNotes.length ? `<small>${evNotes.map(esc).join(' ')}</small>` : ''}</div>`;
  }).join('');
  const table = Object.entries(groups).map(([g, list]) => `<h3 class="sub">${esc(gname[g] || g)}</h3>
    <div class="mt"><div class="mrow head"><span>指标</span>${splitNames.map((k) => `<span>${esc(k)}</span>`).join('')}</div>
    ${list.map((m) => `<div class="mrow"><span class="mname">${esc(m)}</span>${splitNames.map((k) => { const o = ((split[k] || {}).summary || {})[m]; return `<span class="mcell"><em class="sl">${esc(k)}</em>${bar(o)}${o && o.recall != null && scored(o) ? `<small>召回 ${esc(o.recall_num)}/${esc(o.recall_den)}</small>` : ''}</span>`; }).join('')}</div>`).join('')}</div>`).join('');
  // 陷阱
  const traps = r.traps && Array.isArray(r.traps.cases) ? r.traps.cases : [];
  const cat = (t) => (/放行|没拦住|未拦住/.test(t.verdict || '') ? 'leak' : /拦住/.test(t.verdict || '') ? 'caught' : 'other');
  const cnt = (c) => traps.filter((t) => cat(t) === c).length;
  const trapHtml = traps.length ? `<h3 class="sub">陷阱用例：故意把数据改坏，看管线拦不拦得住</h3>
    <div class="traps">${traps.map((t) => `<span class="tp ${cat(t)}" title="${esc(`${t.id} ${t.title || ''}：${t.verdict || ''}`)}">${esc(t.id)}</span>`).join('')}</div>
    <p class="legend"><span class="tp caught"></span>管线拦住 ${cnt('caught')}　<span class="tp leak"></span>管线放行、评测发现 ${cnt('leak')}　<span class="tp other"></span>其他 ${cnt('other')}</p>
    ${cnt('leak') ? `<ul class="leaks">${traps.filter((t) => cat(t) === 'leak').map((t) => `<li><b>${esc(t.id)} ${esc(t.title || '')}</b>：${esc(t.changed || '')}</li>`).join('')}</ul>` : ''}
    ${r.traps.note ? `<p class="lede small">${esc(r.traps.note)}</p>` : ''}` : '';
  // 哪里没过
  const fails = (r.events || []).flatMap((e) => ['results', 'process'].flatMap((g) => Object.entries(e[g] || {}).flatMap(([m, o]) => (o.failures || []).map((f) => ({ e, m, f })))));
  const failHtml = fails.length ? `<h3 class="sub">没过的地方（${fails.length} 处）</h3><ul class="fails">${fails.slice(0, 12).map(({ e, m, f }) => `<li><span>${esc(e.split || '')}</span><b>${esc(m)}</b> ${esc(f.what || f.code || '')}${f.claim ? ' · ' + esc(f.claim) : ''}${f.got ? ` · 抽到 ${esc(f.got)}` : ''}${f.expect ? ` · 应为 ${esc(f.expect)}` : ''}<small>${esc(names[e.id] || e.id)}</small></li>`).join('')}</ul>${fails.length > 12 ? `<p class="lede small">还有 ${fails.length - 12} 处，见 <code>eval/report.md</code>。</p>` : ''}` : '<h3 class="sub">没过的地方</h3><p class="lede small">这一版没有扣分项。</p>';
  el.innerHTML = `${r.gold_note ? `<div class="absent caveat"><b>先说清楚：</b>${esc(r.gold_note)}</div>` : ''}
    <div class="eval-head"><div><span class="big">${esc(r.events_scored ?? '?')}/${esc(r.events_total ?? '?')}</span><small>个事件已打分</small></div>
      ${r.gold_check ? `<div><span class="big">${esc(r.gold_check.passed)}/${esc(r.gold_check.total)}</span><small>标准答案自查（逐字可复核的部分）</small></div>` : ''}
      ${traps.length ? `<div><span class="big">${cnt('caught')}/${traps.length}</span><small>陷阱被管线拦住</small></div>` : ''}
      ${r.generated_at ? `<div><span class="big sm">${esc(bjs(r.generated_at))}</span><small>成绩单生成时间</small></div>` : ''}</div>
    ${r.summary_by_split ? `<p class="lede small">分两组算：测试集是抽取时没有参考过评测结果的事件；开发集是按评测意见改过抽取的事件，分数不再算独立测量。</p>` : ''}
    <div class="splits">${splitDesc}</div>${table}${trapHtml}${failHtml}`;
}

// ---------------- 我怎么用 AI 的 ----------------
export function renderProcess(el, res) {
  if (!res || !res.ok || !isObj(res.data)) { el.innerHTML = absent('过程记录', res || { path: 'data/process.json' }); return; }
  const p = res.data;
  const wins = Array.isArray(p.windows) ? p.windows : [];
  const main = wins.find((w) => /主/.test(w.name)) || wins[0];
  const others = wins.filter((w) => w !== main);
  const subs = Array.isArray(p.subtasks) ? p.subtasks : [];
  const list = (arr) => (Array.isArray(arr) && arr.length ? `<ol>${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : `<p>${miss('未记录')}</p>`);
  el.innerHTML = `<div class="org" id="org">
      <svg class="wires" aria-hidden="true"></svg>
      <div class="sat">${others.map((w, i) => `<div class="win" data-w="${i}"><b>${esc(w.name)}</b><span>${esc(w.does || '')}</span></div>`).join('')}</div>
      ${main ? `<div class="win main" id="org-main"><b>${esc(main.name)}</b><span>${esc(main.does || '')}</span></div>` : ''}
      <div class="subs">${subs.map((s, i) => `<div class="sub" data-s="${i}"><b>子任务 × ${esc(s.count ?? 1)}</b><span>${esc(s.what || '')}</span><small>${esc(s.limit || '')}</small></div>`).join('')}</div>
    </div>
    <div class="sync"><b>怎么同步</b>${list(p.sync)}</div>
    <div class="two"><div><h3 class="sub">本人定的</h3>${list(p.human_decisions)}</div><div><h3 class="sub">AI 被纠正的</h3>${list(p.ai_corrected)}</div></div>
    ${p.tool ? `<p class="lede small">工具：${esc(p.tool)}。${esc(p.note || '')}</p>` : ''}`;
  drawWires();
  addEventListener('resize', drawWires);
}
function drawWires() {
  const org = document.getElementById('org'), m = document.getElementById('org-main');
  if (!org || !m) return;
  const svg = org.querySelector('.wires'), o = org.getBoundingClientRect();
  svg.setAttribute('width', o.width); svg.setAttribute('height', o.height);
  const c = (el) => { const r = el.getBoundingClientRect(); return { x: r.left - o.left + r.width / 2, top: r.top - o.top, bottom: r.bottom - o.top }; };
  const M = c(m);
  const lines = [...org.querySelectorAll('.sat .win')].map((w) => { const W = c(w); return `<path d="M${M.x} ${M.top} C ${M.x} ${(M.top + W.bottom) / 2}, ${W.x} ${(M.top + W.bottom) / 2}, ${W.x} ${W.bottom}"/>`; })
    .concat([...org.querySelectorAll('.subs .sub')].map((s) => { const S = c(s); return `<path class="dash" d="M${M.x} ${M.bottom} C ${M.x} ${(M.bottom + S.top) / 2}, ${S.x} ${(M.bottom + S.top) / 2}, ${S.x} ${S.top}"/>`; }));
  svg.innerHTML = lines.join('');
}
