import React from 'react';

type BadgeTone = 'neutral' | 'teal' | 'sand' | 'dashed';

export const Badge: React.FC<{
  tone?: BadgeTone;
  title?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ tone = 'neutral', title, children, style }) => (
  <span
    className={`badge${tone === 'teal' ? ' badge-teal' : tone === 'sand' ? ' badge-sand' : tone === 'dashed' ? ' badge-dashed' : ''}`}
    title={title}
    style={style}
  >
    {children}
  </span>
);

export const Disclosure: React.FC<{
  label: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ label, children, style }) => (
  <details className="disclosure" style={style}>
    <summary>{label}</summary>
    <div className="disclosure-body">{children}</div>
  </details>
);

export function formatIst(iso: string | undefined | null): string {
  if (!iso) return 'not reported';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return (
    new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(parsed) + ' IST'
  );
}

export function formatDay(iso: string | undefined): string {
  if (!iso) return 'date pending';
  const parsed = new Date(`${iso}T12:00:00+05:30`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}
