import json, time, urllib.parse, urllib.request, os

QUERIES = [
    "resume builder ai",
    "ai resume",
    "resume job matching",
    "job application ai agent",
    "resume tailor job description",
    "ats resume optimizer",
    "conversational resume chatbot",
    "resume parser nlp",
    "job application tracker",
    "cover letter generator ai",
    "简历 生成",
    "简历 岗位 匹配",
]

out = {}
for q in QUERIES:
    url = "https://api.github.com/search/repositories?" + urllib.parse.urlencode({
        "q": q, "sort": "stars", "order": "desc", "per_page": 20
    })
    req = urllib.request.Request(url, headers={
        "Accept": "application/vnd.github+json",
        "User-Agent": "research-script",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.load(r)
    except Exception as e:
        print("ERR", q, e)
        time.sleep(8)
        continue
    print(q, data.get("total_count"), len(data.get("items", [])))
    for it in data.get("items", []):
        fn = it["full_name"]
        if fn not in out:
            out[fn] = {
                "full_name": fn,
                "stars": it["stargazers_count"],
                "forks": it["forks_count"],
                "desc": it.get("description"),
                "lang": it.get("language"),
                "updated": it.get("pushed_at"),
                "topics": it.get("topics", []),
                "license": (it.get("license") or {}).get("spdx_id"),
                "url": it["html_url"],
                "queries": [q],
            }
        else:
            out[fn]["queries"].append(q)
    time.sleep(7)

os.makedirs("research", exist_ok=True)
with open("research/repos.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)

ranked = sorted(out.values(), key=lambda x: -x["stars"])
with open("research/repos.md", "w", encoding="utf-8") as f:
    for r in ranked:
        f.write(f"- **{r['full_name']}** ⭐{r['stars']} ({r['lang']}, {r['license']}) — {r['desc']}\n")
print("TOTAL", len(out))
