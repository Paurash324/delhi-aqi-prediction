import React from 'react';
import { AlertTriangle, CloudOff, RefreshCw } from 'lucide-react';
import type {
  ExternalForecastResponse,
  ExternalOutlookDay,
  ExternalOutlookResponse,
} from '../api/types';
import type { ApiError } from '../api/client';
import { getAqiCategoryMeta } from '../data/delhiAqiData';
import { Badge, formatDay, formatIst } from './primitives';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';

interface ExternalForecastCardProps {
  forecast: ExternalForecastResponse | null;
  /** Today + next three days, each its own 24h window. Optional: the card still
   *  renders the single next-day estimate when the outlook request fails. */
  outlook: ExternalOutlookResponse | null;
  /** Selected forecast horizon (1-3). Picks which outlook day is shown in detail. */
  horizon: number;
  isLoading: boolean;
  error: ApiError | null;
  onRetry: () => void;
  onSelectHorizon?: (horizon: number) => void;
}

function shortAveraging(label: string | undefined): string {
  if (!label) return 'not reported';
  if (label.startsWith('max 8h')) return 'max 8h mean';
  if (label.startsWith('1h peak')) return '1h peak';
  if (label.startsWith('24h')) return '24h mean';
  return label;
}

function leadLabel(lead: number): string {
  if (lead === 0) return 'Today';
  if (lead === 1) return 'Tomorrow';
  return `+${lead} days`;
}

/**
 * Small trend across the modelled windows. Straight segments between day values only:
 * no spline, so no peak is drawn between two days that was never computed.
 */
const OutlookTrend: React.FC<{ days: ExternalOutlookDay[] }> = ({ days }) => {
  const points = days
    .map((day, index) => ({ index, value: day.aqi }))
    .filter((point): point is { index: number; value: number } => point.value !== null);
  if (points.length < 2) return null;

  const values = points.map(point => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const xAt = (index: number) => (days.length === 1 ? 50 : (index / (days.length - 1)) * 100);
  const yAt = (value: number) => 24 - ((value - min) / span) * 18;
  const path = points
    .map((point, i) => `${i === 0 ? 'M' : 'L'} ${xAt(point.index).toFixed(2)},${yAt(point.value).toFixed(2)}`)
    .join(' ');

  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ width: '100%', height: '26px', display: 'block', marginTop: '2px', overflow: 'visible' }}
    >
      <path
        d={path}
        fill="none"
        stroke="#5aa79a"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

/**
 * The CAMS-derived estimate is a separate source from both the trained model and the
 * station observations. It is badged as modelled and never presented as an official
 * CPCB reading or a model output.
 */
