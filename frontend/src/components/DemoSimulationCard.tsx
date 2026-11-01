import React from 'react';
import { AlertTriangle, Building2, Clock, FlaskConical, RefreshCw } from 'lucide-react';
import type { DemoObservationsResponse } from '../api/types';
import type { ApiError } from '../api/client';
import { Badge } from './primitives';

/**
 * Demo Simulation body for the Station Observations panel. Every figure shown
 * here is fabricated sample data from a deterministic backend fixture. It is
 * never presented as a measurement and is never merged with the live payload.
 */
interface DemoSimulationCardProps {
  demo: DemoObservationsResponse | null;
  isLoading: boolean;
  error: ApiError | null;
  onRetry: () => void;
}

export const DemoSimulationCard: React.FC<DemoSimulationCardProps> = ({
  demo,
  isLoading,
  error,
  onRetry,
}) => {
  if (error && !isLoading) {
    return (
      <div style={{ marginTop: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', color: '#e0b184' }}>
          <AlertTriangle size={15} />
          <span style={{ fontSize: '12.5px', fontWeight: 500 }}>Demo sample could not be loaded</span>
        </div>
        <button type="button" className="icon-button" onClick={onRetry} style={{ marginTop: '9px' }}>
          <RefreshCw size={11} />
          <span>Reload sample</span>
        </button>
      </div>
    );
  }

  if (isLoading || !demo) {
    return <p style={{ marginTop: '12px', fontSize: '12px', color: 'var(--ink-muted)' }}>Loading simulated sample…</p>;
  }

  return (
    <div style={{ marginTop: '10px' }}>
      <div
        role="note"
        aria-label="Simulated demo data notice"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '9px',
          padding: '9px 11px',
          borderRadius: '10px',
          border: '1px dashed rgba(201, 161, 112, 0.42)',
          background: 'rgba(201, 161, 112, 0.055)',
        }}
      >
        <FlaskConical size={15} style={{ color: '#d9b98d', flexShrink: 0, marginTop: '1px' }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#e0c39b', lineHeight: 1.4 }}>
            Simulated sample — not a measurement
          </div>
          <p style={{ marginTop: '2px', fontSize: '11px', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
            Fabricated values for interface demonstration only.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '9px', fontSize: '11px', color: 'var(--ink-muted)' }}>
        <span className="tnum" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Building2 size={11} />
          {demo.station_count} fictitious stations · {demo.record_count} readings
        </span>
        <span style={{ color: 'var(--ink-faint)' }}>·</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Clock size={11} />
          <span className="tnum">{demo.sample_snapshot?.label}</span>
        </span>
        <Badge tone="dashed">Fixed timestamp</Badge>
      </div>

      <div style={{ marginTop: '9px', overflowX: 'auto' }}>
        <table className="data-table demo-table">
          <thead>
            <tr>
              <th>Demo station</th>
              <th>Pollutant</th>
              <th style={{ textAlign: 'right' }}>Sample value</th>
              <th className="col-secondary" style={{ textAlign: 'right' }}>Illustrative time</th>
            </tr>
          </thead>
          <tbody>
            {(demo.stations || []).map(station =>
              station.readings.map((reading, index) => (
                <tr key={`${station.station}-${reading.pollutant}`}>
                  <td style={{ color: 'var(--ink-primary)', fontWeight: 500 }}>
                    {station.station}
                    {index === 0 && (
                      <span style={{ display: 'block', fontSize: '9.5px', color: 'var(--ink-faint)', fontWeight: 400 }}>
                        simulated · {station.zone_label}
                      </span>
                    )}
                  </td>
                  <td style={{ color: 'var(--ink-muted)' }}>{reading.pollutant}</td>
                  <td className="tnum" style={{ textAlign: 'right' }}>
                    {reading.value.toFixed(2)}
                    <span style={{ marginLeft: '3px', fontSize: '9.5px', color: 'var(--ink-faint)' }}>{reading.unit}</span>
                  </td>
                  <td className="tnum col-secondary" style={{ textAlign: 'right', color: 'var(--ink-faint)' }}>
                    {index === 0 ? station.illustrative_timestamp_label : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
