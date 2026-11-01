/** Type definitions for the Delhi AQI Prediction research dashboard. */
export type AqiCategory = 'Good' | 'Satisfactory' | 'Moderate' | 'Poor' | 'Very Poor' | 'Severe';

export interface WeatherMetrics {
  tempC: number | null;
  humidityPct: number | null;
  windKmh: number | null;
  windDir: string | null;
  precipMm: number | null;
  condition: string;
  boundaryLayerHeightM: number | null;
  tempMaxC?: number | null;
  tempMinC?: number | null;
  /** Apparent temperature reported for this day, when the provider supplies it. */
  feelsLikeC?: number | null;
  /** Surface pressure in hPa; the provider reports it for current conditions only. */
  pressureHpa?: number | null;
  /** Wind bearing in degrees (direction the wind comes from). */
  windDeg?: number | null;
}

/** One day of the daily weather forecast, with its lead day relative to today. */
export interface WeatherForecastDay extends WeatherMetrics {
  /** Calendar date of the forecast day (provider timezone, Asia/Kolkata). */
  date: string | null;
  /** 0 = today, 1 = tomorrow, 2 = day after, 3 = third forecast day. */
  leadDays: number;
}

export interface PollutantReading {
  name: string;
  symbol: string;
  value: number | null;
  unit: string;
  standard24h: number | null;
  status: string | null;
}

export interface DailyAqiRecord {
  date: string;
  displayDate: string;
  dayOfWeek: string;
  derivedActualAQI: number;
  predictedAQI: number;
  baselineAQI: number;
  error: number;
  absError: number;
  dominantPollutant: string | null;
  pm25UgM3: number | null;
  pm10UgM3: number | null;
  category: AqiCategory;
  healthAdvisory: string;
  weather: WeatherMetrics;
  season: string;
  episodeTag?: string;
  horizon?: number;
  selectedModel?: string;
  absolutePersistenceError?: number | null;
  modelBeatenBaseline?: boolean | null;
  provenanceNote?: string;
  pollutants?: PollutantReading[];
}

export interface PollutionEpisode {
  id: string;
  title: string;
  date: string;
  peakAQI: number;
  category: AqiCategory;
  subtitle: string;
  narrative: string;
  dominantFactor: string;
}

export type AppMode = 'historical' | 'live';
