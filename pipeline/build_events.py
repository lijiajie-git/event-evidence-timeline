"""把抽取结果组装成前端读的 data/events.json，并逐字校验每条引用。
抽取（说法、数值、关系、类型）由大模型离线完成；本脚本只做规则部分：
拼时间、算状态、校验引用。引用在公告原文里匹配不到的说法直接丢弃并报错。
用法: python3 pipeline/build_events.py"""
import json, re, datetime, sys
BJ = datetime.timezone(datetime.timedelta(hours=8))
raw = {r["id"]: r for r in json.load(open("data/raw/announcements.json"))}
norm = lambda s: re.sub(r"\s+", "", s).replace("，", ",")
def text(i): return norm(open(f"data/raw/text/{i}.txt").read())
def day(ms): return datetime.datetime.fromtimestamp(ms / 1000, BJ).strftime("%Y-%m-%d")

# ---- 抽取结果（大模型离线抽取，人工抽查；数值单位：万元）----
E = [dict(
  id="600187-2025A-forecast", code="600187", name="*ST国中", type="业绩预告", period="2025 年年度",
  title="2025 年年度业绩预告及两次更正",
  merge_reason="同一公司、同一报告期（2025-01-01 至 2025-12-31）的业绩预告；后两份公告在正文中点名引用前一份的公告编号（临 2026-003、临 2026-014）。",
  occurred=dict(start="2025-01-01", end="2025-12-31", note="说法所指的报告期"),
  evidence=[
    dict(id="e1", ann="1224956497", doc_no="临 2026-003", signed="2026-01-30", kind="事实", relation=dict(type="首次披露")),
    dict(id="e2", ann="1225121518", doc_no="临 2026-014", signed=None, kind="事实", relation=dict(type="更正", target="e1"),
         reason="子公司荣县水务增补确认的污水处理费 2,207 万元询证函未回函，无法确认收入。",
         reason_quote="询证函未得到回函，因此无法确认这部分污水处理费所形成的收入"),
    dict(id="e3", ann="1225230061", doc_no="临 2026-015", signed=None, kind="事实", relation=dict(type="更正", target="e2"),
         reason="对诸暨文盛汇（间接持有北京汇源 20.89%）的长期投资，2025 年度不再确认投资收益，并计提资产减值损失。",
         reason_quote="现2025年度不再确认投资收益，同时计提资产减值损失"),
  ],
  claims=[
    dict(key="归母净利润", versions=[
      ("e1", -13000, -10400, "归属于母公司所有者的净利润-13,000万元到-10,400万元"),
      ("e2", -15500, -13000, "归属于母公司所有者的净利润-15,500万元到-13,000万元"),
      ("e3", -21491, -21491, "归属于母公司所有者的净利润-21,491万元")]),
    dict(key="扣非净利润", versions=[
      ("e1", 900, 1080, "扣除非经常性损益后的净利润为900万元到1,080万元"),
      ("e2", -3600, -2900, "扣除非经常性损益后的净利润为-3,600万元到-2,900万元"),
      ("e3", -5976, -5976, "扣除非经常性损益后的净利润为-5,976万元")]),
    dict(key="利润总额", versions=[
      ("e1", -11000, -8800, "利润总额-11,000万元到-8,800万元"),
      ("e2", -13900, -11200, "利润总额-13,900万元到-11,200万元"),
      ("e3", -19651, -19651, "利润总额-19,651万元")]),
    dict(key="营业收入", versions=[
      ("e1", 21000, 25200, "营业收入21,000万元到25,200万元"),
      ("e2", 20000, 24000, "营业收入20,000万元到24,000万元"),
      ("e3", 22282, 22282, "营业收入22,282万元")]),
  ],
  conflicts=[dict(
    id="c1", kind="日期不一致", evidence_ids=["e2", "e1"],
    text="更正公告称前次预告披露于 2025 年 1 月 30 日；前次公告落款和巨潮披露日均为 2026 年 1 月 30 日。",
    quotes=[("e2", "公司于2025年1月30日在上海证券交易所网站披露了《2025年年度业绩预亏公告》"), ("e1", "2026年1月30日")],
    resolution="以交易所披露日为准（2026-01-30），更正公告中的年份判断为笔误。这是推断，不是公司确认的事实。")],
  pending=["2025 年年度报告实际数与 5-06 年报更正公告尚未并入本事件", "扶摇行情未接入，暂无法显示各次更正前后的股价与成交量"],
)]

out, bad = [], 0
for e in E:
    ev = {}
    for x in e["evidence"]:
        r = raw[x["ann"]]
        x.update(title=r["title"], url=r["url"], source="巨潮资讯网", source_tier="A", tier_note="交易所指定披露平台上的公司公告",
                 times=dict(occurred=e["occurred"], disclosed=day(r["disclosed_ms"]), signed=x.pop("signed"), fetched=r["fetched_at"], updated=None))
        if x.get("reason_quote") and norm(x["reason_quote"]) not in text(x["ann"]):
            print("引用未匹配", x["id"], x["reason_quote"]); bad += 1
        ev[x["id"]] = x
    for c in e["claims"]:
        vs = []
        for n, (eid, lo, hi, q) in enumerate(c["versions"]):
            if norm(q) not in text(ev[eid]["ann"]):
                print("引用未匹配", c["key"], eid, q); bad += 1; continue
            vs.append(dict(v=n + 1, evidence_id=eid, low=lo, high=hi, unit="万元", quote=q, valid_from=ev[eid]["times"]["disclosed"], valid_to=None, status="active", superseded_by=None))
        for a, b in zip(vs, vs[1:]):
            a.update(valid_to=b["valid_from"], status="superseded", superseded_by=b["evidence_id"])
        c["versions"] = vs
    for c in e["conflicts"]:
        qs = []
        for eid, q in c.pop("quotes"):
            if norm(q) not in text(ev[eid]["ann"]): print("引用未匹配 冲突", eid, q); bad += 1
            qs.append(dict(evidence_id=eid, quote=q))
        c["quotes"] = qs
    last = e["evidence"][-1]
    e["status"] = "已更正" if last["relation"]["type"] == "更正" else "进行中"
    e["status_since"] = last["times"]["disclosed"]
    e["notifications"] = [dict(at=x["times"]["disclosed"], type=x["relation"]["type"], evidence_id=x["id"],
        text=f"{x['doc_no']} {x['relation']['type']}" + (f"了 {ev[x['relation']['target']]['doc_no']}" if x["relation"].get("target") else "")) for x in e["evidence"]]
    out.append(e)
if bad: sys.exit(f"{bad} 条引用未通过校验，未生成文件")
json.dump(dict(generated_at=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
    disclaimer="仅整理公开披露信息，不构成投资建议，不预测涨跌。", events=out), open("data/events.json", "w"), ensure_ascii=False, indent=1)
print("OK", len(out), "个事件")
