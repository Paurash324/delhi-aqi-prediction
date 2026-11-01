import React, { useState, useEffect } from 'react';
import { X, Calendar as CalendarIcon, Check } from 'lucide-react';
import type { ReplayRangeResponse } from '../api/types';

interface DateSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  replayRange?: ReplayRangeResponse | null;
}

export const DateSelectorModal: React.FC<DateSelectorModalProps> = ({
  isOpen, onClose, selectedDate, onSelectDate, replayRange,
}) => {
  const [draftDate, setDraftDate] = useState(selectedDate);
  useEffect(() => { if (isOpen) setDraftDate(selectedDate); }, [isOpen, selectedDate]);
  if (!isOpen) return null;

  const min = replayRange?.startDate || '2025-07-01';
  const max = replayRange?.endDate || '2025-12-31';
  const outOfRange = draftDate < min || draftDate > max;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(4, 8, 12, 0.78)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="editorial-glass"
        style={{ width: '100%', maxWidth: '430px', borderRadius: '16px', padding: '20px 22px', backgroundColor: 'rgba(10, 16, 21, 0.95)' }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Select replay date"
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CalendarIcon size={16} style={{ color: 'var(--accent-teal-line)' }} />
            <div>
              <h3 className="font-heading" style={{ fontSize: '15px', fontWeight: 600 }}>Replay date</h3>
              <p style={{ fontSize: '10.5px', color: 'var(--ink-muted)', marginTop: '1px' }}>Within the held-out test range</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close date picker" style={{ background: 'none', border: 'none', color: 'var(--ink-muted)', cursor: 'pointer', padding: '4px' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ marginTop: '18px' }}>
          <label htmlFor="replay-date-input" style={{ display: 'block', fontSize: '11px', color: 'var(--ink-muted)', marginBottom: '6px' }}>
            Target date (Asia/Kolkata)
          </label>
          <input
            id="replay-date-input"
            type="date"
            value={draftDate}
            min={min}
            max={max}
            onChange={e => setDraftDate(e.target.value)}
            style={{
              width: '100%',
              color: 'var(--ink-primary)',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--surface-card-border)',
              borderRadius: '8px',
              padding: '10px 11px',
              fontSize: '13px',
              colorScheme: 'dark',
              fontFamily: 'inherit',
            }}
          />
          <p style={{ marginTop: '7px', color: outOfRange ? '#d9b98d' : 'var(--ink-muted)', fontSize: '10.5px', lineHeight: 1.5 }}>
            Available dates: {min} to {max}. Dates outside the holdout are not evaluated as replay predictions.
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '18px' }}>
          <button type="button" className="icon-button" onClick={onClose}>Cancel</button>
          <button
            type="button"
            disabled={!draftDate || outOfRange}
            onClick={() => { onSelectDate(draftDate); onClose(); }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              border: 'none',
              borderRadius: '8px',
              padding: '7px 13px',
              color: '#06110f',
              background: outOfRange ? 'rgba(63,157,144,0.35)' : '#8fc7ba',
              cursor: outOfRange ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: '11.5px',
              fontFamily: 'inherit',
            }}
          >
            <Check size={13} />
            Apply date
          </button>
        </div>
      </div>
    </div>
  );
};
