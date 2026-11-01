import React from 'react';
import type { PollutantReading } from '../types';
import { Badge } from './primitives';

interface PollutantPanelProps {
  pollutants?: PollutantReading[];
  pm25UgM3?: number | null;
  pm10UgM3?: number | null;
  dateLabel?: string;
}

function formatValue(value: number): string {
  if (Math.abs(value) >= 100) return Math.round(value).toString();
  return Number(value.toFixed(value < 10 ? 2 : 1)).toString();
}

/**
 * Concentrations are rendered exactly as returned by the replay API. A pollutant
 * the archive does not report on this date is shown as "Not reported" — it is
 * never estimated, interpolated or filled from another source.
 */
export const PollutantPanel: React.FC<PollutantPanelProps> = ({
  pollutants,
  pm25UgM3,
  pm10UgM3,
  dateLabel,
}) => {
  const rows: PollutantReading[] =
    pollutants && pollutants.length > 0
      ? pollutants
      : [
          ...(pm25UgM3 == null
            ? []
            : [{
                name: 'Particulate Matter < 2.5 µm',
                symbol: 'PM2.5',
                value: pm25UgM3,
                unit: 'µg/m³',
                standard24h: null,
                status: null,
              }]),
          ...(pm10UgM3 == null
            ? []
            : [{
                name: 'Particulate Matter < 10 µm',
                symbol: 'PM10',
                value: pm10UgM3,
                unit: 'µg/m³',
                standard24h: null,
                status: null,
              }]),
        ];

  const reported = rows.filter(r => r.value != null);
  const aboveStandard = reported.filter(
    r => r.standard24h != null && r.standard24h > 0 && (r.value as number) > r.standard24h
  ).length;
  const comparable = reported.filter(r => r.standard24h != null && r.standard24h > 0).length;
  const pctValues = reported
    .filter(r => r.standard24h != null && r.standard24h > 0)
    .map(r => ((r.value as number) / (r.standard24h as number)) * 100);
  // Keep the 100% marker readable while still separating extreme exceedances.
  const scaleMax = Math.max(150, ...pctValues);

  return (
    <section className="editorial-glass panel" aria-label="Pollutant concentrations">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h3 className="section-title">Pollutant load</h3>
          <p className="section-sub" style={{ marginTop: 2 }}>
            Concentration against the CPCB 24-hour standard
          </p>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {dateLabel && <Badge title="Target date of these concentrations">{dateLabel}</Badge>}
          {comparable > 0 && (
            <Badge tone={aboveStandard > 0 ? 'sand' : 'teal'}>
              {aboveStandard} of {comparable} above standard
            </Badge>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p style={{ marginTop: '18px', fontSize: '12.5px', color: 'var(--ink-muted)' }}>
          Pollutant records are not available for this date.
        </p>
      ) : (
        <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {rows.map(row => {
            const value = row.value;
            const standard = row.standard24h;
            const pct = value != null && standard != null && standard > 0 ? (value / standard) * 100 : null;
            const fill = pct == null ? 0 : Math.min(pct / scaleMax, 1) * 100;
            const tone = pct == null ? 'var(--ink-faint)' : pct > 200 ? '#c26b62' : pct > 100 ? '#c9a170' : '#5aa79a';

            return (
              <div
                key={row.symbol || row.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '58px minmax(0, 1fr) 104px',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '7px 0',
                  borderBottom: '1px solid var(--rule)',
                }}
              >
                <div>
                  <div
                    className="tnum"
                    style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-primary)', lineHeight: 1.2 }}
                    title={row.name}
                  >
                    {row.symbol || row.name}
                  </div>
                  <div style={{ fontSize: '9.5px', color: 'var(--ink-faint)', lineHeight: 1.3, marginTop: 1 }}>
                    {standard == null ? 'standard n/a' : `${formatValue(standard)} ${row.unit}`}
                  </div>
                </div>

                <div style={{ position: 'relative', height: '14px' }}>
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      inset: '5px 0',
                      borderRadius: '2px',
                      background: 'rgba(255,255,255,0.07)',
                    }}
                  />
                  {pct != null && (
                    <div
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: '5px',
                        height: '4px',
                        width: `${fill}%`,
                        borderRadius: '2px',
                        background: tone,
                        transition: 'width 0.4s var(--e-out)',
                      }}
                    />
                  )}
                  {/* 100% of the 24-hour standard sits two-thirds along the track. */}
                  <div
                    aria-hidden="true"
                    title="CPCB 24-hour standard"
                    style={{
                      position: 'absolute',
                      left: `${(100 / scaleMax) * 100}%`,
                      top: '2px',
                      bottom: '2px',
                      width: '1px',
                      background: 'rgba(255,255,255,0.28)',
                    }}
                  />
                </div>

                <div style={{ textAlign: 'right', lineHeight: 1.25 }}>
                  {value == null ? (
                    <span style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>Not reported</span>
                  ) : (
                    <>
                      <span className="tnum" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--ink-primary)' }}>
                        {formatValue(value)}
                      </span>
                      <span style={{ fontSize: '9.5px', color: 'var(--ink-faint)', marginLeft: '3px' }}>{row.unit}</span>
                      <div className="tnum" style={{ fontSize: '10px', color: pct != null && pct > 100 ? '#d9b98d' : 'var(--ink-muted)' }}>
                        {pct == null ? '—' : `${Math.round(pct)}% of std`}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {reported.length < rows.length && (
        <p style={{ marginTop: '9px', fontSize: '10.5px', color: 'var(--ink-faint)', lineHeight: 1.5 }}>
          A pollutant the archive does not report on this date is left unreported, never estimated.
        </p>
      )}
    </section>
  );
};
