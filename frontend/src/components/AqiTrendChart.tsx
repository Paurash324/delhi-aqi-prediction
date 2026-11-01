import React, { useMemo, useState } from 'react';
import { DailyAqiRecord } from '../types';
import { getAqiCategory, getAqiCategoryMeta } from '../data/delhiAqiData';

interface AqiTrendChartProps {
  records: DailyAqiRecord[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDate(iso: string): string {
  const parts = iso.split('-');
  return `${parts[2]} ${MONTHS[Number(parts[1]) - 1] || ''}`;
}

function fullDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00+05:30`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

const BANDS = [
  { from: 300, to: 400, fill: 'rgba(196, 98, 92, 0.075)' },
  { from: 200, to: 300, fill: 'rgba(200, 138, 106, 0.055)' },
  { from: 100, to: 200, fill: 'rgba(208, 178, 124, 0.045)' },
  { from: 0, to: 100, fill: 'rgba(143, 179, 154, 0.045)' },
  { from: 400, to: 500, fill: 'rgba(142, 59, 69, 0.1)' },
];

/**
 * Daily held-out values drawn as straight segments between actual points. No
 * spline, curve or interpolation is applied, so no intermediate peak is invented.
 */
export const AqiTrendChart: React.FC<AqiTrendChartProps> = ({ records, selectedDate, onSelectDate }) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const n = records.length;
  const allValues = records.flatMap(r => [r.derivedActualAQI, r.predictedAQI, r.baselineAQI]);
  const rawMax = allValues.length ? Math.max(...allValues) : 100;
  const yMax = Math.min(500, Math.max(100, Math.ceil(rawMax / 100) * 100));

  const xAt = (i: number) => (n <= 1 ? 50 : 1 + (i / (n - 1)) * 98);
  const yAt = (value: number) => 96 - (Math.min(Math.max(value, 0), yMax) / yMax) * 90;

  const linePath = (values: number[]) =>
    values.map((value, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(2)},${yAt(value).toFixed(2)}`).join(' ');

  const targetPath = useMemo(() => linePath(records.map(r => r.derivedActualAQI)), [records]);
  const modelPath = useMemo(() => linePath(records.map(r => r.predictedAQI)), [records]);
  const baselinePath = useMemo(() => linePath(records.map(r => r.baselineAQI)), [records]);

  if (!records.length) return null;

  const hoveredRecord = hovered != null ? records[hovered] : null;
  const selectedRecord = records.find(r => r.date === selectedDate) || null;
  const readout = hoveredRecord || selectedRecord;
  const readoutIndex = hovered ?? (readout ? records.findIndex(r => r.date === readout.date) : -1);
  const safeIndex = readoutIndex >= 0 ? readoutIndex : 0;
  const readoutMeta = readout ? getAqiCategoryMeta(getAqiCategory(readout.derivedActualAQI)) : null;

  const xTicks = Array.from(new Set([0, Math.round((n - 1) * 0.2), Math.round((n - 1) * 0.4), Math.round((n - 1) * 0.6), Math.round((n - 1) * 0.8), n - 1]));
  const yTicks = [100, 200, 300, 400].filter(level => level <= yMax);

