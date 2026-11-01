/**
 * Typed adapter for the existing FastAPI backend. This module deliberately does
 * not invent data when the backend omits a field or a request fails.
 */
import type {
  ReplayRangeResponse, ReplayQueryResponse, ReplayMetricsResponse,
  LiveWeatherResponse, LiveStatusResponse, PredictRequest, PredictResponse,
  ExternalForecastResponse, ExternalOutlookResponse, LiveObservationsResponse,
  DemoObservationsResponse,
} from './types';
import type { PollutionEpisode, DailyAqiRecord, WeatherMetrics, WeatherForecastDay, AqiCategory } from '../types';
import { getAqiCategory, getAqiCategoryMeta } from '../data/delhiAqiData';

const STORAGE_KEY = 'DELHI_AQI_API_BASE_URL';
type AnyRecord = Record<string, any>;

const COMPASS_POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'] as const;

/** Convert a meteorological bearing (degrees the wind comes from) to a compass point. */
function compassFromDegrees(degrees: number | null | undefined): string | null {
  if (degrees == null || Number.isNaN(degrees)) return null;
  const normalised = ((degrees % 360) + 360) % 360;
  return COMPASS_POINTS[Math.round(normalised / 22.5) % 16] ?? null;
}

function firstDefined<T>(...values: T[]): T | undefined {
  return values.find(value => value !== undefined && value !== null);
}
function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function requiredNumber(value: unknown, field: string, endpoint: string): number {
  const n = numberOrNull(value);
  if (n === null) throw new ApiError(`Backend response is missing required field: ${field}`, { endpoint, status: 502 });
  return n;
}
function categoryFor(value: number): AqiCategory {
  return getAqiCategory(value);
}
function dayOfWeek(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('en-IN', { weekday: 'long', timeZone: 'Asia/Kolkata' }).format(d);
}
function displayDate(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? date : new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(d);
}
function emptyWeather(condition = 'Weather observations unavailable'): WeatherMetrics {
  return { tempC: null, humidityPct: null, windKmh: null, windDir: null, precipMm: null, condition, boundaryLayerHeightM: null };
}
function normalizeHistoricalWeather(raw: AnyRecord | null | undefined): WeatherMetrics {
  const w = raw || {};
  const mps = numberOrNull(firstDefined(w.wind_speed_mps, w.windSpeedMps));
  return {
    tempC: numberOrNull(firstDefined(w.temperature_c, w.tempC, w.temp_c)),
    humidityPct: numberOrNull(firstDefined(w.humidity_pct, w.humidityPct)),
    windKmh: numberOrNull(firstDefined(w.wind_speed_kmh, w.windKmh, mps === null ? null : mps * 3.6)),
    windDir: firstDefined(w.wind_dir, w.windDir, null) as string | null,
    precipMm: numberOrNull(firstDefined(w.rainfall_mm, w.precipMm, w.precip_mm)),
    condition: String(firstDefined(w.weather_desc, w.condition, 'Historical weather observation not described')),
    boundaryLayerHeightM: numberOrNull(firstDefined(w.boundary_layer_height_m, w.boundaryLayerHeightM)),
  };
}
function normalizeChartSeries(raw: any, selectedWeather: WeatherMetrics): DailyAqiRecord[] {
  const blankRecord = (date: string, actual: number, predicted: number, baseline: number): DailyAqiRecord => ({
    date,
    displayDate: displayDate(date),
    dayOfWeek: dayOfWeek(date),
    derivedActualAQI: actual,
    predictedAQI: predicted,
    baselineAQI: baseline,
    error: predicted - actual,
    absError: Math.abs(predicted - actual),
    dominantPollutant: null,
    pm25UgM3: null,
    pm10UgM3: null,
    category: categoryFor(actual),
    healthAdvisory: getAqiCategoryMeta(categoryFor(actual)).advisory,
    weather: selectedWeather,
    season: 'Historical archive',
  });

  // Actual backend contract: { dates: [], actuals: [], predictions: [], persistence: [], active_date }
  if (raw && !Array.isArray(raw) && Array.isArray(raw.dates)) {
    const dates = raw.dates as string[];
    const actuals = raw.actuals || [];
    const predictions = raw.predictions || [];
    const baselines = raw.persistence || [];
    return dates.flatMap((date: string, i: number) => {
      const a = numberOrNull(actuals[i]);
      const p = numberOrNull(predictions[i]);
      const b = numberOrNull(baselines[i]);
      return a === null || p === null || b === null ? [] : [blankRecord(date, a, p, b)];
    });
  }

  // Compatibility with a future backend returning an array of chart point objects.
  if (Array.isArray(raw)) {
    return raw.flatMap((item: AnyRecord) => {
      const date = String(item.date || item.target_date || '');
      const a = numberOrNull(firstDefined(item.actual_aqi_estimate, item.derivedActualAQI, item.derived_actual_aqi));
      const p = numberOrNull(firstDefined(item.prediction, item.predictedAQI, item.predicted_aqi));
      const b = numberOrNull(firstDefined(item.persistence_prediction, item.baselineAQI, item.baseline_aqi));
      return date && a !== null && p !== null && b !== null ? [blankRecord(date, a, p, b)] : [];
    });
  }
  return [];
}

