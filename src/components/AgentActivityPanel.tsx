import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, CircleAlert, Info, Loader2, TerminalSquare } from 'lucide-react';
import type { ActivityRun, ActivityStatus, ActivityStep } from '../kernel/agentActivity';
import { formatDuration } from '../kernel/agentActivity';

const agentLabel = (agent?: string) => (agent === 'si_1' ? 'Aria' : agent);

const StatusIcon: React.FC<{ status: ActivityStatus; className?: string }> = ({ status, className = 'h-3.5 w-3.5' }) => {
  if (status === 'running') return <Loader2 className={`${className} animate-spin text-cyan-300`} aria-label="w toku" />;
  if (status === 'done') return <CheckCircle2 className={`${className} text-emerald-400`} aria-label="zakończono" />;
  if (status === 'error') return <CircleAlert className={`${className} text-rose-400`} aria-label="błąd" />;
  return <Info className={`${className} text-slate-400`} aria-label="informacja" />;
};

/** Odświeża komponent co sekundę, gdy coś trwa — żeby liczniki czasu szły na żywo. */
function useTicker(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [active]);
}

const StepRow: React.FC<{ step: ActivityStep; partial?: string }> = ({ step, partial }) => {
  const [showOutput, setShowOutput] = useState(false);
  const duration = step.endedAt !== undefined
    ? formatDuration(step.endedAt - step.startedAt)
    : step.status === 'running' ? formatDuration(Date.now() - step.startedAt) : null;
  return (
    <li className="relative pl-6">
      <span className="absolute left-0 top-0.5"><StatusIcon status={step.status} /></span>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className={`text-[12px] ${step.status === 'error' ? 'text-rose-200' : 'text-slate-200'}`}>{step.title}</span>
        {step.detail && <span className="min-w-0 break-words text-[10px] text-slate-500">{step.detail}</span>}
        {duration && step.status !== 'info' && <span className="ml-auto font-mono text-[10px] text-slate-600">{duration}</span>}
      </div>
      {step.command && (
        <div className="mt-1 overflow-hidden rounded-md border border-slate-800 bg-black/60 font-mono text-[11px]">
          <button
            type="button"
            onClick={() => setShowOutput((value) => !value)}
            disabled={!step.output}
            aria-expanded={showOutput}
            className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-emerald-300 disabled:cursor-default"
          >
            <TerminalSquare className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">$ {step.command}</span>
            {step.output && (showOutput ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />)}
          </button>
          {showOutput && step.output && (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words border-t border-slate-800 px-2 py-1.5 text-slate-300">{step.output}</pre>
          )}
        </div>
      )}
      {partial && (
        <div className="mt-1 max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-cyan-900/60 bg-slate-950/70 px-2.5 py-1.5 text-[12px] leading-relaxed text-slate-300">
          {partial}
          <span className="ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 animate-pulse bg-cyan-400" aria-hidden="true" />
        </div>
      )}
    </li>
  );
};

