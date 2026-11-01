/**
 * Delhi AQI Forecast Lab
 * Live external forecast (experimental) + historical replay of the trained models.
 * @license Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AppMode, DailyAqiRecord, PollutionEpisode, WeatherForecastDay, WeatherMetrics } from './types';
import {
  ReplayRangeResponse,
  ReplayMetricsResponse,
  LiveStatusResponse,
  ExternalForecastResponse,
  ExternalOutlookResponse,
  LiveObservationsResponse,
  ConnectionState,
} from './api/types';
import { apiClient, ApiError } from './api/client';
import { getRecordByDate, get15DayWindow, NOTABLE_EPISODES } from './data/delhiAqiData';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { HeroSection } from './components/HeroSection';
import { WeatherStrip } from './components/WeatherStrip';
import { formatDay } from './components/primitives';
import { AqiTrendChart } from './components/AqiTrendChart';
import { RightRail } from './components/RightRail';
import { DateSelectorModal } from './components/DateSelectorModal';
import { ProjectSourcesPage } from './components/ProjectSourcesPage';
import { ExternalForecastCard } from './components/ExternalForecastCard';
import { HealthGuide } from './components/HealthGuide';
import { PollutantPanel } from './components/PollutantPanel';
import { WindowAnalytics } from './components/WindowAnalytics';
import { MlForecastCard } from './components/MlForecastCard';
import { ArchiveProfile } from './components/ArchiveProfile';
import { AlertTriangle, Database, RotateCw } from 'lucide-react';

export default function App() {
  const [currentMode, setCurrentMode] = useState<AppMode>('live');
  const [selectedDate, setSelectedDate] = useState<string>('2025-11-18');
  const [selectedHorizon, setSelectedHorizon] = useState<number>(1);

  // Connection & Data state
  const [connectionState, setConnectionState] = useState<ConnectionState>('checking');
  const [currentRecord, setCurrentRecord] = useState<DailyAqiRecord | null>(null);
  const [chartRecords, setChartRecords] = useState<DailyAqiRecord[]>([]);
  const [episodes, setEpisodes] = useState<PollutionEpisode[]>([]);
  const [replayRange, setReplayRange] = useState<ReplayRangeResponse | null>(null);
  const [replayMetrics, setReplayMetrics] = useState<ReplayMetricsResponse | null>(null);
  const [replayMetricsError, setReplayMetricsError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveStatusResponse | null>(null);
  const [liveWeather, setLiveWeather] = useState<WeatherMetrics | null>(null);
  // Every daily row of the provider's weather series, so each forecast day can
  // use its own values instead of repeating the next-day row.
  const [liveWeatherDays, setLiveWeatherDays] = useState<WeatherForecastDay[]>([]);
  const [liveWeatherNote, setLiveWeatherNote] = useState<string | null>(null);
  // Retrieval time and cache flag of the weather payload, for the freshness line.
  const [weatherUpdatedAt, setWeatherUpdatedAt] = useState<string | null>(null);
  const [weatherCached, setWeatherCached] = useState<boolean>(false);

  // External (Open-Meteo CAMS) forecast — a separate source from the trained model.
  const [externalForecast, setExternalForecast] = useState<ExternalForecastResponse | null>(null);
  // Today + next three days, each its own 24h window, from the same external source.
  const [externalOutlook, setExternalOutlook] = useState<ExternalOutlookResponse | null>(null);
  const [externalForecastLoading, setExternalForecastLoading] = useState<boolean>(false);
  const [externalForecastError, setExternalForecastError] = useState<ApiError | null>(null);

  // Raw official station observations (data.gov.in). Independent of both the
  // trained model and the CAMS estimate; no AQI is derived from them.
  const [observations, setObservations] = useState<LiveObservationsResponse | null>(null);
  const [observationsLoading, setObservationsLoading] = useState<boolean>(false);
  const [observationsError, setObservationsError] = useState<ApiError | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [apiError, setApiError] = useState<ApiError | null>(null);

  // Navigation & modals
  const [isProjectPage, setIsProjectPage] = useState<boolean>(false);
  const [isDateSelectorOpen, setIsDateSelectorOpen] = useState<boolean>(false);

  // Initial connection check & bootstrap
  const checkAndConnect = useCallback(async () => {
    setIsLoading(true);
    setApiError(null);

    const testRes = await apiClient.testConnection();

    if (testRes.success) {
      setConnectionState('connected');
      try {
        const [rangeRes, episodesRes, statusRes, weatherRes] = await Promise.allSettled([
          apiClient.getReplayRange(),
          apiClient.getReplayEpisodes(),
          apiClient.getLiveStatus(),
          apiClient.getLiveWeather(),
        ]);

        let targetDate = selectedDate;
        if (rangeRes.status === 'fulfilled') {
          setReplayRange(rangeRes.value);
          if (rangeRes.value.defaultDate) {
            targetDate = rangeRes.value.defaultDate;
            setSelectedDate(targetDate);
          }
        }

        if (episodesRes.status === 'fulfilled') {
          setEpisodes(episodesRes.value);
        }

        if (statusRes.status === 'fulfilled') {
          setLiveStatus(statusRes.value);
        }

        if (weatherRes.status === 'fulfilled') {
          setLiveWeather(weatherRes.value.weather);
          setLiveWeatherDays(weatherRes.value.dailyForecast || []);
          setLiveWeatherNote([weatherRes.value.source, weatherRes.value.warning].filter(Boolean).join(' — ') || null);
          setWeatherUpdatedAt(weatherRes.value.updatedAt ?? null);
          setWeatherCached(Boolean(weatherRes.value.cached));
        }

        // Fetch query for initial date & horizon
        const queryRes = await apiClient.getReplayQuery(targetDate, selectedHorizon);
        setCurrentRecord(queryRes);
        setChartRecords(queryRes.chartSeries);
      } catch (err: any) {
        setApiError(
          err instanceof ApiError ? err : new ApiError(err.message, { endpoint: '/api/replay/query' })
        );
      }
    } else {
      // Backend is not reachable on this origin (expected in a static cloud preview)
      setConnectionState('disconnected');
    }
    setIsLoading(false);
  }, [selectedDate, selectedHorizon]);

  useEffect(() => {
    checkAndConnect();
  }, []);

  // Frozen scores are horizon-specific: reload them whenever the horizon changes
  // so a t+3 card can never display the t+1 evaluation row.
  useEffect(() => {
    if (connectionState !== 'connected') return;
    let isCancelled = false;
    setReplayMetricsError(null);
    apiClient
      .getReplayMetrics(selectedHorizon)
      .then(metrics => {
        if (isCancelled) return;
        setReplayMetrics(metrics);
        setReplayMetricsError(null);
      })
      .catch(() => {
        if (isCancelled) return;
        setReplayMetrics(null);
        setReplayMetricsError('Frozen evaluation metrics are unavailable for this horizon.');
      });
    return () => {
      isCancelled = true;
    };
  }, [connectionState, selectedHorizon]);

  // Fetch replay query whenever date or horizon changes in connected mode
  useEffect(() => {
    if (connectionState !== 'connected') {
      if (connectionState === 'offline-archive') {
        const localRec = getRecordByDate(selectedDate);
        setCurrentRecord(localRec);
        setChartRecords(get15DayWindow(selectedDate));
      }
      return;
    }

    let isCancelled = false;
    async function fetchRecord() {
      setIsLoading(true);
      setApiError(null);
      try {
        const res = await apiClient.getReplayQuery(selectedDate, selectedHorizon);
        if (!isCancelled) {
          setCurrentRecord(res);
          setChartRecords(res.chartSeries);
        }
      } catch (err: any) {
        if (!isCancelled) {
          setApiError(
            err instanceof ApiError
              ? err
              : new ApiError(err.message, { endpoint: `/api/replay/query?date=${selectedDate}&horizon=${selectedHorizon}` })
          );
        }
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }

    fetchRecord();
    return () => {
      isCancelled = true;
    };
  }, [selectedDate, selectedHorizon, connectionState]);

  // Fetch live telemetry & prediction when switching to live mode
  useEffect(() => {
    if (currentMode !== 'live' || connectionState !== 'connected') return;

    let isCancelled = false;
    async function fetchLive() {
      setIsLoading(true);
      try {
        const [statusRes, weatherRes] = await Promise.all([
          apiClient.getLiveStatus(),
          apiClient.getLiveWeather(),
        ]);
        if (isCancelled) return;
        setLiveStatus(statusRes);
        setLiveWeather(weatherRes.weather);
        setLiveWeatherDays(weatherRes.dailyForecast || []);
        setLiveWeatherNote([weatherRes.source, weatherRes.warning].filter(Boolean).join(' — ') || null);
        setWeatherUpdatedAt(weatherRes.updatedAt ?? null);
        setWeatherCached(Boolean(weatherRes.cached));
      } catch (err: any) {
        if (!isCancelled) {
          setApiError(
            err instanceof ApiError ? err : new ApiError(err.message, { endpoint: '/api/live' })
          );
        }
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }

    fetchLive();
    return () => {
      isCancelled = true;
    };
  }, [currentMode, selectedHorizon, connectionState]);

  // External forecast is fetched independently; a failure here must never affect
  // the trained-model status or Historical Replay.
  const loadExternalForecast = useCallback(async () => {
    setExternalForecastLoading(true);
    setExternalForecastError(null);

    const [forecastRes, outlookRes] = await Promise.allSettled([
      apiClient.getExternalAqiForecast(),
      apiClient.getExternalAqiOutlook(),
    ]);

    setExternalForecast(forecastRes.status === 'fulfilled' ? forecastRes.value : null);
    setExternalOutlook(outlookRes.status === 'fulfilled' ? outlookRes.value : null);

    // The two external requests are independent: one usable payload is enough to
    // render the card, so a hard error is only surfaced when both failed.
    if (forecastRes.status === 'rejected' && outlookRes.status === 'rejected') {
      const err = forecastRes.reason;
      setExternalForecastError(
        err instanceof ApiError
          ? err
          : new ApiError(err?.message || 'External forecast request failed', {
              endpoint: '/api/live/external-aqi-forecast',
            })
      );
    }

    setExternalForecastLoading(false);
  }, []);

  // Official station observations. A failure here must not affect the CAMS card,
  // the trained-model status, or Historical Replay.
  const loadObservations = useCallback(async () => {
    setObservationsLoading(true);
    setObservationsError(null);
    try {
      const res = await apiClient.getLiveObservations();
      setObservations(res);
    } catch (err: any) {
      setObservations(null);
      setObservationsError(
        err instanceof ApiError
          ? err
          : new ApiError(err.message, { endpoint: '/api/live/observations' })
      );
    } finally {
      setObservationsLoading(false);
    }
  }, []);

  // Fetch the external modelled forecast only while Live Forecast is on screen.
  useEffect(() => {
    if (currentMode !== 'live' || connectionState !== 'connected') return;
    loadExternalForecast();
  }, [currentMode, connectionState, loadExternalForecast]);

  useEffect(() => {
    if (currentMode !== 'live' || connectionState !== 'connected') return;
    loadObservations();
  }, [currentMode, connectionState, loadObservations]);

  // Explicit user action to view the offline research archive
  const handleLoadOfflineArchive = () => {
    setConnectionState('offline-archive');
    setApiError(null);
    const rec = getRecordByDate(selectedDate);
    setCurrentRecord(rec);
    setChartRecords(get15DayWindow(selectedDate));
    setEpisodes(NOTABLE_EPISODES);
    setReplayMetrics(null);
    setIsLoading(false);
  };

  // Step through actual dates in the backend's held-out test range.
  const shiftSelectedDate = (deltaDays: number) => {
    const current = new Date(`${selectedDate}T00:00:00Z`);
    if (Number.isNaN(current.getTime())) return;
    current.setUTCDate(current.getUTCDate() + deltaDays);
    const next = current.toISOString().slice(0, 10);
    if (replayRange && (next < replayRange.startDate || next > replayRange.endDate)) return;
    setSelectedDate(next);
  };

  const handlePrevRecord = () => shiftSelectedDate(-1);
  const handleNextRecord = () => shiftSelectedDate(1);

  const handleSelectEpisode = (date: string) => {
    setCurrentMode('historical');
    setSelectedDate(date);
  };

  const isLive = currentMode === 'live';
  // Prefer today's modelled window for the page atmosphere, then the next-day
  // estimate, then whatever historical record is loaded.
  const externalToday = externalOutlook?.days.find(day => day.lead_days === 0) ?? null;
  // The guide follows the same displayed AQI as the panel, and falls back to the
  // next-day estimate only when no current window was returned.
  const guideAqi = externalToday?.aqi ?? externalForecast?.aqi ?? null;
  const guideCategory = externalToday?.category ?? externalForecast?.category ?? null;
  const currentCategory = isLive
    ? externalToday?.category ?? externalForecast?.category ?? currentRecord?.category ?? 'neutral'
    : currentRecord
    ? currentRecord.category
    : 'neutral';

  const weatherSource = liveWeatherNote || 'Open-Meteo';
  const weatherIsFallback = /offline|fallback|simulated/i.test(weatherSource);
  // Day 1 -> the first forecast row, day 2 -> the second, day 3 -> the third.
  // Falls back to the single reported day only when the provider sends no series.
  const liveForecastDay =
    liveWeatherDays.find(day => day.leadDays === selectedHorizon) ?? null;

  return (
    <div style={{ position: 'relative', minHeight: '100vh', width: '100%' }}>
      {/* 1. Atmospheric Photographic Stage */}
      <div className="stage-background" aria-hidden="true">
        <div className="stage-photo" />
        <div className={`stage-atmosphere category-${currentCategory.toLowerCase().replace(/\s+/g, '-')}`} />
        <div className="stage-vignette" />
      </div>

      {/* 2. Navigation */}
      <Sidebar
        currentMode={currentMode}
        isProjectPage={isProjectPage}
        onSelectMode={mode => {
          setIsProjectPage(false);
          setCurrentMode(mode);
        }}
        onOpenProjectPage={() => setIsProjectPage(true)}
      />

      {/* 3. Main Wrapper */}
      <div
        className="main-wrapper"
        style={{
          position: 'relative',
          zIndex: 10,
          marginLeft: '76px',
          padding: '20px 30px 44px',
          maxWidth: '1560px',
        }}
      >
        {isProjectPage ? (
          <ProjectSourcesPage
            onBack={() => setIsProjectPage(false)}
            externalForecast={externalForecast}
            externalForecastError={externalForecastError}
            externalForecastLoading={externalForecastLoading}
            observations={observations}
            observationsError={observationsError}
            observationsLoading={observationsLoading}
            liveStatus={liveStatus}
            weatherNote={liveWeatherNote}
            weatherIsFallback={weatherIsFallback}
          />
        ) : (
          <>
        <Header
          currentMode={currentMode}
          selectedRecord={currentRecord}
          selectedHorizon={selectedHorizon}
          onSelectHorizon={setSelectedHorizon}
          onOpenDateSelector={() => setIsDateSelectorOpen(true)}
        />

        {/* Backend unreachable notice (static preview) */}
        {connectionState === 'disconnected' && !currentRecord && (
          <div className="editorial-glass panel" style={{ marginBottom: '16px', borderColor: 'rgba(201, 161, 112, 0.34)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', color: '#e0b184' }}>
              <AlertTriangle size={17} />
              <h3 className="font-heading" style={{ fontSize: '15px', fontWeight: 600 }}>
                Forecast service not reachable
              </h3>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--ink-secondary)', marginTop: '6px', lineHeight: 1.55, maxWidth: '680px' }}>
              This preview cannot reach the local forecasting API. The 2025 research archive is still available offline.
            </p>
            <button
              type="button"
              onClick={handleLoadOfflineArchive}
              style={{
                marginTop: '11px',
                background: 'var(--accent-teal-deep)',
                border: 'none',
                borderRadius: '9px',
                padding: '7px 13px',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontFamily: 'inherit',
              }}
            >
              <Database size={13} />
              <span>Browse offline archive</span>
            </button>
          </div>
        )}

        {connectionState === 'offline-archive' && (
          <div className="editorial-glass panel" style={{ marginBottom: '16px', borderColor: 'rgba(201, 161, 112, 0.34)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', color: '#e0b184' }}>
              <Database size={16} />
              <h3 className="font-heading" style={{ fontSize: '14px', fontWeight: 600 }}>
                Offline illustrative sample
              </h3>
            </div>
            <p style={{ fontSize: '11.5px', color: 'var(--ink-secondary)', marginTop: '5px', lineHeight: 1.55, maxWidth: '720px' }}>
              These rows are a bundled sample kept for preview. They come from a separate dataset and are not
              the backend&rsquo;s frozen 2025 H2 replay targets, so a date can show a different AQI here than in the
              replay view. They are never merged with backend records.
            </p>
          </div>
        )}

        {isLive ? (
          /* ---------------- Live Forecast ---------------- */
          <div className="live-column">
            {apiError && (
              <div
                className="editorial-glass panel"
                style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '10px 14px', marginBottom: '14px', flexWrap: 'wrap' }}
              >
                <span style={{ fontSize: '12px', color: '#e0b184' }}>
                  {apiError.status ? `Request failed (HTTP ${apiError.status}). ` : 'Request failed. '}
                  The previous record remains on screen.
                </span>
                <button type="button" className="icon-button" onClick={checkAndConnect}>
                  <RotateCw size={11} />
                  <span>Retry</span>
                </button>
              </div>
            )}

            <div className="live-layout">
              <div className="live-forecast">
                <ExternalForecastCard
                  forecast={externalForecast}
                  outlook={externalOutlook}
                  horizon={selectedHorizon}
                  isLoading={externalForecastLoading}
                  error={externalForecastError}
                  onRetry={loadExternalForecast}
                  onSelectHorizon={setSelectedHorizon}
                />
              </div>

              <div className="live-weather">
                {liveWeather ? (
                  <WeatherStrip
                    // The selected day supplies its own high/low/humidity/wind; fields the
                    // daily block does not report (surface pressure) come from current.
                    weather={{ ...liveWeather, ...(liveForecastDay ?? {}) }}
                    isLiveForecast
                    sourceLabel={weatherIsFallback ? 'Fallback' : 'Open-Meteo'}
                    isFallback={weatherIsFallback}
                    sourceDetail={liveWeatherNote}
                    forecastDays={liveWeatherDays}
                    horizon={selectedHorizon}
                    dateLabel={liveForecastDay?.date ? formatDay(liveForecastDay.date) : null}
                    updatedAt={weatherUpdatedAt}
                    cached={weatherCached}
                  />
                ) : (
                  <div className="editorial-glass panel" aria-busy={isLoading} style={{ fontSize: '11.5px', color: 'var(--ink-muted)' }}>
                    {isLoading ? 'Loading current weather…' : 'Weather data is currently unavailable.'}
                  </div>
                )}
              </div>

              <div className="live-guide">
                <HealthGuide
                  aqi={guideAqi}
                  category={guideCategory}
                  weather={liveWeather ? { ...liveWeather, ...(liveForecastDay ?? {}) } : null}
                  sourceLabel={
                    externalToday
                      ? 'CAMS-modelled current window'
                      : externalForecast
                      ? 'CAMS-modelled next-day window'
                      : null
                  }
                />
              </div>
            </div>
          </div>
        ) : (
          /* ---------------- Historical Replay ---------------- */
          <div
            className="dashboard-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) 336px',
              gap: '18px',
              alignItems: 'start',
            }}
          >
            <div className="hist-main">
              <div className="hero-split">
                <HeroSection
                  selectedRecord={currentRecord}
                  selectedHorizon={selectedHorizon}
                  isLoading={isLoading}
                  apiError={apiError}
                  onRetry={checkAndConnect}
                  onPrevRecord={handlePrevRecord}
                  onNextRecord={handleNextRecord}
                />

                {currentRecord ? (
                  <WeatherStrip
                    weather={currentRecord.weather}
                    isLiveForecast={false}
                    sourceLabel="Recorded"
                  />
                ) : (
                  <div />
                )}
              </div>

              {chartRecords.length > 0 && (
                <AqiTrendChart
                  records={chartRecords}
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                />
              )}

              <div className="analytics-split">
                <PollutantPanel
                  pollutants={currentRecord?.pollutants}
                  pm25UgM3={currentRecord?.pm25UgM3}
                  pm10UgM3={currentRecord?.pm10UgM3}
                  dateLabel={currentRecord?.displayDate}
                />
                <WindowAnalytics records={chartRecords} horizon={selectedHorizon} />
              </div>
            </div>

            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <RightRail
                currentRecord={currentRecord}
                episodes={episodes}
                onSelectEpisode={handleSelectEpisode}
                onOpenProjectPage={() => setIsProjectPage(true)}
              />
              <MlForecastCard
                record={currentRecord}
                metrics={replayMetrics}
                metricsError={replayMetricsError}
                horizon={selectedHorizon}
              />
              <ArchiveProfile />
            </div>
          </div>
        )}
          </>
        )}
      </div>

      {/* Modal */}
      <DateSelectorModal
        isOpen={isDateSelectorOpen}
        onClose={() => setIsDateSelectorOpen(false)}
        selectedDate={selectedDate}
        replayRange={replayRange}
        onSelectDate={setSelectedDate}
      />
    </div>
  );
}
