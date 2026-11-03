import json, os, urllib.request, time

REPOS = [
    "career-ops-hq/career-ops",
    "ai-job-search-dev/ai-job-search",
    "DaKheera47/job-ops",
    "Liam-Frost/AutoApply",
    "Gsync/jobsync",
    "coolbrother/apply-potato",
    "x0VIER/job-application-bot",
    "DanielPan12/JobHuntBot",
    "magicapple123/ResumeForge",
    "weicanie/prisma-ai",
    "GresonKwan/JobOK",
    "srbhr/Resume-Matcher",
    "reactive-resume/reactive-resume",
    "JOYCEQL/magic-resume",
    "Hacker233/resume-design",
    "LingyiChen-AI/JadeAI",
    "visiky/resume",
    "olyaiy/resume-lm",
    "attahiruj/resmd",
    "Divish1032/resume-hacker",
    "transponster27/LLM-Resume-Analyzer",
    "FelixNg1022/JobMatch-AI",
    "binoydutt/Resume-Job-Description-Matching",
    "jlifeng/JobPilot",
    "kyle-kw/ai-job-app",
    "zhansan379/boss-crawler-skill",
    "OmkarPathak/pyresparser",
    "speedyapply/JobSpy",
    "feder-cr/Jobs_Applier_AI_Agent_AIHawk",
    "xitanggg/open-resume",
]

def get(url, accept="application/vnd.github+json"):
    req = urllib.request.Request(url, headers={"Accept": accept, "User-Agent": "research"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()

os.makedirs("research/repos", exist_ok=True)
meta = {}
for fn in REPOS:
    try:
        data = json.loads(get(f"https://api.github.com/repos/{fn}"))
        branch = data.get("default_branch", "main")
        meta[fn] = {
            "full_name": data["full_name"], "stars": data["stargazers_count"],
            "forks": data["forks_count"], "desc": data.get("description"),
            "lang": data.get("language"), "license": (data.get("license") or {}).get("spdx_id"),
            "created": data.get("created_at"), "pushed": data.get("pushed_at"),
            "topics": data.get("topics", []), "homepage": data.get("homepage"),
            "archived": data.get("archived"), "branch": branch,
            "open_issues": data.get("open_issues_count"),
        }
        # readme
        try:
            raw = get(f"https://raw.githubusercontent.com/{fn}/{branch}/README.md", "*/*")
        except Exception:
            raw = b""
        txt = raw.decode("utf-8", "replace")
        safe = fn.replace("/", "__")
        with open(f"research/repos/{safe}.md", "w", encoding="utf-8") as f:
            f.write(txt)
        meta[fn]["readme_len"] = len(txt)
        print("OK", fn, data["stargazers_count"], len(txt))
    except Exception as e:
        print("ERR", fn, e)
    time.sleep(1)

with open("research/meta.json", "w", encoding="utf-8") as f:
    json.dump(meta, f, ensure_ascii=False, indent=1)
print("TOTAL", len(meta))
