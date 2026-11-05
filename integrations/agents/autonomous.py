#!/usr/bin/env python3
"""Four independent, persistent Ollama-backed task agents for BastillaOS.
No shell execution, git writes or deployment privileges are granted.
"""
import argparse
import json
import os
import sqlite3
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

AGENTS = {
    "Aria": "Coordinate project tasks, split work into actionable steps and identify dependencies.",
    "Alex": "Design and review BastillaOS architecture, kernel interfaces and implementation plans.",
    "Astyria": "Analyze reliability, test plans, security risks and diagnostic evidence.",
    "Aurelius": "Review GitHub integration, CI, release plans and safe deployment procedures.",
}
DB = Path(os.getenv("BASTILLA_AGENT_DB", "data/agents/tasks.sqlite3"))
OLLAMA = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
MODEL = os.getenv("OLLAMA_MODEL", "gemma3:4b")

def connect():
    DB.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB)
    db.execute("CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY, agent TEXT NOT NULL, prompt TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', result TEXT, created TEXT NOT NULL, updated TEXT NOT NULL)")
    db.commit()
    return db

def now():
    return datetime.now(timezone.utc).isoformat()

def ask(agent, prompt):
    body = json.dumps({"model": MODEL, "stream": False, "messages": [
        {"role": "system", "content": f"You are {agent}, an autonomous planning and analysis agent for BastillaOS. Mission: {AGENTS[agent]} You cannot claim to have executed commands, accessed GitHub, or verified live status. Return a concrete, honest action plan in Polish."},
        {"role": "user", "content": prompt}
    ], "options": {"num_predict": 1024}}).encode()
    request = urllib.request.Request(OLLAMA + "/api/chat", data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=180) as response:
        return json.load(response)["message"]["content"]

def work(db):
    task = db.execute("SELECT id,agent,prompt FROM tasks WHERE status='queued' ORDER BY id LIMIT 1").fetchone()
    if not task:
        return False
    task_id, agent, prompt = task
    db.execute("UPDATE tasks SET status='running',updated=? WHERE id=?", (now(), task_id))
    db.commit()
    try:
        answer = ask(agent, prompt)
        status = "done"
    except Exception as exc:
        answer, status = f"{type(exc).__name__}: {exc}", "failed"
    db.execute("UPDATE tasks SET status=?,result=?,updated=? WHERE id=?", (status, answer, now(), task_id))
    db.commit()
    print(json.dumps({"id": task_id, "agent": agent, "status": status}, ensure_ascii=False), flush=True)
    return True

def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    add = sub.add_parser("submit")
    add.add_argument("agent", choices=[*AGENTS, "all"])
    add.add_argument("prompt")
    sub.add_parser("once")
    serve = sub.add_parser("serve")
    serve.add_argument("--interval", type=int, default=10)
    sub.add_parser("status")
    args = parser.parse_args()
    with connect() as db:
        if args.command == "submit":
            for agent in (AGENTS if args.agent == "all" else [args.agent]):
                db.execute("INSERT INTO tasks(agent,prompt,status,created,updated) VALUES(?,?,'queued',?,?)", (agent, args.prompt, now(), now()))
            db.commit()
            print("Queued")
        elif args.command == "once":
            work(db)
        elif args.command == "serve":
            while True:
                if not work(db):
                    time.sleep(max(1, args.interval))
        else:
            for row in db.execute("SELECT id,agent,status,substr(result,1,500),updated FROM tasks ORDER BY id DESC LIMIT 30"):
                print(json.dumps(dict(zip(["id","agent","status","result","updated"], row)), ensure_ascii=False))

if __name__ == "__main__":
    main()
