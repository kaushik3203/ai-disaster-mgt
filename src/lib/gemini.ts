import type { Database } from "./database.types";

type Disaster = Database["public"]["Tables"]["disasters"]["Row"];
type Resource = Database["public"]["Tables"]["resources"]["Row"];
type Team = Database["public"]["Tables"]["teams"]["Row"];
type Alert = Database["public"]["Tables"]["alerts"]["Row"];

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-3-flash-preview";

const genAI = {
  getGenerativeModel({ model }: { model: string }) {
    return {
      async generateContent(prompt: string) {
        if (!apiKey) {
          throw new Error("Missing VITE_GEMINI_API_KEY in environment.");
        }
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
            }),
          }
        );
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Gemini API ${res.status}: ${errText}`);
        }
        const data = await res.json();
        const text =
          data?.candidates?.[0]?.content?.parts
            ?.map((p: { text?: string }) => p.text ?? "")
            .join("") ?? "";
        return {
          response: {
            text: () => text,
          },
        };
      },
    };
  },
};

export async function generateChatResponse({
  prompt,
  context
}: {
  prompt: string;
  context: {
    disasters: Disaster[];
    resources: Resource[];
    teams: Team[];
    alerts: Alert[];
  };
}) {
  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const formattedContext = `
      You are an AI assistant for a disaster management system. Current situation:

      Active Disasters (${context.disasters.length}):
      ${context.disasters.map(d => `
        • ${d.title}
        - Severity: ${d.severity}/5
        - Location: ${d.location_name}
        - Status: ${d.status}
        - Affected: ${d.affected_population?.toLocaleString() || 'Unknown'} people
      `).join('\n')}

      Resources (${context.resources.length}):
      ${context.resources.map(r => `
        • ${r.name}
        - ${r.quantity} ${r.unit}
        - Status: ${r.status}
        - Location: ${r.location_name}
      `).join('\n')}

      Teams (${context.teams.length}):
      ${context.teams.map(t => `
        • ${t.name}
        - Type: ${t.type}
        - Status: ${t.status}
        - Location: ${t.location_name}
      `).join('\n')}

      Recent Alerts:
      ${context.alerts.filter(a => a.status === 'sent').slice(0, 3).map(a => `
        • ${a.title}
        - Type: ${a.type}
        - Severity: ${a.severity}/5
      `).join('\n')}

      User Question: ${prompt}

      Please provide a clear, concise response based on this data. Include specific numbers and details when relevant.
    `;

    const result = await model.generateContent(formattedContext);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Gemini API Error:', error);
    throw new Error('Failed to generate response. Please try again.');
  }
}

export async function analyzeSeverity(disasterData: {
  type: string;
  description: string;
  location: string;
  affectedPopulation?: number;
}) {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const prompt = `
    Analyze this disaster situation and provide:
    1. Severity level (1-5)
    2. Recommended immediate actions
    3. Resource allocation suggestions
    4. Evacuation priority areas

    Disaster details:
    Type: ${disasterData.type}
    Location: ${disasterData.location}
    Description: ${disasterData.description}
    Affected population: ${disasterData.affectedPopulation || 'Unknown'}
  `;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}

export async function predictResourceNeeds(disasterData: {
  type: string;
  severity: number;
  affectedPopulation?: number;
  location: string;
}) {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const prompt = `
    Based on this disaster scenario, predict and suggest:
    1. Required medical supplies (quantity and type)
    2. Food and water requirements
    3. Shelter needs
    4. Emergency response team size
    5. Equipment requirements

    Disaster details:
    Type: ${disasterData.type}
    Severity: ${disasterData.severity}
    Location: ${disasterData.location}
    Affected population: ${disasterData.affectedPopulation || 'Unknown'}
  `;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}

export async function detectMisinformation(report: {
  title: string;
  description: string;
  source?: string;
}) {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const prompt = `
    Analyze this disaster report for potential misinformation:
    Title: ${report.title}
    Description: ${report.description}
    Source: ${report.source || 'Unknown'}

    Please provide:
    1. Credibility score (0-100%)
    2. Potential red flags
    3. Verification suggestions
    4. Similar confirmed incidents
  `;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}

export async function generateSituationReport(data: {
  incidents: Array<{ type: string; description: string; timestamp: string }>;
  location: string;
  timeframe: string;
}) {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const prompt = `
    Generate a comprehensive situation report based on these incidents:
    Location: ${data.location}
    Timeframe: ${data.timeframe}

    Incidents:
    ${data.incidents.map(i => `
      Type: ${i.type}
      Time: ${i.timestamp}
      Description: ${i.description}
    `).join('\n')}

    Please provide:
    1. Executive summary
    2. Key developments
    3. Current challenges
    4. Resource status
    5. Recommended actions
  `;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}

export interface ForecastWaypoint {
  eta: string;
  area: string;
  lat: number;
  lng: number;
  intensity: string;
}

export interface DisasterAIForecast {
  summary: string;
  riskTrend: 'Escalating' | 'Stable' | 'Weakening';
  confidence: number;
  typeSpecificLabel: string;
  timeline: ForecastWaypoint[];
  keyMetrics: Array<{ label: string; value: string }>;
  actionAdvice: string;
}

const forecastCache = new Map<string, DisasterAIForecast>();

const TYPE_GUIDANCE: Record<string, string> = {
  hurricane: 'Predict cyclone eye track waypoints (+6h, +12h, +24h, +48h), expected wind speed, landfall ETA, and coastal storm surge.',
  tornado: 'Predict storm/cyclone movement track (+6h, +12h, +24h, +48h), wind gusts, affected districts/coasts, and landfall ETA.',
  flood: 'Predict downstream flood expansion zones (+6h, +12h, +24h), water level rise, peak flood ETA, and low-lying areas at risk.',
  earthquake: 'Predict aftershock probability, seismic zone checkpoints (+6h, +24h, +48h), tsunami potential if coastal, and structural risk.',
  wildfire: 'Predict wind-driven fire spread direction & perimeter waypoints (+6h, +12h, +24h), smoke plume reach, and containment outlook.',
  tsunami: 'Predict wave arrival waypoints (+1h, +3h, +6h), coastal surge height, and safe inland distance.',
};

export async function predictDisasterTrajectory(params: {
  id: string;
  type: Disaster['type'];
  title: string;
  locationName: string;
  lat: number;
  lng: number;
  severity: number;
  radiusKm: number;
  description?: string | null;
  weather?: {
    temperature_2m: number;
    wind_speed_10m: number;
    precipitation: number;
    relative_humidity_2m: number;
    wave_height: number | null;
    ocean_current_velocity: number | null;
    river_discharge: number | null;
  } | null;
}): Promise<DisasterAIForecast> {
  const cached = forecastCache.get(params.id);
  if (cached) return cached;

  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const guidance = TYPE_GUIDANCE[params.type] || TYPE_GUIDANCE.hurricane;

  const weatherText = params.weather
    ? `Wind: ${params.weather.wind_speed_10m} km/h, Rain: ${params.weather.precipitation} mm, Temp: ${params.weather.temperature_2m}C, Humidity: ${params.weather.relative_humidity_2m}%, River Flow: ${params.weather.river_discharge ?? 'N/A'} m3/s, Sea Wave: ${params.weather.wave_height ?? 'N/A'} m, Sea Current: ${params.weather.ocean_current_velocity ?? 'N/A'} m/s`
    : 'Live weather unavailable; estimate from region and season.';

  const prompt = `
