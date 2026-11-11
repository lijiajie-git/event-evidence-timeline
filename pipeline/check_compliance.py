"""合规检查：系统自己写的文字（摘要、结论、冲突说明）里不能出现买卖建议和涨跌预测用语。
媒体标题和原文引用是第三方原话，不在检查范围内，但会在页面上标明来源和类型。
用法: python3 pipeline/check_compliance.py"""
import json, sys
BAD = ["买入", "卖出", "加仓", "减仓", "抄底", "目标价", "必涨", "必跌", "将上涨", "将下跌", "有望上涨", "建议持有", "推荐", "稳赚", "保证收益"]
d = json.load(open("data/events.json")); hits = []
def scan(where, s):
    for w in BAD:
        if w in (s or ""): hits.append(f"{where}: 出现「{w}」→ {s[:40]}")
for e in d["events"]:
    scan(e["id"] + " 合并理由", e["merge_reason"])
    for x in e["evidence"]: scan(f"{e['id']} {x['id']} 摘要", x.get("summary"))
    for c in e["conclusions"]:
        for part in ("facts", "inferences"):
            for it in c.get(part, []): scan(f"{e['id']} {c['as_of']} {part}", it["text"])
        for t in c.get("unknowns", []): scan(f"{e['id']} {c['as_of']} unknowns", t)
    for c in e.get("conflicts", []): scan(f"{e['id']} 冲突", c["text"] + c["resolution"])
print("\n".join(hits) if hits else f"合规检查通过：{len(d['events'])} 个事件，未发现买卖建议或涨跌预测用语")
sys.exit(1 if hits else 0)
