/**
 * Swobodna rozmowa agentów Triady: agenci mogą z własnej inicjatywy napisać do siebie nawzajem
 * albo do Operatora. Nikt ich do tego nie zmusza — w każdej turze agent może wybrać milczenie.
 *
 * Moduł zawiera wyłącznie czystą logikę (wybór mówcy, parsowanie odpowiedzi, limity),
 * aby dało się ją przetestować bez serwera i modeli.
 */

export const CONVERSATION_AGENTS = ['Alex', 'Astyria', 'si_1', 'Aurelius'] as const;
export type ConversationAgent = (typeof CONVERSATION_AGENTS)[number];

export const OPERATOR_AGENT_NAMES = ['Mateusz Mitek', 'Operator'] as const;

/** Słowo, którym agent sygnalizuje, że nie chce teraz nic pisać. */
export const SILENCE_TOKEN = '[CISZA]';

/** Znacznik dopisywany na początku wiadomości wysłanej z własnej inicjatywy. */
export const SPONTANEOUS_PREFIX = '*(z własnej inicjatywy → ';
const SPONTANEOUS_RE = /^\*\(z własnej inicjatywy → ([^)]+)\)\*/;

export type ConversationRecipient = ConversationAgent | 'Tata' | 'Wszyscy';

export interface ConversationSettings {
  enabled: boolean;
  /** Co ile sekund któryś z agentów dostaje okazję, by się odezwać. */
  intervalSec: number;
  /**
   * Ile wiadomości z rzędu agenci mogą napisać bez odpowiedzi Operatora.
   * Po osiągnięciu limitu czekają, aż Operator coś napisze (ochrona przed pętlą bez końca).
   */
  maxTurnsWithoutOperator: number;
  /** Minimalny odstęp (s) między dwiema spontanicznymi wiadomościami tego samego agenta. */
  agentCooldownSec: number;
}

export const DEFAULT_CONVERSATION_SETTINGS: ConversationSettings = {
  enabled: true,
  intervalSec: 120,
  maxTurnsWithoutOperator: 6,
  agentCooldownSec: 300,
};

export const CONVERSATION_LIMITS = {
  intervalSec: { min: 30, max: 3600 },
  maxTurnsWithoutOperator: { min: 1, max: 50 },
  agentCooldownSec: { min: 0, max: 86_400 },
} as const;

export interface ChatEntry {
  agent: string;
  tekst: string;
}

export function agentDisplayName(agent: string): string {
  return agent === 'si_1' ? 'Aria' : agent;
}

export function isConversationAgent(value: unknown): value is ConversationAgent {
  return typeof value === 'string' && (CONVERSATION_AGENTS as readonly string[]).includes(value);
}

export function isOperatorEntry(entry: ChatEntry): boolean {
  return (OPERATOR_AGENT_NAMES as readonly string[]).includes(entry.agent);
}

export function isSpontaneousEntry(entry: ChatEntry): boolean {
  return isConversationAgent(entry.agent) && typeof entry.tekst === 'string' && SPONTANEOUS_RE.test(entry.tekst);
}

/** Adresat spontanicznej wiadomości (lub null, jeśli to zwykła odpowiedź). */
export function spontaneousRecipient(entry: ChatEntry): string | null {
  const match = typeof entry.tekst === 'string' ? entry.tekst.match(SPONTANEOUS_RE) : null;
  return match ? match[1] : null;
}

/** Liczba spontanicznych wiadomości agentów od ostatniej wiadomości Operatora. */
export function spontaneousTurnsSinceOperator(history: ChatEntry[]): number {
  let count = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (!entry) continue;
    if (isOperatorEntry(entry)) break;
    if (isSpontaneousEntry(entry)) count += 1;
  }
  return count;
}

