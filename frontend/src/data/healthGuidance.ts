/**
 * AQI-category and weather guidance for the Health & Activity Guide.
 *
 * Everything here is derived from the values the dashboard already displays:
 * the CPCB AQI category and the Open-Meteo weather payload. It is general
 * public-health guidance, not a medical diagnosis or a protection guarantee.
 *
 * No indoor air-quality sensor is connected, so ventilation advice never claims
 * indoor air is cleaner than outdoor air and never assumes a "cleaner" hour.
 */
import type { AqiCategory, WeatherMetrics } from '../types';

export const CPCB_BANDS: Array<{ category: AqiCategory; upper: number; range: string }> = [
  { category: 'Good', upper: 50, range: '0–50' },
  { category: 'Satisfactory', upper: 100, range: '51–100' },
  { category: 'Moderate', upper: 200, range: '101–200' },
  { category: 'Poor', upper: 300, range: '201–300' },
  { category: 'Very Poor', upper: 400, range: '301–400' },
  { category: 'Severe', upper: 500, range: '401–500' },
];

/** CPCB national AQI category for a value, or null when no value is available. */
export function categoryFromAqi(aqi: number | null | undefined): AqiCategory | null {
  if (aqi == null || Number.isNaN(aqi)) return null;
  const band = CPCB_BANDS.find(entry => aqi <= entry.upper);
  return band ? band.category : 'Severe';
}

export interface CategoryAdvice {
  headline: string;
  toDo: string[];
  toAvoid: string[];
}

/** Outdoor-activity indicator text for each CPCB category. */
export const OUTDOOR_ACTIVITY: Record<AqiCategory, string> = {
  Good: 'Generally suitable',
  Satisfactory: 'Generally suitable',
  Moderate: 'Use caution',
  Poor: 'Reduce prolonged exertion',
  'Very Poor': 'Avoid strenuous activity',
  Severe: 'Minimize outdoor exposure',
};

/**
 * Conditional ventilation advice. Elevated pollution means closed windows are
 * recommended; lower categories allow ventilation but never promise cleaner
 * indoor air, because no indoor measurement exists.
 */
const VENTILATION_ADVICE: Record<AqiCategory, string> = {
  Good: 'Ventilate indoor spaces while outdoor levels are reported low. No indoor air sensor is connected, so indoor air itself is not measured.',
  Satisfactory: 'Ventilation is reasonable while outdoor levels stay in this band. No indoor air sensor is connected, so indoor air quality is not measured here.',
  Moderate: 'Open windows briefly rather than for long stretches, and close them if nearby traffic or visible haze builds up.',
  Poor: 'Keep windows and doors closed where practical, especially during nearby traffic or pollution peaks. This reduces incoming outdoor air but is not a guaranteed protection.',
  'Very Poor':
    'Keep windows and doors closed where practical, especially during traffic peaks. This lowers incoming outdoor air but does not guarantee clean indoor air.',
  Severe:
    'Keep windows and doors closed where practical and avoid anything that adds indoor smoke. This is a precaution, not a guaranteed protection.',
};

const BASE_ADVICE: Record<AqiCategory, CategoryAdvice> = {
  Good: {
    headline: 'Normal outdoor activities are generally suitable.',
    toDo: [
      'A good window for a walk, run or cycle ride if the weather also suits you.',
      'Re-check the reading before longer outdoor plans later in the day.',
    ],
    toAvoid: [
      'Avoid burning leaves, waste or incense outdoors — it degrades otherwise clean air.',
      'Avoid idling engines in traffic where it is safe to switch off.',
      'Do not assume the air will stay clean all day; conditions can change within hours.',
    ],
  },
  Satisfactory: {
    headline: 'Most people can continue normal activities.',
    toDo: [
      'Outdoor exercise is generally fine for most people at this level.',
      'Sensitive individuals may notice mild irritation and should monitor how they feel.',
    ],
    toAvoid: [
      'Avoid prolonged exposure right beside heavy traffic.',
      'Avoid burning waste or using smoke-producing products outdoors.',
      'Do not ignore eye, throat or chest irritation if you are sensitive to air quality.',
    ],
  },
  Moderate: {
    headline: 'Sensitive individuals should be more cautious.',
    toDo: [
      'Shorten or lower the intensity of outdoor exercise if you notice irritation.',
      'Plan strenuous activity for a period when the reading is lower instead of relying on a fixed time of day.',
    ],
    toAvoid: [
      'Avoid intense outdoor exercise during peak traffic hours.',
      'Avoid smoky and dusty environments, including secondhand smoke.',
      'Avoid leaving windows open through periods of heavy nearby traffic.',
      'Avoid strenuous outdoor work if you have a heart or lung condition.',
    ],
  },
  Poor: {
    headline: 'Reduce prolonged outdoor exertion.',
    toDo: [
      'Choose lighter or indoor activity instead of long outdoor sessions.',
      'Consider a well-fitted mask in crowded or traffic-heavy areas.',
    ],
    toAvoid: [
      'Avoid intense outdoor exercise.',
      'Avoid prolonged exposure near busy roads and construction dust.',
      'Avoid smoky and dusty environments.',
      'Avoid burning anything indoors or outdoors.',
    ],
  },
  'Very Poor': {
    headline: 'Avoid strenuous outdoor activity and limit exposure.',
    toDo: [
      'Move exercise indoors where you have cleaner air.',
      'Keep outdoor trips short and choose routes away from heavy traffic.',
    ],
    toAvoid: [
      'Avoid strenuous or prolonged outdoor activity.',
      'Avoid outdoor exercise near traffic or construction sites.',
      'Avoid burning anything indoors or outdoors, including candles and incense.',
      'Avoid long outdoor trips with children and older adults.',
    ],
  },
  Severe: {
    headline: 'Minimize outdoor exposure and follow official health advisories.',
    toDo: [
      'Stay indoors where possible, especially if you are in a sensitive group.',
      'Follow CPCB and local health authority guidance for your area.',
    ],
    toAvoid: [
      'Avoid all outdoor exercise and long outdoor stays.',
      'Avoid crowded outdoor areas and traffic corridors.',
      'Avoid indoor smoke from incense, cooking fumes or candles.',
      'Avoid self-medicating; seek medical advice if symptoms worsen.',
    ],
  },
};

