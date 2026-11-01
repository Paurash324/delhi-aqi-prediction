import React from 'react';
import { DailyAqiRecord, PollutionEpisode } from '../types';
import { getAqiCategoryMeta } from '../data/delhiAqiData';
import { Badge } from './primitives';

function formatEpisodeDate(iso: string): string {
  const parsed = new Date(`${iso}T12:00:00+05:30`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
  }).format(parsed);
}

interface RightRailProps {
  currentRecord: DailyAqiRecord | null;
  episodes?: PollutionEpisode[];
  onSelectEpisode: (date: string) => void;
  onOpenProjectPage: () => void;
}

/**
 * Episode rows display only the fields the replay endpoint returns: date, title,
 * representative AQI and category. Causal narratives that are not present in the
 * data are deliberately not rendered.
 */
export const RightRail: React.FC<RightRailProps> = ({
  currentRecord,
  episodes = [],
  onSelectEpisode,
  onOpenProjectPage,
}) => {
  return (
    <aside className="notable-episodes-panel" style={{ minWidth: 0 }}>
      <section className="editorial-glass panel" aria-label="Notable episodes">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
          <div>
            <h3 className="section-title" style={{ fontSize: '14px' }}>Notable episodes</h3>
            <p className="section-sub" style={{ marginTop: 2 }}>
              Markers in the 2025 held-out archive
            </p>
          </div>
          {episodes.length > 0 && <Badge>{episodes.length}</Badge>}
        </div>

        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column' }}>
          {episodes.length === 0 ? (
            <p style={{ fontSize: '11.5px', color: 'var(--ink-muted)', padding: '8px 0' }}>
              No episode markers are available from this service.
            </p>
          ) : (
            episodes.map(episode => {
              const isActive = currentRecord?.date === episode.date;
              const meta = getAqiCategoryMeta(episode.category);

              return (
                <button
                  key={episode.id}
                  type="button"
                  onClick={() => onSelectEpisode(episode.date)}
                  aria-current={isActive ? 'true' : undefined}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '46px minmax(0, 1fr) auto',
                    alignItems: 'center',
                    gap: '9px',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 8px 8px 9px',
                    border: 'none',
                    borderLeft: `2px solid ${isActive ? meta.color : 'transparent'}`,
                    borderTop: '1px solid var(--rule)',
                    background: isActive ? 'rgba(255,255,255,0.055)' : 'transparent',
                    color: 'inherit',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    borderRadius: isActive ? '0 6px 6px 0' : 0,
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.035)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <span className="tnum" style={{ fontSize: '10px', color: 'var(--ink-muted)' }}>
                    {formatEpisodeDate(episode.date)}
                  </span>
                  <span style={{ fontSize: '12px', color: isActive ? 'var(--ink-primary)' : 'var(--ink-secondary)', lineHeight: 1.3 }}>
                    {episode.title}
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    <span className="tnum" style={{ display: 'block', fontSize: '12.5px', fontWeight: 500, color: meta.color, lineHeight: 1.2 }}>
                      {episode.peakAQI}
                    </span>
                    <span style={{ display: 'block', fontSize: '9px', color: 'var(--ink-faint)', lineHeight: 1.3 }}>
                      {episode.category}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '9px', paddingTop: '9px', borderTop: '1px solid var(--rule)' }}>
          <span style={{ fontSize: '10px', color: 'var(--ink-faint)' }}>Reconstructed targets</span>
          <button
            type="button"
            onClick={onOpenProjectPage}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              color: 'var(--ink-muted)',
              fontSize: '10.5px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              textDecoration: 'underline',
              textUnderlineOffset: '2px',
            }}
          >
            Data sources
          </button>
        </div>
      </section>
    </aside>
  );
};
