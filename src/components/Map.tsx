import React, { useEffect, useRef, useState } from 'react';
import Map, { 
  Marker, 
  Popup, 
  Source, 
  Layer,
  NavigationControl,
  FullscreenControl,
  ViewStateChangeEvent,
  MapRef,
  GeolocateControl
} from 'react-map-gl';
import { AlertTriangle, Users, Box, Truck, Shield, Wind, Layers, Waves, Droplets, Gauge, Thermometer, X, Play, Pause, SkipBack, SkipForward, Sparkles, Clock, Navigation } from 'lucide-react';
import { useDisasterStore } from '../store/disaster';
import { parsePointLocation, createCirclePolygon } from '../lib/geo';
import { fetchLiveWeather, fetchRainViewerFrames, type LiveWeather, type RadarFrame } from '../lib/liveDisasters';
import { predictDisasterTrajectory, type DisasterAIForecast } from '../lib/gemini';
import type { Database } from '../lib/database.types';
import type { StyleSpecification } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

type Disaster = Database['public']['Tables']['disasters']['Row'];
type Resource = Database['public']['Tables']['resources']['Row'];

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const RESOURCE_ICONS = {
  medical: Shield,
  food: Box,
  water: Wind,
  shelter: Box,
  rescue: Users,
  transport: Truck
};

function createRasterStyle(tiles: string[], labelTiles?: string[]): StyleSpecification {
  const sources: StyleSpecification['sources'] = {
    base: {
      type: 'raster',
      tiles,
      tileSize: 256,
    },
  };
  const layers: StyleSpecification['layers'] = [
    {
      id: 'base-layer',
      type: 'raster',
      source: 'base',
    },
  ];

  if (labelTiles) {
    sources.labels = {
      type: 'raster',
      tiles: labelTiles,
      tileSize: 256,
    };
    layers.push({
      id: 'labels-layer',
      type: 'raster',
      source: 'labels',
    });
  }

  return {
    version: 8,
    sources,
    layers,
  };
}

const MAP_STYLES: Array<{ id: string; label: string; style: StyleSpecification }> = [
  {
    id: 'satellite',
    label: 'Satellite',
    style: createRasterStyle(
      ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}']
    ),
  },
  {
    id: 'streets',
    label: 'Streets',
    style: createRasterStyle(['https://tile.openstreetmap.org/{z}/{x}/{y}.png']),
  },
  {
    id: 'terrain',
    label: 'Terrain',
    style: createRasterStyle(['https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}']),
  },
  {
    id: 'dark',
    label: 'Dark',
    style: createRasterStyle(['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}']),
  },
];

const DISASTER_FILTERS = [
  { id: 'all', label: 'All', emoji: '🌍' },
  { id: 'flood', label: 'Flood', emoji: '🌊' },
  { id: 'hurricane', label: 'Cyclone', emoji: '🌀' },
  { id: 'earthquake', label: 'Earthquake', emoji: '🌋' },
  { id: 'wildfire', label: 'Wildfire', emoji: '🔥' },
] as const;

