"""把抽取结果（pipeline/extracted/*.json）组装成前端读的 data/events.json。
抽取结果由大模型离线产出：证据类型、关系、各版数字、分时点结论、冲突。
本脚本只做规则部分：补来源元数据和时间、算权重和状态、截行情片段、逐字校验引用。
任何一条引用在原文里匹配不到，或引用了不存在的证据编号，就报错退出，不生成文件。
用法: python3 pipeline/build_events.py"""
import json, re, datetime, sys, glob, os
BJ = datetime.timezone(datetime.timedelta(hours=8))
WEIGHTS = {"A": dict(w=1.0, label="公司公告、交易所文件"), "B": dict(w=0.7, label="媒体对公告的转述"),
           "C": dict(w=0.4, label="媒体评论、研报观点"), "D": dict(w=0.2, label="推测性报道、算法归因"), "E": dict(w=0.1, label="传闻、未署名消息")}
norm = lambda s: re.sub(r"\s+", "", re.sub(r"<[^>]+>", "", s or "")).replace("，", ",")
iso = lambda ms: datetime.datetime.fromtimestamp(int(ms) / 1000, BJ)
ANN = {r["id"]: r for r in json.load(open("data/raw/announcements.json"))}
errs = []
def load_news(th):
    p = f"data/raw/news/{th}.json"
    return json.load(open(p)) if os.path.exists(p) else None
def resolve(x, th, news):
    """按来源补齐标题、链接、发布时间、可校验正文。"""
    if x["src"] == "ann":
        r = ANN[x["ref"]]; t = f"data/raw/text/{x['ref']}.txt"
        d = iso(r["disclosed_ms"]).strftime("%Y-%m-%d")
        return dict(title=r["title"], url=r["url"], source="巨潮资讯网", channel="巨潮资讯网公告检索", published_at=d, precision="日",
                    fetched=r["fetched_at"]), (norm(open(t).read()) if os.path.exists(t) else None)
    if x["src"] == "news":
        i = next((i for i in news["timeline"]["items"] if i["id"] == x["ref"]), None)
        if not i: errs.append(f"找不到新闻 {x['ref']}"); return {}, None
        return dict(title=i["title"].strip(), url=i["jump_url"], source=i.get("source") or "未注明", channel="扶摇个股新闻接口",
                    published_at=iso(i["publish_time_ms"]).strftime("%Y-%m-%d %H:%M"), precision="分钟", fetched=news["fetched_at"]), norm(i["title"] + (i.get("summary") or ""))
    if x["src"] == "anomaly":
        day, tag = x["ref"].split("|")
        for i in news["anomaly"]["data"]["items"]:
            t = iso(i["first_publish_time"])
            if t.strftime("%Y-%m-%d") == day and i.get("tag_name") == tag:
                return dict(title=f"异动解读：{tag}", url=i.get("link_url"), source="同花顺异动解读", channel="扶摇异动解读接口",
                            published_at=t.strftime("%Y-%m-%d %H:%M"), precision="分钟", fetched=news["fetched_at"]), norm(i.get("analysis_content"))
        errs.append(f"找不到异动解读 {x['ref']}"); return {}, None
def check(eid, q, texts, where):
    if eid not in texts: errs.append(f"{where}: 证据 {eid} 不存在"); return
    if texts[eid] is None: errs.append(f"{where}: 证据 {eid} 没有可校验的正文"); return
    if norm(q) not in texts[eid]: errs.append(f"{where}: 引用未在 {eid} 原文中匹配到 → {q}")
def prices(th, dates):
    p = f"data/prices/{th}.json"
    if not os.path.exists(p): return dict(error="行情未抓取", bars=[], markers=[])
    d = json.load(open(p)); bars = d["bars"]
    if d.get("error"): return dict(source=d["source"], error=d["error"], bars=[], markers=[])
    for a, b in zip(bars, bars[1:]): b["pct"] = round((b["close"] / a["close"] - 1) * 100, 2) if a["close"] else None
    keep, marks = set(), []
    for eid, day in dates:
        k = next((n for n, b in enumerate(bars) if b["date"] >= day), None)
        if k is None: continue
        keep.update(range(max(0, k - 3), min(len(bars), k + 4))); marks.append(dict(evidence_id=eid, disclosed=day, first_trading_day=bars[k]["date"]))
    return dict(source=d["source"], adjust="不复权", unit=dict(close="元", pct="%，相对前一交易日收盘", turnover="元"), fetched=d["fetched_at"], error=None,
                note="只保留各次披露前后 3 个交易日的片段", markers=marks,
                bars=[dict(date=b["date"], close=b["close"], pct=b.get("pct"), turnover=b.get("turnover")) for n, b in enumerate(bars) if n in keep])
