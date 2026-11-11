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
errs, AUD = [], []
CUR = [None]
import hashlib
sha = lambda t: hashlib.sha256((t or "").encode()).hexdigest()[:16]
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
        m = re.search(r"/(20\d{6})/", i["jump_url"]); pub = iso(i["publish_time_ms"])
        if m and abs((datetime.datetime.strptime(m.group(1), "%Y%m%d").date() - pub.date()).days) > 1:
            errs.append(f"{x['id']}: 新闻时间戳 {pub.date()} 和链接里的日期 {m.group(1)} 对不上，不能用作证据")
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
    ok = norm(q) in texts[eid]
    AUD.append(dict(event_id=CUR[0], where=where, evidence_id=eid, quote=q, **{"pass": ok}))
    if not ok: errs.append(f"{where}: 引用未在 {eid} 原文中匹配到 → {q}")
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
DRY = "--dry" in sys.argv
FILES = [a for a in sys.argv[1:] if a.endswith(".json")] or sorted(glob.glob("pipeline/extracted/*.json"))
SCALE = {"元": 1, "万元": 1e4, "亿元": 1e8, "%": 1, "股": 1, "万股": 1e4, "元/股": 1}
STATUS_CODES = ["已预告", "预告更正", "已兑现", "定期报告更正", "筹划", "预案", "草案", "审核中", "未通过", "终止审核", "终止", "监管问询", "立案", "风险警示", "终止上市", "澄清", "否认"]
INJECT = ["忽略以上", "忽略之前", "忽略上述", "系统提示", "ignore previous", "ignore all", "system prompt"]
def nums(q): return [float(m.replace(",", "").replace("，", "")) for m in re.findall(r"-?\d[\d,，]*(?:\.\d+)?", q or "")]
def check_value(c, v, where):
    """数值必须能在自己的引用里找到；换算成指标单位后要等于 low/high。"""
    raw = v.get("raw") or dict(low=v["low"], high=v["high"], unit=c.get("unit"))
    if raw["unit"] not in SCALE or c.get("unit") not in SCALE: errs.append(f"{where}: 单位不认识 {raw['unit']} / {c.get('unit')}"); return
    found = nums(v["quote"])
    for k in ("low", "high"):
        if raw[k] is None:
            if v[k] is not None: errs.append(f"{where}: 原文没有数却给了 {k}")
            continue
        if not any(abs(abs(raw[k]) - abs(f)) < 1e-6 for f in found): errs.append(f"{where}: 引用里找不到数值 {raw[k]} → {v['quote']}")
        conv = raw[k] * SCALE[raw["unit"]] / SCALE[c["unit"]]
        if v[k] is None or abs(conv - v[k]) > 0.006: errs.append(f"{where}: 单位换算对不上，原文 {raw[k]}{raw['unit']} 应为 {round(conv, 2)}{c['unit']}，写的是 {v[k]}")
