# BastillaOS / Bastilla OS 2 — canonical repository

**Canonical GitHub repository for both projects:** `u6930438163-code/LISTOPAD`.

The independent agent worker is in `integrations/agents/autonomous.py`. It provides separate missions, queued tasks, persistent SQLite history and Ollama inference for Aria, Alex, Astyria and Aurelius. Each task gets an independent model request; workers share a queue but do not impersonate independent AI models.

## Run in Codespaces or on your own machine

```bash
# Install and start Ollama and pull the model first, then:
python3 integrations/agents/autonomous.py submit all "Przeanalizuj plan rozwoju Bastilla OS 2"
python3 integrations/agents/autonomous.py serve
# In another terminal:
python3 integrations/agents/autonomous.py status
```

Use `python3 integrations/agents/autonomous.py once` for a single task. To run unattended, use a process supervisor (e.g. systemd) and keep the Codespace or host running. No unattended operation is possible while the environment is stopped.

**Security and limitations:** This first stage is autonomous task processing and analysis, not unrestricted code execution. It does not yet provide repository edits, MCP tools, direct messaging between agents, GitHub pull requests, notifications, or live dashboard integration. Those require separate scoped adapters, authentication, permission checks, and tests. Never grant broad GitHub tokens or host root permissions to model output. Existing UI and chat behavior are unchanged.

The original package metadata still references the former repository; update the GitHub origin and CI/deployment settings after reviewing this branch. This document sets the project convention, not external AI Studio or GitHub account defaults.
