"""按公告 id 取正文：本地没有就从巨潮下载 PDF 并用 pdftotext 转成文本。只新增文件，不改已有文件。
用法: python3 pipeline/get_text.py 1225414043 1225480593      打印每份的路径和字数
      python3 pipeline/get_text.py --list 600889 [关键词]       列出某只股票的公告（日期、id、标题）"""
import json, sys, os, subprocess, urllib.request, datetime
BJ = datetime.timezone(datetime.timedelta(hours=8))
rows = json.load(open("data/raw/announcements.json")); by = {r["id"]: r for r in rows}
if sys.argv[1] == "--list":
    kw = sys.argv[3:]
    for r in sorted(rows, key=lambda r: r["disclosed_ms"]):
        if r["code"] == sys.argv[2] and (not kw or any(k in r["title"] for k in kw)):
            print(datetime.datetime.fromtimestamp(r["disclosed_ms"] / 1000, BJ).strftime("%Y-%m-%d"), r["id"], r["title"][:80])
    sys.exit()
os.makedirs("data/raw/pdf", exist_ok=True); os.makedirs("data/raw/text", exist_ok=True)
for i in sys.argv[1:]:
    t = f"data/raw/text/{i}.txt"
    if not os.path.exists(t):
        p = f"data/raw/pdf/{i}.pdf"
        open(p, "wb").write(urllib.request.urlopen(urllib.request.Request(by[i]["url"], headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read())
        subprocess.run(["pdftotext", "-layout", p, t], check=True)
    print(i, by[i]["title"][:50], t, len(open(t).read()), "字")
