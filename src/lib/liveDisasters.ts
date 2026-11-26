import type { Database } from './database.types';

type Disaster = Database['public']['Tables']['disasters']['Row'];

export interface LiveWeather {
  temperature_2m: number;
  wind_speed_10m: number;
  precipitation: number;
  relative_humidity_2m: number;
  time: string;
  wave_height: number | null;
  ocean_current_velocity: number | null;
  river_discharge: number | null;
}

const USGS_FEED_URL =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson';
const NASA_EONET_URL =
  'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=20';

function mapMagnitudeToSeverity(mag: number): number {
  if (mag >= 7) return 5;
  if (mag >= 6) return 4;
  if (mag >= 5) return 3;
  if (mag >= 4) return 2;
  return 1;
}

function mapEonetCategory(
  categoryId?: string
): { type: Disaster['type']; severity: number; radiusKm: number } {
  switch (categoryId) {
    case 'wildfires':
      return { type: 'wildfire', severity: 4, radiusKm: 35 };
    case 'severeStorms':
      return { type: 'hurricane', severity: 4, radiusKm: 120 };
    case 'floods':
      return { type: 'flood', severity: 4, radiusKm: 50 };
    case 'volcanoes':
      return { type: 'earthquake', severity: 4, radiusKm: 40 };
    default:
      return { type: 'tornado', severity: 3, radiusKm: 30 };
  }
}

async function fetchUsgsEarthquakes(): Promise<Disaster[]> {
  const res = await fetch(USGS_FEED_URL);
  if (!res.ok) throw new Error(`USGS HTTP ${res.status}`);
  const data = await res.json();
  const features = Array.isArray(data?.features) ? data.features : [];

  return features
    .map((f: {
      id?: string;
      properties?: { mag?: number; place?: string; time?: number; title?: string };
      geometry?: { coordinates?: [number, number, number?] };
    }): Disaster | null => {
      const coords = f.geometry?.coordinates;
      if (!coords || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) {
        return null;
      }
      const mag = Number(f.properties?.mag ?? 4.5);
      const timestamp = f.properties?.time
        ? new Date(f.properties.time).toISOString()
        : new Date().toISOString();

      return {
        id: `usgs-${f.id ?? `${coords[0]}-${coords[1]}`}`,
        type: 'earthquake',
        severity: mapMagnitudeToSeverity(mag),
        title: f.properties?.title || `M${mag.toFixed(1)} Earthquake`,
        description: `Live USGS feed • Magnitude ${mag.toFixed(1)} • Depth ${coords[2] ?? 'N/A'} km`,
        location: { type: 'Point', coordinates: [coords[0], coords[1]] },
        location_name: f.properties?.place || 'Global Seismic Zone',
        affected_radius_km: Math.max(20, Math.round(mag * 15)),
        affected_population: null,
        status: 'active',
        created_at: timestamp,
        updated_at: timestamp,
        predicted_path: null,
        weather_conditions: { magnitude: mag, depth_km: coords[2] ?? null, source: 'USGS' },
        evacuation_zones: null,
      };
    })
    .filter((d: Disaster | null): d is Disaster => d !== null);
}

