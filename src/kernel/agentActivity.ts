/**
 * Dziennik aktywności agentów na żywo (podobnie jak panel pracy w Copilocie):
 * każde zadanie to „przebieg” (run) z listą kroków — myślenie modelu, próby dostawców,
 * wykonywane polecenia, zapis do historii — oraz tekstem odpowiedzi powstającym na żywo.
 */

export type ActivityStatus = 'running' | 'done' | 'error' | 'info';
export type ActivityRunKind = 'chat' | 'conversation';

export interface ActivityStep {
  key: string;
  title: string;
  status: ActivityStatus;
  agent?: string;
  detail?: string;
  /** Polecenie (np. `/exec ls`) i jego wynik — wyświetlane jak w terminalu. */
  command?: string;
  output?: string;
  startedAt: number;
  endedAt?: number;
}

export interface ActivityRun {
  id: string;
  kind: ActivityRunKind;
  title: string;
  status: ActivityStatus;
  startedAt: number;
  endedAt?: number;
  detail?: string;
  steps: ActivityStep[];
  /** Tekst odpowiedzi poszczególnych agentów w trakcie pisania. */
  partials: Record<string, string>;
}

export const ACTIVITY_LIMITS = {
  runs: 30,
  stepsPerRun: 80,
  detail: 600,
  output: 4000,
  partial: 20_000,
} as const;

const clip = (value: string | undefined, max: number) =>
  value === undefined ? undefined : value.length > max ? `${value.slice(0, max)}…` : value;

export interface ActivityStepInput {
  title?: string;
  status?: ActivityStatus;
  agent?: string;
  detail?: string;
  command?: string;
  output?: string;
}

export class ActivityRunHandle {
  private readonly hub: ActivityHub;
  readonly id: string;

  constructor(hub: ActivityHub, id: string) {
    this.hub = hub;
    this.id = id;
  }

  /** Tworzy krok o danym kluczu albo aktualizuje istniejący. */
  step(key: string, input: ActivityStepInput): void {
    this.hub.updateRun(this.id, (run, now) => {
      const existing = run.steps.find((step) => step.key === key);
      const status = input.status ?? existing?.status ?? 'running';
      const finished = status === 'done' || status === 'error' || status === 'info';
      if (existing) {
        if (input.title !== undefined) existing.title = input.title;
        if (input.agent !== undefined) existing.agent = input.agent;
        if (input.detail !== undefined) existing.detail = clip(input.detail, ACTIVITY_LIMITS.detail);
        if (input.command !== undefined) existing.command = clip(input.command, ACTIVITY_LIMITS.detail);
        if (input.output !== undefined) existing.output = clip(input.output, ACTIVITY_LIMITS.output);
        existing.status = status;
        if (finished && existing.endedAt === undefined) existing.endedAt = now;
        return;
      }
      if (run.steps.length >= ACTIVITY_LIMITS.stepsPerRun) return;
      run.steps.push({
        key,
        title: input.title ?? key,
        status,
        agent: input.agent,
        detail: clip(input.detail, ACTIVITY_LIMITS.detail),
        command: clip(input.command, ACTIVITY_LIMITS.detail),
        output: clip(input.output, ACTIVITY_LIMITS.output),
        startedAt: now,
        endedAt: finished ? now : undefined,
      });
    });
  }

  /** Aktualny tekst odpowiedzi agenta w trakcie pisania (rozsyłany z ograniczoną częstotliwością). */
  partial(agent: string, text: string): void {
    this.hub.updateRun(this.id, (run) => {
      run.partials[agent] = clip(text, ACTIVITY_LIMITS.partial) ?? '';
    }, true);
  }

  finish(status: 'done' | 'error', detail?: string): void {
    this.hub.updateRun(this.id, (run, now) => {
      if (run.endedAt !== undefined) return;
      run.status = status;
      run.endedAt = now;
      if (detail !== undefined) run.detail = clip(detail, ACTIVITY_LIMITS.detail);
      run.partials = {};
      // Kroki, które nie zdążyły się zakończyć, zamykamy razem z przebiegiem.
      for (const step of run.steps) {
        if (step.status === 'running') {
          step.status = status === 'error' ? 'error' : 'info';
          step.endedAt = now;
        }
      }
    });
  }

  get finished(): boolean {
    return this.hub.get(this.id)?.endedAt !== undefined;
  }
}

export type ActivityListener = (run: ActivityRun) => void;

export interface ActivityHubOptions {
  now?: () => number;
  /** Minimalny odstęp (ms) między rozsyłaniem aktualizacji tekstu na żywo. */
  partialThrottleMs?: number;
  newId?: () => string;
}

export class ActivityHub {
  private readonly runs: ActivityRun[] = [];
  private readonly listeners = new Set<ActivityListener>();
  private readonly pendingPartial = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly now: () => number;
  private readonly partialThrottleMs: number;
  private readonly newId: () => string;
  private counter = 0;

  constructor(options: ActivityHubOptions = {}) {
    this.now = options.now ?? Date.now;
    this.partialThrottleMs = options.partialThrottleMs ?? 200;
    this.newId = options.newId ?? (() => `run-${this.now().toString(36)}-${(this.counter += 1).toString(36)}`);
  }

  startRun(kind: ActivityRunKind, title: string): ActivityRunHandle {
    const run: ActivityRun = {
      id: this.newId(),
      kind,
      title: clip(title, ACTIVITY_LIMITS.detail) ?? '',
      status: 'running',
      startedAt: this.now(),
      steps: [],
      partials: {},
    };
    this.runs.push(run);
    if (this.runs.length > ACTIVITY_LIMITS.runs) this.runs.splice(0, this.runs.length - ACTIVITY_LIMITS.runs);
    this.emit(run);
    return new ActivityRunHandle(this, run.id);
  }

  get(id: string): ActivityRun | undefined {
    return this.runs.find((run) => run.id === id);
  }

  /** Kopie przebiegów, od najstarszego do najnowszego. */
  list(): ActivityRun[] {
    return this.runs.map((run) => structuredClone(run));
  }

  subscribe(listener: ActivityListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** @internal Używane przez ActivityRunHandle. */
  updateRun(id: string, mutate: (run: ActivityRun, now: number) => void, throttled = false): void {
    const run = this.get(id);
    if (!run) return;
    if (throttled && run.endedAt !== undefined) return;
    mutate(run, this.now());
    if (!throttled) {
      const timer = this.pendingPartial.get(id);
      if (timer) {
        clearTimeout(timer);
        this.pendingPartial.delete(id);
      }
      this.emit(run);
      return;
    }
    if (this.pendingPartial.has(id)) return;
    this.pendingPartial.set(id, setTimeout(() => {
      this.pendingPartial.delete(id);
      const current = this.get(id);
      if (current) this.emit(current);
    }, this.partialThrottleMs));
  }

  private emit(run: ActivityRun): void {
    if (this.listeners.size === 0) return;
    const snapshot = structuredClone(run);
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        // Błąd jednego odbiorcy (np. zamknięte połączenie) nie może zatrzymać pozostałych.
      }
    }
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${Math.round(seconds % 60)} s`;
}
