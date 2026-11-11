// 三个小样共用：回放计算、数字格式、主题切换。只读数据，不写死任何事件内容。
(function () {
  const MISSING = { extract: '未抽取', connect: '未接入', record: '未记录' };

  const minus = (s) => s.replace(/-/g, '−');
  const grp = (n) => Math.abs(n).toLocaleString('en-US');

  // 万元 → 显示。|x| ≥ 1 亿时用亿，保留两位
  function wan(n, opts = {}) {
    if (n == null || Number.isNaN(n)) return MISSING.extract;
    const sign = n < 0 ? '−' : '';
    if (!opts.forceWan && Math.abs(n) >= 10000) return sign + (Math.abs(n) / 10000).toFixed(2) + ' 亿';
    return sign + grp(n) + ' 万';
  }
  function range(v, opts = {}) {
    if (!v) return MISSING.extract;
    if (v.low == null && v.high == null) return MISSING.extract;
    if (v.low === v.high) return wan(v.low, opts);
    const useYi = !opts.forceWan && Math.max(Math.abs(v.low), Math.abs(v.high)) >= 10000;
    const f = (x) => useYi ? (x < 0 ? '−' : '') + (Math.abs(x) / 10000).toFixed(2) : (x < 0 ? '−' : '') + grp(x);
    return `${f(v.low)} ~ ${f(v.high)} ${useYi ? '亿' : '万'}`;
  }
  const mid = (v) => (v.low + v.high) / 2;

  // 版本间的变化，只描述数字本身，不做判断
  function change(prev, cur) {
    if (!prev || !cur) return '';
    const a = mid(prev), b = mid(cur);
    if (a > 0 && b < 0) return '由盈转亏';
    if (a < 0 && b > 0) return '由亏转盈';
    if (b < a) return '下调';
    if (b > a) return '上调';
    return '未变';
  }

  const md = (d) => d ? d.slice(5).replace('-', '-') : '';
  const cn = (d) => { if (!d) return ''; const [y, m, dd] = d.split('-'); return `${y} 年 ${+m} 月 ${+dd} 日`; };
  const cnShort = (d) => { if (!d) return ''; const [, m, dd] = d.split('-'); return `${+m} 月 ${+dd} 日`; };
  const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const bj = (iso) => {
    if (!iso) return MISSING.record;
    const t = new Date(new Date(iso).getTime() + 8 * 3600e3);
    return t.toISOString().slice(0, 16).replace('T', ' ') + ' 北京';
  };

  function stops(ev, generatedAt) {
    const ds = [...new Set(ev.evidence.map((x) => x.times && x.times.disclosed).filter(Boolean))].sort();
    const today = (generatedAt || '').slice(0, 10);
    const out = [{ date: addDays(ds[0], -1), label: '首次披露前' }];
    ds.forEach((d) => {
      const docs = ev.evidence.filter((x) => x.times.disclosed === d);
      out.push({ date: d, label: docs.map((x) => x.relation && x.relation.type).join('、'), docs });
    });
    if (today && today > ds[ds.length - 1]) out.push({ date: today, label: '数据生成日' });
    return out;
  }

  function asOf(ev, D) {
    const evidence = ev.evidence.filter((x) => x.times.disclosed <= D);
    const ids = new Set(evidence.map((x) => x.id));
    const claims = (ev.claims || []).map((c) => {
      const seen = (c.versions || []).filter((v) => v.valid_from <= D);
      const current = seen.find((v) => !v.valid_to || D < v.valid_to) || null;
      return { key: c.key, all: c.versions || [], seen, current };
    });
    const conflicts = (ev.conflicts || []).filter((c) => c.evidence_ids.every((i) => ids.has(i)));
    const last = evidence[evidence.length - 1];
    const status = !last ? '尚未披露' : (last.relation && last.relation.type === '更正' ? '已更正' : '进行中');
    const notifications = (ev.notifications || []).filter((n) => n.at <= D);
    return { D, evidence, ids, claims, conflicts, status, last, notifications, isLatest: D >= (ev.status_since || '') };
  }

  const byId = (ev, id) => ev.evidence.find((x) => x.id === id);
  const fieldOr = (v, kind = 'extract') => (v == null || v === '' ? MISSING[kind] : v);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // 主题：跟随系统，按钮可覆盖
  function initTheme(btn) {
    const root = document.documentElement;
    let saved = null;
    try { saved = localStorage.getItem('ev-theme'); } catch (e) {}
    if (saved) root.dataset.theme = saved;
    const label = () => {
      const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      btn.textContent = dark ? '浅色' : '深色';
    };
    btn.addEventListener('click', () => {
      const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      root.dataset.theme = dark ? 'light' : 'dark';
      try { localStorage.setItem('ev-theme', root.dataset.theme); } catch (e) {}
      label();
    });
    label();
  }

  window.EV = { MISSING, wan, range, mid, change, md, cn, cnShort, bj, addDays, stops, asOf, byId, fieldOr, esc, initTheme };
})();
