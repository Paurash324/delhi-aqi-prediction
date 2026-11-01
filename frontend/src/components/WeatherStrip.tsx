import React from 'react';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Gauge,
  Sun,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import { WeatherForecastDay, WeatherMetrics } from '../types';
import { formatIst } from './primitives';

interface WeatherStripProps {
  weather: WeatherMetrics;
  isLiveForecast?: boolean;
  /** Short provider label, e.g. "Open-Meteo" or "Recorded observation". */
  sourceLabel?: string;
  /** True when the backend served an offline fallback rather than a live fetch. */
  isFallback?: boolean;
  /** Full provider string for the title/tooltip. */
  sourceDetail?: string | null;
  /** The provider's whole daily series; each day renders its own values. */
  forecastDays?: WeatherForecastDay[];
  /** Selected forecast horizon (1-3), used only to highlight its day. */
  horizon?: number;
  /** Date of the day whose values are shown as the headline temperature. */
  dateLabel?: string | null;
  /** When the provider payload was retrieved, for the freshness line. */
  updatedAt?: string | null;
  /** True when the API served this payload from its own cache. */
  cached?: boolean;
}

const COMPASS_POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

function compassFromDegrees(degrees: number | null | undefined): string | null {
  if (degrees == null || Number.isNaN(degrees)) return null;
  const normalised = ((degrees % 360) + 360) % 360;
  return COMPASS_POINTS[Math.round(normalised / 22.5) % 16] ?? null;
}

/** Pick an icon that matches the provider's WMO condition text. */
function iconFor(condition: string): LucideIcon {
  const text = condition.toLowerCase();
  if (/thunder|hail/.test(text)) return CloudLightning;
  if (/snow|sleet/.test(text)) return CloudSnow;
  if (/drizzle/.test(text)) return CloudDrizzle;
  if (/rain|shower/.test(text)) return CloudRain;
  if (/fog|mist|haze/.test(text)) return CloudFog;
  if (/part/.test(text)) return CloudSun;
  if (/overcast|cloudy/.test(text)) return Cloud;
  if (/clear|sunny/.test(text)) return Sun;
  return CloudSun;
}

function conditionText(condition: string): string {
  return /not described/i.test(condition) ? 'Recorded conditions' : condition;
}