out = []
for path in FILES:
    e = json.load(open(path)); th = e.get("thscode"); news = load_news(th) if th else None
    texts, ev = {}, {}
    CUR[0] = e["id"]
    for x in e["evidence"]:
        meta, texts[x["id"]] = resolve(x, th, news)
        if not meta: continue
        occ = x.pop("occurred", None) or (e["occurred"] if x["src"] == "ann" else dict(date="未抽取", note="报道所述事项的发生日期没有抽取"))
        x.update(title=meta["title"], url=meta["url"], source=meta["source"], channel=meta["channel"], source_tier=x.pop("tier"),
                 times=dict(occurred=occ, disclosed=meta["published_at"][:10], published_at=meta["published_at"], precision=meta["precision"],
                            signed=x.pop("signed", None), fetched=meta["fetched"], updated=None))
        x["snapshot"] = dict(sha256_16=sha(texts[x["id"]]), taken_at=meta["fetched"], of="公告正文（去空白后）" if x["src"] == "ann" else "标题加摘要（去空白后）") if texts[x["id"]] else None
        short = re.sub(r"^.{0,24}?(股份)?有限公司", "", x["title"]).strip(" ：:-") or x["title"]
        x["label"] = x.get("doc_no") or ((short[:15] + "…") if len(short) > 16 else short) if x["src"] == "ann" else x["source"]
        x["weight"] = WEIGHTS[x["source_tier"]]["w"]; x["tier_note"] = WEIGHTS[x["source_tier"]]["label"]
        if x.get("quote"): check(x["id"], x["quote"], texts, x["id"])
        if x["src"] == "anomaly" and x["source_tier"] != "D": errs.append(f"{x['id']}: 异动解读的来源级别只能是 D")
        if x["src"] == "news" and x["source_tier"] == "A": errs.append(f"{x['id']}: 新闻的来源级别不能是 A")
        if x["src"] == "ann" and x["source_tier"] != "A": errs.append(f"{x['id']}: 公告的来源级别应为 A")
        for w in INJECT:
            if w.lower() in ((x.get("quote") or "") + (x.get("summary") or "")).lower(): errs.append(f"{x['id']}: 引用或摘要里有指令式文字「{w}」")
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
            if v["evidence_id"] in ev: check_value(c, v, f"{e['id']} {c['key']} v{n+1}")
            v.update(v=n + 1, unit=c.get("unit"), valid_from=v.get("valid_from") or ev[v["evidence_id"]]["times"]["disclosed"], valid_to=None, status=v.get("status", "active"), superseded_by=None)
            vs.append(v)
        for a, b in zip(vs, vs[1:]): a.update(valid_to=b["valid_from"], status="superseded", superseded_by=b["evidence_id"])
        c["versions"] = vs
        for a, b in zip(vs, vs[1:]):
            if b["valid_from"] < a["valid_from"]: errs.append(f"{e['id']} {c['key']}: 第 {b['v']} 版的生效日早于第 {a['v']} 版")
        if e["type"] == "业绩预告" and len(vs) > 1 and vs[-1].get("basis", "").startswith(("年报", "半年报", "半年度报告", "年度报告")) and vs[0]["low"] is not None:
            a, lo, hi = vs[-1]["low"], vs[0]["low"], vs[0]["high"]
            c["forecast_gap"] = dict(first_low=lo, first_high=hi, actual=a, unit=c.get("unit"), within_first_range=lo <= a <= hi,
                                     gap_to_nearer_bound=0 if lo <= a <= hi else round(min(abs(a - lo), abs(a - hi)), 2), revisions=len(vs) - 2,
                                     note="首次预告区间和定期报告实际数的差。只陈列已发生的事实，不代表对今后预告的判断。")
    for c in e.get("conflicts", []):
        c["quotes"] = [dict(evidence_id=i, quote=q) for i, q in c["quotes"]]
        for q in c["quotes"]: check(q["evidence_id"], q["quote"], texts, f"冲突 {c['id']}")
        c["evidence_ids"] = [q["evidence_id"] for q in c["quotes"]]
        c["first_seen"] = max(ev[i]["times"]["disclosed"] for i in c["evidence_ids"] if i in ev)
    for s in e["status_history"]:
        s["at"] = ev[s["evidence_id"]]["times"]["disclosed"]
        if s.get("code") not in STATUS_CODES: errs.append(f"{e['id']}: 状态「{s['status']}」没有标准状态码，code 必须是 {STATUS_CODES} 之一")
    for c in e["conclusions"]:
        c["as_of"] = ev[c["evidence_id"]]["times"]["disclosed"]
        for it in c.get("facts", []):
            if not any(i in ev and ev[i]["kind"] == "事实" and ev[i]["source_tier"] in "AB" for i in it["evidence_ids"]): errs.append(f"{e['id']} {c['as_of']}: 事实句没有挂 A 或 B 级的事实类证据 → {it['text'][:24]}")
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
    anns = [x for x in e["evidence"] if x["src"] == "ann"]
    first = next((x for x in anns if x["relation"]["type"] == "首次披露"), anns[0] if anns else None)
    if first:
        early = [x for x in e["evidence"] if x["src"] == "news" and x["relation"].get("target") == first["id"] and x["times"]["published_at"] < first["times"]["published_at"]]
        e["first_source"] = dict(evidence_id=first["id"], title=first["title"], doc_no=first.get("doc_no"), disclosed=first["times"]["disclosed"], source=first["source"],
            earlier_media=[dict(evidence_id=x["id"], source=x["source"], published_at=x["times"]["published_at"]) for x in early],
            note="最早出处取本事件里最早的公司公告。媒体转述早于巨潮披露日的，单列在 earlier_media：公告通常前一晚上网，巨潮按次日记披露日。")
    mix = {}
    for x in e["evidence"]:
        k = "公告" if x["src"] == "ann" else {"事实": "媒体转述", "观点": "评论和研报观点", "推测": "推测和归因", "传闻": "传闻"}[x["kind"]]
        mix[k] = mix.get(k, 0) + 1
    e["evidence_mix"] = dict(counts=mix, conflicts=len(e.get("conflicts", [])), outdated=sum(1 for x in e["evidence"] if x.get("outdated_by")),
                             last_evidence_at=max(x["times"]["published_at"] for x in e["evidence"]))
    e["prices"] = prices(th, [(x["id"], x["times"]["disclosed"]) for x in e["evidence"] if x["src"] == "ann"]) if th else dict(error="未提供代码", bars=[], markers=[])
    if e["prices"].get("error"): e.setdefault("pending", []).append(f"行情不可用：{e['prices']['error']}")
    out.append(e)
