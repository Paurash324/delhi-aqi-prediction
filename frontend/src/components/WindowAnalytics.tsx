import React from 'react';
import type { DailyAqiRecord } from '../types';
import { Badge } from './primitives';

interface WindowAnalyticsProps {
  records: DailyAqiRecord[];
  horizon: number;
  title?: string;
  subtitle?: string;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/**
 * Window statistics are calculated only from the chart series returned by the
 * replay API for this date and horizon. Nothing is pulled from another period.
 */
export const WindowAnalytics: React.FC<WindowAnalyticsProps> = ({
  records,
  horizon,
  title = 'Window statistics',
  subtitle,
}) => {
  if (!records.length) return null;

  const actuals = records.map(r => r.derivedActualAQI);
  const modelAbs = records.map(r => Math.abs(r.predictedAQI - r.derivedActualAQI));
  const baseAbs = records.map(r => Math.abs(r.baselineAQI - r.derivedActualAQI));
  const modelMae = mean(modelAbs);
  const baseMae = mean(baseAbs);
  const skill = baseMae > 0 ? ((baseMae - modelMae) / baseMae) * 100 : 0;
  const beatDays = records.reduce((count, _record, i) => count + (modelAbs[i] <= baseAbs[i] ? 1 : 0), 0);
  const peakRecord = records.reduce((best, r) => (r.derivedActualAQI > best.derivedActualAQI ? r : best), records[0]);
  const above300 = records.filter(r => r.derivedActualAQI > 300).length;
  const above400 = records.filter(r => r.derivedActualAQI > 400).length;
  const meanAqi = mean(actuals);

  const stats = [
    { label: 'Window mean', value: meanAqi.toFixed(1), suffix: 'AQI' },
    {
      label: 'Window peak',
      value: peakRecord.derivedActualAQI.toFixed(1),
      suffix: new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' }).format(
        new Date(`${peakRecord.date}T12:00:00+05:30`)
      ),
    },
    { label: 'Days above 300', value: String(above300), suffix: `of ${records.length}` },
    { label: 'Days above 400', value: String(above400), suffix: `of ${records.length}` },
  ];

  return (
    <section className="editorial-glass panel" aria-label="Window statistics">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
        <div>
          <h3 className="section-title">{title}</h3>
          <p className="section-sub" style={{ marginTop: 2 }}>
            {subtitle || `${records.length}-day evaluated window`}
          </p>
        </div>
        <Badge tone="teal">ML vs persistence</Badge>
      </div>

      <div
        style={{
          marginTop: '12px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1px',
          background: 'var(--rule)',
          border: '1px solid var(--rule)',
          borderRadius: '10px',
          overflow: 'hidden',
        }}
      >
        {stats.map(stat => (
          <div key={stat.label} style={{ background: 'rgba(10, 16, 21, 0.55)', padding: '9px 11px' }}>
            <div style={{ fontSize: '10px', color: 'var(--ink-muted)', lineHeight: 1.3 }}>{stat.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', marginTop: '2px' }}>
              <span className="tnum" style={{ fontSize: '17px', fontWeight: 500, color: 'var(--ink-primary)', lineHeight: 1.15 }}>
                {stat.value}
              </span>
              <span style={{ fontSize: '9.5px', color: 'var(--ink-faint)' }}>{stat.suffix}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
          <span style={{ fontSize: '10.5px', color: 'var(--ink-muted)' }}>
            Absolute error · model vs persistence
          </span>
          <span
            className="tnum"
            style={{ fontSize: '11px', fontWeight: 500, color: skill >= 0 ? '#8fc7ba' : '#d9b98d' }}
          >
            {skill >= 0 ? '+' : ''}{skill.toFixed(1)}% skill
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '6px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--ink-muted)' }}>
              <span>Model</span>
              <span className="tnum" style={{ color: 'var(--ink-primary)' }}>{modelMae.toFixed(1)}</span>
            </div>
            <div style={{ height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.07)', marginTop: '4px' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.min((modelMae / Math.max(modelMae, baseMae, 1)) * 100, 100)}%`,
                  background: '#5aa79a',
                  borderRadius: '2px',
                }}
              />
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--ink-muted)' }}>
              <span>Persistence</span>
              <span className="tnum" style={{ color: 'var(--ink-primary)' }}>{baseMae.toFixed(1)}</span>
            </div>
            <div style={{ height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.07)', marginTop: '4px' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.min((baseMae / Math.max(modelMae, baseMae, 1)) * 100, 100)}%`,
                  background: 'rgba(255,255,255,0.34)',
                  borderRadius: '2px',
                }}
              />
            </div>
          </div>
        </div>

        <p style={{ marginTop: '8px', fontSize: '10.5px', color: 'var(--ink-faint)', lineHeight: 1.45 }}>
          Model error is at or below persistence on {beatDays} of {records.length} days at t+{horizon}.
        </p>
      </div>
    </section>
  );
};