export class ApiError extends Error {
  status: number;
  endpoint: string;
  detail?: string;
  isNetworkError: boolean;
  constructor(message: string, options: { status?: number; endpoint: string; detail?: string; isNetworkError?: boolean }) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status || 0;
    this.endpoint = options.endpoint;
    this.detail = options.detail;
    this.isNetworkError = !!options.isNetworkError;
  }
}

class DelhiAqiApiClient {
  private baseUrl: string;
  constructor() {
    let saved: string | null = null;
    try { saved = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null; } catch { /* storage may be disabled */ }
    this.baseUrl = saved ?? '';
  }
  getBaseUrl(): string { return this.baseUrl; }
  setBaseUrl(url: string): void {
    const cleaned = url.trim().replace(/\/+$/, '');
    this.baseUrl = cleaned;
    try {
      if (typeof window !== 'undefined') {
        if (!cleaned) window.localStorage.removeItem(STORAGE_KEY);
        else window.localStorage.setItem(STORAGE_KEY, cleaned);
      }
    } catch { /* in-memory URL still works when localStorage is disabled */ }
  }
  private resolveUrl(endpoint: string): string {
    const normalized = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return this.baseUrl ? `${this.baseUrl}${normalized}` : normalized;
  }
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = this.resolveUrl(endpoint);
    const headers = new Headers(options.headers || {});
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    let response: Response;
    try {
      response = await fetch(url, { ...options, headers });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network request failed';
      throw new ApiError(`Could not connect to ${url}`, { endpoint, detail: message, isNetworkError: true });
    }
    if (!response.ok) {
      let detail = '';
      try {
        const payload = await response.json();
        detail = String(payload.detail || payload.message || payload.error || JSON.stringify(payload));
      } catch {
        detail = await response.text().catch(() => 'Request failed');
      }
      throw new ApiError(`HTTP ${response.status}: ${response.statusText || 'Request failed'}`, {
        status: response.status, endpoint, detail,
      });
    }
    try { return await response.json() as T; }
    catch { throw new ApiError('Backend returned an invalid JSON response.', { status: 502, endpoint }); }
  }

  async getReplayRange(): Promise<ReplayRangeResponse> {
    const raw = await this.request<AnyRecord>('/api/replay/range');
    const test = raw.test_range || raw.testRange || {};
    const archive = raw.archive_range || raw.archiveRange || {};
    const startDate = String(firstDefined(test.min, raw.startDate, raw.start_date, archive.min, '') || '');
    const endDate = String(firstDefined(test.max, raw.endDate, raw.end_date, archive.max, '') || '');
    const defaultDate = String(firstDefined(raw.default_date, raw.defaultDate, startDate) || '');
    if (!startDate || !endDate || !defaultDate) {
      throw new ApiError('Replay range response did not include valid test-date boundaries.', { endpoint: '/api/replay/range', status: 502, detail: JSON.stringify(raw) });
    }
    return {
      startDate,
      endDate,
      totalDays: Number(firstDefined(test.count, raw.totalDays, raw.total_days, 0)),
      defaultDate,
      availableHorizons: (firstDefined(raw.supported_horizons, raw.availableHorizons, raw.available_horizons, [1, 2, 3]) as number[]),
    };
  }

  async getReplayEpisodes(): Promise<PollutionEpisode[]> {
    const raw = await this.request<AnyRecord[]>('/api/replay/episodes');
    if (!Array.isArray(raw)) throw new ApiError('Episode endpoint did not return a list.', { endpoint: '/api/replay/episodes', status: 502 });
    return raw.map((item, index) => {
      const peak = Number(firstDefined(item.typical_aqi, item.peak_aqi, item.peakAQI, NaN));
      const aqi = Number.isFinite(peak) ? peak : 0;
      return {
        id: String(item.id || `episode-${index}`),
        title: String(item.title || 'Documented episode'),
        date: String(item.date || item.start_date || ''),
        peakAQI: aqi,
        category: (item.category || getAqiCategory(aqi)) as AqiCategory,
        subtitle: String(item.description || item.subtitle || ''),
        narrative: String(item.narrative || item.details || item.description || ''),
        dominantFactor: String(item.dominant_factor || item.dominantFactor || item.tag || ''),
      };
    }).filter(ep => ep.date !== '');
  }

  async getReplayQuery(date: string, horizon = 1): Promise<ReplayQueryResponse> {
    const endpoint = `/api/replay/query?date=${encodeURIComponent(date)}&horizon=${encodeURIComponent(horizon)}`;
    const raw = await this.request<AnyRecord>(endpoint);
    if (raw.success === false) {
      throw new ApiError(String(raw.message || 'No held-out prediction is available for this date and horizon.'), {
        status: 404, endpoint, detail: String(raw.provenance_note || ''),
      });
    }
    const actual = requiredNumber(firstDefined(raw.actual_aqi_estimate, raw.derivedActualAQI, raw.derived_actual_aqi), 'actual_aqi_estimate', endpoint);
    const predicted = requiredNumber(firstDefined(raw.predicted_aqi, raw.predictedAQI), 'predicted_aqi', endpoint);
    const baseline = requiredNumber(firstDefined(raw.persistence_prediction, raw.baselineAQI, raw.baseline_aqi), 'persistence_prediction', endpoint);
    const targetDate = String(firstDefined(raw.target_date, raw.date, date));
    const weather = normalizeHistoricalWeather(raw.weather);
    const pollutantList: AnyRecord[] = Array.isArray(raw.pollutants) ? raw.pollutants : [];
    const pm25 = pollutantList.find(p => String(p.symbol || '').toUpperCase().replace(/\s/g, '') === 'PM2.5');
    const pm10 = pollutantList.find(p => String(p.symbol || '').toUpperCase().replace(/\s/g, '') === 'PM10');
    // Pass the backend's own pollutant rows through untouched. No concentration is
    // inferred for a pollutant the archive does not report on this date.
    const pollutants = pollutantList.map(item => ({
      name: String(item.name || item.symbol || 'Pollutant'),
      symbol: String(item.symbol || ''),
      value: numberOrNull(item.value),
      unit: String(item.unit || ''),
      standard24h: numberOrNull(firstDefined(item.standard_24h, item.standard24H)),
      status: item.status == null ? null : String(item.status),
    }));
    const category = String(firstDefined(raw.actual_category, raw.category, getAqiCategory(actual))) as AqiCategory;
    const modelError = numberOrNull(firstDefined(raw.absolute_model_error, raw.absError, raw.abs_error)) ?? Math.abs(predicted - actual);
    const persistenceError = numberOrNull(raw.absolute_persistence_error);
    const chartSeries = normalizeChartSeries(raw.chart_series || raw.chartSeries, weather);
    return {
      date: targetDate,
      displayDate: String(firstDefined(raw.display_date, raw.displayDate, displayDate(targetDate))),
      dayOfWeek: dayOfWeek(targetDate),
      horizon: Number(firstDefined(raw.horizon_days, raw.horizon, horizon)),
      derivedActualAQI: actual,
      predictedAQI: predicted,
      baselineAQI: baseline,
      error: predicted - actual,
      absError: modelError,
      absolutePersistenceError: persistenceError,
      modelBeatenBaseline: typeof raw.model_beaten_baseline === 'boolean' ? raw.model_beaten_baseline : null,
      selectedModel: String(firstDefined(raw.selected_model, raw.selectedModel, 'Model name not reported')),
      category,
      dominantPollutant: null,
      pm25UgM3: numberOrNull(pm25?.value),
      pm10UgM3: numberOrNull(pm10?.value),
      healthAdvisory: getAqiCategoryMeta(category).advisory,
      weather,
      pollutants,
      season: String(firstDefined(raw.season, 'Historical archive')),
      chartSeries,
      provenanceNote: String(firstDefined(raw.provenance_note, 'CPCB-method-derived estimate; not independently verified against official published daily AQI.')),
    };
  }

  async getReplayMetrics(horizonDays = 1): Promise<ReplayMetricsResponse> {
    const raw = await this.request<AnyRecord>('/api/replay/metrics');
    const rows: AnyRecord[] = Array.isArray(raw.metrics) ? raw.metrics : [];
    const testRows = rows.filter(r => String(r.split || '').includes('final_test_2025_H2'));
    // Report the frozen evaluation row for the horizon on screen, never an
    // adjacent horizon's score.
    const row =
      testRows.find(r => Number(r.horizon_days) === horizonDays) ||
      rows.find(r => Number(r.horizon_days) === horizonDays);
    if (!row) {
      throw new ApiError(`The metrics endpoint returned no ${horizonDays}-day evaluation row.`, {
        endpoint: '/api/replay/metrics',
        status: 502,
      });
    }
    const mae = requiredNumber(row.MAE ?? row.mae, 'MAE', '/api/replay/metrics');
    const baselineMae = requiredNumber(row.baseline_MAE ?? row.baselineMae ?? row.baseline_mae, 'baseline_MAE', '/api/replay/metrics');
    const rmse = requiredNumber(row.RMSE ?? row.rmse, 'RMSE', '/api/replay/metrics');
    const baselineRmse = requiredNumber(row.baseline_RMSE ?? row.baselineRmse ?? row.baseline_rmse, 'baseline_RMSE', '/api/replay/metrics');
    const metadata = raw.metadata || {};
    return {
      modelName: String(row.model || metadata.results?.['1_day']?.selected_model || 'Selected one-day model'),
      evaluationPeriod: String(row.split || raw.test_period || 'final_test_2025_H2'),
      sampleCount: Number(row.n || 0),
      mae, rmse,
      baselineMae, baselineRmse,
      improvementPct: baselineMae > 0 ? Number(((baselineMae - mae) / baselineMae * 100).toFixed(1)) : 0,
      featureImportance: Array.isArray(raw.feature_importance) ? raw.feature_importance : [],
      limitations: Array.isArray(metadata.limitations) ? metadata.limitations : [],
      day3Policy: String(raw.summary?.['3_day']?.verdict || metadata.day3_policy || 'Persistence fallback used for three-day forecasts.'),
    };
  }

  async getLiveWeather(): Promise<LiveWeatherResponse> {
    const raw = await this.request<AnyRecord>('/api/live/weather');
    const f = raw.tomorrow_forecast || raw.tomorrowForecast || {};
    const current = raw.current || {};
    // The provider returns one daily row per day. Read them all: reading only
    // `tomorrow_forecast` is what made every forecast day show one temperature.
    const timelineRows: AnyRecord[] = Array.isArray(raw.daily_timeline)
      ? raw.daily_timeline
      : Array.isArray(raw.dailyTimeline)
      ? raw.dailyTimeline
      : [];
    const baselineMs = timelineRows.length && timelineRows[0]?.date
      ? Date.parse(`${timelineRows[0].date}T00:00:00Z`)
      : NaN;
    const dailyForecast: WeatherForecastDay[] = timelineRows
      .map((row, index): WeatherForecastDay | null => {
        const date = row?.date ? String(row.date) : null;
        if (!date) return null;
        const rowMs = Date.parse(`${date}T00:00:00Z`);
        const leadDays =
          Number.isNaN(baselineMs) || Number.isNaN(rowMs)
            ? index
            : Math.round((rowMs - baselineMs) / 86_400_000);
        const dayMax = numberOrNull(firstDefined(row.temp_max, row.tempMax));
        const windDeg = numberOrNull(firstDefined(row.wind_direction_deg, row.wind_dir_deg));
        return {
          date,
          leadDays,
          tempC: dayMax,
          tempMaxC: dayMax,
          tempMinC: numberOrNull(firstDefined(row.temp_min, row.tempMin)),
          humidityPct: numberOrNull(firstDefined(row.humidity, row.humidity_pct, row.humidityPct)),
          windKmh: numberOrNull(firstDefined(row.wind_speed_kmh, row.windSpeedKmh)),
          windDeg,
          windDir: compassFromDegrees(windDeg),
          feelsLikeC: numberOrNull(firstDefined(row.feels_like_max, row.apparent_temperature_max)),
          precipMm: numberOrNull(firstDefined(row.precipitation_mm, row.precipitationMm, row.precip_mm)),
          condition: String(firstDefined(row.weather_desc, row.weatherDesc, 'Forecast condition not reported')),
          boundaryLayerHeightM: null,
        };
      })
      .filter((day): day is WeatherForecastDay => day !== null);

    const hasTomorrow = numberOrNull(firstDefined(f.temp_max, f.tempMax, f.temperature_c)) !== null;
    const tempMax = numberOrNull(firstDefined(f.temp_max, f.tempMax));
    const tempMin = numberOrNull(firstDefined(f.temp_min, f.tempMin));
    const weather: WeatherMetrics = hasTomorrow ? {
      tempC: tempMax,
      tempMaxC: tempMax,
      tempMinC: tempMin,
      humidityPct: numberOrNull(firstDefined(f.humidity, f.humidity_pct)),
      windKmh: numberOrNull(firstDefined(f.wind_speed_kmh, f.windKmh)),
      windDeg: numberOrNull(firstDefined(f.wind_direction_deg, f.wind_direction_10m_dominant)),
      windDir: compassFromDegrees(numberOrNull(firstDefined(f.wind_direction_deg, f.wind_direction_10m_dominant))),
      feelsLikeC: numberOrNull(firstDefined(f.feels_like_max, f.apparent_temperature_max)),
      pressureHpa: numberOrNull(firstDefined(current.pressure_hpa, current.surface_pressure)),
      precipMm: numberOrNull(firstDefined(f.precipitation_mm, f.precipitationMm, f.precip_mm)),
      condition: String(firstDefined(f.weather_desc, f.weatherDesc, 'Forecast condition not reported')),
      boundaryLayerHeightM: null,
    } : {
      tempC: numberOrNull(firstDefined(current.temperature_c, current.tempC)),
      humidityPct: numberOrNull(firstDefined(current.humidity_pct, current.humidityPct)),
      windKmh: numberOrNull(firstDefined(current.wind_speed_kmh, current.windKmh)),
      windDeg: numberOrNull(firstDefined(current.wind_direction_deg, current.wind_dir_deg)),
      windDir: compassFromDegrees(numberOrNull(firstDefined(current.wind_direction_deg, current.wind_dir_deg))),
      feelsLikeC: numberOrNull(firstDefined(current.feels_like_c, current.apparent_temperature)),
      pressureHpa: numberOrNull(firstDefined(current.pressure_hpa, current.surface_pressure)),
      precipMm: numberOrNull(firstDefined(f.precipitation_mm, f.precip_mm)),
      condition: String(firstDefined(current.weather_desc, current.condition, 'Current weather condition not reported')),
      boundaryLayerHeightM: null,
    };
    const source = String(firstDefined(raw.source, 'Weather source not reported'));
    const warning = raw.warning ? String(raw.warning) : null;
    return {
      location: String(firstDefined(raw.city, raw.location, 'Delhi, India')),
      forecastFor: String(firstDefined(f.date, raw.forecast_for, 'Tomorrow')),
      updatedAt: String(firstDefined(raw.timestamp, raw.updated_at, '')) || undefined,
      source, cached: Boolean(raw.cached), warning,
      weather: {
        ...weather,
        condition: source.toLowerCase().includes('offline') ? `Sample fallback: ${weather.condition}` : weather.condition,
      },
      dailyForecast,
    };
  }

  async getLiveStatus(): Promise<LiveStatusResponse> {
    const raw = await this.request<AnyRecord>('/api/live/status');
    const canPredict = Boolean(firstDefined(raw.forecast_available, raw.canPredict, raw.can_predict, false));
    const bundle = raw.model_bundle;
    return {
      modelBundle: bundle
        ? {
            loaded: Boolean(bundle.loaded),
            dataEnd: bundle.data_end ?? null,
            note: bundle.note ?? null,
            models: Object.fromEntries(
              Object.entries(bundle.models || {}).map(([key, spec]: [string, any]) => [
                key,
                {
                  modelName: spec?.model_name ?? null,
                  testMae: numberOrNull(spec?.test_MAE),
                  testBaselineMae: numberOrNull(spec?.test_baseline_MAE),
                },
              ])
            ),
          }
        : null,
      serviceStatus: canPredict ? 'active' : (raw.status_code ? 'unavailable' : String(raw.status || raw.serviceStatus || 'standby')) as LiveStatusResponse['serviceStatus'],
      canPredict,
      reason: String(firstDefined(raw.reason, raw.message, 'Live AQI compatibility has not been confirmed.')),
      requiredInputs: (firstDefined(raw.required_features, raw.required_inputs, raw.requiredInputs, []) as string[]),
      availableInputs: (firstDefined(raw.available_features, raw.available_inputs, raw.availableInputs, []) as string[]),
      missingInputs: (firstDefined(raw.missing_features, raw.missing_inputs, raw.missingInputs, []) as string[]),
      targetLabel: String(firstDefined(raw.target_label, raw.targetLabel, 'CPCB-method-derived citywide AQI estimate')),
      checkedAt: String(firstDefined(raw.current_checked_at, raw.checked_at, '') || '') || undefined,
    };
  }

  async getLiveObservations(): Promise<LiveObservationsResponse> {
    // Raw reported station values from data.gov.in. The backend never derives an
    // AQI here, and its UNAVAILABLE/ERROR states are valid HTTP 200 payloads.
    return this.request<LiveObservationsResponse>('/api/live/observations');
  }

  async getDemoObservations(): Promise<DemoObservationsResponse> {
    // Separate simulation endpoint. It is never merged with the live payload and
    // the backend rejects these rows in the prediction path.
    return this.request<DemoObservationsResponse>('/api/demo/observations');
  }

  async getExternalAqiForecast(): Promise<ExternalForecastResponse> {
    // Separate third-party source. The backend returns status UNAVAILABLE (HTTP 200)
    // when CPCB sufficiency rules are not met, so that state is handled by the UI.
    return this.request<ExternalForecastResponse>('/api/live/external-aqi-forecast');
  }

  async getExternalAqiOutlook(): Promise<ExternalOutlookResponse> {
    // Today's window plus the next three days, each an independent 24h CPCB window.
    // A day whose sufficiency rules fail is returned with aqi: null, never filled in.
    return this.request<ExternalOutlookResponse>('/api/live/external-aqi-outlook');
  }

  async postPredict(targetDate: string, horizonDays = 1): Promise<PredictResponse> {
    const payload: PredictRequest = { target_date: targetDate, horizon_days: horizonDays };
    const raw = await this.request<AnyRecord>('/api/predict', { method: 'POST', body: JSON.stringify(payload) });
    if (raw.success === false || raw.status === 'UNAVAILABLE' || raw.status === 'unavailable') {
      return {
        status: 'unavailable', targetDate: String(firstDefined(raw.target_date, targetDate)),
        horizonDays: Number(firstDefined(raw.horizon_days, horizonDays)),
        detail: String(firstDefined(raw.message, raw.detail, raw.reason, 'Compatible recent pollution inputs are unavailable.')),
      };
    }
    const result = raw.result || raw;
    const prediction = numberOrNull(firstDefined(result.predicted_aqi, result.predictedAQI, result.prediction));
    if (prediction === null) {
      return {
        status: 'unavailable', targetDate: String(firstDefined(result.date, raw.target_date, targetDate)),
        horizonDays: Number(firstDefined(result.horizon_days, raw.horizon_days, horizonDays)),
        detail: String(firstDefined(raw.message, raw.detail, 'Backend did not return a compatible AQI prediction.')),
      };
    }
    return {
      status: 'success', targetDate: String(firstDefined(result.date, raw.target_date, targetDate)),
      horizonDays: Number(firstDefined(result.horizon_days, raw.horizon_days, horizonDays)),
      predictedAQI: prediction,
      category: categoryFor(prediction),
      dominantPollutant: null,
      healthAdvisory: getAqiCategoryMeta(categoryFor(prediction)).advisory,
      detail: String(firstDefined(result.label, result.method, raw.detail, '')) || undefined,
    };
  }

  async testConnection(targetUrl?: string): Promise<{
    success: boolean; latencyMs: number; testedUrl: string;
    endpointsChecked: Array<{ endpoint: string; ok: boolean; status?: number; error?: string }>;
    error?: string;
  }> {
    const previous = this.baseUrl;
    if (targetUrl !== undefined) this.baseUrl = targetUrl.trim().replace(/\/+$/, '');
    const start = performance.now();
    const results: Array<{ endpoint: string; ok: boolean; status?: number; error?: string }> = [];
    try {
      for (const endpoint of ['/api/live/status', '/api/replay/range']) {
        try {
          await this.request(endpoint);
          results.push({ endpoint, ok: true, status: 200 });
        } catch (error: any) {
          results.push({ endpoint, ok: false, status: error?.status, error: error?.message || String(error) });
        }
      }
    } finally {
      if (targetUrl !== undefined) this.baseUrl = previous;
    }
    const success = results.some(r => r.ok);
    return {
      success,
      latencyMs: Math.round(performance.now() - start),
      testedUrl: targetUrl !== undefined ? (targetUrl || '(same origin /)') : (this.baseUrl || '(same origin /)'),
      endpointsChecked: results,
      error: success ? undefined : results.map(r => `${r.endpoint}: ${r.error || 'failed'}`).join('; '),
    };
  }
}

export const apiClient = new DelhiAqiApiClient();
