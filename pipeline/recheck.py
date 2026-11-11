"""重抓公告正文，和上次存的正文比指纹，用来发现"来源事后改过"。
两个数据源都不提供更新时间，所以靠自己比对。结果写进 data/recheck.json。
用法: python3 pipeline/recheck.py"""
import json, re, hashlib, subprocess, tempfile, urllib.request, datetime, os
norm = lambda s: re.sub(r"\s+", "", s or "").replace("，", ",")
sha = lambda t: hashlib.sha256(t.encode()).hexdigest()[:16]
ev = json.load(open("data/events.json")); rows = []
for e in ev["events"]:
    for x in e["evidence"]:
        if x["src"] != "ann": continue
        old = sha(norm(open(f"data/raw/text/{x['ref']}.txt").read()))
        try:
            with tempfile.TemporaryDirectory() as d:
                p = os.path.join(d, "a.pdf"); t = os.path.join(d, "a.txt")
                open(p, "wb").write(urllib.request.urlopen(urllib.request.Request(x["url"], headers={"User-Agent": "Mozilla/5.0"}), timeout=40).read())
                subprocess.run(["pdftotext", "-layout", p, t], check=True)
                new = sha(norm(open(t).read()))
            rows.append(dict(event_id=e["id"], evidence_id=x["id"], ref=x["ref"], first_snapshot=x["times"]["fetched"], old=old, new=new, changed=old != new, error=None))
        except Exception as err:
            rows.append(dict(event_id=e["id"], evidence_id=x["id"], ref=x["ref"], old=old, new=None, changed=None, error=type(err).__name__))
out = dict(checked_at=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"), checked=len(rows),
           changed=sum(r["changed"] is True for r in rows), failed=sum(r["error"] is not None for r in rows), items=rows,
           note="changed 为真表示公告正文和首次抓取时不一样，页面上应把重抓时间记为该证据的更新时间。")
json.dump(out, open("data/recheck.json", "w"), ensure_ascii=False, indent=1)
print({k: out[k] for k in ("checked_at", "checked", "changed", "failed")})
