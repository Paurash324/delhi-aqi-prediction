import React from 'react';
import type { DailyAqiRecord } from '../types';
import type { ReplayMetricsResponse } from '../api/types';
import { getAqiCategory, getAqiCategoryMeta } from '../data/delhiAqiData';
import { Badge } from './primitives';

interface MlForecastCardProps {
  record: DailyAqiRecord | null;
  metrics: ReplayMetricsResponse | null;
  metricsError: string | null;
  horizon: number;
}

/**
 * Historical ML output for the selected date. The prediction, target and
 * residual come from the replay response; the frozen evaluation figures come
 * from /api/replay/metrics. Neither is recalculated or substituted.
 */
export const MlForecastCard: React.FC<MlForecastCardProps> = ({
  record,
  metrics,
  metricsError,
  horizon,
}) => {
  const meta = record ? getAqiCategoryMeta(getAqiCategory(record.predictedAQI)) : null;
  const residual = record ? record.predictedAQI - record.derivedActualAQI : null;

  return (
    <section className="editorial-glass panel" aria-label="Trained model forecast" data-source="replay-model" data-is-trained-model="true">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div>
          <h3 className="section-title" style={{ fontSize: '14px' }}>ML forecast</h3>
          <p className="section-sub" style={{ marginTop: 2 }}>
            Held-out model output · t+{horizon}
          </p>
        </div>
        <Badge tone="teal">Trained model</Badge>
      </div>

      {!record ? (
        <p style={{ marginTop: '14px', fontSize: '12px', color: 'var(--ink-muted)' }}>
          No held-out prediction for this date.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '9px', marginTop: '10px' }}>
            <span className="tnum font-heading" style={{ fontSize: '34px', fontWeight: 600, lineHeight: 1, letterSpacing: '-0.02em' }}>
              {record.predictedAQI.toFixed(1)}
            </span>
            <span style={{ fontSize: '12.5px', fontWeight: 500, color: meta?.color }}>{getAqiCategory(record.predictedAQI)}</span>
          </div>
          <div style={{ fontSize: '10.5px', color: 'var(--ink-muted)', marginTop: '3px' }}>
            {record.selectedModel || 'Selected model not reported'}
          </div>
          {horizon === 3 && (
            <p style={{ marginTop: '4px', fontSize: '10px', lineHeight: 1.45, color: 'var(--ink-faint)' }}>
              Saved 3-day model evaluation. The live t+3 policy is persistence fallback.
            </p>
          )}

          <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: 'var(--rule)', border: '1px solid var(--rule)', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ background: 'rgba(10,16,21,0.5)', padding: '7px 9px' }}>
              <div style={{ fontSize: '9.5px', color: 'var(--ink-muted)' }}>Target</div>
              <div className="tnum" style={{ fontSize: '13px', color: 'var(--ink-primary)' }}>{record.derivedActualAQI.toFixed(1)}</div>
            </div>
            <div style={{ background: 'rgba(10,16,21,0.5)', padding: '7px 9px' }}>
              <div style={{ fontSize: '9.5px', color: 'var(--ink-muted)' }}>Residual</div>
              <div className="tnum" style={{ fontSize: '13px', color: residual != null && residual > 0 ? '#d9b98d' : '#8fc7ba' }}>
                {residual == null ? '—' : `${residual > 0 ? '+' : ''}${residual.toFixed(1)}`}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px', marginTop: '9px', fontSize: '10.5px', color: 'var(--ink-muted)' }}>
            <span>Beat persistence</span>
            <span style={{ color: record.modelBeatenBaseline ? '#8fc7ba' : '#d9b98d', fontWeight: 500 }}>
              {record.modelBeatenBaseline == null ? 'not reported' : record.modelBeatenBaseline ? 'Yes' : 'No'}
            </span>
          </div>
        </>
      )}

      <div style={{ marginTop: '11px', paddingTop: '10px', borderTop: '1px solid var(--rule)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <span style={{ fontSize: '10.5px', color: 'var(--ink-muted)' }}>Frozen test metrics · t+{horizon}</span>
          {metrics && <span style={{ fontSize: '9.5px', color: 'var(--ink-faint)' }}>n = {metrics.sampleCount}</span>}
        </div>

        {metrics ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0', marginTop: '4px' }}>
              {[
                ['MAE', metrics.mae.toFixed(2)],
                ['Persistence MAE', metrics.baselineMae.toFixed(2)],
                ['RMSE', metrics.rmse.toFixed(2)],
                ['Skill vs persistence', `${metrics.improvementPct > 0 ? '+' : ''}${metrics.improvementPct.toFixed(1)}%`],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '4px 0', borderBottom: '1px solid var(--rule)', fontSize: '11px' }}>
                  <span style={{ color: 'var(--ink-muted)' }}>{label}</span>
                  <span className="tnum" style={{ color: 'var(--ink-primary)' }}>{value}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p style={{ marginTop: '4px', fontSize: '10.5px', color: 'var(--ink-faint)', lineHeight: 1.5 }}>
            {metricsError || 'Frozen evaluation metrics are unavailable.'}
          </p>
        )}
      </div>
    </section>
  );
};
