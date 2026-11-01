import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlaskConical, Radio, RefreshCw } from 'lucide-react';
import type {
  DemoObservationsResponse,
  LiveObservationsResponse,
  ObservationsMode,
} from '../api/types';
import { apiClient, ApiError } from '../api/client';
import { LiveObservationsCard } from './LiveObservationsCard';
import { DemoSimulationCard } from './DemoSimulationCard';
import { Badge } from './primitives';

/**
 * Station Observations panel with an explicit Live Data / Demo Simulation switch.
 *
 * The two modes are kept completely separate: Live Data renders only the
 * `/api/live/observations` payload and preserves its UNAVAILABLE/ERROR states
 * verbatim, while Demo Simulation renders a clearly labelled synthetic fixture
 * from `/api/demo/observations`. Neither mode fills in for the other.
 */
interface StationObservationsSectionProps {
  observations: LiveObservationsResponse | null;
  isLoading: boolean;
  error: ApiError | null;
  onRetry: () => void;
}

interface ModeButtonProps {
  active: boolean;
  label: string;
  description: string;
  onClick: () => void;
  children: React.ReactNode;
}

const ModeButton: React.FC<ModeButtonProps> = ({ active, label, description, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    title={description}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      border: 'none',
      background: active ? 'rgba(63, 157, 144, 0.22)' : 'transparent',
      color: active ? 'var(--ink-primary)' : 'var(--ink-muted)',
      fontSize: '11px',
      fontWeight: 500,
      padding: '4px 9px',
      borderRadius: '7px',
      cursor: 'pointer',
      fontFamily: 'inherit',
      whiteSpace: 'nowrap',
    }}
  >
    {children}
    <span>{label}</span>
  </button>
);

export const StationObservationsSection: React.FC<StationObservationsSectionProps> = ({
  observations,
  isLoading,
  error,
  onRetry,
}) => {
  const [mode, setMode] = useState<ObservationsMode>('live');
  const [demo, setDemo] = useState<DemoObservationsResponse | null>(null);
  const [demoLoading, setDemoLoading] = useState<boolean>(false);
  const [demoError, setDemoError] = useState<ApiError | null>(null);
  const demoRequested = useRef<boolean>(false);

  const loadDemo = useCallback(async () => {
    setDemoLoading(true);
    setDemoError(null);
    try {
      const res = await apiClient.getDemoObservations();
      setDemo(res);
    } catch (err: any) {
      setDemo(null);
      setDemoError(
        err instanceof ApiError
          ? err
          : new ApiError(err?.message || 'Demo sample could not be loaded', {
              endpoint: '/api/demo/observations',
            })
      );
    } finally {
      setDemoLoading(false);
    }
  }, []);

  // Fetch the fixture only after Demo Simulation is actually selected.
  useEffect(() => {
    if (mode !== 'demo' || demoRequested.current) return;
    demoRequested.current = true;
    loadDemo();
  }, [mode, loadDemo]);

  const isDemo = mode === 'demo';

  return (
    <section
      className="editorial-glass panel"
      aria-label="Station observations"
      data-mode={mode}
      data-source={isDemo ? 'demo-simulation-fixture' : 'data.gov.in-cpcb'}
      data-is-simulated={isDemo ? 'true' : 'false'}
      data-is-trained-model="false"
      data-is-aqi="false"
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <h3 className="section-title">Station observations</h3>
            <Badge tone={isDemo ? 'dashed' : 'teal'}>{isDemo ? 'Simulated' : 'Observed'}</Badge>
            {!isDemo && <Badge>Raw values</Badge>}
          </div>
          <p className="section-sub" style={{ marginTop: 3 }}>
            {isDemo
              ? 'Fabricated fixture for interface demonstration'
              : 'CPCB / DPCC station reports · no AQI derived'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <div className="segmented" role="group" aria-label="Station observations data mode">
            <ModeButton
              active={!isDemo}
              label="Live"
              description="Reported CPCB/DPCC station values from data.gov.in"
              onClick={() => setMode('live')}
            >
              <Radio size={11} />
            </ModeButton>
            <ModeButton
              active={isDemo}
              label="Demo"
              description="Fabricated sample records that demonstrate this interface"
              onClick={() => setMode('demo')}
            >
              <FlaskConical size={11} />
            </ModeButton>
          </div>

          {!isDemo && (
            <button type="button" className="icon-button" onClick={onRetry} disabled={isLoading} aria-label="Refresh station observations">
              <RefreshCw size={11} style={{ animation: isLoading ? 'spin 1s linear infinite' : undefined }} />
            </button>
          )}
        </div>
      </div>

      {isDemo ? (
        <DemoSimulationCard demo={demo} isLoading={demoLoading} error={demoError} onRetry={loadDemo} />
      ) : (
        <LiveObservationsCard observations={observations} isLoading={isLoading} error={error} />
      )}
    </section>
  );
};
