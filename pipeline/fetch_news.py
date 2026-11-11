"""拉非公告类证据：扶摇个股分时新闻、扶摇异动解读。密钥读本地 .env，不入库。
用法: python3 pipeline/fetch_news.py 600187.SH 600499.SH
输出: data/raw/news/<thscode>.json（原样保留来源、发布时间、链接、抓取时间；失败写 error）"""
import json, os, sys, time, datetime, urllib.request, urllib.parse
def env(n):
    v = os.environ.get(n)
    if not v and os.path.exists(".env"):
        for l in open(".env"):
            if l.startswith(n + "="): v = l.split("=", 1)[1].strip()
    return v or sys.exit(f"缺少 {n}")
def get(path, **q):
    url = "https://fuyao.aicubes.cn" + path + "?" + urllib.parse.urlencode(q)
    try:
        r = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={"X-api-key": env("FUYAO_API_KEY")}), timeout=30).read())
    except Exception as e:
        return None, f"请求失败: {type(e).__name__}"
    if r.get("code") != 0: return None, f"code={r.get('code')} {r.get('message')}"
    return r.get("data") or {}, None
def timeline(code, pages=15):
    items, off, err = [], "first", None
    for _ in range(pages):
        d, err = get("/api/news/stock/timeline-list", thscode=code, offset=off, size=100)
        if err or not d.get("items"): break
        items += d["items"]
        if not d.get("has_more"): break
        off = d["offset"]; time.sleep(0.3)
    return items, err
if __name__ == "__main__":
    os.makedirs("data/raw/news", exist_ok=True)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    BJ = datetime.timezone(datetime.timedelta(hours=8))
    for c in sys.argv[1:]:
        tl, e1 = timeline(c)
        an, e2 = get("/api/news/anomaly/analysis", begin_date="2025-12-01", end_date="2026-11-11", thscode=c)
        json.dump(dict(thscode=c, fetched_at=now, timeline=dict(source="扶摇 /api/news/stock/timeline-list", error=e1, items=tl),
                       anomaly=dict(source="扶摇 /api/news/anomaly/analysis", error=e2, data=an)), open(f"data/raw/news/{c}.json", "w"), ensure_ascii=False)
        ds = sorted(datetime.datetime.fromtimestamp(i["publish_time_ms"] / 1000, BJ).strftime("%Y-%m-%d") for i in tl if i.get("publish_time_ms"))
        print(c, "分时新闻", len(tl), e1, (ds[0], ds[-1]) if ds else "", "| 异动解读", len((an or {}).get("items") or []), e2)
