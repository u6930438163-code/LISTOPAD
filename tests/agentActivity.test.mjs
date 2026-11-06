import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTIVITY_LIMITS, ActivityHub, formatDuration } from '../src/kernel/agentActivity.ts';
import { stripPartialThinking } from '../src/kernel/llmChain.ts';

const makeHub = () => {
  let now = 1000;
  const hub = new ActivityHub({ now: () => now, partialThrottleMs: 10 });
  return { hub, advance: (ms) => { now += ms; } };
};

test('records steps, updates them by key and finishes the run', () => {
  const { hub, advance } = makeHub();
  const events = [];
  hub.subscribe((run) => events.push(run));
  const run = hub.startRun('chat', 'Wiadomość od Taty do Triady');
  run.step('agent-Alex', { title: 'Alex myśli…', agent: 'Alex' });
  advance(1500);
  run.step('agent-Alex', { title: 'Alex odpowiedział(a)', status: 'done', detail: 'ollama:gemma3' });
  run.finish('done');

  const [snapshot] = hub.list();
  assert.equal(snapshot.status, 'done');
  assert.equal(snapshot.steps.length, 1);
  assert.equal(snapshot.steps[0].title, 'Alex odpowiedział(a)');
  assert.equal(snapshot.steps[0].endedAt - snapshot.steps[0].startedAt, 1500);
  assert.equal(run.finished, true);
  assert.ok(events.length >= 4);
  // Odbiorcy dostają kopie, nie wewnętrzny stan.
  events[0].title = 'zmienione';
  assert.equal(hub.list()[0].title, 'Wiadomość od Taty do Triady');
});

test('finishing closes steps still running and clears live text', () => {
  const { hub } = makeHub();
  const run = hub.startRun('chat', 'x');
  run.step('a', { title: 'trwa' });
  run.partial('Alex', 'Częściowa odpowiedź');
  run.finish('error', 'Model nie odpowiedział');
  const [snapshot] = hub.list();
  assert.equal(snapshot.steps[0].status, 'error');
  assert.deepEqual(snapshot.partials, {});
  assert.equal(snapshot.detail, 'Model nie odpowiedział');
  // Drugie zakończenie nie nadpisuje pierwszego.
  run.finish('done');
  assert.equal(hub.list()[0].status, 'error');
});

test('throttles live text updates', async () => {
  const { hub } = makeHub();
  const run = hub.startRun('chat', 'x');
  const events = [];
  hub.subscribe((snapshot) => events.push(snapshot));
  for (let index = 0; index < 50; index += 1) run.partial('Alex', 'a'.repeat(index + 1));
  assert.equal(events.length, 0);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(events.length, 1);
  assert.equal(events[0].partials.Alex.length, 50);
});

test('keeps a bounded number of runs and clips long outputs', () => {
  const { hub } = makeHub();
  for (let index = 0; index < ACTIVITY_LIMITS.runs + 5; index += 1) hub.startRun('chat', `run ${index}`);
  const runs = hub.list();
  assert.equal(runs.length, ACTIVITY_LIMITS.runs);
  assert.equal(runs[0].title, 'run 5');
  const run = hub.startRun('chat', 'long');
  run.step('cmd', { command: 'ls', output: 'x'.repeat(ACTIVITY_LIMITS.output + 100), status: 'done' });
  const output = hub.list().at(-1).steps[0].output;
  assert.ok(output.length <= ACTIVITY_LIMITS.output + 1);
});

test('a failing listener does not break others', () => {
  const { hub } = makeHub();
  let received = 0;
  hub.subscribe(() => { throw new Error('closed'); });
  hub.subscribe(() => { received += 1; });
  hub.startRun('conversation', 'x');
  assert.equal(received, 1);
});

test('hides unfinished thinking blocks in live text', () => {
  assert.equal(stripPartialThinking('<think>planuję</think>Cześć'), 'Cześć');
  assert.equal(stripPartialThinking('Cześć <think>jeszcze myśl'), 'Cześć');
  assert.equal(stripPartialThinking('<think>tylko myśl'), '');
});

test('formats durations in Polish units', () => {
  assert.equal(formatDuration(250), '250 ms');
  assert.equal(formatDuration(3200), '3.2 s');
  assert.equal(formatDuration(42_000), '42 s');
  assert.equal(formatDuration(125_000), '2 min 5 s');
});