if DRY:
    print("\n".join(errs) if errs else f"试跑通过：{len(out)} 个事件，{len(AUD)} 条引用，未写入任何文件"); sys.exit(1 if errs else 0)
QA = json.load(open("pipeline/qa.json")); EV = {e["id"]: {x["id"]: x for x in e["evidence"]} for e in out}; leak_checks = 0
for q in QA["items"]:
    if q["event_id"] not in EV: errs.append(f"问答 {q['id']} 指向不存在的事件"); continue
    used = [i for a in q["answer"] for i in a["evidence_ids"]] + [i for t in q["trace"] for i in t.get("used", [])] + [x["id"] for t in q["trace"] for x in t.get("excluded", [])]
    for i in used:
        if i not in EV[q["event_id"]]: errs.append(f"问答 {q['id']} 引用了不存在的证据 {i}")
    for i in [i for a in q["answer"] for i in a["evidence_ids"]] + [i for t in q["trace"] for i in t.get("used", [])]:
        leak_checks += 1
        if i in EV[q["event_id"]] and EV[q["event_id"]][i]["times"]["disclosed"] > q["as_of"]: errs.append(f"问答 {q['id']}（截至 {q['as_of']}）用了之后才披露的证据 {i}")
    for a in q["answer"]:
        if a["kind"] == "事实" and not a["evidence_ids"]: errs.append(f"问答 {q['id']} 有一句事实没有证据编号")
now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
hist = json.load(open("data/audit_history.json")) if os.path.exists("data/audit_history.json") else []
hist.append(dict(at=now, ok=not errs, quotes_checked=len(AUD), blocked=errs)); json.dump(hist[-50:], open("data/audit_history.json", "w"), ensure_ascii=False, indent=1)
if errs:
    print("\n".join(errs)); sys.exit(f"{len(errs)} 处未通过校验，未生成文件")
ORDER = ["600187-2025A-forecast", "600499-2026-tefu-restructuring", "605081-2025A-delisting", "600187-2026H1-forecast", "600889-2026H1-forecast",
         "600499-2026H1-forecast", "920685-2026-restructuring", "01122-2026-11-11-clarification", "02672-2026-11-11-clarification"]