function getRiskLabel(severity: number) {
  if (severity >= 4) return { text: 'HIGH RISK — Stay Safe', cls: 'bg-red-500/20 text-red-300 border-red-500/40' };
  if (severity >= 3) return { text: 'MODERATE — Stay Alert', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40' };
  return { text: 'LOW — Monitoring', cls: 'bg-blue-500/20 text-blue-300 border-blue-500/40' };
}

function getWindStatus(kmh: number) {
  if (kmh >= 60) return { label: 'Dangerous', color: 'bg-red-500', pct: 100 };
  if (kmh >= 35) return { label: 'Strong', color: 'bg-amber-500', pct: Math.min(100, (kmh / 80) * 100) };
  if (kmh >= 15) return { label: 'Breezy', color: 'bg-blue-400', pct: Math.min(100, (kmh / 80) * 100) };
  return { label: 'Calm', color: 'bg-emerald-400', pct: Math.max(8, (kmh / 80) * 100) };
}

function getWaterStatus(rainMm: number, discharge: number | null) {
  const score = rainMm * 2 + (discharge ? Math.min(50, discharge / 10) : 0);
  if (score >= 40) return { label: 'Flood Risk', color: 'bg-red-500', pct: 100 };
  if (score >= 15) return { label: 'Rising', color: 'bg-amber-500', pct: Math.min(100, score * 2) };
  return { label: 'Normal', color: 'bg-cyan-400', pct: Math.max(10, score * 2) };
}

interface DisasterMapProps {
  onDisasterSelect?: (id: string) => void;
}

export default function DisasterMap({ onDisasterSelect }: DisasterMapProps) {
  const { disasters, teams, resources } = useDisasterStore();
  const [popupInfo, setPopupInfo] = useState<Disaster | null>(null);
  const [liveWeather, setLiveWeather] = useState<LiveWeather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [aiForecast, setAiForecast] = useState<DisasterAIForecast | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'current' | 'ai'>('current');
  const activeDisasterIdRef = useRef<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [activeStyleId, setActiveStyleId] = useState<string>('satellite');
  const [radarFrames, setRadarFrames] = useState<RadarFrame[]>([]);
  const [radarIndex, setRadarIndex] = useState(0);
  const [isPlayingRadar, setIsPlayingRadar] = useState(false);
  const [showRadar, setShowRadar] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const mapRef = useRef<MapRef>(null);
  const [viewState, setViewState] = useState({
    longitude: 78.9629,
    latitude: 20.5937,
    zoom: 4,
    bearing: 0,
    pitch: 0
  });

  const matchesFilter = (disaster: Disaster, filterId: string) => {
    if (filterId === 'all') return true;
    if (filterId === 'hurricane') return disaster.type === 'hurricane' || disaster.type === 'tornado';
    return disaster.type === filterId;
  };

  const filteredDisasters = disasters.filter(d => matchesFilter(d, activeFilter));

  useEffect(() => {
    if (popupInfo && !matchesFilter(popupInfo, activeFilter)) {
      activeDisasterIdRef.current = null;
      setPopupInfo(null);
      setLiveWeather(null);
      setAiForecast(null);
      setAiError(null);
    }
    if (activeFilter !== 'all') {
      setSelectedResource(null);
    }
  }, [activeFilter, popupInfo]);

  useEffect(() => {
    const matchingDisasters = disasters.filter(d => matchesFilter(d, activeFilter));
    if (matchingDisasters.length > 0 && mapRef.current) {
      const coordinates = matchingDisasters
        .map(d => parsePointLocation(d.location))
        .filter((coord): coord is [number, number] => coord !== null);

      if (coordinates.length > 0) {
        if (coordinates.length === 1) {
          mapRef.current.flyTo({
            center: coordinates[0],
            zoom: 5,
            duration: 900,
          });
        } else {
          const bounds = coordinates.reduce(
            (b, coord) => ({
              minLng: Math.min(b.minLng, coord[0]),
              maxLng: Math.max(b.maxLng, coord[0]),
              minLat: Math.min(b.minLat, coord[1]),
              maxLat: Math.max(b.maxLat, coord[1]),
            }),
            {
              minLng: coordinates[0][0],
              maxLng: coordinates[0][0],
              minLat: coordinates[0][1],
              maxLat: coordinates[0][1],
            }
          );

          mapRef.current.fitBounds(
            [
              [bounds.minLng, bounds.minLat],
              [bounds.maxLng, bounds.maxLat],
            ],
            { padding: 60, duration: 900, maxZoom: 6 }
          );
        }
      }
    }
  }, [disasters, activeFilter]);

  const handleViewStateChange = (event: ViewStateChangeEvent) => {
    setViewState(event.viewState);
  };

  const getSeverityColor = (severity: number) => {
    if (severity >= 4) return 'text-red-500';
    if (severity >= 3) return 'text-yellow-500';
    return 'text-blue-500';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'text-green-500';
      case 'in-transit': return 'text-yellow-500';
      case 'deployed': return 'text-blue-500';
      default: return 'text-gray-500';
    }
  };

  useEffect(() => {
    fetchRainViewerFrames().then(frames => {
      if (frames.length > 0) {
        setRadarFrames(frames);
        setRadarIndex(frames.length - 1);
      }
    });
  }, []);

  useEffect(() => {
    if (!isPlayingRadar || radarFrames.length === 0) return;
    const timer = setInterval(() => {
      setRadarIndex(prev => (prev + 1) % radarFrames.length);
    }, 700);
    return () => clearInterval(timer);
  }, [isPlayingRadar, radarFrames.length]);

  const currentRadarFrame = radarFrames[radarIndex];

  const disasterPointsGeoJSON = {
    type: 'FeatureCollection' as const,
    features: filteredDisasters
      .map(disaster => {
        const coords = parsePointLocation(disaster.location);
        if (!coords) return null;
        return {
          type: 'Feature' as const,
          properties: {
            id: disaster.id,
            severity: disaster.severity,
          },
          geometry: {
            type: 'Point' as const,
            coordinates: coords,
          },
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null),
  };

  const disasterZonesGeoJSON = {
    type: 'FeatureCollection' as const,
    features: filteredDisasters
      .map(disaster => {
        const coords = parsePointLocation(disaster.location);
        if (!coords) return null;
        return {
          type: 'Feature' as const,
          properties: {
            id: disaster.id,
            title: disaster.title,
            severity: disaster.severity,
          },
          geometry: {
            type: 'Polygon' as const,
            coordinates: [createCirclePolygon(coords, disaster.affected_radius_km || 25)],
          },
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null),
  };

  const handleDisasterClick = async (disaster: Disaster, longitude: number, latitude: number) => {
    activeDisasterIdRef.current = disaster.id;
    setPopupInfo(disaster);
    setLiveWeather(null);
    setWeatherLoading(true);
    setAiForecast(null);
    setAiError(null);
    setAiLoading(true);
    onDisasterSelect?.(disaster.id);

    let weatherData: LiveWeather | null = null;
    try {
      weatherData = await fetchLiveWeather(latitude, longitude);
      if (activeDisasterIdRef.current === disaster.id) {
        setLiveWeather(weatherData);
      }
    } finally {
      if (activeDisasterIdRef.current === disaster.id) {
        setWeatherLoading(false);
      }
    }

    try {
      const forecast = await predictDisasterTrajectory({
        id: disaster.id,
        type: disaster.type,
        title: disaster.title,
        locationName: disaster.location_name,
        lat: latitude,
        lng: longitude,
        severity: disaster.severity,
        radiusKm: disaster.affected_radius_km || 25,
        description: disaster.description,
        weather: weatherData,
      });
      if (activeDisasterIdRef.current === disaster.id) {
        setAiForecast(forecast);
      }
    } catch (err) {
      if (activeDisasterIdRef.current === disaster.id) {
        setAiError(err instanceof Error ? err.message : 'AI forecast unavailable');
      }
    } finally {
      if (activeDisasterIdRef.current === disaster.id) {
        setAiLoading(false);
      }
    }
  };

  const predictedPathGeoJSON = (() => {
    const origin = popupInfo ? parsePointLocation(popupInfo.location) : null;
    if (!origin || !aiForecast || aiForecast.timeline.length === 0) {
      return { type: 'FeatureCollection' as const, features: [] };
    }
    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: { id: popupInfo?.id },
          geometry: {
            type: 'LineString' as const,
            coordinates: [origin, ...aiForecast.timeline.map(wp => [wp.lng, wp.lat] as [number, number])],
          },
        },
      ],
    };
  })();

  const renderDisasterMarkers = () => {
    return filteredDisasters.map(disaster => {
      const coords = parsePointLocation(disaster.location);
      if (!coords) return null;
      const [longitude, latitude] = coords;
      
      return (
        <React.Fragment key={disaster.id}>
          <Marker
            longitude={longitude}
            latitude={latitude}
            onClick={e => {
              e.originalEvent.stopPropagation();
              handleDisasterClick(disaster, longitude, latitude);
            }}
          >
            <div className="relative cursor-pointer transform hover:scale-110 transition-transform marker-pulse">
              <AlertTriangle 
                className={`w-8 h-8 drop-shadow ${getSeverityColor(disaster.severity)}`}
              />
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white text-gray-900 flex items-center justify-center shadow">
                <span className="text-xs font-bold">{disaster.severity}</span>
              </div>
            </div>
          </Marker>
        </React.Fragment>
      );
    });
  };

  const renderResourceMarkers = () => {
    if (activeFilter !== 'all') return null;
    return resources.map(resource => {
      const coords = parsePointLocation(resource.location);
      if (!coords) return null;
      const [longitude, latitude] = coords;
      const Icon = RESOURCE_ICONS[resource.type] || Box;

      return (
        <Marker
          key={resource.id}
          longitude={longitude}
          latitude={latitude}
          onClick={e => {
            e.originalEvent.stopPropagation();
            setSelectedResource(resource);
          }}
        >
          <div className="cursor-pointer transform hover:scale-110 transition-transform">
            <Icon className={`w-6 h-6 drop-shadow ${getStatusColor(resource.status)}`} />
          </div>
        </Marker>
      );
    });
  };

  const renderTeamMarkers = () => {
    if (activeFilter !== 'all') return null;
    return teams.map(team => {
      const coords = parsePointLocation(team.location);
      if (!coords) return null;
      const [longitude, latitude] = coords;

      return (
        <Marker
          key={team.id}
          longitude={longitude}
          latitude={latitude}
        >
          <div className="cursor-pointer transform hover:scale-110 transition-transform">
            <Users className={`w-6 h-6 ${
              team.status === 'available' ? 'text-green-500' :
              team.status === 'responding' ? 'text-yellow-500' :
              'text-blue-500'
            }`} />
          </div>
        </Marker>
      );
    });
  };

  return (
    <div className="relative w-full h-full">
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-2 max-w-[calc(100%-5rem)]">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center space-x-1 bg-black/75 backdrop-blur-md p-1.5 rounded-lg border border-white/15 shadow-lg w-fit">
            <Layers className="w-4 h-4 text-blue-400 mx-1.5" />
            {MAP_STYLES.map(style => (
              <button
                key={style.id}
                onClick={() => setActiveStyleId(style.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeStyleId === style.id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-200 hover:bg-white/10'
                }`}
              >
                {style.label}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-1 bg-black/75 backdrop-blur-md p-1.5 rounded-lg border border-white/15 shadow-lg w-fit">
            <button
              onClick={() => setShowRadar(v => !v)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                showRadar ? 'bg-cyan-600 text-white' : 'text-gray-300 hover:bg-white/10'
              }`}
            >
              🌧️ Rain Radar
            </button>
            <button
              onClick={() => setShowHeatmap(v => !v)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                showHeatmap ? 'bg-orange-600 text-white' : 'text-gray-300 hover:bg-white/10'
              }`}
            >
              🔥 Heat Zone
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 bg-black/75 backdrop-blur-md p-1.5 rounded-lg border border-white/15 shadow-lg w-fit">
          {DISASTER_FILTERS.map(filter => {
            const count = disasters.filter(d => matchesFilter(d, filter.id)).length;
            return (
              <button
                key={filter.id}
                onClick={() => setActiveFilter(filter.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center space-x-1 ${
                  activeFilter === filter.id
                    ? 'bg-red-600 text-white'
                    : 'text-gray-200 hover:bg-white/10'
                }`}
              >
                <span>{filter.emoji}</span>
                <span>{filter.label}</span>
                <span className="ml-1 px-1.5 py-0.2 rounded-full bg-white/15 text-[10px]">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Animated RainViewer Timeline Player */}
      {showRadar && currentRadarFrame && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center space-x-2 bg-slate-900/85 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20 shadow-xl text-white text-xs">
          <button
            onClick={() => setIsPlayingRadar(p => !p)}
            className="p-1.5 rounded-full bg-blue-600 hover:bg-blue-500 transition-colors"
            aria-label={isPlayingRadar ? 'Pause radar' : 'Play radar'}
          >
            {isPlayingRadar ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setRadarIndex(i => (i - 1 + radarFrames.length) % radarFrames.length)}
            className="p-1 text-gray-300 hover:text-white"
            aria-label="Previous frame"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>
          <span className="font-medium tabular-nums px-1">
            {new Date(currentRadarFrame.time * 1000).toLocaleString([], {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          <button
            onClick={() => setRadarIndex(i => (i + 1) % radarFrames.length)}
            className="p-1 text-gray-300 hover:text-white"
            aria-label="Next frame"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Simple Non-Tech Legend */}
      <div className="absolute bottom-3 right-3 z-10 bg-black/75 backdrop-blur-md px-3 py-2 rounded-lg border border-white/15 text-[11px] text-gray-200 flex items-center space-x-3 shadow-lg">
        <span className="flex items-center space-x-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /><span>High Risk</span></span>
        <span className="flex items-center space-x-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /><span>Moderate</span></span>
        <span className="flex items-center space-x-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /><span>Low</span></span>
      </div>

      {/* Graphical Non-Tech Friendly Disaster Telemetry + AI Forecast Card */}
      {popupInfo && (
        <div className="absolute bottom-3 left-3 z-20 w-80 sm:w-96 max-h-[75%] overflow-y-auto bg-slate-900/95 border border-white/20 rounded-xl shadow-2xl p-4 text-white">
          <div className="flex items-start justify-between gap-2 mb-2.5">
            <div>
              <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border mb-1 ${getRiskLabel(popupInfo.severity).cls}`}>
                {getRiskLabel(popupInfo.severity).text}
              </span>
              <h3 className="font-bold text-base leading-tight">{popupInfo.title}</h3>
              <p className="text-xs text-gray-300 mt-0.5">📍 Region: {popupInfo.location_name}</p>
              {popupInfo.description && (
                <p className="text-[11px] text-gray-400 mt-1">{popupInfo.description}</p>
              )}
              <p className="text-[10px] text-gray-500 mt-0.5">
                🕒 Updated: {new Date(popupInfo.updated_at || popupInfo.created_at).toLocaleString()}
              </p>
            </div>
            <button
              onClick={() => {
                activeDisasterIdRef.current = null;
                setPopupInfo(null);
                setAiForecast(null);
              }}
              className="text-gray-400 hover:text-white p-1"
              aria-label="Close disaster details"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Current vs AI Prediction Tabs */}
          <div className="grid grid-cols-2 gap-1 bg-black/30 p-1 rounded-lg border border-white/10 mb-3 text-xs font-medium">
            <button
              type="button"
              onClick={() => setDetailTab('current')}
              className={`py-1.5 rounded-md transition-colors ${
                detailTab === 'current' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:text-white'
              }`}
            >
              📊 Current Live
            </button>
            <button
              type="button"
              onClick={() => setDetailTab('ai')}
              className={`py-1.5 rounded-md transition-colors flex items-center justify-center space-x-1 ${
                detailTab === 'ai' ? 'bg-purple-600 text-white' : 'text-gray-300 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Future Path</span>
              {aiLoading && <span className="w-1.5 h-1.5 rounded-full bg-purple-300 animate-ping" />}
            </button>
          </div>

          {detailTab === 'current' ? (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs bg-white/5 rounded-lg p-2.5 mb-3">
                <div>
                  <span className="text-gray-400 block">Impact Zone</span>
                  <span className="font-semibold text-white">{popupInfo.affected_radius_km} km radius</span>
                </div>
                <div>
                  <span className="text-gray-400 block">Frequency (Active)</span>
                  <span className="font-semibold text-white flex items-center space-x-1">
                    <Gauge className="w-3.5 h-3.5 text-purple-400" />
                    <span>{disasters.filter(d => d.type === popupInfo.type).length} {popupInfo.type}(s)</span>
                  </span>
                </div>
              </div>

              {weatherLoading ? (
                <p className="text-xs text-blue-300 animate-pulse">Loading live wind, water & sea telemetry...</p>
              ) : liveWeather ? (
                <div className="space-y-2.5 text-xs">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="flex items-center space-x-1 text-gray-300">
                        <Wind className="w-3.5 h-3.5 text-sky-400" />
                        <span>Wind Speed</span>
                      </span>
                      <span className="font-semibold">
                        {liveWeather.wind_speed_10m} km/h ({getWindStatus(liveWeather.wind_speed_10m).label})
                      </span>
                    </div>
                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${getWindStatus(liveWeather.wind_speed_10m).color}`}
                        style={{ width: `${getWindStatus(liveWeather.wind_speed_10m).pct}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="flex items-center space-x-1 text-gray-300">
                        <Droplets className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Water / Rain Level</span>
                      </span>
                      <span className="font-semibold">
                        {liveWeather.precipitation} mm
                        {liveWeather.river_discharge !== null ? ` • Flow ${liveWeather.river_discharge.toFixed(1)} m³/s` : ''}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${getWaterStatus(liveWeather.precipitation, liveWeather.river_discharge).color}`}
                        style={{ width: `${getWaterStatus(liveWeather.precipitation, liveWeather.river_discharge).pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-white/5 rounded-lg px-2.5 py-1.5">
                    <span className="flex items-center space-x-1 text-gray-300">
                      <Waves className="w-3.5 h-3.5 text-teal-400" />
                      <span>Sea Current / Waves</span>
                    </span>
                    <span className="font-semibold">
                      {liveWeather.wave_height !== null || liveWeather.ocean_current_velocity !== null
                        ? `${liveWeather.wave_height ?? 0} m waves • ${liveWeather.ocean_current_velocity ?? 0} m/s`
                        : 'Inland Region'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-gray-300 pt-1">
                    <span className="flex items-center space-x-1">
                      <Thermometer className="w-3.5 h-3.5 text-orange-400" />
                      <span>Temp: <strong className="text-white">{liveWeather.temperature_2m}°C</strong></span>
                    </span>
                    <span>Humidity: <strong className="text-white">{liveWeather.relative_humidity_2m}%</strong></span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400">{popupInfo.description}</p>
              )}
            </>
          ) : (
            <div className="space-y-3 text-xs">
              {aiLoading ? (
                <div className="py-6 text-center space-y-2">
                  <Sparkles className="w-6 h-6 text-purple-400 animate-spin mx-auto" />
                  <p className="text-purple-200">Gemini AI {popupInfo.type} route & future ETA predict kar raha hai...</p>
                </div>
              ) : aiError ? (
                <div className="p-3 bg-red-500/20 border border-red-500/40 rounded-lg text-red-200">
                  {aiError}
                </div>
              ) : aiForecast ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-purple-300 flex items-center space-x-1">
                      <Navigation className="w-3.5 h-3.5" />
                      <span>{aiForecast.typeSpecificLabel}</span>
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      aiForecast.riskTrend === 'Escalating'
                        ? 'bg-red-500/20 text-red-300'
                        : aiForecast.riskTrend === 'Weakening'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}>
                      {aiForecast.riskTrend} • {aiForecast.confidence}% conf.
                    </span>
                  </div>

                  <p className="text-gray-200 leading-relaxed">{aiForecast.summary}</p>

                  {aiForecast.keyMetrics.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      {aiForecast.keyMetrics.map((m, idx) => (
                        <div key={idx} className="bg-white/5 rounded-lg p-2">
                          <span className="text-gray-400 block text-[10px]">{m.label}</span>
                          <span className="font-semibold text-white">{m.value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {aiForecast.timeline.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-semibold text-gray-300 flex items-center space-x-1">
                        <Clock className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Predicted Route & ETA Timeline (Shown on Map)</span>
                      </span>
                      {aiForecast.timeline.map((wp, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => mapRef.current?.flyTo({ center: [wp.lng, wp.lat], zoom: 6, duration: 700 })}
                          className="w-full text-left bg-white/5 hover:bg-purple-500/20 border border-white/10 rounded-lg px-2.5 py-2 transition-colors flex items-center justify-between"
                        >
                          <div>
                            <span className="text-cyan-300 font-semibold">{wp.eta}</span>
                            <span className="text-white ml-2">{wp.area}</span>
                          </div>
                          <span className="text-gray-300 text-[11px]">{wp.intensity}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="p-2.5 bg-amber-500/15 border border-amber-500/30 rounded-lg text-amber-200 text-[11px]">
                    <strong>Safety Advice:</strong> {aiForecast.actionAdvice}
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      )}

      <Map
        ref={mapRef}
        {...viewState}
        onMove={handleViewStateChange}
        style={{ width: '100%', height: '100%' }}
        mapStyle={MAP_STYLES.find(s => s.id === activeStyleId)?.style ?? MAP_STYLES[0].style}
        projection={{ name: 'mercator' }}
        mapboxAccessToken={MAPBOX_TOKEN}
        attributionControl={false}
      >
      <GeolocateControl 
        position="top-right"
        positionOptions={{ enableHighAccuracy: true }}
        trackUserLocation={true}
        showUserHeading={true}
        showAccuracyCircle={true}
      />
      <FullscreenControl position="top-right" />
      <NavigationControl position="top-right" showCompass={true} showZoom={true} visualizePitch={true} />

      {/* Live RainViewer Weather Radar Raster Overlay */}
      {showRadar && currentRadarFrame && (
        <Source
          id="rainviewer-radar"
          type="raster"
          tiles={[currentRadarFrame.tileUrl]}
          tileSize={256}
        >
          <Layer
            id="rainviewer-radar-layer"
            type="raster"
            paint={{ 'raster-opacity': 0.72 }}
          />
        </Source>
      )}

      {/* Disaster Severity Heatmap Overlay */}
      {showHeatmap && (
        <Source id="disaster-heatmap-source" type="geojson" data={disasterPointsGeoJSON}>
          <Layer
            id="disaster-heatmap-layer"
            type="heatmap"
            paint={{
              'heatmap-weight': ['interpolate', ['linear'], ['get', 'severity'], 1, 0.3, 5, 1],
              'heatmap-intensity': 1.2,
              'heatmap-radius': 35,
              'heatmap-opacity': 0.75,
              'heatmap-color': [
                'interpolate',
                ['linear'],
                ['heatmap-density'],
                0, 'rgba(0, 0, 255, 0)',
                0.2, 'rgba(59, 130, 246, 0.55)',
                0.5, 'rgba(245, 158, 11, 0.75)',
                0.8, 'rgba(239, 68, 68, 0.9)',
                1, 'rgba(220, 38, 38, 1)'
              ],
            }}
          />
        </Source>
      )}

      {/* Render live disaster impact radius zones */}
      <Source id="disaster-impact-zones" type="geojson" data={disasterZonesGeoJSON}>
        <Layer
          id="disaster-impact-fill"
          type="fill"
          paint={{
            'fill-color': [
              'case',
              ['>=', ['get', 'severity'], 4], 'rgba(239, 68, 68, 0.25)',
              ['>=', ['get', 'severity'], 3], 'rgba(245, 158, 11, 0.25)',
              'rgba(59, 130, 246, 0.25)'
            ]
          }}
        />
        <Layer
          id="disaster-impact-line"
          type="line"
          paint={{
            'line-color': [
              'case',
              ['>=', ['get', 'severity'], 4], '#ef4444',
              ['>=', ['get', 'severity'], 3], '#f59e0b',
              '#3b82f6'
            ],
            'line-width': 2
          }}
        />
      </Source>

      {/* AI Predicted Trajectory / Spread Path on Map */}
      {predictedPathGeoJSON.features.length > 0 && (
        <Source id="ai-predicted-path" type="geojson" data={predictedPathGeoJSON}>
          <Layer
            id="ai-predicted-path-line"
            type="line"
            paint={{
              'line-color': '#c084fc',
              'line-width': 3.5,
              'line-dasharray': [2, 1.5],
            }}
          />
        </Source>
      )}

      {aiForecast?.timeline.map((wp, idx) => (
        <Marker key={`ai-wp-${idx}`} longitude={wp.lng} latitude={wp.lat}>
          <div className="flex flex-col items-center pointer-events-none">
            <div className="px-2 py-0.5 rounded-full bg-purple-600 text-white text-[10px] font-bold border border-white/60 shadow-lg whitespace-nowrap">
              {wp.eta} • {wp.area}
            </div>
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-300 border-2 border-purple-900 mt-0.5 shadow" />
          </div>
        </Marker>
      ))}

      {renderDisasterMarkers()}
      {renderResourceMarkers()}
      {renderTeamMarkers()}

      {(() => {
        const coords = popupInfo ? parsePointLocation(popupInfo.location) : null;
        if (!popupInfo || !coords) return null;
        return (
        <Popup
          longitude={coords[0]}
          latitude={coords[1]}
          anchor="bottom"
          onClose={() => setPopupInfo(null)}
          closeButton={true}
          closeOnClick={false}
          className="disaster-popup"
        >
          <div className="p-3 max-w-xs backdrop-blur-sm bg-white/90">
            <h3 className="font-bold text-lg">{popupInfo.title}</h3>
            <p className="text-sm text-gray-600 mb-2">{popupInfo.description}</p>
            <div className="space-y-2">
              <div className={`px-2 py-1 rounded-full text-xs font-medium inline-block
                ${popupInfo.severity >= 4 ? 'bg-red-100 text-red-800' :
                  popupInfo.severity >= 3 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-blue-100 text-blue-800'}`}>
                Level {popupInfo.severity}
              </div>
              <p className="text-xs text-gray-500">
                Affected radius: {popupInfo.affected_radius_km}km
              </p>
              {popupInfo.affected_population && (
                <p className="text-xs text-gray-500">
                  Population affected: {popupInfo.affected_population.toLocaleString()}
                </p>
              )}
              {liveWeather && (
                <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-700 grid grid-cols-2 gap-1">
                  <span>🌡️ {liveWeather.temperature_2m}°C</span>
                  <span>💨 {liveWeather.wind_speed_10m} km/h</span>
                  <span>🌧️ {liveWeather.precipitation} mm</span>
                  <span>💧 {liveWeather.relative_humidity_2m}%</span>
                </div>
              )}
            </div>
          </div>
        </Popup>
        );
      })()}

      {(() => {
        const coords = selectedResource ? parsePointLocation(selectedResource.location) : null;
        if (!selectedResource || !coords) return null;
        return (
        <Popup
          longitude={coords[0]}
          latitude={coords[1]}
          anchor="bottom"
          onClose={() => setSelectedResource(null)}
          closeButton={true}
          closeOnClick={false}
          className="resource-popup"
        >
          <div className="p-3 max-w-xs backdrop-blur-sm bg-white/90">
            <h3 className="font-bold text-lg">{selectedResource.name}</h3>
            <p className="text-sm text-gray-600 mb-2">{selectedResource.description}</p>
            <div className="space-y-2">
              <div className={`px-2 py-1 rounded-full text-xs font-medium inline-block
                ${getStatusColor(selectedResource.status).replace('text-', 'bg-').replace('500', '100')}
                ${getStatusColor(selectedResource.status).replace('text-', 'text-').replace('500', '800')}`}>
                {selectedResource.status}
              </div>
              <p className="text-xs text-gray-500">
                Quantity: {selectedResource.quantity} {selectedResource.unit}
              </p>
              <p className="text-xs text-gray-500">
                Location: {selectedResource.location_name}
              </p>
            </div>
          </div>
        </Popup>
        );
      })()}
    </Map>
    </div>
  );
}