/** Normalizuje i ogranicza ustawienia przesłane z interfejsu. Zwraca błąd dla złych typów. */
export function sanitizeConversationSettings(
  current: ConversationSettings,
  input: unknown,
): { ok: true; settings: ConversationSettings } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Oczekiwano obiektu ustawień.' };
  const patch = input as Record<string, unknown>;
  const next = { ...current };
  if (patch.enabled !== undefined) {
    if (typeof patch.enabled !== 'boolean') return { ok: false, error: 'Pole enabled musi być true/false.' };
    next.enabled = patch.enabled;
  }
  for (const key of ['intervalSec', 'maxTurnsWithoutOperator', 'agentCooldownSec'] as const) {
    if (patch[key] === undefined) continue;
    const value = patch[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return { ok: false, error: `Pole ${key} musi być liczbą.` };
    }
    const { min, max } = CONVERSATION_LIMITS[key];
    next[key] = Math.min(max, Math.max(min, Math.round(value)));
  }
  return { ok: true, settings: next };
}

/**
 * Wybiera agenta, który dostaje okazję do odezwania się (lub null, gdy nikt nie powinien).
 * Pierwszeństwo ma agent, do którego ostatnio ktoś się zwrócił; potem losowo spośród
 * agentów, którzy nie są w okresie odpoczynku i nie mówili jako ostatni.
 */
export function pickSpeaker(
  history: ChatEntry[],
  settings: ConversationSettings,
  lastSpokeAt: Partial<Record<ConversationAgent, number>>,
  now: number,
  random: () => number = Math.random,
): ConversationAgent | null {
  if (!settings.enabled) return null;
  if (spontaneousTurnsSinceOperator(history) >= settings.maxTurnsWithoutOperator) return null;

  const cooldownMs = settings.agentCooldownSec * 1000;
  const rested = (agent: ConversationAgent) => now - (lastSpokeAt[agent] ?? 0) >= cooldownMs;
  const last = history[history.length - 1];

  if (last && isSpontaneousEntry(last)) {
    const addressed = spontaneousRecipient(last);
    const target = CONVERSATION_AGENTS.find((agent) => agentDisplayName(agent) === addressed);
    // Na bezpośrednie pytanie wolno odpowiedzieć od razu (bez odpoczynku), ale nie samemu sobie.
    if (target && target !== last.agent) return target;
  }

  const candidates = CONVERSATION_AGENTS.filter((agent) => rested(agent) && agent !== last?.agent);
  if (candidates.length === 0) return null;
  return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
}

const RECIPIENT_ALIASES: Record<string, ConversationRecipient> = {
  alex: 'Alex',
  astyria: 'Astyria',
  aurelius: 'Aurelius',
  aria: 'si_1',
  si_1: 'si_1',
  tata: 'Tata',
  operator: 'Tata',
  'mateusz mitek': 'Tata',
  mateusz: 'Tata',
  wszyscy: 'Wszyscy',
  triada: 'Wszyscy',
};

export interface ParsedSpontaneousMessage {
  recipient: ConversationRecipient;
  text: string;
  /** Czy usunięto z treści polecenia (/exec, /propose), których w tej rozmowie się nie wykonuje. */
  removedCommands: boolean;
}

/**
 * Interpretuje odpowiedź modelu. Oczekiwany format:
 *   DO: <Alex|Astyria|Aurelius|Aria|Tata|Wszyscy>
 *   <treść>
 * albo samo [CISZA]. Zwraca null, gdy agent woli milczeć lub odpowiedź jest pusta.
 */