out.sort(key=lambda e: ORDER.index(e["id"]) if e["id"] in ORDER else len(ORDER))
json.dump(dict(generated_at=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
    disclaimer="只整理公开披露信息和公开报道，不预测涨跌，不构成投资建议。",
    glossary=dict(updated="2026-11-11", sections=[
        dict(title="事件状态", note="只按公司公告和交易所文件认定，媒体的说法不改变状态。", items=[
            ["已预告", "公司披露了业绩预告，还没有更正，定期报告也还没出。"], ["预告更正", "公司发公告更正了之前的业绩预告。"], ["已兑现", "定期报告已披露，预告有了实际数可以对照。"],
            ["定期报告更正", "年报或半年报披露后，公司又更正了其中的内容。"], ["筹划", "公司公告正在筹划交易，方案未定。"], ["预案", "已披露预案，审计评估通常未完成。"],
            ["草案", "已披露报告书草案，作价等要素已确定。"], ["审核中", "交易所已受理或正在问询、等待上会。"], ["未通过", "审核机构审议未通过。交易是否终止还要看后续公告。"],
            ["终止审核", "交易所决定终止对这次申请的审核。"], ["终止", "公司董事会决定终止交易。"], ["监管问询", "收到监管工作函、问询函，或已回复。"], ["立案", "公司公告收到证监会立案告知书。"],
            ["风险警示", "被实施或提示可能被实施退市风险警示、其他风险警示。"], ["终止上市", "交易所作出终止上市决定，直至摘牌。"], ["澄清", "公司发公告更正或说明自己之前披露的内容。"], ["否认", "公司发公告否认外部的说法。"]]),
        dict(title="数字版本的状态", items=[["当前有效", "截至所选日期，这个指标最新的一版。"], ["前值", "已被后面的公告取代。保留不删，并注明哪天被哪条证据取代。"], ["已作废", "交易终止等原因使这个数不再适用。"]]),
        dict(title="证据类型", items=[["事实", "公司公告、交易所文件里陈述的事，或媒体对公告内容的如实转述。"], ["观点", "媒体评论、研报的判断。"], ["推测", "带“或”“有望”“？”的报道，或把股价变化归因于某件事的解读。"], ["传闻", "没有署名来源的说法。目前没有收录到真实样例。"],
            ["前提已不成立", "观点以某件事会发生为前提，后来的公告推翻了这个前提。观点保留，但标出是哪条公告推翻的。"]]),
        dict(title="来源级别和权重", note="权重由规则给定，不由模型打分。低级别来源不能推翻高级别来源；同级别以后披露的为准。", items=[[k, f"{v['label']}，权重 {v['w']}"] for k, v in WEIGHTS.items()]),
        dict(title="四种时间", items=[["发生时间", "说法所指的日期或报告期，比如董事会开会日、业绩所属的年度。"], ["披露时间", "公告在巨潮的披露日（精确到日），或媒体的发布时间（精确到分钟）。公告通常前一晚上网，所以媒体转述可能比披露日早一晚。"],
            ["抓取时间", "本系统取到这条数据的时间。"], ["更新时间", "来源事后修改的时间。数据源不提供，靠重抓比对正文指纹来发现；目前没有发现变化。"]]),
        dict(title="结论里的三种句子", items=[["事实", "至少有一条公告或对公告的转述作依据。"], ["推断", "系统或媒体的判断，会写明是谁的判断。"], ["还不确定", "截至所选日期没有证据能回答的事。"]])]),
    weights=WEIGHTS, weight_rule="低级别来源不能推翻高级别来源；同级别以后披露的为准。",
    time_note="发生时间=说法所指的日期或报告期；披露时间=公告在巨潮的披露日或媒体发布时间；抓取时间=本系统取数时间（UTC）；更新时间=来源事后修改的时间，目前数据源不提供。",
    events=out), open("data/events.json", "w"), ensure_ascii=False, indent=1)
for q in QA["items"]: q["generated"] = "离线生成"
json.dump(dict(generated_at=now, note=QA["note"], items=QA["items"]), open("data/qa.json", "w"), ensure_ascii=False, indent=1)
json.dump(dict(generated_at=now,
    summary=dict(quotes_checked=len(AUD), quotes_passed=sum(a["pass"] for a in AUD), quotes_blocked=sum(not a["pass"] for a in AUD), qa_items=len(QA["items"]), qa_evidence_time_checks=leak_checks,
                 builds_recorded=len(hist), builds_blocked=sum(not h["ok"] for h in hist)),
    rules=["每条引用去掉空白后，必须在对应证据的原文里逐字出现", "结论和问答不能引用截至日之后才披露的证据", "标为事实的句子必须挂证据编号", "引用的证据编号必须存在",
           "任何一条不通过，本次构建不生成数据文件，线上保持上一版"],
    note="能生成这份文件，说明本次构建全部通过。被拦下的构建记在 history 里；历史从 2026-11-11 开始记，之前的失败没有留档。",
    history=hist[-50:], checks=AUD), open("data/audit.json", "w"), ensure_ascii=False, indent=1)
print("OK", len(out), "个事件;", sum(len(e["evidence"]) for e in out), "条证据")
