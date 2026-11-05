/** Safe, durable task queue driven by the ORIGINAL AI Studio agent model pipeline.
 *
 * The caller supplies existing generateWithChain and CHAT_AGENT_MISSIONS from
 * server.ts; this module NEVER creates model personas, runs shell commands,
 * writes to GitHub, purchases resources, merges PRs or grants admin rights.
 * Worker execution requires an actual provider response to be persisted.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const ORIGINAL_AGENTS = Object.freeze(['Alex', 'Aria', 'Astyria', 'Aurelius']);
export const SOURCE_REPOSITORY = 'u6930438163-code/AI_Studio_BastillaOS';
export const TARGET_REPOSITORY = 'u6930438163-code/Debian_13_Trixie';
export const TASK_CAPABILITY = 'debian13_review_task_v1';
export const MESSAGE_CAPABILITY = 'debian13_agent_message_v1';
const MAX_JOBS = 300;
const MAX_ATTEMPTS = 3;
const MAX_BODY = 4000;
const MAX_RESULT = 16000;
const AGENT_IDS = new Set(ORIGINAL_AGENTS);
const STATES = new Set(['queued', 'running', 'completed', 'failed']);
const SAFE_KINDS = new Set(['development', 'bugfix', 'audit', 'research']);
const SAFE_ID = /^[a-zA-Z0-9_-]{1,128}$/;

class JobError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
export { JobError };

function nonEmpty(text, max, code) {
  if (typeof text !== 'string' || !text.trim() || text.length > max) throw new JobError(code);
  return text.trim();
}

function cleanData(pathName) {
  try {
    const parsed = JSON.parse(fs.readFileSync(pathName, 'utf8'));
    if (!Array.isArray(parsed)) throw Error('invalid');
    return parsed.filter(x => x && SAFE_ID.test(x.id) && AGENT_IDS.has(x.agent)
      && STATES.has(x.status) && x.targetRepository === TARGET_REPOSITORY).slice(-MAX_JOBS);
  } catch (e) {
    if (e?.code === 'ENOENT') return [];
    // Never discard a corrupted queue and silently report an empty success.
    throw new Error('original_worker_queue_invalid');
  }
}

export class OriginalAgentJobService {
  constructor({ file, execute, enabled = false, providerConfigured = false, intervalMs = 5000, now = () => Date.now() }) {
    if (!file || typeof execute !== 'function') throw Error('job_service_invalid_configuration');
    this.file = file;
    this.execute = execute;
    this.enabled = enabled === true;
    this.providerConfigured = providerConfigured === true;
    this.intervalMs = Math.max(1000, intervalMs);
    this.now = now;
    this.jobs = cleanData(this.file);
    this.running = new Map();
    this.lastHeartbeat = new Map();
    this.lastErrors = new Map();
    this.timer = null;
    for (const job of this.jobs) {
      if (job.status === 'running') {
        job.status = job.attempts >= MAX_ATTEMPTS ? 'failed' : 'queued';
        job.errorCode = job.status === 'failed' ? 'interrupted_after_restarts' : undefined;
        job.nextAttemptAt = this.now() + 1000;
      }
    }
    this._save();
  }

  _save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = this.file + '.' + process.pid + '.' + randomUUID() + '.tmp';
    try {
      fs.writeFileSync(temp, JSON.stringify(this.jobs, null, 2), { mode: 0o600, flag: 'wx' });
      fs.renameSync(temp, this.file);
      fs.chmodSync(this.file, 0o600);
    } finally {
      try { fs.unlinkSync(temp); } catch { /* already renamed */ }
    }
  }

  _queue(agent, type, title, description, key = '') {
    if (!AGENT_IDS.has(agent)) throw new JobError('unknown_original_agent');
    if (key && !SAFE_ID.test(key)) throw new JobError('invalid_idempotency_key');
    if (key) {
      const found = this.jobs.find(x => x.key === key);
      if (found) {
        if (found.agent !== agent || found.type !== type ||
            found.title !== title || found.description !== description) {
          throw new JobError('idempotency_key_conflict', 409);
        }
        return found;
      }
    }
    if (!this.enabled || !this.providerConfigured) throw new JobError('original_workers_not_configured', 503);
    if (this.jobs.length >= MAX_JOBS) throw new JobError('queue_full', 429);
    const job = {
      id: randomUUID(), key, agent, type, title, description,
      targetRepository: TARGET_REPOSITORY, status: 'queued',
      attempts: 0, createdAt: new Date(this.now()).toISOString(),
      startedAt: null, finishedAt: null, lastHeartbeatAt: null,
      nextAttemptAt: this.now(), result: null, errorCode: null,
      provider: null, model: null,
    };
    this.jobs.push(job);
    this._save();
    return job;
  }

  submitTask(body, key = '') {
    const agent = body?.agent;
    if (body?.capability !== TASK_CAPABILITY || body?.mode !== 'pull_request_proposal'
      || body?.autoMerge !== false || body?.purchaseAuthorized !== false
      || !body?.task || body.task.targetRepository !== TARGET_REPOSITORY
      || !SAFE_KINDS.has(body.task.kind)) throw new JobError('invalid_review_task_contract');
    const title = nonEmpty(body.task.title, 120, 'invalid_title');
    const description = nonEmpty(body.task.description, 2000, 'invalid_description');
    const job = this._queue(agent, 'task', title, description, key);
    return { accepted: true, agent, capability: TASK_CAPABILITY, taskId: job.id,
      status: job.status, workerExecutionVerified: job.status === 'completed' };
  }

  sendMessage(body, key = '') {
    const agent = body?.agent;
    if (body?.mode !== 'review_only' || body?.autoMerge !== false
      || body?.purchaseAuthorized !== false
      || body?.targetRepository !== TARGET_REPOSITORY) throw new JobError('invalid_message_contract');
    const message = nonEmpty(body.message, 2000, 'invalid_message');
    const job = this._queue(agent, 'message', 'Wiadomość operatora do ' + agent, message, key);
    return { accepted: true, agent, messageId: job.id, status: job.status,
      agentReplyVerified: job.status === 'completed' };
  }

  getJob(id) {
    if (typeof id !== 'string' || !SAFE_ID.test(id)) throw new JobError('invalid_job_id');
    const job = this.jobs.find(x => x.id === id);
    if (!job) throw new JobError('job_not_found', 404);
    const { key, nextAttemptAt, ...rest } = job;
    return { ...rest,
      workerExecutionVerified: rest.status === 'completed' && Boolean(rest.provider) && Boolean(rest.result),
      pullRequestVerified: false,
      note: 'Completed means the original AI Studio model returned a saved review. It does not mean code was changed or a PR was opened.',
    };
  }

  getWorkers() {
    const now = this.now();
    return {
      sourceRepository: SOURCE_REPOSITORY,
      targetRepository: TARGET_REPOSITORY,
      protocolVersion: 1,
      enabled: this.enabled,
      providerConfigured: this.providerConfigured,
      mode: 'model_review_only',
      agents: ORIGINAL_AGENTS.map(agent => {
        const running = this.running.get(agent);
        const heartbeat = this.lastHeartbeat.get(agent);
        return {
          name: agent,
          state: !this.enabled ? 'disabled' : !this.providerConfigured ? 'provider_unavailable'
            : running && heartbeat && now - heartbeat < 30000 ? 'running' : 'idle',
          workerVerified: Boolean(running && heartbeat && now - heartbeat < 30000),
          heartbeatAt: heartbeat ? new Date(heartbeat).toISOString() : null,
          activeTaskId: running?.id || null,
          queued: this.jobs.filter(j => j.agent === agent && j.status === 'queued').length,
          completed: this.jobs.filter(j => j.agent === agent && j.status === 'completed').length,
          failed: this.jobs.filter(j => j.agent === agent && j.status === 'failed').length,
          lastErrorCode: this.lastErrors.get(agent) || null,
        };
      }),
    };
  }

  capabilities() {
    return {
      sourceRepository: SOURCE_REPOSITORY, protocolVersion: 1,
      agents: [...ORIGINAL_AGENTS],
      agent: 'Alex', // Legacy capabilities reader: actual Issue-to-PR NOT advertised.
      capabilities: this.enabled && this.providerConfigured
        ? [TASK_CAPABILITY, MESSAGE_CAPABILITY] : [],
      workerExecutionVerified: false,
      mode: 'model_review_only',
    };
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.tick(); }, this.intervalMs);
    this.timer.unref?.();
    void this.tick();
  }

  async tick() {
    if (!this.enabled || !this.providerConfigured) return;
    const now = this.now();
    for (const agent of ORIGINAL_AGENTS) {
      if (this.running.has(agent)) continue;
      const job = this.jobs.find(x => x.agent === agent && x.status === 'queued' &&
        x.nextAttemptAt <= now);
      if (!job) continue;
      job.status = 'running';
      job.attempts++;
      job.startedAt = new Date(now).toISOString();
      job.lastHeartbeatAt = job.startedAt;
      this.running.set(agent, job);
      this.lastHeartbeat.set(agent, now);
      this._save();
      void this._execute(job);
    }
  }

  async _execute(job) {
    const interval = setInterval(() => {
      if (this.running.get(job.agent) !== job) return;
      const now = this.now();
      this.lastHeartbeat.set(job.agent, now);
      job.lastHeartbeatAt = new Date(now).toISOString();
      this._save();
    }, 10000);
    interval.unref?.();
    try {
      const answer = await this.execute(job.agent, {
        kind: job.type, title: job.title, description: job.description,
        targetRepository: TARGET_REPOSITORY,
      });
      if (!answer || typeof answer.text !== 'string' || !answer.text.trim() ||
        !nonEmpty(answer.provider, 60, 'invalid_model_provider') ||
        !nonEmpty(answer.model, 120, 'invalid_model_name')) {
        throw new Error('empty_real_model_response');
      }
      job.result = answer.text.slice(0, MAX_RESULT);
      job.provider = answer.provider;
      job.model = answer.model;
      job.status = 'completed';
      job.finishedAt = new Date(this.now()).toISOString();
      job.errorCode = null;
    } catch (_e) {
      // Never leak model credentials, response bodies or raw exceptions in task API.
      this.lastErrors.set(job.agent, 'model_request_failed');
      if (job.attempts < MAX_ATTEMPTS) {
        job.status = 'queued';
        job.nextAttemptAt = this.now() + job.attempts * 30000;
        job.errorCode = 'retry_scheduled';
      } else {
        job.status = 'failed';
        job.finishedAt = new Date(this.now()).toISOString();
        job.errorCode = 'model_request_failed';
      }
    } finally {
      clearInterval(interval);
      this.running.delete(job.agent);
      this._save();
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
