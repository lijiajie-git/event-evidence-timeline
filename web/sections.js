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
  const fp = isObj(r.first_pass) ? r.first_pass : null;
  const order = (fp && Array.isArray(fp.metric_order) && fp.metric_order.length) ? fp.metric_order
    : (isObj(r.groups) ? Object.values(r.groups).flat() : Object.keys(r.summary || {}));
  const scored = (o) => o && o.den > 0;
  const bar = (o) => (scored(o) ? `<span class="mb"><span class="mbf ${o.value < 1 ? 'low' : ''}" style="width:${Math.max(2, o.value * 100)}%"></span></span><span class="mv">${pct(o.value)}</span><span class="mn">${esc(o.num)}/${esc(o.den)}</span>` : '<span class="mnone">还没有打分</span>');
  const big = (o, label, sub) => `<div><span class="big">${scored(o) ? pct(o.value) : '—'}</span><small>${label}${scored(o) ? `：${esc(o.num)}/${esc(o.den)}` : '：还没有打分'}</small>${sub ? `<small class="sub">${sub}</small>` : ''}</div>`;
  // 多列指标表：cols = [[列名, summary对象, 列说明]]；notesFrom 取 changed_by_adjudication
  const mtable = (cols, notesFrom) => `<div class="mt"><div class="mrow head" style="grid-template-columns: 11em repeat(${cols.length}, minmax(0, 1fr))"><span>指标</span>${cols.map(([k]) => `<span>${esc(k)}</span>`).join('')}</div>
    ${order.map((m) => { const note = notesFrom && notesFrom[m] && notesFrom[m].changed_by_adjudication; return `<div class="mrow ${note ? 'diff' : ''}" style="grid-template-columns: 11em repeat(${cols.length}, minmax(0, 1fr))"><span class="mname">${esc(m)}</span>${cols.map(([k, sum]) => { const o = sum && sum[m]; return `<span class="mcell"><em class="sl">${esc(k)}</em>${bar(o)}${o && o.recall != null && scored(o) ? `<small>召回 ${esc(o.recall_num)}/${esc(o.recall_den)}</small>` : ''}</span>`; }).join('')}${note ? `<span class="mnote">裁决改动：${esc(note)}</span>` : ''}</div>`; }).join('')}</div>`;

  // 陷阱
  const traps = r.traps && Array.isArray(r.traps.cases) ? r.traps.cases : [];
  const cat = (t) => (/放行|没拦住|未拦住/.test(t.verdict || '') ? 'leak' : /拦住/.test(t.verdict || '') ? 'caught' : 'other');
  const cnt = (c) => traps.filter((t) => cat(t) === c).length;

  let html = r.gold_note ? `<div class="absent caveat"><b>先说清楚：</b>${esc(r.gold_note)}</div>` : '';
  if (fp) {
    const S = fp.summary || {}, SB = fp.summary_blind_gold || {}, E1 = fp.event1 || null, W = fp.summary_with_event1 || {};
    const nTest = Array.isArray(fp.test_events) ? fp.test_events.length : null;
    html += `<div class="eval-head">
      ${big(S['数值抽取精确匹配'], `数值抽取，首次抽取 ${nTest ?? '?'} 个事件`, '裁决后的标准答案')}
      ${big(W['数值抽取精确匹配'], '数值抽取，9 个事件首次合计', '加上事件 1 第一版')}
      ${E1 ? big((E1.summary || {})['数值抽取精确匹配'], '事件 1 第一版', '第一轮查出问题的那一版') : ''}
      ${traps.length ? `<div><span class="big">${cnt('caught')}/${traps.length}</span><small>陷阱被管线拦住</small></div>` : ''}
    </div>
    ${fp.note ? `<p class="fpnote">${esc(fp.note.replace(/现在\s*summary\s*里的/g, '修订后的').replace(/summary_by_split|summary/g, '修订后的分数'))}</p>` : ''}
    <h3 class="sub">首次抽取的成绩（主数字）</h3>
    <p class="lede small">${nTest ?? '?'} 个事件，每个都是第一次抽取、没参考评测意见时的结果（抽取提交 <code>${esc(fp.test_extracted_commit || '未记录')}</code>，${esc(fp.test_eval_round || '评测轮次未记录')}）：${(fp.test_events || []).map((id) => esc(names[id] || id)).join('；')}。</p>
    ${mtable([['裁决后的标准答案', S], ['按盲标原样', SB]], SB)}
    ${fp.blind_gold_note ? `<p class="lede small">${esc(fp.blind_gold_note.replace(/summary_blind_gold|summary/g, (x) => (x === 'summary' ? '裁决后' : '按盲标原样')))}</p>` : ''}`;
    if (E1) {
      // 事件 1：第一版 → 修订后（修订后不是独立测量）
      const cur = (r.events || []).find((e) => e.id === E1.id);
      const now = cur ? { ...(cur.results || {}), ...(cur.process || {}) } : {};
      const moved = order.filter((m) => { const a = (E1.summary || {})[m], b = now[m]; return scored(a) && scored(b) && a.value !== b.value; });
      html += `<h3 class="sub">事件 1 第一版：评测第一轮就是在它身上查出问题的</h3>
        <p class="lede small">${esc(names[E1.id] || E1.id)} · 抽取提交 <code>${esc(E1.extracted_commit || '')}</code> · ${esc(E1.eval_round || '')}。${esc(E1.note || '')}</p>
        ${moved.length ? `<div class="shift">${moved.map((m) => { const a = E1.summary[m], b = now[m]; return `<div class="sr"><span class="mname">${esc(m)}</span><span class="from">${pct(a.value)}<small>${esc(a.num)}/${esc(a.den)} 第一版</small></span><span class="arr">→</span><span class="to">${pct(b.value)}<small>${esc(b.num)}/${esc(b.den)} 修订后，不是独立测量</small></span></div>`; }).join('')}</div>
          <p class="lede small">评测推动的改进：漏抽的版本和指标补上了，管线加了数值和引用对应、版本时序、来源级别等检查。修订后的分数是改完再测同一个事件，只能说明问题修掉了，不能当成抽取准确率。</p>` : ''}
        <h3 class="sub">9 个事件首次抽取合计（含事件 1 第一版）</h3>
        ${fp.with_event1_note ? `<p class="lede small">${esc(fp.with_event1_note)}</p>` : ''}
        ${mtable([['裁决后的标准答案', W], ['按盲标原样', fp.summary_with_event1_blind_gold || {}]], fp.summary_with_event1_blind_gold || null)}`;
    }
  } else {
    html += `<div class="absent">首次抽取成绩${miss('未生成')}（report.json 里没有 first_pass），下面只有修订之后的分数，不能代表首次抽取的准确率。</div>`;
  }

  // 修订之后：开发集 / 测试集
  const split = isObj(r.summary_by_split) ? r.summary_by_split : (isObj(r.summary) ? { 全部: { summary: r.summary } } : {});
  const splitNames = Object.keys(split);
  const splitDesc = splitNames.map((k) => {
    const ids = (split[k] && split[k].events) || [];
    const evNotes = [...new Set((r.events || []).filter((e) => e.split === k && e.split_note).map((e) => e.split_note))];
    return `<div class="split"><b>${esc(k)}</b><span>${ids.length ? `${ids.length} 个事件：${ids.map((id) => esc(names[id] || id)).join('；')}` : '还没有事件'}</span>${evNotes.length ? `<small>${evNotes.map(esc).join(' ')}</small>` : ''}</div>`;
  }).join('');
  html += `<details class="more after"><summary>按评测意见修订之后的分数（开发集 / 测试集，不是独立测量）</summary>
    <p class="lede small">改过抽取的事件归入开发集，它们的分数是改完再测，不再独立；测试集只剩没改过的事件，所以分数偏高，不能代表抽取有多准。</p>
    <div class="splits">${splitDesc}</div>${mtable(splitNames.map((k) => [k, (split[k] || {}).summary || {}]), null)}</details>`;

  if (traps.length) {
    html += `<h3 class="sub">陷阱用例：故意把数据改坏，看管线拦不拦得住</h3>
    <div class="traps">${traps.map((t) => `<span class="tp ${cat(t)}" title="${esc(`${t.id} ${t.title || ''}：${t.verdict || ''}`)}">${esc(t.id)}</span>`).join('')}</div>
    <p class="legend"><span class="tp caught"></span>管线拦住 ${cnt('caught')}　<span class="tp leak"></span>管线放行、评测发现 ${cnt('leak')}　<span class="tp other"></span>其他 ${cnt('other')}</p>
    ${cnt('leak') ? `<ul class="leaks">${traps.filter((t) => cat(t) === 'leak').map((t) => `<li><b>${esc(t.id)} ${esc(t.title || '')}</b>：${esc(t.changed || '')}</li>`).join('')}</ul>` : ''}
    ${r.traps.note ? `<p class="lede small">${esc(r.traps.note)}</p>` : ''}`;
  }
  const fails = (r.events || []).flatMap((e) => ['results', 'process'].flatMap((g) => Object.entries(e[g] || {}).flatMap(([m, o]) => (o.failures || []).map((f) => ({ e, m, f })))));
  html += fails.length ? `<h3 class="sub">现在还没过的地方（${fails.length} 处）</h3><ul class="fails">${fails.slice(0, 12).map(({ e, m, f }) => `<li><span>${esc(e.split || '')}</span><b>${esc(m)}</b> ${esc(f.what || f.code || '')}${f.claim ? ' · ' + esc(f.claim) : ''}${f.got ? ` · 抽到 ${esc(f.got)}` : ''}${f.expect ? ` · 应为 ${esc(f.expect)}` : ''}<small>${esc(names[e.id] || e.id)}</small></li>`).join('')}</ul>${fails.length > 12 ? `<p class="lede small">还有 ${fails.length - 12} 处，见 <code>eval/report.md</code>。</p>` : ''}` : '';
  if (r.generated_at) html += `<p class="lede small">成绩单生成于 ${esc(bjs(r.generated_at))}${r.gold_check ? `；标准答案自查 ${esc(r.gold_check.passed)}/${esc(r.gold_check.total)}（逐字可复核的部分）` : ''}。</p>`;
  el.innerHTML = html;
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
