/** API contracts normalized from the existing FastAPI backend. */
import type { AqiCategory, WeatherMetrics, WeatherForecastDay, DailyAqiRecord, PollutionEpisode } from '../types';

export interface ReplayRangeResponse {
  startDate: string;
  endDate: string;
  totalDays: number;
  defaultDate: string;
  availableHorizons: number[];
}

export interface ReplayQueryResponse extends DailyAqiRecord {
  chartSeries: DailyAqiRecord[];
  selectedModel: string;
  absolutePersistenceError: number | null;
  modelBeatenBaseline: boolean | null;
  provenanceNote: string;
}

export interface ReplayMetricsResponse {
  modelName: string;
  evaluationPeriod: string;
  sampleCount: number;
  mae: number;
  rmse: number;
  r2?: number;
  baselineMae: number;
  baselineRmse: number;
  improvementPct: number;
  featureImportance: Array<{ feature: string; weight: number }>;
  limitations?: string[];
  day3Policy?: string;
}

export interface LiveWeatherResponse {
  location: string;
  forecastFor: string;
  updatedAt?: string;
  source?: string;
  cached?: boolean;
  warning?: string | null;
  weather: WeatherMetrics;
  /** Every daily row the provider returned, each mapped on its own (0 = today). */
  dailyForecast: WeatherForecastDay[];
}

export interface LiveStatusResponse {
  serviceStatus: 'active' | 'standby' | 'disconnected' | 'unavailable';
  canPredict: boolean;
  reason: string;
  requiredInputs: string[];
  availableInputs: string[];
  missingInputs: string[];
  targetLabel?: string;
  checkedAt?: string;
  /** Metadata of the loaded model artifact, if the backend reports it. */
  modelBundle?: ModelBundleInfo | null;
}

export interface PredictRequest {
  target_date: string;
  horizon_days: number;
}

export interface PredictResponse {
  status: 'success' | 'error' | 'unavailable';
  targetDate: string;
  horizonDays: number;
  predictedAQI?: number;
  category?: AqiCategory;
  dominantPollutant?: string | null;
  healthAdvisory?: string;
  weather?: WeatherMetrics;
  confidenceInterval?: [number, number];
  detail?: string;
}

export interface ExternalSubIndex {
  pollutant: string;
  concentration: number;
  unit: string;
  averaging: string;
  /** Hourly timestamps with a value, including provider-interpolated ones. */
  resampled_hours_available: number;
  /** Independent native 3-hourly CAMS values with a value. */
  native_values_available: number;
  /** Native values that actually entered this sub-index. */
  native_values_used: number;
  window_hours: number;
  sub_index: number;
}

export interface ExternalNativeCoverage {
  native_resolution_hours: number;
  native_values_in_window: number;
  resampled_timestamps_in_window: number;
  interpolated_timestamps_in_window: number;
  best_native_values_per_pollutant: number;
  cpcb_min_data_hours: number;
  cpcb_16h_rule_met: boolean;
  note: string;
}

export interface ExternalForecastResponse {
  status: 'OK' | 'UNAVAILABLE' | 'ERROR';
  kind: string;
  label: string;
  is_trained_model_output: boolean;
  /** True when the index is a modelled estimate that does not meet CPCB data rules. */
  experimental?: boolean;
  cpcb_compliant?: boolean;
  aqi_basis?: string;
  method_note?: string;
  native_coverage?: ExternalNativeCoverage | null;
  target_date: string;
  window?: {
    start: string;
    end: string;
    hours_required: number;
    convention: string;
  };
  aqi?: number | null;
  category?: AqiCategory | null;
  dominant_pollutant?: string | null;
  sub_indices?: ExternalSubIndex[];
  excluded_pollutants?: Array<{ pollutant: string; reason: string }>;
  sufficiency?: {
    rule: string;
    pollutants_used: number;
    particulate_present: boolean;
    min_pollutants_met: boolean;
    cpcb_16h_rule_met: boolean;
    met: boolean;
  };
  provider?: {
    name: string;
    dataset: string;
    attribution: string;
    native_resolution?: {
      temporal: string;
      hours: number;
      spatial_degrees: number;
      spatial_km: number;
      note: string;
    };
    update_cadence?: string;
    url: string;
    grid?: { latitude: number | null; longitude: number | null; timezone: string | null; utc_offset_seconds: number | null } | null;
  };
  provider_index?: {
    name: string;
    scale?: string;
    unit: string;
    value_at_window_end: number | null;
    min_in_window: number | null;
    max_in_window: number | null;
    note: string;
  } | null;
  retrieved_at?: string;
  cached?: boolean;
  message?: string;
  reasons?: string[];
}

