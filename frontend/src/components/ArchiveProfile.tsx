import React from 'react';
import { DAILY_AQI_DATABASE, getAqiCategory, getAqiCategoryMeta } from '../data/delhiAqiData';
import { Badge } from './primitives';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface MonthBucket {
  key: string;
  label: string;
  mean: number;
  count: number;
  peak: number;
}

interface ArchiveProfileProps {
  /** Wider two-column treatment used on the Live Forecast page. */
  wide?: boolean;
}

/**
 * The bundled 2025 research archive is the only source in the app with coverage
 * beyond a single 15-day replay window. It is summarised here and kept visually
 * separate from API-backed replay values; no missing month is estimated.
 */
export const ArchiveProfile: React.FC<ArchiveProfileProps> = ({ wide = false }) => {
  const groups = new Map<string, number[]>();
  for (const record of DAILY_AQI_DATABASE) {
    const key = record.date.slice(0, 7);
    const list = groups.get(key) || [];
    list.push(record.derivedActualAQI);
    groups.set(key, list);
  }

  const buckets: MonthBucket[] = Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, values]) => ({
      key,
      label: MONTHS[Number(key.slice(5, 7)) - 1],
      mean: values.reduce((a, b) => a + b, 0) / values.length,
      count: values.length,
      peak: Math.max(...values),
    }));

  if (!buckets.length) return null;
  const maxMean = Math.max(...buckets.map(b => b.mean), 1);
  const allMeans = DAILY_AQI_DATABASE.map(r => r.derivedActualAQI);
  const archiveMean = allMeans.reduce((a, b) => a + b, 0) / allMeans.length;
  const archivePeak = Math.max(...allMeans);

  const seasonGroups = new Map<string, number[]>();
  for (const record of DAILY_AQI_DATABASE) {
    const list = seasonGroups.get(record.season) || [];
    list.push(record.derivedActualAQI);
    seasonGroups.set(record.season, list);
  }

  const chart = (
    <div
      style={{
        marginTop: wide ? '16px' : '12px',
        display: 'grid',
        gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))`,
        gap: wide ? '9px' : '6px',
        alignItems: 'end',
      }}
    >
      {buckets.map(bucket => {
        const meta = getAqiCategoryMeta(getAqiCategory(bucket.mean));
        const height = Math.max(8, (bucket.mean / maxMean) * (wide ? 118 : 54));
        return (
          <div key={bucket.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <span className="tnum" style={{ fontSize: wide ? '10.5px' : '10px', color: 'var(--ink-secondary)' }}>
              {Math.round(bucket.mean)}
            </span>
            <div
              className="archive-bar"
              title={`${bucket.label} 2025 · ${bucket.count} archived records · mean ${bucket.mean.toFixed(1)} · peak ${bucket.peak}`}
              style={{
                width: '100%',
                height: `${height}px`,
                borderRadius: '2px 2px 0 0',
                background: meta.color,
                opacity: 0.62,
              }}
            />
            <span style={{ fontSize: wide ? '10.5px' : '10px', color: 'var(--ink-muted)' }}>{bucket.label}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <section className="editorial-glass panel" aria-label="2025 archive profile">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div>
          <h3 className="section-title" style={{ fontSize: wide ? '15px' : '14px' }}>2025 archive profile</h3>
          <p className="section-sub" style={{ marginTop: 2 }}>
            Monthly mean of archived reconstructed targets
          </p>
        </div>
        <Badge tone="sand" title="Bundled research archive; reconstructed daily targets">Archive</Badge>
      </div>

      {wide ? (
        <div className="archive-wide-grid">
          <div>
            {chart}
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: '8px',
                marginTop: '10px',
                paddingTop: '9px',
                borderTop: '1px solid var(--rule)',
                fontSize: '11px',
                color: 'var(--ink-muted)',
              }}
            >
              <span>Archive mean</span>
              <span className="tnum" style={{ color: 'var(--ink-primary)', fontSize: '14px' }}>{archiveMean.toFixed(1)} AQI</span>
            </div>
          </div>

          <aside className="archive-side">
            <div className="archive-side-stat">
              <span>Recorded days</span>
              <strong className="tnum">{DAILY_AQI_DATABASE.length}</strong>
            </div>
            <div className="archive-side-stat">
              <span>Archive mean</span>
              <strong className="tnum">{archiveMean.toFixed(1)}</strong>
            </div>
            <div className="archive-side-stat">
              <span>Archive peak</span>
              <strong className="tnum">{archivePeak.toFixed(1)}</strong>
            </div>
            <div className="archive-seasons">
              <span className="archive-side-title">Seasonal means</span>
              {Array.from(seasonGroups.entries()).map(([season, values]) => {
                const average = values.reduce((a, b) => a + b, 0) / values.length;
                return (
                  <div key={season}>
                    <span>{season}</span>
                    <span className="tnum">{average.toFixed(1)}</span>
                  </div>
                );
              })}
            </div>
            <p className="archive-coverage">
              Bundled 2025 archive covering August–December. Months without archived records are omitted, not
              interpolated. This is historical context, not a live reading.
            </p>
          </aside>
        </div>
      ) : (
        <>
          {chart}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: '8px',
              marginTop: '8px',
              paddingTop: '8px',
              borderTop: '1px solid var(--rule)',
              fontSize: '11px',
              color: 'var(--ink-muted)',
            }}
          >
            <span>Archive mean</span>
            <span className="tnum" style={{ color: 'var(--ink-primary)', fontSize: '12px' }}>{archiveMean.toFixed(1)} AQI</span>
          </div>
        </>
      )}
    </section>
  );
};