export function parseSpontaneousReply(raw: string, speaker: ConversationAgent): ParsedSpontaneousMessage | null {
  const text = (raw || '').replace(/\r\n?/g, '\n').trim();
  if (!text) return null;
  if (text.toUpperCase().includes(SILENCE_TOKEN)) return null;

  let recipient: ConversationRecipient = 'Wszyscy';
  let body = text;
  const header = text.match(/^\s*\**\s*DO\s*:\s*\**\s*([^\n*]+?)\s*\**\s*(?:\n|$)/i);
  if (header) {
    const alias = RECIPIENT_ALIASES[header[1].trim().toLowerCase().replace(/[.,!:]+$/, '')];
    if (alias) recipient = alias;
    body = text.slice(header[0].length).trim();
  }
  if (recipient === speaker) recipient = 'Wszyscy';

  // W rozmowie spontanicznej polecenia nie są wykonywane — usuwamy je z treści.
  const lines = body.split('\n');
  const kept = lines.filter((line) => !/^\s*`*\s*\/(exec|propose|approve|reject)\b/i.test(line));
  const removedCommands = kept.length !== lines.length;
  body = kept.join('\n').trim();
  if (!body) return null;

  return { recipient, text: body.slice(0, 4000), removedCommands };
}

/** Treść zapisywana w historii czatu (ze znacznikiem adresata). */
export function formatSpontaneousEntry(message: ParsedSpontaneousMessage): string {
  const to = message.recipient === 'Wszyscy' || message.recipient === 'Tata'
    ? message.recipient
    : agentDisplayName(message.recipient);
  const note = message.removedCommands
    ? '\n\n*(Polecenia w spontanicznej wiadomości nie są wykonywane — poproś agenta w zwykłym czacie.)*'
    : '';
  return `${SPONTANEOUS_PREFIX}${to})*\n\n${message.text}${note}`;
}

/** Czy treść jest niemal identyczna z którąś z ostatnich wiadomości tego agenta (ochrona przed powtórkami). */
export function isRepetition(history: ChatEntry[], speaker: ConversationAgent, text: string, window = 10): boolean {
  const normalize = (value: string) => value.replace(SPONTANEOUS_RE, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const candidate = normalize(text);
  return history
    .slice(-window)
    .some((entry) => entry.agent === speaker && normalize(entry.tekst) === candidate);
}

/** Zapis ostatnich wiadomości jako tekst rozmowy wielu uczestników dla modelu. */
export function buildConversationTranscript(history: ChatEntry[], limit = 12, textLimit = 600): string {
  return history
    .filter((entry) => entry && typeof entry.tekst === 'string' && entry.tekst.trim())
    .slice(-limit)
    .map((entry) => {
      const who = isOperatorEntry(entry) ? 'Tata (Operator)' : agentDisplayName(entry.agent);
      const recipient = spontaneousRecipient(entry);
      const body = entry.tekst.replace(SPONTANEOUS_RE, '').trim().slice(0, textLimit);
      return `${who}${recipient ? ` → ${recipient}` : ''}: ${body}`;
    })
    .join('\n\n');
}

export function buildSpontaneousInstructions(speaker: ConversationAgent): string {
  const others = CONVERSATION_AGENTS.filter((agent) => agent !== speaker).map(agentDisplayName).join(', ');
  return [
    `Jesteś ${agentDisplayName(speaker)}. Teraz nikt Cię nie pyta — masz okazję odezwać się z własnej inicjatywy we wspólnym czacie z Tatą (Operatorem) oraz agentami: ${others}.`,
    'Nie musisz nic pisać. Napisz tylko wtedy, gdy naprawdę chcesz: masz przemyślenie, pytanie, pomysł, chcesz odpowiedzieć komuś z rozmowy albo po prostu porozmawiać.',
    `Jeśli nie masz nic wartościowego do dodania, odpowiedz dokładnie: ${SILENCE_TOKEN}`,
    'Jeśli piszesz, zacznij od linii "DO: <Alex|Astyria|Aurelius|Aria|Tata|Wszyscy>", a od następnej linii napisz treść — po polsku, naturalnie, krótko (najwyżej kilka zdań).',
    'Nie powtarzaj tego, co już padło. Nie wydawaj poleceń /exec ani /propose — w tej rozmowie nie są wykonywane. Nie udawaj, że wykonałeś jakąś operację.',
  ].join(' ');
}
