// 演示页下半部分：亮点（图）、评测成绩单（图）、我怎么用 AI 的（分工图）。
// 数字全部从数据文件读；文件没有或字段缺失时写“未生成”“还没有打分”。
import { esc, miss, bj } from './core.js';

const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
const pct = (v) => (v == null || isNaN(v) ? '—' : (v * 100).toFixed(v === 1 ? 0 : 1) + '%');
const bjs = (iso) => (bj(iso) || '').replace('（北京时间）', ' 北京时间');
const absent = (name, res) => `<div class="absent">${esc(name)}${miss('未生成')}：<code>${esc(res.path)}</code>（${esc(res.error || '格式不对')}）。生成后这里会直接显示，不需要改页面。</div>`;

// ---------------- 亮点：一条横向流程，数字写进句子 ----------------
export function renderHighlights(el, { events, audit, recheck, qa }) {
  const ev = (events && events.events) || [];
  const all = ev.flatMap((e) => e.evidence || []);
  const n = (f) => all.filter(f).length;
  const versions = ev.flatMap((e) => (e.claims || []).flatMap((c) => c.versions || [])).length;
  const concl = ev.reduce((s2, e) => s2 + (e.conclusions || []).length, 0);
  const states = ev.reduce((s2, e) => s2 + (e.status_history || []).length, 0);
  const conf = ev.reduce((s2, e) => s2 + (e.conflicts || []).length, 0);
  const bars = ev.reduce((s2, e) => s2 + (e.prices && !e.prices.error && Array.isArray(e.prices.bars) ? e.prices.bars.length : 0), 0);
  const sm = audit && audit.ok && isObj(audit.data) && isObj(audit.data.summary) ? audit.data.summary : null;
  const R = recheck && recheck.ok && isObj(recheck.data) ? recheck.data : null;
  const Q = qa && qa.ok && qa.data && Array.isArray(qa.data.items) ? qa.data.items.length : null;
  const step = (name, by, text, model) => `<li class="${model ? 'model' : ''}"><b>${name}</b><i>${by}</i><p>${text}</p></li>`;
  el.innerHTML = [
    step('抓取', '规则', `巨潮公告 ${n((x) => x.src === 'ann')} 份，新闻 ${n((x) => x.src === 'news')} 条，异动解读 ${n((x) => x.src === 'anomaly')} 条，日 K 线 ${bars} 根。`),
    step('抽取', '模型 · 离线', `读正文，抽出 ${versions} 个数字版本、${concl} 份分时点结论${Q != null ? `和 ${Q} 道问答` : ''}，每条带原文引用。`, true),
    step('校验', '规则', sm ? `${esc(sm.quotes_checked)} 条引用逐字回原文核对，${esc(sm.quotes_passed)} 条通过${R && Array.isArray(R.items) ? `；${R.items.length} 份公告重抓比对，${R.items.filter((r) => r.changed).length} 份有变化` : ''}。` : '核查记录未生成。'),
    step('组装', '规则', `${ev.length} 个事件，${states} 次状态变化，${conf} 处冲突，来源分级和权重按固定规则。`),
    step('页面', '浏览器', '只读数据文件。回放、查验、两版对比都在浏览器里算。'),
  ].join('');
}