export const ExternalForecastCard: React.FC<ExternalForecastCardProps> = ({
  forecast,
  outlook,
  horizon,
  isLoading,
  error,
  onRetry,
  onSelectHorizon,
}) => {
  const days = outlook?.days ?? [];
  const forecastDays = days.filter(day => day.role === 'forecast');
  // The existing horizon control drives which day is shown in detail.
  const primaryDay =
    forecastDays.find(day => day.lead_days === horizon) ??
    forecastDays.find(day => day.aqi !== null) ??
    null;
  const currentDay = days.find(day => day.lead_days === 0) ?? null;

  const primaryAqi = primaryDay ? primaryDay.aqi : forecast?.aqi ?? null;
  const primaryCategory = primaryDay ? primaryDay.category : forecast?.category ?? null;
  const primaryDate = primaryDay?.target_date ?? forecast?.target_date;
  const primaryWindowEnd = primaryDay?.window.end ?? forecast?.window?.end;
  const dominant = primaryDay?.dominant_pollutant ?? forecast?.dominant_pollutant ?? null;
  const subIndices = primaryDay?.sub_indices ?? forecast?.sub_indices ?? [];

  const ok = !isLoading && typeof primaryAqi === 'number';
  // Display-only tween so a refreshed reading settles instead of snapping.
  const animatedAqi = useAnimatedNumber(typeof primaryAqi === 'number' ? primaryAqi : null);
  const categoryMeta = ok && primaryCategory ? getAqiCategoryMeta(primaryCategory) : null;
  const maxSubIndex = subIndices.length ? Math.max(...subIndices.map(item => item.sub_index)) : 0;

  const updatedAt = outlook?.retrieved_at ?? forecast?.retrieved_at;
  const isCached = Boolean(outlook?.cached ?? forecast?.cached);
  const providerStatus = outlook?.status ?? forecast?.status;

  return (
    <section
      className="editorial-glass panel"
      aria-label="Modelled air quality estimate"
      data-source="open-meteo-cams"
      data-is-trained-model="false"
      data-is-aqi="true"
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <Badge tone="sand">CAMS estimate</Badge>
            <Badge>Experimental</Badge>
            {primaryDate && (
              <span className="tnum" style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>
                {formatDay(primaryDate)}
              </span>
            )}
          </div>
          <h2 className="font-heading" style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.02em', marginTop: '7px', lineHeight: 1.25 }}>
            Delhi air quality outlook
          </h2>
        </div>

        <button type="button" className="icon-button" onClick={onRetry} disabled={isLoading} aria-label="Refresh modelled forecast">
          <RefreshCw size={12} style={{ animation: isLoading ? 'spin 1s linear infinite' : undefined }} />
          <span>{isLoading ? 'Refreshing' : 'Refresh'}</span>
        </button>
      </div>

      {/* Current window: modelled, never an observation. */}
      {currentDay && currentDay.aqi !== null && currentDay.category && (
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '8px',
            flexWrap: 'wrap',
            marginTop: '10px',
            paddingTop: '9px',
            borderTop: '1px solid var(--rule)',
          }}
        >
          <span style={{ fontSize: '10.5px', color: 'var(--ink-muted)' }}>Current estimate</span>
          <span className="tnum font-heading" style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink-primary)', lineHeight: 1 }}>
            {currentDay.aqi}
          </span>
          <span style={{ fontSize: '11.5px', fontWeight: 500, color: getAqiCategoryMeta(currentDay.category).color }}>
            {currentDay.category}
          </span>
          <span className="tnum" style={{ fontSize: '10px', color: 'var(--ink-faint)' }}>
            24h to {formatIst(currentDay.window.end)} · modelled
          </span>
        </div>
      )}

      {isLoading && !forecast && !outlook && (
        <p style={{ marginTop: '16px', fontSize: '12.5px', color: 'var(--ink-muted)' }}>Requesting the modelled forecast…</p>
      )}

      {error && !isLoading && !ok && (
        <div className="compact-state" style={{ marginTop: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#e0b184' }}>
            <AlertTriangle size={16} />
            <span style={{ fontSize: '13px', fontWeight: 500 }}>Modelled estimate unavailable</span>
          </div>
          <p>
            {error.status ? `The provider returned HTTP ${error.status}. ` : ''}
            No value is substituted for this window.
          </p>
        </div>
      )}

      {!error && !isLoading && !ok && providerStatus === 'UNAVAILABLE' && (
        <div className="compact-state" style={{ marginTop: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#e0b184' }}>
            <CloudOff size={16} />
            <span style={{ fontSize: '13px', fontWeight: 500 }}>Not enough pollutant data for an estimate</span>
          </div>
          <p>No value is substituted. The provider response is documented on the project page.</p>
        </div>
      )}

      {!error && !isLoading && !ok && providerStatus === 'ERROR' && (
        <div className="compact-state" style={{ marginTop: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#e0b184' }}>
            <AlertTriangle size={16} />
            <span style={{ fontSize: '13px', fontWeight: 500 }}>Provider returned an error</span>
          </div>
          <p>No estimate was produced, and no value is substituted.</p>
        </div>
      )}

      {ok && categoryMeta && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', marginTop: '12px', flexWrap: 'wrap' }}>
            <span className="tnum font-heading" style={{ fontSize: 'clamp(48px, 5vw, 64px)', fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 1 }}>
              {animatedAqi == null ? primaryAqi : Math.round(animatedAqi)}
            </span>
            <div>
              <div className="font-heading" style={{ fontSize: '18px', fontWeight: 600, color: categoryMeta.color, lineHeight: 1.2 }}>
                {primaryCategory}
              </div>
              <div className="tnum" style={{ fontSize: '11px', color: 'var(--ink-muted)', marginTop: '2px' }}>
                {primaryDay ? `${leadLabel(primaryDay.lead_days)} · ` : ''}
                {primaryWindowEnd ? `24h ending ${formatIst(primaryWindowEnd)}` : 'window not reported'}
              </div>
            </div>
            {dominant && (
              <span style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <span style={{ display: 'block', fontSize: '10px', color: 'var(--ink-muted)' }}>Highest sub-index</span>
                <span style={{ display: 'block', fontSize: '12px', color: 'var(--ink-primary)' }}>{dominant}</span>
              </span>
            )}
          </div>

          {days.length > 0 && (
            <div style={{ marginTop: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '10px', letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>
                  Modelled outlook
                </span>
                <span className="tnum" style={{ fontSize: '10px', color: 'var(--ink-faint)' }}>
                  {updatedAt ? `Retrieved ${formatIst(updatedAt)}` : 'retrieval time not reported'}
                  {isCached ? ' · cached' : ''}
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
                  gap: '6px',
                  marginTop: '7px',
                }}
              >
                {days.map(day => {
                  const meta = day.category ? getAqiCategoryMeta(day.category) : null;
                  const active = primaryDay ? day.target_date === primaryDay.target_date : false;
                  const selectable = day.role === 'forecast' && day.aqi !== null;
                  const cellStyle: React.CSSProperties = {
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: '1px',
                    padding: '6px 8px',
                    borderRadius: '8px',
                    border: `1px solid ${active ? 'rgba(143, 199, 186, 0.5)' : 'var(--rule)'}`,
                    background: active ? 'rgba(63, 157, 144, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                    color: 'inherit',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                    cursor: selectable ? 'pointer' : 'default',
                    minWidth: 0,
                  };
                  const content = (
                    <>
                      <span style={{ fontSize: '9.5px', color: 'var(--ink-muted)', lineHeight: 1.2 }}>
                        {leadLabel(day.lead_days)}
                      </span>
                      <span
                        className="tnum font-heading"
                        style={{ fontSize: '17px', fontWeight: 600, lineHeight: 1.15, color: meta ? meta.color : 'var(--ink-muted)' }}
                      >
                        {day.aqi === null ? '—' : day.aqi}
                      </span>
                      <span style={{ fontSize: '9px', color: 'var(--ink-faint)', lineHeight: 1.25 }}>
                        {day.category || 'no index'}
                      </span>
                    </>
                  );
                  return selectable ? (
                    <button
                      key={day.target_date}
                      type="button"
                      onClick={() => onSelectHorizon?.(day.lead_days)}
                      aria-pressed={active}
                      title={`${formatDay(day.target_date)} · CPCB-method estimate from CAMS concentrations`}
                      style={cellStyle}
                    >
                      {content}
                    </button>
                  ) : (
                    <div
                      key={day.target_date}
                      title={`${formatDay(day.target_date)} · modelled current estimate, not an observation`}
                      style={cellStyle}
                    >
                      {content}
                    </div>
                  );
                })}
              </div>

              <OutlookTrend days={days} />
            </div>
          )}

          <div style={{ marginTop: '12px', overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Pollutant</th>
                  <th className="col-secondary">Averaging</th>
                  <th style={{ textAlign: 'right' }}>Concentration</th>
                  <th style={{ textAlign: 'right' }}>Sub-index</th>
                </tr>
              </thead>
              <tbody>
                {subIndices.map(item => {
                  const isDominant = item.pollutant === dominant;
                  return (
                    <tr key={item.pollutant}>
                      <td style={{ color: 'var(--ink-primary)', fontWeight: isDominant ? 600 : 500 }}>
                        {item.pollutant}
                      </td>
                      <td className="col-secondary" title={item.averaging}>{shortAveraging(item.averaging)}</td>
                      <td className="tnum" style={{ textAlign: 'right' }}>
                        {item.concentration} <span style={{ color: 'var(--ink-faint)', fontSize: '10px' }}>{item.unit}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '7px' }}>
                          <span aria-hidden="true" style={{ width: '38px', height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                            <span
                              style={{
                                display: 'block',
                                height: '100%',
                                width: `${maxSubIndex > 0 ? Math.min((item.sub_index / maxSubIndex) * 100, 100) : 0}%`,
                                background: isDominant ? categoryMeta.color : 'rgba(255,255,255,0.3)',
                              }}
                            />
                          </span>
                          <span className="tnum" style={{ fontSize: '11.5px', fontWeight: isDominant ? 600 : 500, color: isDominant ? categoryMeta.color : 'var(--ink-secondary)', minWidth: '24px' }}>
                            {item.sub_index}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p style={{ marginTop: '10px', fontSize: '10.5px', color: 'var(--ink-faint)', lineHeight: 1.5 }}>
            Modelled concentrations, not station measurements · experimental CPCB method, not an official CPCB AQI ·
            this is not the trained ML model.
          </p>
        </>
      )}
    </section>
  );
};