export interface ExternalOutlookDay {
  target_date: string;
  /** 0 = today's bulletin window, 1 = tomorrow, ... */
  lead_days: number;
  role: 'current_estimate' | 'forecast';
  status: 'OK' | 'UNAVAILABLE';
  aqi: number | null;
  category: AqiCategory | null;
  dominant_pollutant: string | null;
  window: { start: string; end: string; hours_required: number };
  sub_indices: ExternalSubIndex[];
  excluded_pollutants: Array<{ pollutant: string; reason: string }>;
  sufficiency: NonNullable<ExternalForecastResponse['sufficiency']>;
  native_coverage: ExternalNativeCoverage | null;
  provider_index: NonNullable<ExternalForecastResponse['provider_index']> | null;
  cpcb_compliant: boolean;
  experimental: boolean;
  reasons?: string[];
}

/** Multi-day external outlook: today's window plus the next forecast days. */
export interface ExternalOutlookResponse {
  status: 'OK' | 'UNAVAILABLE' | 'ERROR';
  kind: string;
  label: string;
  is_trained_model_output: boolean;
  convention?: string;
  days: ExternalOutlookDay[];
  provider?: ExternalForecastResponse['provider'];
  retrieved_at?: string;
  cached?: boolean;
  best_available_lead_day?: number | null;
  experimental?: boolean;
  cpcb_compliant?: boolean;
  method_note?: string;
  message?: string;
  reasons?: string[];
}

export interface ModelBundleInfo {
  loaded: boolean;
  dataEnd?: string | null;
  note?: string | null;
  models: Record<
    string,
    { modelName: string | null; testMae: number | null; testBaselineMae: number | null }
  >;
}

export interface LiveObservationReading {
  pollutant: string;
  reported_min: number | null;
  reported_max: number | null;
  reported_avg: number | null;
  /** Always null today: the source states no unit. */
  unit: string | null;
  unit_status: 'unverified';
}

export interface LiveObservationStation {
  station: string;
  latitude: number | null;
  longitude: number | null;
  last_update_raw: string | null;
  pollutants: LiveObservationReading[];
}

export interface LiveObservationPollutantSummary {
  pollutant: string;
  rows: number;
  stations_reporting: number;
  unit: string | null;
  unit_status: 'unverified';
  note: string;
}

export interface LiveObservationsResponse {
  status: 'OK' | 'UNAVAILABLE' | 'ERROR';
  kind: string;
  is_trained_model_output: boolean;
  is_aqi: boolean;
  label: string;
  city: string;
  provider?: {
    name: string;
    publisher: string;
    resource: string;
    resource_id: string;
    api_url: string;
    attribution: string;
    credential_note: string;
  };
  retrieved_at?: string;
  cached?: boolean;
  units?: { status: string; unit: string | null; note: string };
  /** Deliberately null: no AQI is derived from this source. */
  aqi: null;
  aqi_note?: string;
  station_count?: number;
  record_count?: number;
  skipped_records?: number;
  source_total?: number | null;
  truncated?: boolean;
  pollutants?: LiveObservationPollutantSummary[];
  stations?: LiveObservationStation[];
  observation_timestamp?: {
    latest_raw: string | null;
    distinct_values: string[];
    parsed_ist: string | null;
    timezone_assumption: string;
  } | null;
  freshness?: {
    status: 'fresh' | 'stale' | 'unknown';
    age_hours: number | null;
    stale_after_hours: number;
    note: string;
  };
  provider_update_note?: string | null;
  message?: string;
  reasons?: string[];
  missing_credential?: boolean;
  setup?: string;
}

export interface DemoObservationReading {
  pollutant: string;
  value: number;
  unit: string;
  /** Always illustrative_only: no reported unit exists for fabricated rows. */
  unit_status: 'illustrative_only';
  aqi: null;
  is_aqi: false;
  is_trained_model_output: false;
}

export interface DemoObservationStation {
  station: string;
  zone_label: string;
  aqi: null;
  is_aqi: false;
  is_trained_model_output: false;
  is_simulated: true;
  data_origin: string;
  illustrative_timestamp: string;
  illustrative_timestamp_label: string;
  readings: DemoObservationReading[];
}

export interface DemoObservationsResponse {
  status: 'DEMO';
  kind: 'simulated_demo_observations';
  is_simulated: true;
  is_trained_model_output: false;
  is_aqi: false;
  aqi: null;
  label: string;
  notice: string;
  disclaimer: string;
  demo_note: string;
  unit_notice: string;
  aqi_note: string;
  city: string;
  sample_snapshot: {
    label: string;
    iso: string;
    is_illustrative: boolean;
    note: string;
  };
  station_count: number;
  record_count: number;
  pollutants: Array<{
    pollutant: string;
    unit: string;
    unit_status: 'illustrative_only';
    stations_reporting: number;
    note: string;
  }>;
  stations: DemoObservationStation[];
  provenance: {
    source: string;
    real_station_names: boolean;
    may_feed_model: boolean;
    may_report_aqi: boolean;
    excluded_from: string[];
  };
}

export type ObservationsMode = 'live' | 'demo';

export type ConnectionState = 'checking' | 'connected' | 'disconnected' | 'offline-archive';