You are an emergency disaster forecasting AI. Analyze this active disaster and return ONLY valid JSON (no markdown fences, no extra text).

Disaster:
- Type: ${params.type}
- Title: ${params.title}
- Location: ${params.locationName} (lat: ${params.lat}, lng: ${params.lng})
- Severity: ${params.severity}/5
- Affected Radius: ${params.radiusKm} km
- Description: ${params.description || 'N/A'}
- Live Telemetry: ${weatherText}

Task: ${guidance}
Generate 3 to 4 realistic geographic waypoints starting near (${params.lat}, ${params.lng}) showing where this ${params.type} impact/track moves over the next hours (keep lat within +-5 deg and lng within +-5 deg of origin, valid coordinates). Use simple, non-technical language.

Return exact JSON matching this schema:
{
  "summary": "2 short plain-English sentences explaining what will happen next",
  "riskTrend": "Escalating" | "Stable" | "Weakening",
  "confidence": 78,
  "typeSpecificLabel": "e.g. Predicted Cyclone Track / Flood Expansion / Fire Spread / Aftershock Zone",
  "timeline": [
    { "eta": "+6 hrs", "area": "Nearby place/direction", "lat": 10.95, "lng": 76.35, "intensity": "e.g. 140 km/h winds" }
  ],
  "keyMetrics": [
    { "label": "e.g. Landfall / Peak ETA", "value": "e.g. ~14 hours" },
    { "label": "e.g. Expected Surge / Aftershock", "value": "e.g. 2.5m / High" }
  ],
  "actionAdvice": "1 short clear safety instruction for residents"
}
`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();
  const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const parsed = JSON.parse(jsonText) as Partial<DisasterAIForecast>;

  const validTimeline: ForecastWaypoint[] = Array.isArray(parsed.timeline)
    ? parsed.timeline.filter(
        (wp): wp is ForecastWaypoint =>
          Boolean(wp) &&
          typeof wp.eta === 'string' &&
          typeof wp.area === 'string' &&
          typeof wp.lat === 'number' &&
          typeof wp.lng === 'number' &&
          Number.isFinite(wp.lat) &&
          Number.isFinite(wp.lng) &&
          wp.lat >= -90 &&
          wp.lat <= 90 &&
          wp.lng >= -180 &&
          wp.lng <= 180
      )
    : [];

  const forecast: DisasterAIForecast = {
    summary: parsed.summary || 'Monitoring disaster progression and nearby risk zones.',
    riskTrend:
      parsed.riskTrend === 'Escalating' || parsed.riskTrend === 'Weakening'
        ? parsed.riskTrend
        : 'Stable',
    confidence:
      typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
        ? Math.max(10, Math.min(99, Math.round(parsed.confidence)))
        : 75,
    typeSpecificLabel: parsed.typeSpecificLabel || 'AI Predicted Path',
    timeline: validTimeline,
    keyMetrics: Array.isArray(parsed.keyMetrics) ? parsed.keyMetrics.slice(0, 4) : [],
    actionAdvice: parsed.actionAdvice || 'Follow local emergency authority advisories.',
  };

  forecastCache.set(params.id, forecast);
  return forecast;
}
