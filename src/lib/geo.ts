export type GeoPoint = { type: 'Point'; coordinates: [number, number] };

/**
 * Parses either a GeoJSON Point object or a PostGIS EWKB hex string
 * (e.g. "0101000020E6100000...") into [longitude, latitude].
 */
export function parsePointLocation(location: unknown): [number, number] | null {
  if (!location) return null;

  if (
    typeof location === 'object' &&
    location !== null &&
    'coordinates' in location &&
    Array.isArray((location as GeoPoint).coordinates) &&
    (location as GeoPoint).coordinates.length >= 2
  ) {
    const [lng, lat] = (location as GeoPoint).coordinates;
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      return [lng, lat];
    }
    return null;
  }

  if (typeof location === 'string' && /^[0-9a-fA-F]+$/.test(location) && location.length >= 42) {
    const bytes = new Uint8Array(location.length / 2);
    for (let i = 0; i < location.length; i += 2) {
      bytes[i / 2] = parseInt(location.slice(i, i + 2), 16);
    }
    const view = new DataView(bytes.buffer);
    const littleEndian = view.getUint8(0) === 1;
    const geomType = view.getUint32(1, littleEndian);
    const hasSrid = (geomType & 0x20000000) !== 0;
    const offset = hasSrid ? 9 : 5;
    if (bytes.byteLength < offset + 16) return null;

    const lng = view.getFloat64(offset, littleEndian);
    const lat = view.getFloat64(offset + 8, littleEndian);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      return [lng, lat];
    }
  }

  return null;
}

/**
 * Generates a GeoJSON Polygon approximating a circle of `radiusKm` around `[lng, lat]`.
 */
export function createCirclePolygon(
  center: [number, number],
  radiusKm: number,
  steps = 48
): [number, number][] {
  const [lng, lat] = center;
  const coords: [number, number][] = [];
  const latDegPerKm = 1 / 110.574;
  const lngDegPerKm = 1 / (111.32 * Math.cos((lat * Math.PI) / 180));

  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    coords.push([
      lng + Math.cos(angle) * radiusKm * lngDegPerKm,
      lat + Math.sin(angle) * radiusKm * latDegPerKm,
    ]);
  }
  return coords;
}
