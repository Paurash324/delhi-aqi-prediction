import React from 'react';
import { AppMode } from '../types';
import { BookOpen, History, Radio } from 'lucide-react';

interface SidebarProps {
  currentMode: AppMode;
  isProjectPage: boolean;
  onSelectMode: (mode: AppMode) => void;
  onOpenProjectPage: () => void;
}

interface RailButtonProps {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}

const RailButton: React.FC<RailButtonProps> = ({ active = false, label, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    aria-current={active ? 'page' : undefined}
    title={label}
    style={{
      background: active ? 'rgba(255, 255, 255, 0.09)' : 'none',
      border: 'none',
      cursor: 'pointer',
      padding: '9px',
      borderRadius: '11px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: active ? 'var(--ink-primary)' : 'rgba(255, 255, 255, 0.42)',
      transition: 'color 0.2s ease, background-color 0.2s ease',
    }}
    onMouseEnter={e => {
      e.currentTarget.style.color = 'var(--ink-primary)';
      if (!active) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
    }}
    onMouseLeave={e => {
      e.currentTarget.style.color = active ? 'var(--ink-primary)' : 'rgba(255, 255, 255, 0.42)';
      e.currentTarget.style.backgroundColor = active ? 'rgba(255, 255, 255, 0.09)' : 'transparent';
    }}
  >
    {children}
  </button>
);

export const Sidebar: React.FC<SidebarProps> = ({
  currentMode,
  isProjectPage,
  onSelectMode,
  onOpenProjectPage,
}) => {
  return (
    <aside
      className="sidebar-container editorial-glass"
      style={{
        position: 'fixed',
        left: '16px',
        top: '16px',
        bottom: '16px',
        width: '58px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: '16px',
        paddingBottom: '16px',
        borderRadius: '18px',
        zIndex: 30,
      }}
    >
      {/* Quiet Project Crest */}
      <div
        aria-hidden="true"
        style={{
          width: '34px',
          height: '34px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%' }}>
          <rect
            width="36"
            height="36"
            rx="10"
            fill="rgba(255, 255, 255, 0.05)"
            stroke="rgba(255, 255, 255, 0.1)"
            strokeWidth="1"
          />
          <clipPath id="calm-crest-clip">
            <circle cx="18" cy="18" r="10" />
          </clipPath>
          <g clipPath="url(#calm-crest-clip)">
            <path d="M 4,12 Q 11,9 18,12 T 32,12" fill="none" stroke="rgba(255, 255, 255, 0.5)" strokeWidth="1.2" />
            <path d="M 4,16 Q 11,13 18,16 T 32,16" fill="none" stroke="rgba(255, 255, 255, 0.75)" strokeWidth="1.2" />
            <path d="M 4,20 Q 11,17 18,20 T 32,20" fill="none" stroke="var(--accent-teal-line)" strokeWidth="1.4" />
            <path d="M 4,24 Q 11,21 18,24 T 32,24" fill="none" stroke="rgba(255, 255, 255, 0.5)" strokeWidth="1.2" />
          </g>
        </svg>
      </div>

      {/* Primary Views */}
      <nav
        className="sidebar-nav"
        aria-label="Sections"
        style={{
          marginTop: '26px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          alignItems: 'center',
        }}
      >
        <RailButton active={!isProjectPage && currentMode === 'live'} label="Live Forecast" onClick={() => onSelectMode('live')}>
          <Radio style={{ width: '20px', height: '20px' }} />
        </RailButton>
        <RailButton active={!isProjectPage && currentMode === 'historical'} label="Historical Replay" onClick={() => onSelectMode('historical')}>
          <History style={{ width: '20px', height: '20px' }} />
        </RailButton>
      </nav>

      {/* Secondary View */}
      <div style={{ marginTop: 'auto' }}>
        <RailButton active={isProjectPage} label="Project & data sources" onClick={onOpenProjectPage}>
          <BookOpen style={{ width: '20px', height: '20px' }} />
        </RailButton>
      </div>
    </aside>
  );
};