async function fetchNasaEonetEvents(): Promise<Disaster[]> {
  const res = await fetch(NASA_EONET_URL);
  if (!res.ok) throw new Error(`NASA EONET HTTP ${res.status}`);
  const data = await res.json();
  const events = Array.isArray(data?.events) ? data.events : [];

  return events
    .map((ev: {
      id?: string;
      title?: string;
      categories?: Array<{ id?: string; title?: string }>;
      geometry?: Array<{ date?: string; type?: string; coordinates?: unknown }>;
    }): Disaster | null => {
      const latestGeom = ev.geometry?.[ev.geometry.length - 1];
      const rawCoords = latestGeom?.coordinates;
      if (
        latestGeom?.type !== 'Point' ||
        !Array.isArray(rawCoords) ||
        rawCoords.length < 2 ||
        !Number.isFinite(rawCoords[0]) ||
        !Number.isFinite(rawCoords[1])
      ) {
        return null;
      }

      const category = ev.categories?.[0];
      const mapped = mapEonetCategory(category?.id);
      const timestamp = latestGeom.date
        ? new Date(latestGeom.date).toISOString()
        : new Date().toISOString();

      return {
        id: `eonet-${ev.id ?? ev.title}`,
        type: mapped.type,
        severity: mapped.severity,
        title: ev.title || 'Active NASA EONET Event',
        description: `Live NASA EONET feed • Category: ${category?.title || 'Natural Hazard'}`,
        location: { type: 'Point', coordinates: [Number(rawCoords[0]), Number(rawCoords[1])] },
        location_name: ev.title || 'Global Hazard Zone',
        affected_radius_km: mapped.radiusKm,
        affected_population: null,
        status: 'active',
        created_at: timestamp,
        updated_at: timestamp,
        predicted_path: null,
        weather_conditions: { category: category?.title ?? null, source: 'NASA EONET' },
        evacuation_zones: null,
      };
    })
    .filter((d: Disaster | null): d is Disaster => d !== null);
}

export async function fetchLiveDisasters(): Promise<Disaster[]> {
  const results = await Promise.allSettled([
    fetchUsgsEarthquakes(),
    fetchNasaEonetEvents(),
  ]);

  const combined: Disaster[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      combined.push(...result.value);
    } else {
      console.warn('Live disaster feed warning:', result.reason);
    }
  }
  return combined;
}

export interface RadarFrame {
  time: number;
  path: string;
  tileUrl: string;
}

export async function fetchRainViewerFrames(): Promise<RadarFrame[]> {
  try {
    const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    if (!res.ok) return [];
    const data = await res.json();
    const host = data?.host || 'https://tilecache.rainviewer.com';
    const past = Array.isArray(data?.radar?.past) ? data.radar.past : [];
    const nowcast = Array.isArray(data?.radar?.nowcast) ? data.radar.nowcast : [];
    return [...past, ...nowcast].map((frame: { time: number; path: string }) => ({
      time: frame.time,
      path: frame.path,
      tileUrl: `${host}${frame.path}/256/{z}/{x}/{y}/6/1_1.png`,
    }));
  } catch {
    return [];
  }
}

export async function fetchLiveWeather(lat: number, lng: number): Promise<LiveWeather | null> {
  try {
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m,precipitation,relative_humidity_2m`;
    const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lng}&current=wave_height,ocean_current_velocity`;
    const floodUrl = `https://flood-api.open-meteo.com/v1/flood?latitude=${lat}&longitude=${lng}&daily=river_discharge&forecast_days=1`;

    const [weatherRes, marineRes, floodRes] = await Promise.allSettled([
      fetch(weatherUrl).then(r => (r.ok ? r.json() : null)),
      fetch(marineUrl).then(r => (r.ok ? r.json() : null)),
      fetch(floodUrl).then(r => (r.ok ? r.json() : null)),
    ]);

    const weatherData = weatherRes.status === 'fulfilled' ? weatherRes.value : null;
    if (!weatherData?.current) return null;

    const marineData = marineRes.status === 'fulfilled' ? marineRes.value : null;
    const floodData = floodRes.status === 'fulfilled' ? floodRes.value : null;

    const discharge = Array.isArray(floodData?.daily?.river_discharge)
      ? floodData.daily.river_discharge[0] ?? null
      : null;

    return {
      temperature_2m: weatherData.current.temperature_2m,
      wind_speed_10m: weatherData.current.wind_speed_10m,
      precipitation: weatherData.current.precipitation,
      relative_humidity_2m: weatherData.current.relative_humidity_2m,
      time: weatherData.current.time,
      wave_height: marineData?.current?.wave_height ?? null,
      ocean_current_velocity: marineData?.current?.ocean_current_velocity ?? null,
      river_discharge: typeof discharge === 'number' ? discharge : null,
    };
  } catch {
    return null;
  }
}
