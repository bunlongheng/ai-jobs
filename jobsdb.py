#!/usr/bin/env python3
"""job_postings DB helper (Linode Postgres). Ingest scored runs and query the pipeline.

Reads LINODE_DATABASE_URL from /Users/bheng/Sites/bheng/.env.local (never printed).
Uses psql (no python driver needed).

Usage:
  python3 jobsdb.py ingest <run.json>   # upsert scored jobs (keeps status/applied_at)
  python3 jobsdb.py pipeline            # summary by verdict + status
  python3 jobsdb.py applied             # rows where status='applied'
  python3 jobsdb.py apply <id|dedupe>   # mark applied (status='applied', applied_at=now())
  python3 jobsdb.py top [N]             # top N by score not yet applied
"""
import json, os, re, subprocess, sys

ENV = "/Users/bheng/Sites/bheng/.env.local"


def db_url():
    for line in open(ENV):
        if line.startswith("LINODE_DATABASE_URL="):
            return line.split("=", 1)[1].strip().strip('"')
    sys.exit("FAIL: LINODE_DATABASE_URL not in .env.local")


def psql(sql, tuples=False):
    args = ["psql", db_url(), "-v", "ON_ERROR_STOP=1"]
    if tuples:
        args += ["-At", "-F", "\t"]
    r = subprocess.run(args + ["-c", sql], capture_output=True, text=True)
    if r.returncode:
        sys.exit("psql error: " + r.stderr.strip())
    return r.stdout


def q(s):
    return s.replace("'", "''") if s else ""


def dq(obj):  # dollar-quoted jsonb literal
    return "$j$" + json.dumps(obj or None) + "$j$"


def ingest(path):
    run = json.load(open(path))
    rows = []
    for j in run["jobs"]:
        url = j.get("url", "")
        dedupe = "job:" + (url or (j["company"] + ":" + j["title"]))
        rows.append(
            "INSERT INTO job_postings "
            "(source,ats,dedupe_key,company,title,location,remote,salary,url,posted,"
            "score,verdict,reasons,flags,score_breakdown,raw) VALUES "
            "('%s','%s','%s','%s','%s','%s',%s,'%s','%s','%s',%s,'%s',%s,%s,%s,%s) "
            "ON CONFLICT (dedupe_key) DO UPDATE SET "
            "score=EXCLUDED.score, verdict=EXCLUDED.verdict, reasons=EXCLUDED.reasons, "
            "flags=EXCLUDED.flags, score_breakdown=EXCLUDED.score_breakdown, "
            "raw=EXCLUDED.raw, updated_at=now();"
            % (q(j.get("source", "ats")), q(j.get("ats", "")), q(dedupe),
               q(j["company"]), q(j["title"]), q(j.get("location", "")),
               "true" if j.get("remote", True) else "false",
               q(j.get("salary", "")), q(url), q(j.get("posted", "")),
               j.get("score", 0), q(j.get("verdict", "")),
               dq(j.get("reasons")), dq(j.get("flags")),
               dq(j.get("score_breakdown")), dq(j))
        )
    psql("\n".join(rows))
    print("ingested %d jobs from %s" % (len(rows), path))
    pipeline()


def pipeline():
    print("\n=== pipeline: verdict x status ===")
    print(psql("SELECT verdict, status, count(*) FROM job_postings "
               "GROUP BY verdict, status ORDER BY verdict, status;"))
    print("=== totals ===")
    print(psql("SELECT status, count(*) FROM job_postings GROUP BY status ORDER BY count(*) DESC;"))


def applied():
    print(psql("SELECT score, company, title, applied_at::date FROM job_postings "
               "WHERE status='applied' ORDER BY applied_at DESC;"))


def top(n=15):
    print(psql("SELECT score, verdict, company, left(title,48) FROM job_postings "
               "WHERE status='new' ORDER BY score DESC LIMIT %d;" % n))


def mark_applied(key):
    where = ("id=%s" % key) if str(key).isdigit() else (
        "dedupe_key='%s' OR id::text='%s'" % (q(key), q(key)))
    psql("UPDATE job_postings SET status='applied', applied_at=now(), updated_at=now() "
         "WHERE %s;" % where)
    print("marked applied:", key)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "pipeline"
    if cmd == "ingest":
        ingest(sys.argv[2])
    elif cmd == "pipeline":
        pipeline()
    elif cmd == "applied":
        applied()
    elif cmd == "apply":
        mark_applied(sys.argv[2])
    elif cmd == "top":
        top(int(sys.argv[2]) if len(sys.argv) > 2 else 15)
    else:
        sys.exit("unknown cmd: " + cmd)
