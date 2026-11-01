import React from 'react';
import {
  CheckCircle2,
  CloudFog,
  CloudRain,
  CloudSun,
  Droplets,
  HeartPulse,
  ShieldAlert,
  Snowflake,
  ThermometerSun,
  Wind,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { AqiCategory, WeatherMetrics } from '../types';
import { getAqiCategoryMeta } from '../data/delhiAqiData';
import { adviceFor, buildWeatherTips, WeatherTipKind } from '../data/healthGuidance';
import { Badge } from './primitives';

interface HealthGuideProps {
  /** Current modelled AQI (CAMS window), or null when unavailable. */
  aqi: number | null;
  /** Category reported alongside the AQI, if any. */
  category: AqiCategory | null;
  /** Weather for the selected day; null when no weather payload is available. */
  weather: WeatherMetrics | null;
  /** Where the AQI value came from, shown on the badge tooltip. */
  sourceLabel?: string | null;
}

const TIP_ICONS: Record<WeatherTipKind, LucideIcon> = {
  heat: ThermometerSun,
  cold: Snowflake,
  rain: CloudRain,
  wind: Wind,
  humidity: Droplets,
  fog: CloudFog,
  still: CloudSun,
};

export const HealthGuide: React.FC<HealthGuideProps> = ({ aqi, category, weather, sourceLabel }) => {
  const { category: effectiveCategory, advice, isGeneral, outdoor } = adviceFor(aqi, category);
  const tips = buildWeatherTips(weather);
  const meta = effectiveCategory ? getAqiCategoryMeta(effectiveCategory) : null;

  const weatherNow = weather
    ? [
        weather.tempC != null ? `${weather.tempC.toFixed(1)}°C` : null,
        weather.humidityPct != null ? `${Math.round(weather.humidityPct)}% RH` : null,
        weather.windKmh != null ? `${weather.windKmh.toFixed(1)} km/h wind` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <section className="editorial-glass panel health-guide" aria-labelledby="health-guide-title">
      <div className="health-guide-head">
        <div style={{ minWidth: 0 }}>
          <div className="health-guide-titles">
            <HeartPulse size={15} className="health-guide-icon" aria-hidden="true" />
            <h3 className="section-title" id="health-guide-title" style={{ fontSize: '14px' }}>
              Health &amp; Activity Guide
            </h3>
          </div>
          <p className="section-sub" style={{ marginTop: 3, maxWidth: '620px' }}>
            Smart recommendations based on Delhi&rsquo;s current air quality and weather conditions.
          </p>
        </div>

        <div className="health-guide-badges">
          {effectiveCategory && meta ? (
            <Badge tone="teal" title={sourceLabel || undefined}>
              <span style={{ color: meta.color, fontWeight: 600 }}>
                AQI {aqi == null ? '—' : Math.round(aqi)}
              </span>
              <span aria-hidden="true">·</span>
              <span>{effectiveCategory}</span>
            </Badge>
          ) : (
            <Badge tone="dashed" title={sourceLabel || undefined}>
              AQI estimate unavailable
            </Badge>
          )}
          {isGeneral ? (
            <Badge tone="sand">General guidance</Badge>
          ) : (
            <Badge title="CPCB national AQI categories">CPCB category</Badge>
          )}
        </div>
      </div>

      <div className="health-guide-body" key={effectiveCategory ?? 'general'}>
      <div className="health-guide-intro">
        <p className="health-guide-headline">{advice.headline}</p>
        <span
          className="health-outdoor"
          title={
            effectiveCategory
              ? `${sourceLabel ? `${sourceLabel}. ` : ''}CPCB category ${effectiveCategory}. Modelled estimate — not an official CPCB measurement.`
              : 'No current AQI estimate is available, so outdoor guidance cannot be given.'
          }
        >
          <span
            className="health-outdoor-dot"
            style={{ background: meta?.color ?? 'var(--ink-faint)' }}
            aria-hidden="true"
          />
          <span className="health-outdoor-text">Outdoor activity</span>
          <strong style={{ color: meta?.color ?? 'var(--ink-muted)' }}>
            {outdoor ?? 'Guidance unavailable'}
          </strong>
        </span>
      </div>

      <div className="health-guide-grid">
        <article className="health-card health-card-do">
          <header className="health-card-head">
            <CheckCircle2 size={15} strokeWidth={2} aria-hidden="true" />
            <h4>What to do</h4>
          </header>
          <ul className="health-list">
            {advice.toDo
              .filter(item => item !== advice.headline)
              .map(item => (
              <li className="health-item" key={item}>
                <CheckCircle2 size={12} strokeWidth={2} aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="health-card health-card-avoid">
          <header className="health-card-head">
            <ShieldAlert size={15} strokeWidth={2} aria-hidden="true" />
            <h4>What to avoid</h4>
          </header>
          <ul className="health-list">
            {advice.toAvoid.map(item => (
              <li className="health-item" key={item}>
                <XCircle size={12} strokeWidth={2} aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <div className="health-weather">
        <div className="health-weather-top">
          <span className="health-weather-head">
            <CloudSun size={12} aria-hidden="true" />
            Weather-based advice
          </span>
          {weatherNow && <span className="health-weather-now tnum">{weatherNow}</span>}
        </div>
        {tips.length > 0 ? (
          <ul className="health-weather-items">
            {tips.map(tip => {
              const Icon = TIP_ICONS[tip.kind];
              return (
                <li className="health-weather-item" key={tip.kind}>
                  <Icon size={13} strokeWidth={1.8} aria-hidden="true" />
                  <span>{tip.text}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="health-weather-empty">
            {weather
              ? 'No weather-specific advisories apply to the current conditions.'
              : 'Weather data is unavailable, so only general air-quality guidance is shown.'}
          </p>
        )}
      </div>

      <p className="health-disclaimer">
        General recommendations based on the displayed AQI category and weather — not personalised
        medical advice, and not a guarantee of protection from air pollution.
      </p>
      </div>
    </section>
  );
};
