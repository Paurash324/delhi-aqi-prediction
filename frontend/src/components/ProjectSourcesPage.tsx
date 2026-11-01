import React from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CloudSun,
  Cpu,
  Database,
  ExternalLink,
  FlaskConical,
  Layers,
  Radio,
  Wind,
} from 'lucide-react';
import type {
  ExternalForecastResponse,
  LiveObservationsResponse,
  LiveStatusResponse,
} from '../api/types';
import type { ApiError } from '../api/client';
import { Badge } from './primitives';

interface ProjectSourcesPageProps {
  onBack: () => void;
  externalForecast: ExternalForecastResponse | null;
  externalForecastError: ApiError | null;
  externalForecastLoading: boolean;
  observations: LiveObservationsResponse | null;
  observationsError: ApiError | null;
  observationsLoading: boolean;
  liveStatus: LiveStatusResponse | null;
  weatherNote: string | null;
  weatherIsFallback: boolean;
}

type StatusTone = 'ok' | 'warn' | 'neutral';

interface SourceStatus {
  tone: StatusTone;
  label: string;
  detail?: string;
}

const TOC = [
  ['sources', 'Data sources'],
  ['processing', 'Processing'],
  ['models', 'Machine learning'],
  ['validation', 'Validation'],
];

const SECTION_LEAD: React.CSSProperties = {
  marginTop: '6px',
  fontSize: '13.5px',
  lineHeight: 1.65,
  color: 'var(--ink-secondary)',
  maxWidth: '68ch',
};

const SectionHeading: React.FC<{
  id: string;
  index: string;
  title: string;
  lead: string;
}> = ({ id, index, title, lead }) => (
  <div className="docs-section-head">
    <span className="docs-index tnum" aria-hidden="true">{index}</span>
    <div>
      <h2 id={id} className="font-heading">{title}</h2>
      <p style={SECTION_LEAD}>{lead}</p>
    </div>
  </div>
);

const StatusPill: React.FC<{ status: SourceStatus }> = ({ status }) => (
  <span
    className={`status-pill status-${status.tone}`}
    title={status.detail}
  >
    <span aria-hidden="true" className="status-dot" />
    {status.label}
  </span>
);

const Facts: React.FC<{ rows: Array<[string, React.ReactNode]> }> = ({ rows }) => (
  <dl className="source-facts">
    {rows.map(([label, value]) => (
      <div key={label}>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    ))}
  </dl>
);

const SourceCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  type: string;
  tone: 'neutral' | 'teal' | 'sand' | 'dashed';
  status: SourceStatus;
  summary: string;
  rows: Array<[string, React.ReactNode]>;
  link?: { href: string; label: string };
}> = ({ icon, title, type, tone, status, summary, rows, link }) => (
  <article className="source-card">
    <header className="source-card-head">
      <span className="source-icon" aria-hidden="true">{icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
          <h3 className="font-heading">{title}</h3>
          <Badge tone={tone}>{type}</Badge>
        </div>
        <p className="source-summary">{summary}</p>
      </div>
    </header>
    <StatusPill status={status} />
    <Facts rows={rows} />
    {link && (
      <a className="source-link" href={link.href} target="_blank" rel="noreferrer noopener">
        {link.label}
        <ExternalLink size={11} />
      </a>
    )}
  </article>
);

function camsStatus(
  forecast: ExternalForecastResponse | null,
  error: ApiError | null,
  isLoading: boolean
): SourceStatus {
  if (isLoading) return { tone: 'neutral', label: 'Checking provider…' };
  if (error) {
    return {
      tone: 'warn',
      label: `Provider error${error.status ? ` · HTTP ${error.status}` : ''}`,
      detail: error.detail || error.message,
    };
  }
  if (!forecast) return { tone: 'neutral', label: 'Not checked in this session' };
  if (forecast.status === 'OK' && typeof forecast.aqi === 'number') {
    return {
      tone: 'ok',
      label: `Estimate available · ${forecast.aqi} AQI`,
      detail: forecast.method_note,
    };
  }
  if (forecast.status === 'UNAVAILABLE') {
    return {
      tone: 'warn',
      label: 'Unavailable · data sufficiency not met',
      detail: forecast.message,
    };
  }
  return {
    tone: 'warn',
    label: 'Provider error',
    detail: forecast.message || forecast.reasons?.join(' '),
  };
}

function observationsStatus(
  observations: LiveObservationsResponse | null,
  error: ApiError | null,
  isLoading: boolean
): SourceStatus {
  if (isLoading) return { tone: 'neutral', label: 'Checking provider…' };
  if (error) {
    return {
      tone: 'warn',
      label: `Provider error${error.status ? ` · HTTP ${error.status}` : ''}`,
      detail: error.detail || error.message,
    };
  }
  if (!observations) return { tone: 'neutral', label: 'Not checked in this session' };
  if (observations.status === 'OK') {
    return {
      tone: 'ok',
      label: `Snapshot available · ${observations.station_count ?? 0} stations`,
      detail: `${observations.record_count ?? 0} reported rows`,
    };
  }
  if (observations.missing_credential) {
    return {
      tone: 'warn',
      label: 'Not configured · API key missing',
      detail: observations.setup || observations.message,
    };
  }
  return {
    tone: 'warn',
    label: observations.status === 'ERROR' ? 'Source error or timeout' : 'UNAVAILABLE',
    detail: observations.message || observations.reasons?.join(' '),
  };
}

function modelStatus(status: LiveStatusResponse | null): SourceStatus {
  if (!status) return { tone: 'neutral', label: 'Not checked in this session' };
  if (status.canPredict) return { tone: 'ok', label: 'Live prediction available' };
  return {
    tone: 'warn',
    label: 'Unavailable · compatible recent history missing',
    detail: status.reason,
  };
}

export const ProjectSourcesPage: React.FC<ProjectSourcesPageProps> = ({
  onBack,
  externalForecast,
  externalForecastError,
  externalForecastLoading,
  observations,
  observationsError,
  observationsLoading,
  liveStatus,
  weatherNote,
  weatherIsFallback,
}) => {
  const cams = camsStatus(externalForecast, externalForecastError, externalForecastLoading);
  const stations = observationsStatus(observations, observationsError, observationsLoading);
  const model = modelStatus(liveStatus);
  const weather: SourceStatus = weatherNote
    ? {
        tone: weatherIsFallback ? 'warn' : 'ok',
        label: weatherIsFallback ? 'Fallback sample in use' : 'Provider response loaded',
        detail: weatherNote,
      }
    : { tone: 'neutral', label: 'Not checked in this session' };

  return (
    <div className="docs-page">
      <div className="docs-hero editorial-glass">
        <div className="docs-hero-copy">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <BookOpen size={17} style={{ color: 'var(--accent-teal-line)' }} />
            <span className="docs-eyebrow">Project record</span>
            <Badge tone="sand">Educational prototype</Badge>
          </div>
          <h1 className="font-heading">Project &amp; data sources</h1>
          <p>
            Where the Delhi AQI Forecast Lab’s daily targets, features, forecasts and live
            readings come from, how they are processed, and what the deployed model can and
            cannot support.
          </p>
          <div className="docs-hero-badges">
            <Badge>Target: CPCB-method-derived AQI</Badge>
            <Badge>Archive ends 31 Dec 2025</Badge>
            <Badge tone="teal">27 model features</Badge>
          </div>
        </div>
        <button type="button" className="icon-button docs-back" onClick={onBack}>
          <ArrowLeft size={12} />
          <span>Back to dashboard</span>
        </button>
      </div>

      <div className="docs-status-strip editorial-glass" aria-label="Current integration status">
        <div className="docs-status-item">
          <span className="docs-status-label">CAMS estimate</span>
          <StatusPill status={cams} />
        </div>
        <div className="docs-status-item">
          <span className="docs-status-label">Station observations</span>
          <StatusPill status={stations} />
        </div>
        <div className="docs-status-item">
          <span className="docs-status-label">Trained model</span>
          <StatusPill status={model} />
        </div>
        <div className="docs-status-item">
          <span className="docs-status-label">Demo fixture</span>
          <StatusPill status={{ tone: 'neutral', label: '8 stations · 56 synthetic readings' }} />
        </div>
      </div>

      <div className="docs-body">
        <aside className="docs-toc" aria-label="Page contents">
          <span className="docs-toc-title">Contents</span>
          <nav>
            {TOC.map(([id, label], index) => (
              <a key={id} href={`#${id}`}>
                <span className="tnum">{String(index + 1).padStart(2, '0')}</span>
                {label}
              </a>
            ))}
          </nav>
          <p>
            The dashboard shows observations and forecasts. This page holds the supporting
            provenance and method.
          </p>
        </aside>

        <main className="docs-content">
          <section className="docs-section" aria-labelledby="sources">
            <SectionHeading
              id="sources"
              index="01"
              title="Data sources and lineage"
              lead="Six source types feed this project. They are kept separate because they have different definitions, coverage and evidentiary status. None of the synthetic or modelled values are substituted for a missing observation."
            />

            <div className="lineage-card editorial-glass-subtle">
              <div className="lineage-head">
                <Database size={15} style={{ color: 'var(--accent-teal-line)' }} />
                <span>Target series lineage</span>
              </div>
              <div className="coverage-row">
                <div className="coverage-label">
                  <span>2017–2023</span>
                  <span className="tnum">2,504 valid of 2,556 days</span>
                </div>
                <div className="coverage-track">
                  <span style={{ width: `${(2504 / 2556) * 100}%` }} />
                </div>
                <span className="coverage-note">
                  Historical hourly-AQI-derived daily targets. 52 days missing or invalid.
                </span>
              </div>
              <div className="coverage-row">
                <div className="coverage-label">
                  <span>2024–2025</span>
                  <span className="tnum">730 valid of 731 days</span>
                </div>
                <div className="coverage-track">
                  <span style={{ width: `${(730 / 731) * 100}%` }} className="recent" />
                </div>
                <span className="coverage-note">
                  Reconstructed CPCB-method-derived citywide targets. 1 day missing or invalid.
                </span>
              </div>
              <p className="lineage-footnote">
                The two target definitions are not proven equivalent. The deployed model trains
                only on the 2024–2025 reconstructed series; the 2017–2023 series is used only by
                the separate exploratory history-only experiment.
              </p>
            </div>

            <div className="source-grid">
              <SourceCard
                icon={<Database size={16} />}
                title="Historical AQI archive"
                type="Historical"
                tone="neutral"
                status={{ tone: 'neutral', label: 'Read-only research source' }}
                summary="The long historical daily target series, built by aggregating reported hourly AQI records across Delhi monitoring stations."
                rows={[
                  ['Coverage', '1 Jan 2017 – 31 Dec 2023'],
                  ['Station resources', '39 in the source pack. The deployed target file stores the citywide daily aggregate, not the per-station rows.'],
                  ['Rows / validity', '2,556 calendar days · 2,504 valid targets · 52 missing or invalid.'],
                  ['Exact file', <code key="hist-file">delhi_citywide_daily_historical_target_2017_2023.csv</code>],
                  ['Source archive', <code key="hist-zip">Delhi_CPCB_Citywide_Results_Pack_FIXED.zip</code>],
                  ['Used for', 'Exploratory history-only Ridge comparison only. Not used to train the deployed 1-day or 2-day model.'],
                  ['Limitation', 'Target definition differs from 2024–2025. No same-time overlap exists for direct hourly validation. No public URL for this archive is recorded in the project.'],
                ]}
              />

              <SourceCard
                icon={<Layers size={16} />}
                title="Recent pollutant and weather archive"
                type="Reconstructed"
                tone="sand"
                status={{ tone: 'neutral', label: 'Read-only training source' }}
                summary="Fifteen-minute pollutant and weather observations aggregated into daily citywide pollutant, weather and AQI features for 2024–2025."
                rows={[
                  ['Coverage', '1 Jan 2024 – 31 Dec 2025 · IST daily aggregation'],
                  ['Station resources', '39 in the source pack. Daily history records a median of 37.25 reporting stations and a maximum of 39.'],
                  ['Rows / validity', '731 calendar days · 730 valid targets · 1 missing or invalid.'],
                  ['Exact files', <span key="recent-files"><code>recent_citywide_daily_cpcb_method_derived_ist.csv</code><br /><code>recent_citywide_daily_pollutant_weather_features_2024_2025_ist.csv</code></span>],
                  ['Used for', 'Model training, validation and the frozen 2025 H2 held-out predictions shown in Historical Replay.'],
                  ['Limitation', 'The AQI target is a CPCB-method-derived estimate, not an independently verified official daily CPCB bulletin.'],
                ]}
              />

              <SourceCard
                icon={<CloudSun size={16} />}
                title="Open-Meteo weather"
                type="Modelled forecast"
                tone="sand"
                status={weather}
                summary="Numerical weather forecast for Delhi, used in the live weather panel and as archived weather context."
                rows={[
                  ['Coverage', 'Current conditions and a five-day daily timeline in Asia/Kolkata.'],
                  ['Variables', 'Temperature (current, daily max/min), relative humidity, precipitation sum, maximum wind speed and WMO weather code.'],
                  ['Used for', 'The weather panel. Archived weather fields also appear in Historical Replay records.'],
                  ['Fallback', 'If the provider is unreachable and no cached response exists, a fixed typical-condition sample is shown and badged “Fallback sample”. It is not an observation.'],
                  ['Limitation', 'Live wind direction and boundary-layer height are not returned by this route; they can be absent.'],
                ]}
                link={{ href: 'https://open-meteo.com/', label: 'Open-Meteo weather API' }}
              />

              <SourceCard
                icon={<Wind size={16} />}
                title="CAMS atmospheric estimate"
                type="Modelled"
                tone="sand"
                status={cams}
                summary="Open-Meteo Air Quality / CAMS Global forecast concentrations converted with the project’s CPCB breakpoint implementation."
                rows={[
                  ['Coverage', 'Forecast window for the next Delhi day; native CAMS Global field is 3-hourly on an approximately 45 km grid.'],
                  ['Pollutants', 'PM2.5, PM10, NO2, SO2, CO and ozone. NH3 and lead are not available from this provider.'],
                  ['Method', 'CPCB piecewise-linear sub-indices, with the composite taken as the maximum sub-index. Hourly timestamps other than the native 3-hourly values are provider-interpolated.'],
                  ['Status', 'Experimental and not CPCB-compliant: the 16-hour CPCB sufficiency rule cannot be demonstrated from a 3-hourly forecast source.'],
                  ['Used for', 'The live “CAMS estimate” card only. It never feeds the trained model and never replaces a station observation.'],
                  ['Limitation', 'Regional modelled grid, not a station measurement. Provider rate limits or missing pollutant values produce an explicit unavailable state.'],
                ]}
                link={{ href: 'https://open-meteo.com/en/docs/air-quality-api', label: 'Open-Meteo air quality API' }}
              />

              <SourceCard
                icon={<Radio size={16} />}
                title="Official station observations"
                type="Measured"
                tone="teal"
                status={stations}
                summary="Raw CPCB / DPCC station pollutant values published on data.gov.in, shown exactly as returned."
                rows={[
                  ['Resource', <code key="resource">3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69</code>],
                  ['Coverage', 'Current Delhi station snapshot. Each station row includes pollutant, reported minimum, maximum and average, and the source’s last-update string.'],
                  ['Integration', 'Requires the DATA_GOV_IN_API_KEY environment variable. Without it the endpoint returns UNAVAILABLE with a missing-credential state.'],
                  ['Used for', 'The Live Data tab of Station Observations. No AQI is derived, and the rows are not fed to the trained model.'],
                  ['Limitation', 'The source states no unit or averaging window, so values are labelled “units unverified”. Bare timestamps are read as IST for freshness only. Requests can time out and are reported as unavailable.'],
                ]}
                link={{ href: 'https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69', label: 'data.gov.in resource' }}
              />

              <SourceCard
                icon={<FlaskConical size={16} />}
                title="Demo Simulation"
                type="Synthetic"
                tone="dashed"
                status={{ tone: 'neutral', label: 'Deterministic fixture · always separate' }}
                summary="A fixed demonstration fixture for the station interface. It exists only to show the layout and interaction when a real feed is unavailable."
                rows={[
                  ['Contents', '8 fictitious stations · 56 deterministic synthetic readings.'],
                  ['Values', 'Pollutant values are illustrative. There is no AQI, no trained-model output and no real station measurement.'],
                  ['Used for', 'The Demo tab of Station Observations, loaded only after the user selects it.'],
                  ['Separation', 'Never merged with live rows, never counted as an observation, and rejected by the prediction path if supplied as history.'],
                  ['Limitation', 'Not evidence about Delhi air quality on any date. The snapshot timestamp is fixed and illustrative.'],
                ]}
              />
            </div>
          </section>

          <section className="docs-section" aria-labelledby="processing">
            <SectionHeading
              id="processing"
              title="Data processing and feature engineering"
              index="02"
              lead="The deployed pipeline is intentionally simple and chronological. Processing choices below are limited to what the training script, model bundle and reports actually implement."
            />

            <div className="process-grid">
              <article className="process-card">
                <span className="process-number tnum">01</span>
                <h3 className="font-heading">Daily construction</h3>
                <p>
                  Station pollutants and AQI sub-indices are evaluated with CPCB breakpoints,
                  then reduced to a citywide daily mean. Each daily row retains the number of
                  hourly values available and the number of reporting stations.
                </p>
              </article>
              <article className="process-card">
                <span className="process-number tnum">02</span>
                <h3 className="font-heading">Cleaning and invalid targets</h3>
                <p>
                  Dates are parsed and sorted, with one row retained per date. Target audits mark
                  2,504 of 2,556 historical days and 730 of 731 recent days valid. Missing or
                  invalid targets are excluded rather than interpolated or filled from another
                  source.
                </p>
              </article>
              <article className="process-card">
                <span className="process-number tnum">03</span>
                <h3 className="font-heading">Station eligibility</h3>
                <p>
                  The upstream results pack defines which half-hourly station records qualify for
                  a daily aggregate. The deployed files preserve station-count diagnostics
                  (median 37.25, maximum 39) but do not re-implement that eligibility test.
                </p>
              </article>
              <article className="process-card">
                <span className="process-number tnum">04</span>
                <h3 className="font-heading">Missing feature values</h3>
                <p>
                  The scikit-learn pipelines impute missing numeric inputs with the training
                  median and add missing-value indicators. A target day without a valid AQI value
                  is not imputed; it is omitted from training or evaluation.
                </p>
              </article>
              <article className="process-card">
                <span className="process-number tnum">05</span>
                <h3 className="font-heading">Lag and rolling features</h3>
                <p>
                  Six AQI-history features are built from the target series: today’s value, lags
                  of 1, 2, 3 and 7 days, and a seven-day rolling mean. The rolling mean requires
                  seven valid observations.
                </p>
              </article>
              <article className="process-card">
                <span className="process-number tnum">06</span>
                <h3 className="font-heading">Time and calendar encoding</h3>
                <p>
                  Recent 15-minute timestamps are documented as UTC and were converted to
                  Asia/Kolkata before daily aggregation. The historical hourly-AQI timezone is not
                  documented in the deployed files and remains unresolved. Calendar features use
                  the target date, not the forecast origin.
                </p>
              </article>
            </div>

            <div className="docs-subsection">
              <h3 className="font-heading">CPCB sub-index calculation</h3>
              <p className="docs-prose">
                Each pollutant’s sub-index is interpolated within a CPCB concentration band. The
                composite AQI is the highest sub-index among the pollutants that meet the
                availability rule.
              </p>
              <div className="formula">I<sub>p</sub> = ((I<sub>hi</sub> − I<sub>lo</sub>) / (B<sub>hi</sub> − B<sub>lo</sub>)) × (C<sub>p</sub> − B<sub>lo</sub>) + I<sub>lo</sub></div>
              <p className="docs-prose">
                <strong>Data sufficiency:</strong> the project follows CPCB’s minimum of 16
                hourly values for a sub-index and requires at least three pollutants, including a
                particulate measurement, for a composite. The CAMS card cannot satisfy the
                16-hour rule from a native 3-hourly field and is therefore labelled experimental.
              </p>
            </div>

            <div className="docs-subsection">
              <h3 className="font-heading">The 27 deployed features</h3>
              <div className="feature-composition" aria-label="Feature composition: 6 AQI history, 17 exogenous, 4 calendar">
                <span className="fc-aqi" style={{ width: `${(6 / 27) * 100}%` }} title="6 AQI-history features" />
                <span className="fc-exog" style={{ width: `${(17 / 27) * 100}%` }} title="17 pollutant, weather and coverage features" />
                <span className="fc-cal" style={{ width: `${(4 / 27) * 100}%` }} title="4 calendar features" />
              </div>
              <div className="feature-legend">
                <span><i className="fc-aqi" /> AQI history · 6</span>
                <span><i className="fc-exog" /> Pollutants, weather &amp; coverage · 17</span>
                <span><i className="fc-cal" /> Calendar · 4</span>
              </div>

              <div className="docs-table-wrap">
                <table className="data-table docs-table">
                  <thead>
                    <tr>
                      <th>Group</th>
                      <th>Count</th>
                      <th>Fields</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>AQI history</td>
                      <td className="tnum">6</td>
                      <td><code>aqi_today</code>, <code>aqi_lag1</code>, <code>aqi_lag2</code>, <code>aqi_lag3</code>, <code>aqi_lag7</code>, <code>aqi_roll7</code></td>
                    </tr>
                    <tr>
                      <td>Pollutants</td>
                      <td className="tnum">7</td>
                      <td>PM2.5, PM10, NO2, SO2, CO, ozone and NH3 daily concentrations, in their training units.</td>
                    </tr>
                    <tr>
                      <td>Weather</td>
                      <td className="tnum">9</td>
                      <td>Temperature, relative humidity, wind speed, solar radiation, pressure, vertical wind speed, wind-direction sine and cosine, and daily rainfall.</td>
                    </tr>
                    <tr>
                      <td>Coverage</td>
                      <td className="tnum">1</td>
                      <td><code>stations_with_any_features</code>: station count contributing to the daily row.</td>
                    </tr>
                    <tr>
                      <td>Calendar</td>
                      <td className="tnum">4</td>
                      <td>Target month, target day of week, and sine/cosine of target day-of-year.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="docs-section" aria-labelledby="models">
            <SectionHeading
              id="models"
              title="Machine learning methodology"
              index="03"
              lead="Model selection used a strict chronological split. The test period was untouched during selection, and the saved predictions shown in Historical Replay are frozen evaluation rows rather than fresh inference."
            />

            <div className="model-grid">
              <article className="model-card">
                <div className="model-card-head">
                  <span className="model-horizon">t+1</span>
                  <Badge tone="teal">Deployed</Badge>
                </div>
                <h3 className="font-heading">Gradient Boosting</h3>
                <p>Best validation MAE for the next-day target. Refit on all eligible 2024–2025 rows after the frozen test scores were recorded.</p>
                <div className="model-score">
                  <span className="tnum">15.78</span>
                  <span>test MAE</span>
                </div>
              </article>
              <article className="model-card">
                <div className="model-card-head">
                  <span className="model-horizon">t+2</span>
                  <Badge tone="teal">Deployed</Badge>
                </div>
                <h3 className="font-heading">Random Forest</h3>
                <p>Selected on validation MAE. The improvement over persistence is marginal, so the evaluation should be read as provisional.</p>
                <div className="model-score">
                  <span className="tnum">29.03</span>
                  <span>test MAE</span>
                </div>
              </article>
              <article className="model-card">
                <div className="model-card-head">
                  <span className="model-horizon">t+3</span>
                  <Badge tone="sand">Fallback</Badge>
                </div>
                <h3 className="font-heading">Persistence</h3>
                <p>The fitted 3-day HistGradientBoosting model did not beat persistence on the final test and is not in the live inference bundle. The live t+3 forecast stays at the latest known AQI.</p>
                <div className="model-score">
                  <span className="tnum">33.43</span>
                  <span>test MAE</span>
                </div>
              </article>
            </div>

            <div className="docs-subsection">
              <h3 className="font-heading">Chronological evaluation</h3>
              <div className="split-track" aria-label="Training, validation and test periods">
                <div className="split-train">
                  <span>Training</span>
                  <strong className="tnum">2024</strong>
                </div>
                <div className="split-val">
                  <span>Validation</span>
                  <strong className="tnum">2025 H1</strong>
                </div>
                <div className="split-test">
                  <span>Final test</span>
                  <strong className="tnum">2025 H2</strong>
                </div>
              </div>
              <p className="docs-prose">
                Training target dates: 1 Jan–31 Dec 2024. Validation: 1 Jan–30 Jun 2025.
                Final held-out test: 1 Jul–31 Dec 2025. Random K-fold was not used because it
                would leak future observations into the training folds.
              </p>
            </div>

            <div className="docs-subsection">
              <h3 className="font-heading">Frozen final-test results</h3>
              <div className="docs-table-wrap">
                <table className="data-table docs-table">
                  <thead>
                    <tr>
                      <th>Horizon</th>
                      <th>Deployed method</th>
                      <th style={{ textAlign: 'right' }}>MAE</th>
                      <th style={{ textAlign: 'right' }}>RMSE</th>
                      <th style={{ textAlign: 'right' }}>Persistence MAE</th>
                      <th style={{ textAlign: 'right' }}>Persistence RMSE</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="tnum">t+1</td>
                      <td>Gradient Boosting</td>
                      <td className="tnum" style={{ textAlign: 'right' }}>15.78</td>
                      <td className="tnum" style={{ textAlign: 'right' }}>21.89</td>
                      <td className="tnum" style={{ textAlign: 'right' }}>21.50</td>
                      <td className="tnum" style={{ textAlign: 'right' }}>29.69</td>
                    </tr>
                    <tr>
                      <td className="tnum">t+2</td>
                      <td>Random Forest</td>
                      <td className="tnum" style={{ textAlign: 'right' }}>29.03</td>
                      <td className="tnum" style={{ textAlign: 'right' }}>39.96</td>
                      <td className="tnum" style={{ textAlign: 'right' }}>30.72</td>
                      <td className="tnum" style={{ textAlign: 'right' }}>42.65</td>
                    </tr>
                    <tr>
                      <td className="tnum">t+3</td>
                      <td>Persistence fallback</td>
                      <td className="tnum" style={{ textAlign: 'right' }}>33.43</td>
                      <td className="tnum" style={{ textAlign: 'right' }}>47.65</td>
                      <td className="tnum" style={{ textAlign: 'right' }}>33.43</td>
                      <td className="tnum" style={{ textAlign: 'right' }}>47.65</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="docs-note">
                n = 184 held-out target days per horizon. For t+3 the fitted model scored MAE
                39.10 and RMSE 54.20, worse than the persistence baseline, so it is not deployed.
                Historical Replay’s t+3 view shows that fitted model’s saved evaluation rows for
                comparison; the live t+3 policy is the persistence fallback.
              </p>
            </div>

            <div className="exploratory-card">
              <div className="exploratory-head">
                <Cpu size={15} />
                <h3 className="font-heading">2021–2025 history-only Ridge experiment</h3>
                <Badge tone="sand">Not deployed</Badge>
              </div>
              <p>
                Training target dates were 2021–2024, with a final candidate refit over eligible
                2021–2025 dates. The history-only Ridge model uses six AQI-history features and
                was evaluated on the same 2025 H2 window: MAE 21.14 versus 21.50 for persistence,
                a 1.68% MAE improvement, with RMSE 29.22 versus 29.69. It was selected on 2025 H1
                validation (MAE 29.49). Because the 2017–2023 and 2024–2025 targets use different
                definitions, this cross-period comparison is exploratory and its small gain is not
                statistically conclusive. The candidate is saved separately and does not replace
                the deployed bundle.
              </p>
            </div>
          </section>

          <section className="docs-section" aria-labelledby="validation">
            <SectionHeading
              id="validation"
              title="Validation and known limitations"
              index="04"
              lead="These are constraints on interpretation, not footnotes. They apply even when a chart or forecast renders successfully."
            />

            <div className="limitation-list">
              <article>
                <AlertTriangle size={15} />
                <div>
                  <h3 className="font-heading">Two target definitions</h3>
                  <p>2017–2023 targets come from reported hourly AQI; 2024–2025 targets are reconstructed from pollutant concentrations with CPCB-style breakpoints. Their equivalence is not independently established.</p>
                </div>
              </article>
              <article>
                <AlertTriangle size={15} />
                <div>
                  <h3 className="font-heading">No independent bulletin validation</h3>
                  <p>The reconstructed daily targets have not been matched to official published daily CPCB AQI bulletins. All model scores describe agreement with the derived target, not with an official bulletin.</p>
                </div>
              </article>
              <article>
                <AlertTriangle size={15} />
                <div>
                  <h3 className="font-heading">No compatible 2026 history</h3>
                  <p>The training archive ends on 31 Dec 2025. A live 2026 prediction needs refreshed daily AQI, pollutant and weather history with the same units and aggregation. Without it the trained model reports an unavailable state instead of guessing.</p>
                </div>
              </article>
              <article>
                <AlertTriangle size={15} />
                <div>
                  <h3 className="font-heading">Live provider availability</h3>
                  <p>Open-Meteo / CAMS can be rate-limited or return insufficient pollutant coverage; data.gov.in needs a configured key and can time out. The interface reports these states directly and does not substitute another source’s number.</p>
                </div>
              </article>
              <article>
                <AlertTriangle size={15} />
                <div>
                  <h3 className="font-heading">Synthetic separation</h3>
                  <p>Demo simulation rows are fabricated, deterministic and excluded from live observations, AQI derivation and model input. They must never be read as measurements.</p>
                </div>
              </article>
            </div>

            <div className="docs-endnote">
              <BookOpen size={14} />
              <p>
                This page documents the deployed prototype. It does not alter the frozen model
                bundle, reports, datasets or training script. Where a source could not be
                verified, the page says so instead of supplying a link or value.
              </p>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};
