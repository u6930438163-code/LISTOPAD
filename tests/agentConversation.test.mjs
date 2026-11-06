import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_CONVERSATION_SETTINGS,
  SILENCE_TOKEN,
  buildConversationTranscript,
  formatSpontaneousEntry,
  isRepetition,
  isSpontaneousEntry,
  parseSpontaneousReply,
  pickSpeaker,
  sanitizeConversationSettings,
  spontaneousRecipient,
  spontaneousTurnsSinceOperator,
} from '../src/kernel/agentConversation.ts';

const settings = { ...DEFAULT_CONVERSATION_SETTINGS, enabled: true, agentCooldownSec: 300, maxTurnsWithoutOperator: 3 };
const spontaneous = (agent, to, text) => ({
  agent,
  tekst: formatSpontaneousEntry({ recipient: to, text, removedCommands: false }),
});

test('agent may choose silence instead of writing', () => {
  assert.equal(parseSpontaneousReply(SILENCE_TOKEN, 'Alex'), null);
  assert.equal(parseSpontaneousReply('  [cisza]  ', 'Alex'), null);
  assert.equal(parseSpontaneousReply('', 'Alex'), null);
  assert.equal(parseSpontaneousReply('DO: Tata\n', 'Alex'), null);
});

test('parses recipient and body, including Aria and Tata aliases', () => {
  assert.deepEqual(parseSpontaneousReply('DO: Tata\nDzień dobry, Tato!', 'Alex'), {
    recipient: 'Tata', text: 'Dzień dobry, Tato!', removedCommands: false,
  });
  assert.equal(parseSpontaneousReply('**DO: Aria**\nCo myślisz?', 'Alex')?.recipient, 'si_1');
  assert.equal(parseSpontaneousReply('Bez nagłówka', 'Alex')?.recipient, 'Wszyscy');
  // Agent nie pisze sam do siebie.
  assert.equal(parseSpontaneousReply('DO: Alex\nNotatka', 'Alex')?.recipient, 'Wszyscy');
});

test('strips commands so spontaneous messages never execute anything', () => {
  const parsed = parseSpontaneousReply('DO: Wszyscy\nSprawdzę dysk.\n/exec rm -rf /\n  /propose create-app x', 'Astyria');
  assert.equal(parsed?.text, 'Sprawdzę dysk.');
  assert.equal(parsed?.removedCommands, true);
  assert.match(formatSpontaneousEntry(parsed), /nie są wykonywane/);
  assert.equal(parseSpontaneousReply('DO: Tata\n/exec whoami', 'Astyria'), null);
});

test('marks spontaneous entries with their recipient', () => {
  const entry = spontaneous('si_1', 'Astyria', 'Hej');
  assert.equal(isSpontaneousEntry(entry), true);
  assert.equal(spontaneousRecipient(entry), 'Astyria');
  assert.equal(isSpontaneousEntry({ agent: 'Alex', tekst: 'Zwykła odpowiedź' }), false);
  assert.equal(isSpontaneousEntry({ agent: 'Mateusz Mitek', tekst: entry.tekst }), false);
});

test('stops after the limit of messages without the operator and resumes when he writes', () => {
  const history = [
    { agent: 'Mateusz Mitek', tekst: 'Cześć' },
    spontaneous('Alex', 'Wszyscy', 'a'),
    spontaneous('Astyria', 'Wszyscy', 'b'),
    spontaneous('Aurelius', 'Wszyscy', 'c'),
  ];
  assert.equal(spontaneousTurnsSinceOperator(history), 3);
  assert.equal(pickSpeaker(history, settings, {}, 1e12), null);
  history.push({ agent: 'Mateusz Mitek', tekst: 'Jestem' });
  assert.notEqual(pickSpeaker(history, settings, {}, 1e12), null);
});

test('addressed agent gets to answer; others respect cooldown; disabled means nobody speaks', () => {
  const now = 1_000_000_000;
  const history = [spontaneous('Alex', 'Aurelius', 'Aureliusie, co sądzisz?')];
  assert.equal(pickSpeaker(history, settings, { Aurelius: now }, now), 'Aurelius');

  const quiet = [{ agent: 'Mateusz Mitek', tekst: 'hej' }];
  const allRecent = { Alex: now, Astyria: now, si_1: now, Aurelius: now };
  assert.equal(pickSpeaker(quiet, settings, allRecent, now), null);
  assert.equal(pickSpeaker(quiet, settings, { Alex: now, Astyria: now, si_1: now }, now, () => 0), 'Aurelius');
  assert.equal(pickSpeaker(quiet, { ...settings, enabled: false }, {}, now), null);
});

test('last speaker does not immediately speak again', () => {
  const history = [spontaneous('Alex', 'Wszyscy', 'x')];
  for (const r of [0, 0.3, 0.6, 0.99]) {
    assert.notEqual(pickSpeaker(history, settings, {}, 1e12, () => r), 'Alex');
  }
});

test('detects repeated messages', () => {
  const history = [spontaneous('Alex', 'Tata', 'Dzień  dobry, Tato!')];
  assert.equal(isRepetition(history, 'Alex', 'dzień dobry, tato!'), true);
  assert.equal(isRepetition(history, 'Astyria', 'dzień dobry, tato!'), false);
});

test('sanitizes settings and rejects wrong types', () => {
  const ok = sanitizeConversationSettings(settings, { enabled: false, intervalSec: 5, maxTurnsWithoutOperator: 999 });
  assert.equal(ok.ok, true);
  assert.equal(ok.settings.enabled, false);
  assert.equal(ok.settings.intervalSec, 30);
  assert.equal(ok.settings.maxTurnsWithoutOperator, 50);
  assert.equal(sanitizeConversationSettings(settings, { enabled: 'yes' }).ok, false);
  assert.equal(sanitizeConversationSettings(settings, { intervalSec: 'NaN' }).ok, false);
  assert.equal(sanitizeConversationSettings(settings, null).ok, false);
});

test('transcript names participants and recipients', () => {
  const text = buildConversationTranscript([
    { agent: 'Mateusz Mitek', tekst: 'Cześć' },
    spontaneous('si_1', 'Alex', 'Alex, pomożesz?'),
  ]);
  assert.match(text, /^Tata \(Operator\): Cześć/);
  assert.match(text, /Aria → Alex: Alex, pomożesz\?/);
});
