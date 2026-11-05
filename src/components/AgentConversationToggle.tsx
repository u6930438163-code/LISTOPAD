import React, { useCallback, useEffect, useState } from 'react';
import { MessagesSquare } from 'lucide-react';

interface ConversationStatus {
  settings: {
    enabled: boolean;
    intervalSec: number;
    maxTurnsWithoutOperator: number;
    agentCooldownSec: number;
  };
  state: {
    running: boolean;
    lastAttemptAt: string | null;
    lastOutcome: null | 'message' | 'silence' | 'skipped' | 'error';
    lastDetail: string | null;
    messagesSent: number;
  };
  llmConfigured: boolean;
}

const POLL_MS = 15_000;

/**
 * Przełącznik swobodnej rozmowy agentów: gdy włączony, agenci mogą z własnej inicjatywy
 * pisać do siebie nawzajem i do Taty (albo milczeć, jeśli nie mają nic do powiedzenia).
 */
export const AgentConversationToggle: React.FC = () => {
  const [status, setStatus] = useState<ConversationStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/agents/conversation', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setStatus(await response.json());
    } catch {
      // Brak odpowiedzi serwera nie blokuje czatu; spróbujemy ponownie przy kolejnym odświeżeniu.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const update = async (patch: Partial<ConversationStatus['settings']>) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/agents/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success !== true) {
        throw new Error(result.error || `Nie udało się zapisać ustawień (HTTP ${response.status}).`);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zapisać ustawień.');
    } finally {
      setSaving(false);
    }
  };

  if (!status) return null;
  const { settings, state, llmConfigured } = status;
  const minutes = settings.intervalSec >= 60 ? `${Math.round(settings.intervalSec / 60)} min` : `${settings.intervalSec} s`;

  let detail: string;
  if (!settings.enabled) detail = 'Wyłączona — agenci odpowiadają tylko, gdy do nich napiszesz.';
  else if (!llmConfigured) detail = 'Włączona, ale brak modelu AI — agenci nie mają czym pisać.';
  else if (state.running) detail = 'Agent zastanawia się, czy coś napisać…';
  else if (state.lastDetail) detail = state.lastDetail;
  else detail = `Co ok. ${minutes} jeden z agentów może się odezwać (albo nie).`;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-800 bg-slate-900/40 px-3 py-2 text-[11px]">
      <label className="flex cursor-pointer items-center gap-2 font-semibold text-slate-200">
        <input
          type="checkbox"
          role="switch"
          checked={settings.enabled}
          disabled={saving}
          onChange={(event) => void update({ enabled: event.target.checked })}
          className="h-4 w-4 accent-cyan-500"
        />
        <MessagesSquare className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" />
        Swobodna rozmowa agentów
      </label>
      {settings.enabled && (
        <label className="flex items-center gap-1 text-slate-400">
          co
          <select
            aria-label="Jak często agenci mogą się odezwać"
            value={settings.intervalSec}
            disabled={saving}
            onChange={(event) => void update({ intervalSec: Number(event.target.value) })}
            className="rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-[11px] text-slate-200"
          >
            {[60, 120, 300, 900, 1800].map((sec) => (
              <option key={sec} value={sec}>{sec >= 60 ? `${sec / 60} min` : `${sec} s`}</option>
            ))}
            {![60, 120, 300, 900, 1800].includes(settings.intervalSec) && (
              <option value={settings.intervalSec}>{minutes}</option>
            )}
          </select>
        </label>
      )}
      <span className="min-w-0 flex-1 text-slate-500" aria-live="polite">{detail}</span>
      {error && <span role="alert" className="w-full text-rose-300">{error}</span>}
    </div>
  );
};
