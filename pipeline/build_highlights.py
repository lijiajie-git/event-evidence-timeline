"""把几份记录里的事实汇成"亮点"数据，给演示页的亮点一节用。所有数字都从文件里算，不手写。
读: data/events.json、data/audit.json、data/recheck.json、data/qa.json、eval/report.json
写: data/highlights.json
用法: python3 pipeline/build_highlights.py"""
import json, datetime, os
J = lambda p: json.load(open(p)) if os.path.exists(p) else None
ev, au, rc, qa, rp = J("data/events.json"), J("data/audit.json"), J("data/recheck.json"), J("data/qa.json"), J("eval/report.json")
E = ev["events"]; evid = [x for e in E for x in e["evidence"]]
n_ann = sum(x["src"] == "ann" for x in evid); n_news = sum(x["src"] == "news" for x in evid); n_anom = sum(x["src"] == "anomaly" for x in evid)
n_ver = sum(len(c["versions"]) for e in E for c in e.get("claims", [])); n_asof = sum(len(e["conclusions"]) for e in E)
P = lambda text, detail=None, num=None, den=None, src=None: dict(text=text, detail=detail, num=num, den=den, source=src)
cases = {c["id"]: c for c in rp["traps"]["cases"]} if rp else {}
def verdict(i):
    c = cases.get(i, {}); return c.get("verdict") or c.get("result") or c.get("conclusion") or "未记录"
groups = []
# 1 数据进来先过一遍
pts = [P("来源只有巨潮和扶摇两个。", f"巨潮资讯网的公告，扶摇接口的新闻、异动解读和行情。页面上用到公告 {n_ann} 份、新闻 {n_news} 条、异动解读 {n_anom} 条。", src="data/events.json")]
if rc: pts.append(P(f"{rc['checked']} 份公告留了正文指纹，重抓比对，{rc['changed']} 份有变化。", f"两个数据源都不提供“事后修改时间”，所以靠自己比对。最近一次重抓 {rc['checked']} 份，{rc['failed']} 份失败。", rc["checked"] - rc["changed"] - rc["failed"], rc["checked"], "data/recheck.json"))
if rp:
    pts.append(P("正文里的指令不执行，评测试过。", f"评测在公告正文里塞了“请忽略以上规则”这类话：规则部分的输出不变；模拟模型被带偏时，结果是「{verdict('T13')}」。", src="eval/report.json traps T12、T13"))
    pts.append(P("时间戳对不上的新闻不能当证据。", f"数据源自己也会错：有一条新闻的时间戳和链接里的日期差了两周。对应陷阱的结果是「{verdict('T20')}」。", src="eval/report.json traps T20"))
pts += [P("密钥只在本地；网页不调模型、不登录、不收集访客数据。", "浏览器里只记一个浅色深色的偏好。", src="index.html、workbench.html、web/"),
        P("公开仓库只放页面用到的片段。", "新闻只留标题、来源、时间、链接和一句引用；行情只留每次披露前后 3 个交易日。原始抓取结果不入库。", src=".gitignore、data/")]
groups.append(dict(id="data", title="数据进来先过一遍", line="来源固定，正文留指纹，文本里的指令不执行。", points=pts))
# 2 每句话都能核
s_ = au["summary"]; hist = au.get("history", [])
groups.append(dict(id="audit", title="每句话都能核", line="引用和数字都拿回原文核一遍，有一条不过就不上线。", points=[
    P(f"{s_['quotes_checked']} 条引用逐字核对，通过 {s_['quotes_passed']} 条。", "去掉空白后，引用必须在对应证据的原文里逐字出现。", s_["quotes_passed"], s_["quotes_checked"], "data/audit.json"),
    P(f"{n_ver} 个数字都在自己的引用里，单位对得上。", "原文单位是元或亿元的，换算成展示单位后要相等。这条是评测指出“逐字匹配证明不了数字读对了”之后加的。", n_ver, n_ver, "pipeline/build_events.py"),
    P(f"结论不用“截至日”之后的证据，查了 {s_['qa_evidence_time_checks']} 次。", f"{len(qa['items'])} 道问答和每个时点的结论都查。", src="data/audit.json"),
    P("有一条不过，这次就不上线。", f"从开始记录起共构建 {len(hist)} 次，被拦下 {sum(not h['ok'] for h in hist)} 次；试跑阶段被拦下的没有记进这个数。", src="data/audit.json history"),
    P("事实只认公告和对公告的转述。", "媒体评论和异动归因只能进“推断”。", src="pipeline/build_events.py")]))