// Keep one decimal: rounding to whole degrees turned 27.5/27.7/27.9 into three
// identical readings, which is exactly what this panel must not do.
function tempText(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function dayLabel(leadDays: number): string {
  if (leadDays <= 0) return 'Today';
  if (leadDays === 1) return 'Tomorrow';
  return `+${leadDays} Days`;
}

function freshness(updatedAt?: string | null): { label: string; stale: boolean } | null {
  if (!updatedAt) return null;
  const parsed = Date.parse(updatedAt);
  if (Number.isNaN(parsed)) return null;
  const minutes = Math.max(0, Math.round((Date.now() - parsed) / 60000));
  const stale = minutes > 90;
  const label =
    minutes < 1 ? 'updated just now' : minutes < 60 ? `updated ${minutes} min ago` : `updated ${Math.round(minutes / 60)} h ago`;
  return { label, stale };
}

export const WeatherStrip: React.FC<WeatherStripProps> = ({
  weather,
  isLiveForecast = false,
  sourceLabel,
  isFallback = false,
  sourceDetail,
  forecastDays,
  horizon,
  dateLabel,
  updatedAt,
  cached,
}) => {
  const condition = conditionText(weather.condition);
  const HeadIcon = iconFor(weather.condition);
  const windDeg = weather.windDeg ?? null;
  const windDir = weather.windDir ?? compassFromDegrees(windDeg);
  const rotation = windDeg ?? null;
  const temperatureLabel = isLiveForecast
    ? weather.tempMaxC != null
      ? 'Forecast high'
      : 'Temperature'
    : 'Recorded temperature';
  // Today, tomorrow and the day after: one card per real daily row, in order.
  const days = (forecastDays || [])
    .filter(day => Number.isFinite(day.leadDays) && day.leadDays >= 0 && day.leadDays <= 2)
    .sort((a, b) => a.leadDays - b.leadDays)
    .slice(0, 3);
  const fresh = freshness(updatedAt);

  return (
    <section
      className="weather-panel"
      aria-label="Weather intelligence"
      data-source={isLiveForecast ? 'open-meteo' : 'archive-weather'}
      title={sourceDetail || sourceLabel || undefined}
    >
      <div className="weather-panel-photo" aria-hidden="true" />
      <div className="weather-panel-glow" aria-hidden="true" />

      <div className="weather-panel-body">
        <header className="wx-head">
          <div style={{ minWidth: 0 }}>
            <div className="wx-badge-row">
              <span className={`wx-badge${isFallback ? ' wx-badge-warn' : ''}`}>
                {isFallback ? 'Fallback sample' : sourceLabel || (isLiveForecast ? 'Open-Meteo' : 'Recorded')}
              </span>
              <span className="wx-loc">Delhi, India</span>
            </div>
            <h3 className="wx-title">Weather Intelligence</h3>
            <p className="wx-sub">
              {condition}
              {dateLabel ? ` · ${dateLabel}` : ''}
            </p>
          </div>
          <HeadIcon size={26} strokeWidth={1.5} className="wx-head-icon" aria-hidden="true" />
        </header>

        <div className="wx-now">
          <div className="wx-temp-row">
            <span className="wx-temp tnum font-heading">{tempText(weather.tempC)}</span>
            <span className="wx-unit">°C</span>
          </div>
          <div className="wx-temp-meta">
            <span className="wx-temp-label">{temperatureLabel}</span>
            {weather.feelsLikeC != null ? (
              <span className="tnum">Feels like {tempText(weather.feelsLikeC)}°</span>
            ) : (
              <span className="wx-unavailable">Feels like unavailable</span>
            )}
            {weather.tempMinC != null && <span className="tnum">Low {tempText(weather.tempMinC)}°C</span>}
          </div>
        </div>

        <div className="wx-metrics">
          <div className="wx-metric">
            <span className="wx-metric-icon" aria-hidden="true">
              <Droplets size={14} />
            </span>
            <span className="wx-metric-label">Humidity</span>
            <span className="wx-metric-value tnum">
              {weather.humidityPct == null ? '—' : `${Math.round(weather.humidityPct)}%`}
            </span>
            <span className="wx-metric-sub">{weather.humidityPct == null ? 'Not reported' : 'Mean for the day'}</span>
          </div>

          <div className="wx-metric">
            <span className="wx-metric-icon" aria-hidden="true">
              {rotation != null ? (
                <svg width="14" height="14" viewBox="0 0 16 16" style={{ transform: `rotate(${rotation}deg)` }}>
                  <path d="M8 2 L11 12 L8 10 L5 12 Z" fill="currentColor" />
                </svg>
              ) : (
                <Wind size={14} />
              )}
            </span>
            <span className="wx-metric-label">Wind</span>
            <span className="wx-metric-value tnum">
              {weather.windKmh == null ? '—' : `${weather.windKmh.toFixed(1)} km/h`}
            </span>
            <span className="wx-metric-sub">
              {windDir ? `From ${windDir}` : 'Direction not reported'}
            </span>
          </div>

          <div className="wx-metric">
            <span className="wx-metric-icon" aria-hidden="true">
              <Gauge size={14} />
            </span>
            <span className="wx-metric-label">Pressure</span>
            <span className="wx-metric-value tnum">
              {weather.pressureHpa == null ? '—' : `${Math.round(weather.pressureHpa)} hPa`}
            </span>
            <span className="wx-metric-sub">
              {weather.pressureHpa == null ? 'Not reported' : 'Current, surface'}
            </span>
          </div>
        </div>

        {days.length > 0 && (
          <div className="wx-forecast" role="list" aria-label="Daily forecast">
            {days.map(day => {
              const DayIcon = iconFor(day.condition);
              const active = day.leadDays === horizon;
              return (
                <div
                  key={day.date ?? day.leadDays}
                  className="wx-day"
                  role="listitem"
                  data-active={active ? 'true' : 'false'}
                  aria-current={active ? 'date' : undefined}
                  title={`${day.date ?? 'date not reported'} · ${conditionText(day.condition)}`}
                >
                  <span className="wx-day-name">{dayLabel(day.leadDays)}</span>
                  <DayIcon size={20} strokeWidth={1.7} className="wx-day-icon" aria-hidden="true" />
                  <span className="wx-day-temps">
                    <span className="wx-day-max tnum font-heading">{tempText(day.tempMaxC)}°</span>
                    <span className="wx-day-min tnum">{tempText(day.tempMinC)}°</span>
                  </span>
                  <span className="wx-day-cond">{conditionText(day.condition)}</span>
                </div>
              );
            })}
          </div>
        )}

        <footer className="wx-foot">
          <svg className="wx-wave" viewBox="0 0 400 32" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="wx-wave-stroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="rgba(80, 230, 240, 0)" />
                <stop offset="45%" stopColor="rgba(96, 232, 242, 0.75)" />
                <stop offset="100%" stopColor="rgba(47, 212, 196, 0.3)" />
              </linearGradient>
            </defs>
            <path
              d="M0 24 C 50 10, 90 30, 140 20 C 190 10, 230 28, 280 18 C 330 8, 365 22, 400 14"
              fill="none"
              stroke="url(#wx-wave-stroke)"
              strokeWidth="1.4"
            />
            <path
              d="M0 30 C 60 18, 100 34, 150 26 C 205 17, 250 33, 300 24 C 345 16, 375 26, 400 22"
              fill="none"
              stroke="rgba(120, 226, 236, 0.26)"
              strokeWidth="1"
            />
          </svg>
          <div className="wx-foot-row">
            <span>
              Weather data by <strong>Open-Meteo</strong>
            </span>
            <span className="tnum">{updatedAt ? formatIst(updatedAt) : 'timestamp not reported'}</span>
          </div>
          <div className="wx-foot-row">
            {fresh ? (
              <span className={fresh.stale ? 'wx-stale' : 'wx-fresh'}>
                {fresh.stale ? 'Stale · ' : 'Fresh · '}
                {fresh.label}
              </span>
            ) : (
              <span>Freshness not reported</span>
            )}
            <span>
              {isFallback
                ? 'Simulated fallback — not live data'
                : cached
                ? 'Served from server cache'
                : 'Live API response'}
            </span>
          </div>
        </footer>
      </div>
    </section>
  );
};
