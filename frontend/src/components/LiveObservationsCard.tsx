import React, { useState } from 'react';
import { AlertTriangle, Building2 } from 'lucide-react';
import type { LiveObservationsResponse, LiveObservationStation } from '../api/types';
import type { ApiError } from '../api/client';
import { Badge, formatIst } from './primitives';

/**
 * Live-mode body of the Station Observations panel. Rendered only for the
 * "Live Data" mode by StationObservationsSection; it never receives or falls
 * back to synthetic records.
 */
export interface LiveObservationsCardProps {
  observations: LiveObservationsResponse | null;
  isLoading: boolean;
  error: ApiError | null;
}

function freshnessLabel(freshness: LiveObservationsResponse['freshness']): string {
  if (!freshness || freshness.status === 'unknown') return 'Freshness unknown';
  const age = freshness.age_hours == null ? '' : `${freshness.age_hours.toFixed(1)} h old`;
  if (freshness.status === 'fresh') return `Fresh${age ? ` · ${age}` : ''}`;
  return `Stale${age ? ` · ${age}` : ''}`;
}

function reported(value: number | null): string {
  return value == null ? '—' : String(value);
}

function rangeLabel(row: { min: number | null; max: number | null }): string {
  if (row.min == null && row.max == null) return '—';
  return `${reported(row.min)} – ${reported(row.max)}`;
}

interface FlatRow {
  station: LiveObservationStation;
  pollutant: string;
  average: number | null;
  min: number | null;
  max: number | null;
}

const VISIBLE_ROWS = 9;

export const LiveObservationsCard: React.FC<LiveObservationsCardProps> = ({
  observations,
  isLoading,
  error,
}) => {
  const [showAll, setShowAll] = useState(false);
  const freshness = observations?.freshness;
  const freshnessColor =
    freshness?.status === 'fresh'
      ? '#8fc7ba'
      : freshness?.status === 'stale'
      ? '#d9b98d'
      : 'var(--ink-muted)';

  const rows: FlatRow[] = [];
  for (const station of observations?.stations || []) {
    for (const reading of station.pollutants) {
      rows.push({
        station,
        pollutant: reading.pollutant,
        average: reading.reported_avg,
        min: reading.reported_min,
        max: reading.reported_max,
      });
    }
  }
  const visible = showAll ? rows : rows.slice(0, VISIBLE_ROWS);

  return (
    <>
      {error && !isLoading && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', color: '#e0b184' }}>
            <AlertTriangle size={15} />
            <span style={{ fontSize: '12.5px', fontWeight: 500 }}>Observations temporarily unavailable</span>
          </div>
          <p style={{ marginTop: '4px', fontSize: '11.5px', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
            No values are substituted while the source is unreachable.
          </p>
        </div>
      )}

      {!error && !isLoading && observations && observations.status !== 'OK' && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', color: '#e0b184' }}>
            <AlertTriangle size={15} />
            <span style={{ fontSize: '12.5px', fontWeight: 500 }}>
              {observations.status === 'ERROR'
                ? 'Source could not be reached'
                : observations.missing_credential
                ? 'Source not configured'
                : 'No usable observations returned'}
            </span>
          </div>
          <p style={{ marginTop: '4px', fontSize: '11.5px', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
            {observations.missing_credential
              ? 'No data.gov.in key is configured for this deployment.'
              : 'No values are substituted while the source is unavailable.'}
          </p>
        </div>
      )}

      {!error && isLoading && (
        <p style={{ marginTop: '12px', fontSize: '12px', color: 'var(--ink-muted)' }}>Loading station observations…</p>
      )}

      {!error && !isLoading && observations?.status === 'OK' && (
        <div style={{ marginTop: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '11px', color: 'var(--ink-muted)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: freshnessColor }}>
              <span aria-hidden="true" style={{ width: '5px', height: '5px', borderRadius: '50%', background: freshnessColor }} />
              {freshnessLabel(freshness)}
            </span>
            <span style={{ color: 'var(--ink-faint)' }}>·</span>
            <span className="tnum">Observed {formatIst(observations.observation_timestamp?.parsed_ist)}</span>
            <span style={{ color: 'var(--ink-faint)' }}>·</span>
            <span className="tnum" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <Building2 size={11} />
              {observations.station_count} stations · {observations.record_count} rows
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginTop: '8px' }}>
            <Badge tone="sand">Units unverified</Badge>
            <span style={{ fontSize: '10.5px', color: 'var(--ink-faint)', lineHeight: 1.4 }}>
              Published values; the source states no unit or averaging window.
            </span>
          </div>

          <div style={{ marginTop: '9px', maxHeight: showAll ? '360px' : undefined, overflow: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ position: 'sticky', top: 0, background: 'rgba(13,19,24,0.96)' }}>Station</th>
                  <th style={{ position: 'sticky', top: 0, background: 'rgba(13,19,24,0.96)' }}>Pollutant</th>
                  <th style={{ position: 'sticky', top: 0, background: 'rgba(13,19,24,0.96)', textAlign: 'right' }}>Average</th>
                  <th className="col-secondary" style={{ position: 'sticky', top: 0, background: 'rgba(13,19,24,0.96)', textAlign: 'right' }}>Min – max</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(row => (
                  <tr key={`${row.station.station}-${row.pollutant}`}>
                    <td style={{ color: 'var(--ink-primary)', fontWeight: 500, minWidth: '150px' }}>{row.station.station}</td>
                    <td style={{ color: 'var(--ink-muted)' }}>{row.pollutant}</td>
                    <td className="tnum" style={{ textAlign: 'right' }}>
                      {row.average == null ? <span style={{ color: 'var(--ink-faint)' }}>not reported</span> : row.average}
                    </td>
                    <td className="tnum col-secondary" style={{ textAlign: 'right', color: 'var(--ink-muted)' }}>{rangeLabel(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length > VISIBLE_ROWS && (
            <button
              type="button"
              onClick={() => setShowAll(v => !v)}
              style={{
                background: 'none',
                border: 'none',
                padding: '7px 0 0',
                fontFamily: 'inherit',
                fontSize: '11px',
                color: 'var(--ink-muted)',
                cursor: 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: '2px',
              }}
            >
              {showAll ? 'Show fewer rows' : `Show all ${rows.length} rows`}
            </button>
          )}

          {observations.truncated && (
            <p style={{ marginTop: '6px', fontSize: '10.5px', color: '#d9b98d', lineHeight: 1.5 }}>
              Partial snapshot: {observations.source_total} records matched, {observations.record_count} returned.
            </p>
          )}
        </div>
      )}
    </>
  );
};