/** Used when no AQI category can be established from the available data. */
export const GENERAL_ADVICE: CategoryAdvice = {
  headline: 'No current AQI estimate is available, so only general guidance is shown.',
  toDo: [
    'Check the local AQI before planning outdoor exercise or long trips.',
    'Keep outdoor activity moderate until a current reading is available.',
    'No indoor air sensor is connected, so indoor air cannot be compared with outdoor air here.',
  ],
  toAvoid: [
    'Avoid burning waste, incense or candles indoors.',
    'Avoid heavy outdoor exertion near traffic until the AQI is known.',
    'Do not treat this guidance as a measurement of current air quality.',
  ],
};

export interface GuidanceResult {
  category: AqiCategory | null;
  advice: CategoryAdvice;
  isGeneral: boolean;
  /** Outdoor activity indicator text, or null when no AQI category is known. */
  outdoor: string | null;
}

export function adviceFor(
  aqi: number | null | undefined,
  category: AqiCategory | string | null | undefined,
): GuidanceResult {
  const known = category && category in BASE_ADVICE ? (category as AqiCategory) : null;
  const effective = known ?? categoryFromAqi(aqi);
  if (!effective) {
    return { category: null, advice: GENERAL_ADVICE, isGeneral: true, outdoor: null };
  }
  const base = BASE_ADVICE[effective];
  // Ventilation is appended as its own conditional line, so every category keeps
  // three recommendations without repeating the one-size-fits-all wording.
  const advice: CategoryAdvice = {
    headline: base.headline,
    toDo: [...base.toDo, VENTILATION_ADVICE[effective]].slice(0, 4),
    toAvoid: base.toAvoid,
  };
  return { category: effective, advice, isGeneral: false, outdoor: OUTDOOR_ACTIVITY[effective] };
}

export type WeatherTipKind = 'heat' | 'cold' | 'rain' | 'wind' | 'humidity' | 'fog' | 'still';

export interface WeatherTip {
  kind: WeatherTipKind;
  text: string;
}

/**
 * Weather advice built only from fields the provider actually returned.
 * Missing fields never produce a tip, and the strip is capped at three.
 */
export function buildWeatherTips(weather: WeatherMetrics | null): WeatherTip[] {
  if (!weather) return [];
  const tips: WeatherTip[] = [];
  const temp = weather.tempC;
  const humidity = weather.humidityPct;
  const wind = weather.windKmh;
  const rain = weather.precipMm;
  const condition = (weather.condition || '').toLowerCase();

  if (temp != null && temp >= 35) {
    tips.push({
      kind: 'heat',
      text: `Hot conditions (${temp.toFixed(0)}°C): stay hydrated and avoid prolonged activity during peak heat.`,
    });
  } else if (temp != null && temp <= 12) {
    tips.push({
      kind: 'cold',
      text: `Cold conditions (${temp.toFixed(0)}°C): dress in layers, especially for early-morning outdoor plans.`,
    });
  }

  if (rain != null && rain > 0) {
    tips.push({
      kind: 'rain',
      text: `Rain expected (${rain.toFixed(1)} mm): carry an umbrella and watch for slippery roads and reduced visibility.`,
    });
  }

  if (wind != null && wind >= 20) {
    tips.push({
      kind: 'wind',
      text: `Strong wind (${wind.toFixed(0)} km/h): expect raised dust — keep windows closed and protect your eyes.`,
    });
  }

  if (humidity != null && humidity >= 75) {
    tips.push({
      kind: 'humidity',
      text: `High humidity (${Math.round(humidity)}%): take breaks during physical activity, since heat stress rises with moisture.`,
    });
  }

  if (/fog|haze|mist/.test(condition)) {
    tips.push({
      kind: 'fog',
      text: 'Foggy conditions: visibility is reduced and pollution can stay trapped near the ground — allow extra travel time.',
    });
  }

  if (tips.length < 3 && wind != null && wind < 8 && (rain == null || rain === 0)) {
    tips.push({
      kind: 'still',
      text: `Light winds (${wind.toFixed(1)} km/h): air mixes slowly today, so hazy conditions can linger.`,
    });
  }

  return tips.slice(0, 3);
}
