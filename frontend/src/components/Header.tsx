import React from 'react';
import { AppMode, DailyAqiRecord } from '../types';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Badge } from './primitives';

interface HeaderProps {
  currentMode: AppMode;
  selectedRecord: DailyAqiRecord | null;
  selectedHorizon: number;
  onSelectHorizon: (horizon: number) => void;
  onOpenDateSelector: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentMode,
  selectedRecord,
  selectedHorizon,
  onSelectHorizon,
  onOpenDateSelector,
}) => {
  return (
    <header
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '16px',
        zIndex: 20,
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <h1 className="font-heading" style={{ fontSize: '23px', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
            Delhi, India
          </h1>
          <Badge tone={currentMode === 'historical' ? 'neutral' : 'teal'}>
            {currentMode === 'historical' ? 'Historical replay' : 'Forecast'}
          </Badge>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--ink-muted)', marginTop: '3px' }}>
          {currentMode === 'historical'
            ? '2025 held-out replay · reconstructed daily targets'
            : 'Delhi air quality · live outlook and archive context'}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <div className="segmented" role="group" aria-label="Forecast horizon">
          {[1, 2, 3].map(h => (
            <button
              key={h}
              type="button"
              onClick={() => onSelectHorizon(h)}
              aria-pressed={selectedHorizon === h}
              title={`Forecast horizon: ${h} day${h > 1 ? 's' : ''} ahead`}
            >
              {h}-day
            </button>
          ))}
        </div>

        {currentMode === 'historical' && selectedRecord && (
          <button type="button" className="icon-button" onClick={onOpenDateSelector} style={{ height: '32px' }}>
            <CalendarIcon size={12} style={{ opacity: 0.7 }} />
            <span className="tnum">{selectedRecord.displayDate || selectedRecord.date}</span>
          </button>
        )}
      </div>
    </header>
  );
};
