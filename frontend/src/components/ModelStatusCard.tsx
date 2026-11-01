import React from 'react';
import type { LiveStatusResponse, PredictResponse } from '../api/types';
import { getAqiCategory, getAqiCategoryMeta } from '../data/delhiAqiData';
import { Badge, formatDay } from './primitives';

interface ModelStatusCardProps {
  status: LiveStatusResponse | null;
  prediction: PredictResponse | null;
  horizon: number;
}

/**
 * One place for the trained model's live state. The card never substitutes the
 * CAMS estimate for a model output; when the model is unavailable it says so and
 * shows which artifact each horizon would use, so the section stays informative
 * instead of being an empty panel.
 */
export const ModelStatusCard: React.FC<ModelStatusCardProps> = ({ status, prediction, horizon }) => {
  const available = prediction?.status === 'success' && typeof prediction.predictedAQI === 'number';
  const meta = available && prediction?.predictedAQI != null
    ? getAqiCategoryMeta(getAqiCategory(prediction.predictedAQI))
    : null;

  const bundle = status?.modelBundle ?? null;
  const horizonRows = bundle?.models
    ? Object.entries(bundle.models)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([key, spec]) => ({
          horizon: key,
          model: spec.modelName ?? 'not reported',
          mae: spec.testMae,
        }))
    : [];

  return (
    <section className="editorial-glass panel" aria-label="Trained model status" data-source="trained-model" data-is-trained-model="true">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div>
          <h3 className="section-title" style={{ fontSize: '14px' }}>ML forecast</h3>
          <p className="section-sub" style={{ marginTop: 2 }}>
            Trained model · t+{horizon}
          </p>
        </div>
        <Badge tone={available ? 'teal' : 'sand'}>{available ? 'Active' : 'Standby'}</Badge>
      </div>

      {available ? (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '9px', marginTop: '12px' }}>
            <span className="tnum font-heading" style={{ fontSize: '36px', fontWeight: 600, lineHeight: 1, letterSpacing: '-0.025em' }}>
              {prediction!.predictedAQI!.toFixed(1)}
            </span>
            <span style={{ fontSize: '12.5px', fontWeight: 500, color: meta?.color }}>{meta ? getAqiCategory(prediction!.predictedAQI!) : ''}</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ink-muted)', marginTop: '4px' }}>
            {formatDay(prediction?.targetDate)}
          </div>
          {prediction?.healthAdvisory && (
            <p style={{ marginTop: '8px', fontSize: '12px', lineHeight: 1.55, color: 'var(--ink-secondary)' }}>
              {prediction.healthAdvisory}
            </p>
          )}
        </>
      ) : (
        <div style={{ marginTop: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }} title={status?.reason}>
            <span aria-hidden="true" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-sand)', flexShrink: 0 }} />
            <span style={{ fontSize: '12.5px', color: 'var(--ink-primary)' }}>Live prediction unavailable</span>
          </div>
          <p style={{ marginTop: '5px', fontSize: '11.5px', lineHeight: 1.55, color: 'var(--ink-muted)' }}>
            The model needs 27 daily features (7 AQI lags, pollutant and weather columns) up to the forecast
            origin. No value is substituted.
          </p>
        </div>
      )}

      {horizonRows.length > 0 && (
        <div style={{ marginTop: '11px', paddingTop: '10px', borderTop: '1px solid var(--rule)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
            <span style={{ fontSize: '10.5px', color: 'var(--ink-muted)' }}>Loaded artifact</span>
            {bundle?.dataEnd && (
              <span className="tnum" style={{ fontSize: '9.5px', color: 'var(--ink-faint)' }}>
                trained through {bundle.dataEnd}
              </span>
            )}
          </div>

          <div style={{ marginTop: '3px' }}>
            {horizonRows.map(row => (
              <div
                key={row.horizon}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: '4px 0',
                  borderBottom: '1px solid var(--rule)',
                  fontSize: '11px',
                  color: row.horizon === String(horizon) ? 'var(--ink-primary)' : 'var(--ink-muted)',
                }}
              >
                <span>{row.horizon}-day</span>
                <span className="tnum" style={{ display: 'inline-flex', gap: '7px' }}>
                  <span>{row.model}</span>
                  <span style={{ color: 'var(--ink-faint)' }}>
                    {row.mae == null ? '' : `MAE ${row.mae.toFixed(2)}`}
                  </span>
                </span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '4px 0', fontSize: '11px', color: horizon === 3 ? 'var(--ink-primary)' : 'var(--ink-muted)' }}>
              <span>3-day</span>
              <span className="tnum">Persistence fallback</span>
            </div>
          </div>

          {bundle?.note && (
            <p style={{ marginTop: '5px', fontSize: '9.5px', lineHeight: 1.45, color: 'var(--ink-faint)' }}>
              {bundle.note}
            </p>
          )}
        </div>
      )}
    </section>
  );
};
