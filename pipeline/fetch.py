"""从巨潮资讯网（cninfo.com.cn，证监会指定信息披露平台）拉取真实公告元数据。
用法: python3 pipeline/fetch.py
输出: data/raw/announcements.json（每条含抓取时间 fetched_at）"""
import json, time, urllib.request, urllib.parse, re, datetime, os
UA = {"User-Agent": "Mozilla/5.0", "Content-Type": "application/x-www-form-urlencoded"}
SD, ED = "2026-01-01", "2026-11-11"
def post(url, data=None):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode() if data else b"", headers=UA)
    return json.loads(urllib.request.urlopen(req, timeout=20).read())
def search(key, n=30):
    q = urllib.parse.urlencode(dict(searchkey=key, sdate=SD, edate=ED, isfulltext="false", sortName="pubdate", sortType="desc", pageNum=1, pageSize=n))
    return post("http://www.cninfo.com.cn/new/fulltextSearch/full?" + q).get("announcements") or []
def by_stock(code, org):
    out = []
    for p in range(1, 6):
        r = post("http://www.cninfo.com.cn/new/hisAnnouncement/query", dict(stock=f"{code},{org}", tabName="fulltext", pageSize=30, pageNum=p, column="", category="", plate="", seDate=f"{SD}~{ED}", searchkey="", secid="", sortName="", sortType="", isHLtitle="true"))
        out += r.get("announcements") or []
        if not r.get("hasMore"): break
        time.sleep(0.3)
    return out
picked = {}
for key, k in [("业绩预告更正", 3), ("澄清公告", 3), ("终止重大资产重组", 2)]:
    c = 0
    for a in search(key):
        if a["secCode"] not in picked and c < k and a.get("orgId"):
            picked[a["secCode"]] = (a["orgId"], a["secName"], key); c += 1
    time.sleep(0.3)
now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
rows = []
for code, (org, name, why) in picked.items():
    for a in by_stock(code, org):
        rows.append(dict(id=a["announcementId"], code=code, name=name, picked_by=why,
            title=re.sub(r"</?em>", "", a["announcementTitle"]), disclosed_ms=a["announcementTime"],
            url="http://static.cninfo.com.cn/" + a["adjunctUrl"], fetched_at=now, source="巨潮资讯网"))
os.makedirs("data/raw", exist_ok=True)
json.dump(rows, open("data/raw/announcements.json", "w"), ensure_ascii=False, indent=1)
print(len(rows), "条", {v[1]: v[2] for v in picked.values()})