  return (
    <section className="editorial-glass panel" aria-label="15-day AQI trend" style={{ paddingBottom: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
        <div>
          <h3 className="section-title">15-day AQI trend</h3>
          <p className="section-sub" style={{ marginTop: 2 }}>
            Daily held-out targets with model and persistence series
          </p>
        </div>

        {readout && (
          <div style={{ minWidth: '260px' }} aria-live="polite">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
              <span aria-hidden="true" style={{ width: '5px', height: '5px', borderRadius: '50%', background: readoutMeta?.color }} />
              <span style={{ fontSize: '11px', color: 'var(--ink-secondary)' }}>
                {fullDate(readout.date)}
              </span>
              <span style={{ fontSize: '9.5px', color: 'var(--ink-faint)' }}>{hoveredRecord ? 'hover' : 'selected'}</span>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '3px' }}>
              {[
                ['Target', readout.derivedActualAQI, '#dbe6e6'],
                ['Model', readout.predictedAQI, '#5aa79a'],
                ['Base', readout.baselineAQI, 'rgba(255,255,255,0.55)'],
              ].map(([label, value, color]) => (
                <span key={String(label)} style={{ display: 'inline-flex', alignItems: 'baseline', gap: '4px' }}>
                  <span style={{ fontSize: '9px', color: 'var(--ink-muted)' }}>{label}</span>
                  <span className="tnum" style={{ fontSize: '12px', fontWeight: 500, color: String(color) }}>
                    {Number(value).toFixed(1)}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ position: 'relative', marginTop: '12px', paddingLeft: '28px', paddingBottom: '18px' }}>
        {/* Y axis labels */}
        {yTicks.map(level => (
          <span
            key={level}
            className="tnum"
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 0,
              top: `calc(${yAt(level)}% - 6px)`,
              fontSize: '10px',
              color: 'var(--ink-faint)',
              width: '25px',
              textAlign: 'right',
            }}
          >
            {level}
          </span>
        ))}

        <div style={{ position: 'relative', height: '190px' }}>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
            role="img"
            aria-label="Line chart of daily target, model prediction and persistence AQI values"
          >
            {/* CPCB category bands */}
            {BANDS.filter(band => band.from < yMax).map(band => {
              const top = yAt(Math.min(band.to, yMax));
              const bottom = yAt(band.from);
              return <rect key={band.from} x="0" y={top} width="100" height={Math.max(bottom - top, 0)} fill={band.fill} />;
            })}

            {/* Hairline reference levels */}
            {yTicks.map(level => (
              <line
                key={level}
                x1="0"
                x2="100"
                y1={yAt(level)}
                y2={yAt(level)}
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {/* Persistence */}
            <path
              key={`base-${records[0].date}`}
              d={baselinePath}
              fill="none"
              stroke="rgba(255,255,255,0.42)"
              strokeWidth="1.3"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />

            {/* Model */}
            <path
              key={`model-${records[0].date}-${records[0].predictedAQI}`}
              className="chart-anim-line"
              d={modelPath}
              fill="none"
              stroke="#5aa79a"
              strokeWidth="1.8"
              strokeLinejoin="round"
              strokeLinecap="round"
              pathLength="1"
              vectorEffect="non-scaling-stroke"
            />

            {/* Reconstructed target */}
            <path
              key={`target-${records[0].date}-${records[0].predictedAQI}`}
              className="chart-anim-line"
              d={targetPath}
              fill="none"
              stroke="#e2ebeb"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              pathLength="1"
              vectorEffect="non-scaling-stroke"
            />

            {/* Cursor */}
            {readout && (
              <line
                x1={xAt(safeIndex)}
                x2={xAt(safeIndex)}
                y1={yAt(yMax)}
                y2={yAt(0)}
                stroke="rgba(255,255,255,0.22)"
                strokeWidth="1"
                strokeDasharray="2 2"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {/* Selection marker (HTML so it stays circular) */}
          {readout && (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: `${xAt(safeIndex)}%`,
                top: `${yAt(readout.derivedActualAQI)}%`,
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: '#f3f7f8',
                border: '2px solid #10171c',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
              }}
            />
          )}

          {/* Click / hover zones, one per day */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
            {records.map((record, i) => (
              <button
                key={record.date}
                type="button"
                aria-label={`Select ${fullDate(record.date)}`}
                aria-pressed={record.date === selectedDate}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(i)}
                onBlur={() => setHovered(null)}
                onClick={() => onSelectDate(record.date)}
                style={{
                  flex: 1,
                  height: '100%',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  borderRadius: '2px',
                }}
              />
            ))}
          </div>
        </div>

        {/* X axis labels */}
        <div style={{ position: 'relative', height: '14px', marginTop: '3px' }}>
          {xTicks.map(i => (
            <button
              key={records[i].date}
              type="button"
              onClick={() => onSelectDate(records[i].date)}
              className="tnum"
              style={{
                position: 'absolute',
                left: `${xAt(i)}%`,
                transform: 'translateX(-50%)',
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: '10px',
                color: records[i].date === selectedDate ? 'var(--ink-primary)' : 'var(--ink-faint)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              {shortDate(records[i].date)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', borderTop: '1px solid var(--rule)', paddingTop: '9px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          {[
            ['#e2ebeb', 'Target', 'solid 2px'],
            ['#5aa79a', 'Model', 'solid 2px'],
            ['rgba(255,255,255,0.42)', 'Persistence', 'dashed'],
          ].map(([color, label, style]) => (
            <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--ink-muted)' }}>
              <span
                aria-hidden="true"
                style={{
                  width: '12px',
                  height: 0,
                  borderTop: `${style === 'dashed' ? '1.5px dashed' : '2px solid'} ${color}`,
                }}
              />
              {label}
            </span>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowTable(v => !v)}
          aria-expanded={showTable}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            fontSize: '10.5px',
            color: 'var(--ink-muted)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            textDecoration: 'underline',
            textUnderlineOffset: '2px',
          }}
        >
          {showTable ? 'Hide values' : 'Values'}
        </button>
      </div>

      {showTable && (
        <div style={{ maxHeight: '190px', overflow: 'auto', marginTop: '10px' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Target</th>
                <th style={{ textAlign: 'right' }}>Model</th>
                <th style={{ textAlign: 'right' }}>Persistence</th>
                <th style={{ textAlign: 'right' }}>Error</th>
              </tr>
            </thead>
            <tbody>
              {records.map(record => (
                <tr key={record.date} style={{ background: record.date === selectedDate ? 'rgba(63,157,144,0.08)' : 'transparent' }}>
                  <td className="tnum">{shortDate(record.date)}</td>
                  <td className="tnum" style={{ textAlign: 'right' }}>{record.derivedActualAQI.toFixed(1)}</td>
                  <td className="tnum" style={{ textAlign: 'right', color: '#8fc7ba' }}>{record.predictedAQI.toFixed(1)}</td>
                  <td className="tnum" style={{ textAlign: 'right' }}>{record.baselineAQI.toFixed(1)}</td>
                  <td className="tnum" style={{ textAlign: 'right' }}>{record.error > 0 ? '+' : ''}{record.error.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