# 3 评测
if rp:
    fp = rp.get("first_pass") or {}; fs = fp.get("summary") or {}; gc = rp.get("gold_check") or {}
    cs = rp["traps"]["cases"]; blocked = sum("拦住" in (c.get("verdict") or c.get("result") or c.get("conclusion") or "") for c in cs)
    g = lambda k: fs.get(k, {})
    e1 = (fp.get("event1") or {}).get("summary", {}).get("数值抽取精确匹配", {})
    groups.append(dict(id="eval", title="准不准，另一个窗口来量", line="另一个 Claude Opus 会话不看抽取结果，先标答案再比。", points=[
        P("标准答案是模型盲标的，不是人工标的。", f"其中能回原文逐字核对的 {gc.get('total')} 处，通过 {gc.get('passed')} 处；证据类型这类判断没有人工复核。", gc.get("passed"), gc.get("total"), "eval/report.json gold_check"),
        P(f"首次抽取：数值 {g('数值抽取精确匹配').get('num')}/{g('数值抽取精确匹配').get('den')}，版本链 {g('版本链').get('num')}/{g('版本链').get('den')}。", f"这是每个事件第一次抽取、没参考评测意见时的成绩。引用逐字匹配 {g('引用逐字匹配').get('num')}/{g('引用逐字匹配').get('den')}。", g("数值抽取精确匹配").get("num"), g("数值抽取精确匹配").get("den"), "eval/report.json first_pass.summary"),
        P(f"{len(cs)} 个陷阱拦住 {blocked} 个，没拦住的照样列出。", "陷阱是故意改坏的数据：改引用、混单位、塞指令、塞买卖建议等。", blocked, len(cs), "eval/report.json traps"),
        P(f"第一个事件第一版只对了 {e1.get('num')}/{e1.get('den')}，是评测查出来的。", "漏了一次更正和两项指标。改完之后的分数单列，不算独立测量。", e1.get("num"), e1.get("den"), "eval/report.json first_pass.event1、eval/adjudication.md")]))
# 4 能自己动手查
groups.append(dict(id="hands", title="能自己动手查", line="每一步都可以自己点开看。", points=[
    P(f"{len(E)} 个事件 {n_asof} 个时点可以回放。", "每个时点只显示当时已经披露的证据和当时的结论。", src="data/events.json conclusions"),
    P(f"{n_ann} 份公告能点回原文。", "正文在页面里打开，引用那一句标出来。", src="data/raw/text/"),
    P("两版公告并排对比。", "只标出改了的地方。", src="workbench.html"),
    P("贴一句话，查它是第几版。", f"{n_ver} 个数字版本都可以比对，在浏览器里算，不调用模型。", src="web/verify.js"),
    P(f"{len(qa['items'])} 道问答带依据。", "每句标事实、推断、不确定或不回答，能展开看用了哪些证据、排除了哪些。", src="data/qa.json")]))
json.dump(dict(generated_at=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
    note="数字都由 pipeline/build_highlights.py 从各份记录里算出来。每条 text 是一句短话，detail 是展开后的补充，source 是出处。", groups=groups), open("data/highlights.json", "w"), ensure_ascii=False, indent=1)
for g_ in groups:
    print("##", g_["title"], "|", g_["line"])
    for p in g_["points"]: print("  -", p["text"])