out = []
for path in sorted(glob.glob("pipeline/extracted/*.json")):
    e = json.load(open(path)); th = e.get("thscode"); news = load_news(th) if th else None
    texts, ev = {}, {}
    for x in e["evidence"]:
        meta, texts[x["id"]] = resolve(x, th, news)
        if not meta: continue
        occ = x.pop("occurred", None) or (e["occurred"] if x["src"] == "ann" else dict(date="未抽取", note="报道所述事项的发生日期没有抽取"))
        x.update(title=meta["title"], url=meta["url"], source=meta["source"], channel=meta["channel"], source_tier=x.pop("tier"),
                 times=dict(occurred=occ, disclosed=meta["published_at"][:10], published_at=meta["published_at"], precision=meta["precision"],
                            signed=x.pop("signed", None), fetched=meta["fetched"], updated=None))
        x["weight"] = WEIGHTS[x["source_tier"]]["w"]; x["tier_note"] = WEIGHTS[x["source_tier"]]["label"]
        if x.get("quote"): check(x["id"], x["quote"], texts, x["id"])
        ev[x["id"]] = x
    e["evidence"].sort(key=lambda x: x["times"]["published_at"])
    for x in e["evidence"]:
        for k in ("target",):
            if x["relation"].get(k) and x["relation"][k] not in ev: errs.append(f"{x['id']} 的关系指向不存在的 {x['relation'][k]}")
        if x.get("outdated_by") and x["outdated_by"] not in ev: errs.append(f"{x['id']} outdated_by 不存在")
    for c in e.get("claims", []):
        vs = []
        for n, v in enumerate(c["versions"]):
            check(v["evidence_id"], v["quote"], texts, f"{c['key']} v{n+1}")
            v.update(v=n + 1, unit=c.get("unit"), valid_from=v.get("valid_from") or ev[v["evidence_id"]]["times"]["disclosed"], valid_to=None, status=v.get("status", "active"), superseded_by=None)
            vs.append(v)
        for a, b in zip(vs, vs[1:]): a.update(valid_to=b["valid_from"], status="superseded", superseded_by=b["evidence_id"])
    for c in e.get("conflicts", []):
        c["quotes"] = [dict(evidence_id=i, quote=q) for i, q in c["quotes"]]
        for q in c["quotes"]: check(q["evidence_id"], q["quote"], texts, f"冲突 {c['id']}")
        c["evidence_ids"] = [q["evidence_id"] for q in c["quotes"]]
        c["first_seen"] = max(ev[i]["times"]["disclosed"] for i in c["evidence_ids"] if i in ev)
    for s in e["status_history"]: s["at"] = ev[s["evidence_id"]]["times"]["disclosed"]
    for c in e["conclusions"]:
        c["as_of"] = ev[c["evidence_id"]]["times"]["disclosed"]
        for part in ("facts", "inferences"):
            for it in c.get(part, []):
                for i in it["evidence_ids"]:
                    if i not in ev: errs.append(f"结论引用了不存在的证据 {i}")
                    elif ev[i]["times"]["disclosed"] > c["as_of"]: errs.append(f"{c['as_of']} 的结论引用了之后才出现的证据 {i}")
    e["status"], e["status_since"] = e["status_history"][-1]["status"], e["status_history"][-1]["at"]
    e["notifications"] = [dict(at=s["at"], type="状态变化", evidence_id=s["evidence_id"], text=f"状态变为「{s['status']}」：{ev[s['evidence_id']]['title'][:40]}") for s in e["status_history"]] + \
                         [dict(at=c["first_seen"], type="证据冲突", conflict_id=c["id"], text=c["text"]) for c in e.get("conflicts", [])] + \
                         [dict(at=ev[x["outdated_by"]]["times"]["disclosed"], type="观点过期", evidence_id=x["id"], text=f"{x['source']}的观点前提已不成立：{x['title'][:30]}") for x in e["evidence"] if x.get("outdated_by")]
    e["notifications"].sort(key=lambda n: n["at"])
    e["prices"] = prices(th, [(x["id"], x["times"]["disclosed"]) for x in e["evidence"] if x["src"] == "ann"]) if th else dict(error="未提供代码", bars=[], markers=[])
    if e["prices"].get("error"): e.setdefault("pending", []).append(f"行情不可用：{e['prices']['error']}")
    out.append(e)
if errs:
    print("\n".join(errs)); sys.exit(f"{len(errs)} 处未通过校验，未生成文件")
json.dump(dict(generated_at=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
    disclaimer="只整理公开披露信息和公开报道，不预测涨跌，不构成投资建议。",
    weights=WEIGHTS, weight_rule="低级别来源不能推翻高级别来源；同级别以后披露的为准。",
    time_note="发生时间=说法所指的日期或报告期；披露时间=公告在巨潮的披露日或媒体发布时间；抓取时间=本系统取数时间（UTC）；更新时间=来源事后修改的时间，目前数据源不提供。",
    events=out), open("data/events.json", "w"), ensure_ascii=False, indent=1)
print("OK", len(out), "个事件;", sum(len(e["evidence"]) for e in out), "条证据")