const RunCard: React.FC<{ run: ActivityRun; defaultOpen: boolean }> = ({ run, defaultOpen }) => {
  const [open, setOpen] = useState(defaultOpen);
  const running = run.status === 'running';
  useEffect(() => {
    if (running) setOpen(true);
  }, [running]);
  const elapsed = formatDuration((run.endedAt ?? Date.now()) - run.startedAt);
  const commands = run.steps.filter((step) => step.command).length;
  const summary = running
    ? 'Pracuje…'
    : `${run.status === 'error' ? 'Błąd' : 'Gotowe'} · ${run.steps.length} ${run.steps.length === 1 ? 'krok' : 'kroków'}${commands ? ` · ${commands} ${commands === 1 ? 'polecenie' : 'poleceń'}` : ''} · ${elapsed}`;

  // Tekst na żywo pokazujemy pod krokiem agenta, który właśnie pisze.
  const partialFor = (step: ActivityStep) => {
    if (!step.agent || step.status !== 'running') return undefined;
    const isWritingStep = step.key === `agent-${step.agent}` || step.key === 'think';
    return isWritingStep ? run.partials[step.agent] : undefined;
  };

  return (
    <div className={`rounded-xl border ${run.status === 'error' ? 'border-rose-900/70' : running ? 'border-cyan-800/70' : 'border-slate-800'} bg-slate-900/70`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <StatusIcon status={run.status} className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-semibold text-slate-100">{run.title}</span>
          <span className="block text-[10px] text-slate-500">{summary}</span>
        </span>
        {open ? <ChevronDown className="h-3.5 w-3.5 text-slate-500" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-500" />}
      </button>
      {open && (
        <div className="border-t border-slate-800/80 px-3 py-2">
          <ol className="space-y-2">
            {run.steps.map((step) => <StepRow key={step.key} step={step} partial={partialFor(step)} />)}
          </ol>
          {run.status === 'error' && run.detail && (
            <p className="mt-2 break-words text-[11px] text-rose-300">{run.detail}</p>
          )}
        </div>
      )}
    </div>
  );
};

interface AgentActivityPanelProps {
  /** Wywoływane przy każdej zmianie — np. aby przewinąć czat do najnowszej treści. */
  onActivity?: () => void;
}

/**
 * Panel „co robią agenci” w stylu Copilota: na żywo pokazuje kroki pracy agentów,
 * wykonywane polecenia z wynikami i odpowiedź powstającą w trakcie pisania.
 */
export const AgentActivityPanel: React.FC<AgentActivityPanelProps> = ({ onActivity }) => {
  const [runs, setRuns] = useState<ActivityRun[]>([]);
  const [connected, setConnected] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/agents/activity/stream');
    source.addEventListener('open', () => setConnected(true));
    source.addEventListener('error', () => setConnected(false));
    source.addEventListener('snapshot', (event) => {
      try {
        setRuns(JSON.parse((event as MessageEvent).data).runs ?? []);
      } catch { /* pomiń uszkodzoną wiadomość */ }
    });
    source.addEventListener('run', (event) => {
      try {
        const run: ActivityRun = JSON.parse((event as MessageEvent).data);
        setRuns((current) => {
          const index = current.findIndex((item) => item.id === run.id);
          if (index === -1) return [...current, run].slice(-30);
          const next = current.slice();
          next[index] = run;
          return next;
        });
      } catch { /* pomiń uszkodzoną wiadomość */ }
    });
    return () => source.close();
  }, []);

  useEffect(() => {
    onActivity?.();
  }, [runs, onActivity]);

  const active = useMemo(() => runs.filter((run) => run.status === 'running'), [runs]);
  const finished = useMemo(() => runs.filter((run) => run.status !== 'running'), [runs]);
  useTicker(active.length > 0);

  const latestFinished = finished[finished.length - 1];
  // Ostatni zakończony przebieg widać jeszcze przez 2 minuty (zwinięty), starsze — w dzienniku.
  const showLatest = latestFinished && active.length === 0 && Date.now() - (latestFinished.endedAt ?? 0) < 120_000;
  const history = finished.slice().reverse().slice(showLatest ? 1 : 0, 15);

  if (runs.length === 0 && connected) return null;

  return (
    <section aria-label="Praca agentów na żywo" aria-live="polite" className="space-y-2">
      {active.map((run) => <RunCard key={run.id} run={run} defaultOpen />)}
      {showLatest && <RunCard key={latestFinished.id} run={latestFinished} defaultOpen={false} />}
      {history.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowHistory((value) => !value)}
            aria-expanded={showHistory}
            className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-slate-500 hover:text-slate-300"
          >
            {showHistory ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Dziennik pracy agentów ({history.length})
          </button>
          {showHistory && (
            <div className="mt-2 space-y-2">
              {history.map((run) => <RunCard key={run.id} run={run} defaultOpen={false} />)}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
