import React from 'react';
import { DailyAqiRecord } from '../types';
import { ApiError } from '../api/client';
import { getAqiCategoryMeta } from '../data/delhiAqiData';
import { ChevronLeft, ChevronRight, RefreshCw, AlertTriangle } from 'lucide-react';
import { Badge } from './primitives';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';

interface HeroSectionProps {
  selectedRecord: DailyAqiRecord | null;
  selectedHorizon: number;
  isLoading: boolean;
  apiError: ApiError | null;
  onRetry: () => void;
  onPrevRecord: () => void;
  onNextRecord: () => void;
}

function formatAqi(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

const StatCell: React.FC<{ label: string; value: string; color?: string; note?: string }> = ({
  label,
  value,
  color,
  note,
}) => (
  <div style={{ padding: '8px 12px 8px 0', minWidth: 0 }}>
    <div style={{ fontSize: '9.5px', color: 'var(--ink-muted)', lineHeight: 1.3 }}>{label}</div>
    <div className="tnum" style={{ fontSize: '15px', fontWeight: 500, color: color || 'var(--ink-primary)', lineHeight: 1.35 }}>
      {value}
    </div>
    {note && <div style={{ fontSize: '9px', color: 'var(--ink-faint)', lineHeight: 1.3 }}>{note}</div>}
  </div>
);

export const HeroSection: React.FC<HeroSectionProps> = ({
  selectedRecord,
  selectedHorizon,
  isLoading,
  apiError,
  onRetry,
  onPrevRecord,
  onNextRecord,
}) => {
  // Called before any early return so the hook order stays stable across states.
  const animatedAqi = useAnimatedNumber(selectedRecord ? selectedRecord.derivedActualAQI : null);

  if (apiError) {
    return (
      <section className="editorial-glass panel" style={{ alignSelf: 'start' }} aria-live="polite">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#e0b184' }}>
          <AlertTriangle size={17} />
          <h3 className="section-title" style={{ fontSize: '15px' }}>This record could not be loaded</h3>
        </div>
        <p style={{ marginTop: '7px', fontSize: '12px', color: 'var(--ink-secondary)', lineHeight: 1.55 }}>
          {apiError.detail || apiError.message}
        </p>
        <button type="button" className="icon-button" onClick={onRetry} style={{ marginTop: '12px' }}>
          <RefreshCw size={12} />
          <span>Retry</span>
        </button>
      </section>
    );
  }

  if (isLoading && !selectedRecord) {
    return (
      <section className="editorial-glass panel" aria-busy="true" style={{ minHeight: '220px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '18px',
              height: '18px',
              border: '2px solid rgba(255,255,255,0.16)',
              borderTopColor: 'var(--accent-teal)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          <span style={{ fontSize: '12.5px', color: 'var(--ink-secondary)' }}>Loading held-out record…</span>
        </div>
      </section>
    );
  }

  if (!selectedRecord) return null;

  const meta = getAqiCategoryMeta(selectedRecord.category);
  const residual = selectedRecord.predictedAQI - selectedRecord.derivedActualAQI;
  const pm25 = selectedRecord.pollutants?.find(p => p.symbol.toUpperCase().replace(/\s/g, '') === 'PM2.5')?.value
    ?? selectedRecord.pm25UgM3
    ?? null;

  return (
    <section className="hero-section" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12.5px', color: 'var(--ink-secondary)', fontWeight: 500 }}>
          {selectedRecord.dayOfWeek ? `${selectedRecord.dayOfWeek}, ` : ''}
          {selectedRecord.displayDate || selectedRecord.date}
        </span>
        <Badge tone="teal">t+{selectedHorizon}</Badge>
        <Badge title="Reconstructed with CPCB-method breakpoints">Reconstructed target</Badge>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', marginTop: '2px' }}>
        <span
          className="tnum font-heading"
          style={{
            fontSize: 'clamp(58px, 6.2vw, 82px)',
            fontWeight: 600,
            letterSpacing: '-0.035em',
            lineHeight: 1,
            color: 'var(--ink-primary)',
          }}
        >
          {formatAqi(
            animatedAqi == null
              ? selectedRecord.derivedActualAQI
              : Math.round(animatedAqi * 10) / 10,
          )}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingBottom: '4px' }}>
          <span className="font-heading" style={{ fontSize: '20px', fontWeight: 600, color: meta.color, lineHeight: 1.15 }}>
            {selectedRecord.category}
          </span>
          <span className="tnum" style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>
            {pm25 != null ? `PM2.5 ${Number(pm25.toFixed(1))} µg/m³` : 'PM2.5 not reported'}
          </span>
        </div>
      </div>

      <div
        className="hero-stats"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: '0 8px',
          marginTop: '12px',
          borderTop: '1px solid var(--rule)',
          borderBottom: '1px solid var(--rule)',
          maxWidth: '540px',
        }}
      >
        <StatCell label="Target" value={formatAqi(selectedRecord.derivedActualAQI)} />
        <StatCell label={`Model · t+${selectedHorizon}`} value={formatAqi(selectedRecord.predictedAQI)} color="#8fc7ba" />
        <StatCell label="Persistence" value={formatAqi(selectedRecord.baselineAQI)} color="var(--ink-secondary)" />
        <StatCell
          label="Residual"
          value={`${residual > 0 ? '+' : ''}${residual.toFixed(1)}`}
          color="var(--ink-primary)"
        />
      </div>

      <p
        style={{
          maxWidth: '540px',
          fontSize: '13.5px',
          lineHeight: 1.55,
          color: 'rgba(243, 247, 248, 0.9)',
          marginTop: '10px',
        }}
      >
        {selectedRecord.healthAdvisory}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
        <div className="segmented">
          <button type="button" onClick={onPrevRecord} aria-label="Previous day">
            <ChevronLeft size={13} style={{ verticalAlign: '-2px' }} /> Previous
          </button>
          <button type="button" onClick={onNextRecord} aria-label="Next day">
            Next <ChevronRight size={13} style={{ verticalAlign: '-2px' }} />
          </button>
        </div>
        <span style={{ fontSize: '10px', color: 'var(--ink-faint)' }}>2025 H2 held-out split</span>
      </div>
    </section>
  );
};