// ---------------- 核查记录（折叠里） ----------------
const scalar = (v) => v == null || ['string', 'number', 'boolean'].includes(typeof v);
function cell(v) {
  if (v === true) return '<span class="ok">通过</span>';
  if (v === false) return '<span class="bad">未通过</span>';
  if (v == null) return miss('未记录');
  if (!scalar(v)) { const t = JSON.stringify(v); return esc(t.length > 140 ? t.slice(0, 140) + '…' : t); }
  return esc(v);
}
function table(rows) {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].slice(0, 8);
  return `<div class="tw"><table class="g"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, 300).map((r) => `<tr>${cols.map((c) => `<td class="${typeof r[c] === 'number' ? 'n' : ''}">${cell(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
export function renderAudit(a) {
  if (!isObj(a)) return `<p class="absent">核查记录格式不对。</p>`;
  const s = a.summary || {};
  const checks = Array.isArray(a.checks) ? a.checks : [];
  return `<p class="small">${s.quotes_checked != null ? `引用核对 ${esc(s.quotes_passed)}/${esc(s.quotes_checked)} 通过，拦下 ${esc(s.quotes_blocked ?? 0)} 条；` : ''}${s.builds_recorded != null ? `记录了 ${esc(s.builds_recorded)} 次构建，被拦 ${esc(s.builds_blocked ?? 0)} 次。` : ''}</p>
    ${Array.isArray(a.rules) ? `<ol class="small" style="padding-left:1.3em">${a.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>` : ''}
    ${checks.length ? table(checks.map((c) => ({ 事件: c.event_id, 位置: c.where, 引用: c.quote, 结果: c.pass }))) : ''}`;
}

// ---------------- 评测 ----------------
function renderEvalFull(el, res, events) {
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

// 评测：一张四行的小表 + 一句第一版到修订后；其余收进“看完整成绩单”
export function renderEvalSection(el, res, events) {
  if (!res || !res.ok || !isObj(res.data)) { el.innerHTML = absent('评测成绩单', res || { path: 'eval/report.json' }); return; }
  const r = res.data, fp = isObj(r.first_pass) ? r.first_pass : null;
  const S = fp ? fp.summary || {} : {};
  const traps = r.traps && Array.isArray(r.traps.cases) ? r.traps.cases : [];
  const caught = traps.filter((t) => /拦住/.test(t.verdict || '') && !/放行|没拦住|未拦住/.test(t.verdict || '')).length;
  const row = (name, o) => `<tr><td>${esc(name)}</td>${o && o.den > 0 ? `<td class="p">${pct(o.value)}</td><td class="n">${esc(o.num)}/${esc(o.den)}</td>` : '<td class="n" colspan="2">还没有打分</td>'}</tr>`;
  const first = fp && fp.note ? fp.note.split('。')[0] + '。' : '';
  const E1 = fp && fp.event1;
  const cur = E1 && (r.events || []).find((e) => e.id === E1.id);
  const a1 = E1 && E1.summary && E1.summary['数值抽取精确匹配'];
  const b1 = cur && cur.results && cur.results['数值抽取精确匹配'];
  el.innerHTML = fp ? `<p class="lede">${esc(first)}${Array.isArray(fp.test_events) ? `共 ${fp.test_events.length} 个事件。` : ''}</p>
    <table class="score"><thead><tr><th>指标</th><th colspan="2">首次抽取</th></tr></thead><tbody>
      ${row('数值抽取', S['数值抽取精确匹配'])}${row('版本链', S['版本链'])}${row('引用逐字匹配', S['引用逐字匹配'])}
      ${traps.length ? `<tr><td>陷阱用例被拦住</td><td class="p">${caught}/${traps.length}</td><td class="n">故意改坏的数据</td></tr>` : ''}
    </tbody></table>
    ${a1 && a1.den ? `<p class="shiftline">事件 1 第一版数值抽取 <b>${pct(a1.value)}</b>${b1 && b1.den ? ` → 按评测意见修订后 <b>${pct(b1.value)}</b><small>修订后的不算独立测量</small>` : ''}</p>` : ''}
    <details class="more"><summary>看完整成绩单</summary><div id="eval-full"></div></details>`
    : `<p class="lede">首次抽取成绩${miss('未生成')}。</p><details class="more"><summary>看完整成绩单</summary><div id="eval-full"></div></details>`;
  renderEvalFull(el.querySelector('#eval-full'), res, events);
}

// ---------------- 我怎么用 AI 的：四个窗口一行，两列短清单 ----------------
const PICK_H = [/题|选了/, /删除线|不删除/, /实时|密钥/, /评测/, /痛点|讲法/, /同类产品|截图/, /亮点/];
const pickBy = (arr, res, n) => {
  const out = [];
  res.forEach((re) => { const hit = arr.find((x) => re.test(x) && !out.includes(x)); if (hit && out.length < n) out.push(hit); });
  arr.forEach((x) => { if (out.length < n && !out.includes(x)) out.push(x); });
  return out;
};
export function renderProcess(el, res) {
  if (!res || !res.ok || !isObj(res.data)) { el.innerHTML = absent('过程记录', res || { path: 'data/process.json' }); return; }
  const p = res.data;
  const wins = Array.isArray(p.windows) ? p.windows : [];
  const hd = Array.isArray(p.human_decisions) ? pickBy(p.human_decisions, PICK_H, 5) : [];
  // 两列不重复说同一件事（比如删除线）
  const ac = Array.isArray(p.ai_corrected) ? p.ai_corrected.filter((x) => !(/删除线/.test(x) && hd.some((h) => /删除线/.test(h)))).slice(0, 4) : [];
  const ol = (a) => (a.length ? `<ol>${a.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : `<p>${miss('未记录')}</p>`);
  el.innerHTML = `<ul class="wins">${wins.map((w) => `<li class="${/主/.test(w.name) ? 'main' : ''}"><b>${esc(w.name)}</b><span>${esc(w.does || '')}</span></li>`).join('')}</ul>
    <p class="syncline">靠任务说明和仓库里的 CLAUDE.md 对齐。</p>
    <div class="two"><div><h3>本人定的</h3>${ol(hd)}</div><div><h3>AI 被纠正的</h3>${ol(ac)}</div></div>`;
}
