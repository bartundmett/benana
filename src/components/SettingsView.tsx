import { useEffect, useState } from 'react';
import { KeyRound, SlidersHorizontal, Wallet } from 'lucide-react';

import type { ModelName, StudioConfigPublic } from '../../shared/types';
import { useStudioConfig, useUsageCost } from '../hooks/useStudioData';
import { useStudioStore } from '../state/useStudioStore';
import { Button, Card, MutedText, PageHeader, StatusText } from '../ui';

export function SettingsView() {
  const { data: fetchedConfig } = useStudioConfig();
  const { data: dayCost = 0 } = useUsageCost('day');
  const { data: monthCost = 0 } = useUsageCost('month');
  const { data: totalCost = 0 } = useUsageCost('all');
  const config = useStudioStore((state) => state.config) ?? fetchedConfig;
  const setConfig = useStudioStore((state) => state.setConfig);
  const monthlyLimit = config?.monthlySpendLimitUsd ?? null;
  const totalLimit = config?.totalSpendLimitUsd ?? null;
  const monthlyUsagePercent = calculateUsagePercent(monthCost, monthlyLimit);
  const totalUsagePercent = calculateUsagePercent(totalCost, totalLimit);
  const monthlyRemaining = monthlyLimit == null ? null : monthlyLimit - monthCost;
  const totalRemaining = totalLimit == null ? null : totalLimit - totalCost;

  const [theme, setTheme] = useState<StudioConfigPublic['theme']>('dark');
  const [defaultModel, setDefaultModel] = useState<ModelName>('gemini-3-pro-image-preview');
  const [queueConcurrency, setQueueConcurrency] = useState(2);
  const [monthlySpendLimitInput, setMonthlySpendLimitInput] = useState('');
  const [totalSpendLimitInput, setTotalSpendLimitInput] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!config) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync editable form state from persisted config
    setTheme(config.theme);
    setDefaultModel(config.defaultModel);
    setQueueConcurrency(config.queueConcurrency);
    setMonthlySpendLimitInput(config.monthlySpendLimitUsd == null ? '' : String(config.monthlySpendLimitUsd));
    setTotalSpendLimitInput(config.totalSpendLimitUsd == null ? '' : String(config.totalSpendLimitUsd));
  }, [config]);

  const saveSettings = async () => {
    let monthlySpendLimitUsd: number | null = null;
    let totalSpendLimitUsd: number | null = null;

    try {
      monthlySpendLimitUsd = parseOptionalSpendLimit(monthlySpendLimitInput, 'Monatslimit');
      totalSpendLimitUsd = parseOptionalSpendLimit(totalSpendLimitInput, 'Gesamtlimit');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Limits konnten nicht gelesen werden.');
      return;
    }

    if (monthlySpendLimitUsd != null && totalSpendLimitUsd != null && totalSpendLimitUsd < monthlySpendLimitUsd) {
      setStatus('Gesamtlimit muss größer oder gleich dem Monatslimit sein.');
      return;
    }

    try {
      const updated = await window.studio.updateConfig({
        theme,
        defaultModel,
        queueConcurrency,
        monthlySpendLimitUsd,
        totalSpendLimitUsd
      });

      setConfig(updated);
      setStatus('Einstellungen wurden aktualisiert.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Einstellungen konnten nicht gespeichert werden.');
    }
  };

  const updateApiKey = async () => {
    if (!apiKey.trim()) {
      setStatus('Bitte zuerst einen Schlüssel eingeben.');
      return;
    }

    try {
      const validation = await window.studio.validateApiKey(apiKey.trim());
      if (!validation.valid) {
        setStatus(validation.message);
        return;
      }

      const newConfig = await window.studio.setApiKey(apiKey.trim());
      setConfig(newConfig);
      setApiKey('');
      setStatus('API-Schlüssel wurde aktualisiert.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'API-Schlüssel konnte nicht aktualisiert werden.');
    }
  };

  const removeApiKey = async () => {
    try {
      const newConfig = await window.studio.clearApiKey();
      setConfig(newConfig);
      setStatus('API-Schlüssel wurde entfernt.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'API-Schlüssel konnte nicht entfernt werden.');
    }
  };

  return (
    <section className="mx-auto grid w-full max-w-1120px content-start gap-3">
      <PageHeader
        className="items-end max-900:items-start max-900:flex-col"
        title="Einstellungen"
        description="Verwalte App-Verhalten, Kostenlimits und den Gemini-Zugang zentral an einem Ort."
        actions={
          <Button
            variant="primary"
            className="border-border-token bg-btn-secondary text-fg hover:bg-btn-secondary-hover hover:border-border-heavy-token active:bg-btn-secondary-active"
            onClick={() => void saveSettings()}
          >
            Änderungen speichern
          </Button>
        }
      />

      <div className="grid grid-cols-settings items-start gap-2 max-1200:grid-cols-1">
        <div className="grid gap-2">
          <Card className="grid gap-2 rounded-lg p-2.5">
            <div className="grid grid-cols-auto-content items-start gap-1.5">
              <div className="grid h-7 w-7 place-items-center rounded-md border border-border-token bg-surface-secondary text-fg-secondary">
                <SlidersHorizontal size={16} />
              </div>
              <div>
                <h3 className="text-lg font-550">App und Generierung</h3>
                <MutedText>Standardeinstellungen für Oberfläche, Modell und parallele Verarbeitung.</MutedText>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.75 max-900:grid-cols-1">
              <label>
                Design
                <select value={theme} onChange={(event) => setTheme(event.target.value as StudioConfigPublic['theme'])}>
                  <option value="dark">Dunkel</option>
                  <option value="light">Hell</option>
                  <option value="system">System</option>
                </select>
              </label>

              <label>
                Standardmodell
                <select value={defaultModel} onChange={(event) => setDefaultModel(event.target.value as ModelName)}>
                  <option value="gemini-3-pro-image-preview">Gemini 3 Pro Image</option>
                  <option value="gemini-2.5-flash-image">Gemini 2.5 Flash Image</option>
                </select>
              </label>

              <label>
                Parallelität Warteschlange
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={queueConcurrency}
                  onChange={(event) =>
                    setQueueConcurrency(Math.max(1, Math.min(8, Number(event.target.value) || 1)))
                  }
                />
              </label>
            </div>
          </Card>

          <Card className="grid gap-2 rounded-lg p-2.5">
            <div className="grid grid-cols-auto-content items-start gap-1.5">
              <div className="grid h-7 w-7 place-items-center rounded-md border border-border-token bg-surface-secondary text-fg-secondary">
                <Wallet size={16} />
              </div>
              <div>
                <h3 className="text-lg font-550">Kosten und Limits</h3>
                <MutedText>
                  Die Werte sind aktuell Schätzungen auf Basis interner Preislogik pro Bildauflösung.
                </MutedText>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.25 max-900:grid-cols-1">
              <Card className="grid gap-0.5 rounded-md border-border-light-token bg-surface-secondary p-1.5">
                <span className="text-xs text-fg-secondary">Heute</span>
                <strong className="font-mono text-sm text-fg">
                  {formatUsd(dayCost)}
                </strong>
              </Card>
              <Card className="grid gap-0.5 rounded-md border-border-light-token bg-surface-secondary p-1.5">
                <span className="text-xs text-fg-secondary">Letzte 30 Tage</span>
                <strong className="font-mono text-sm text-fg">
                  {formatUsd(monthCost)}
                </strong>
              </Card>
              <Card className="grid gap-0.5 rounded-md border-border-light-token bg-surface-secondary p-1.5">
                <span className="text-xs text-fg-secondary">Gesamt</span>
                <strong className="font-mono text-sm text-fg">
                  {formatUsd(totalCost)}
                </strong>
              </Card>
            </div>

            <div className="grid grid-cols-2 gap-1.5 max-900:grid-cols-1">
              <label>
                Monatslimit (USD)
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Leer lassen = kein Limit"
                  value={monthlySpendLimitInput}
                  onChange={(event) => setMonthlySpendLimitInput(event.target.value)}
                />
              </label>
              <label>
                Gesamtlimit (USD)
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Leer lassen = kein Limit"
                  value={totalSpendLimitInput}
                  onChange={(event) => setTotalSpendLimitInput(event.target.value)}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-1.25 max-900:grid-cols-1">
              <article className="grid gap-0.9 rounded-md border border-border-light-token bg-surface-secondary p-1.3">
                <div className="flex items-center justify-between gap-1">
                  <strong className="text-sm font-560">Monatslimit</strong>
                  <span className="font-mono text-xs text-fg-secondary">
                    {monthlyLimit == null
                      ? `Kein Limit · ${formatUsd(monthCost)}`
                      : `${formatUsd(monthCost)} / ${formatUsd(monthlyLimit)}`}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-btn-secondary" aria-hidden>
                  <div
                    className={`h-full w-0 rounded-inherit bg-success-token transition-width-token duration-200 ${
                      monthlyUsagePercent != null && monthlyUsagePercent >= 100 ? 'bg-error-token' : ''
                    }`}
                    style={{ width: `${monthlyUsagePercent ?? 0}%` }}
                  />
                </div>
                <MutedText>
                  {monthlyRemaining == null
                    ? 'Aktuell ohne Monatslimit.'
                    : monthlyRemaining >= 0
                      ? `Verfügbar: ${formatUsd(monthlyRemaining)}`
                      : `Überschritten um ${formatUsd(Math.abs(monthlyRemaining))}`}
                </MutedText>
              </article>

              <article className="grid gap-0.9 rounded-md border border-border-light-token bg-surface-secondary p-1.3">
                <div className="flex items-center justify-between gap-1">
                  <strong className="text-sm font-560">Gesamtlimit</strong>
                  <span className="font-mono text-xs text-fg-secondary">
                    {totalLimit == null
                      ? `Kein Limit · ${formatUsd(totalCost)}`
                      : `${formatUsd(totalCost)} / ${formatUsd(totalLimit)}`}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-btn-secondary" aria-hidden>
                  <div
                    className={`h-full w-0 rounded-inherit bg-success-token transition-width-token duration-200 ${
                      totalUsagePercent != null && totalUsagePercent >= 100 ? 'bg-error-token' : ''
                    }`}
                    style={{ width: `${totalUsagePercent ?? 0}%` }}
                  />
                </div>
                <MutedText>
                  {totalRemaining == null
                    ? 'Aktuell ohne Gesamtlimit.'
                    : totalRemaining >= 0
                      ? `Verfügbar: ${formatUsd(totalRemaining)}`
                      : `Überschritten um ${formatUsd(Math.abs(totalRemaining))}`}
                </MutedText>
              </article>
            </div>
          </Card>
        </div>

        <aside className="grid gap-2">
          <Card className="grid gap-2 rounded-lg p-2.5">
            <div className="grid grid-cols-auto-content items-start gap-1.5">
              <div className="grid h-7 w-7 place-items-center rounded-md border border-border-token bg-surface-secondary text-fg-secondary">
                <KeyRound size={16} />
              </div>
              <div>
                <h3 className="text-lg font-550">API-Schlüssel</h3>
                <MutedText>Gemini-Zugang verwalten und bei Bedarf rotieren.</MutedText>
              </div>
            </div>

            <div
              className={`rounded-md border px-1.35 py-1.1 text-sm ${
                config?.hasApiKey
                  ? 'border-success-limit text-success-token'
                  : 'border-border-token text-fg-secondary'
              } bg-surface-secondary`}
            >
              {config?.hasApiKey ? 'Schlüssel hinterlegt' : 'Kein Schlüssel hinterlegt'}
            </div>

            <label>
              Neuer Schlüssel
              <input
                type="password"
                placeholder="Gemini-API-Schlüssel eingeben"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </label>

            <div className="grid grid-cols-2 gap-1.25 max-900:grid-cols-1">
              <Button
                variant="primary"
                className="border-border-token bg-btn-secondary text-fg hover:bg-btn-secondary-hover hover:border-border-heavy-token active:bg-btn-secondary-active"
                onClick={() => void updateApiKey()}
              >
                Schlüssel aktualisieren
              </Button>
              <Button onClick={() => void removeApiKey()}>
                Schlüssel entfernen
              </Button>
            </div>
          </Card>

          <Card className="grid gap-1 rounded-lg p-2.5">
            <h3>Hinweis</h3>
            <MutedText>
              Limits verhindern neue Jobs, sobald die prognostizierten Kosten den Grenzwert überschreiten.
              Bereits laufende Jobs werden nicht nachträglich gestoppt.
            </MutedText>
          </Card>
        </aside>
      </div>

      {status ? <StatusText className="-mt-1">{status}</StatusText> : null}
    </section>
  );
}

function formatUsd(value: number): string {
  return `$${value.toFixed(3)}`;
}

function parseOptionalSpendLimit(rawValue: string, label: string): number | null {
  const normalized = rawValue.trim().replace(',', '.');
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} muss eine positive Zahl sein.`);
  }

  return Number(parsed.toFixed(3));
}

function calculateUsagePercent(spent: number, limit: number | null): number | null {
  if (limit == null || limit <= 0) {
    return null;
  }

  return Math.max(0, Math.min(100, (spent / limit) * 100));
}
