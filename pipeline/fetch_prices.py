"""从扶摇金融数据 API 拉日 K 线，用来对照每次披露前后的价格和成交量。
密钥从环境变量或本地 .env 读（FUYAO_API_KEY），不入库。
用法: python3 pipeline/fetch_prices.py 600187.SH 600499.SH
输出: data/prices/<thscode>.json；调用失败时写入 error，不生成假数据。"""
import json, os, sys, time, datetime, urllib.request
def key():
    k = os.environ.get("FUYAO_API_KEY")
    if not k and os.path.exists(".env"):
        for l in open(".env"):
            if l.startswith("FUYAO_API_KEY="): k = l.split("=", 1)[1].strip()
    if not k: sys.exit("缺少 FUYAO_API_KEY")
    return k
BJ = datetime.timezone(datetime.timedelta(hours=8))
ms = lambda s: int(datetime.datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=BJ).timestamp() * 1000)
def fetch(code, start="2025-12-01", end="2026-11-11", adjust="none"):
    url = f"https://fuyao.aicubes.cn/api/a-share/prices/historical?thscode={code}&interval=1d&start={ms(start)}&end={ms(end)}&adjust={adjust}"
    meta = dict(thscode=code, source="扶摇金融数据 API /api/a-share/prices/historical", adjust=adjust, unit=dict(price="元", volume="以接口返回为准", turnover="元"),
                fetched_at=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"))
    try:
        r = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={"X-api-key": key()}), timeout=30).read())
    except Exception as e:
        return dict(meta, error=f"请求失败: {type(e).__name__}", bars=[])
    if r.get("code") not in (0, 200, "0"):
        return dict(meta, error=f"接口返回 code={r.get('code')} {r.get('message')}", request_id=r.get("request_id"), bars=[])
    items = (r.get("data") or {}).get("item") or []
    bars = [dict(date=datetime.datetime.fromtimestamp(i["date_ms"] / 1000, BJ).strftime("%Y-%m-%d"), open=i.get("open_price"), high=i.get("high_price"),
                 low=i.get("low_price"), close=i.get("close_price"), volume=i.get("volume"), turnover=i.get("turnover")) for i in items]
    return dict(meta, request_id=r.get("request_id"), error=None if bars else "接口返回空数据", bars=bars)
if __name__ == "__main__":
    os.makedirs("data/prices", exist_ok=True)
    for c in sys.argv[1:]:
        d = fetch(c); json.dump(d, open(f"data/prices/{c}.json", "w"), ensure_ascii=False)
        print(c, len(d["bars"]), d["error"], d["bars"][:1], d["bars"][-1:]); time.sleep(0.5)
