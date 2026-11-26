import { useEffect, useMemo, useRef, useState } from "react";
import createGlobe from "cobe";
import type { COBEOptions } from "cobe";
import { useDisasterStore } from '../store/disaster';
import { parsePointLocation } from '../lib/geo';

function getDisasterColor(type: string): [number, number, number] {
  switch (type) {
    case 'earthquake':
      return [1, 0.25, 0.2];
    case 'flood':
      return [0.2, 0.55, 1];
    case 'hurricane':
      return [0.95, 0.8, 0.2];
    case 'tornado':
      return [0.7, 0.3, 0.95];
    case 'wildfire':
      return [1, 0.5, 0.1];
    case 'tsunami':
      return [0, 0.8, 0.95];
    default:
      return [1, 1, 1];
  }
}

export function Globe({
  className = "",
}: {
  className?: string;
  config?: Partial<COBEOptions>;
}) {
  const { disasters } = useDisasterStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phiRef = useRef(0);
  const pointerInteracting = useRef<number | null>(null);
  const pointerStartRotation = useRef(0);
  const rotationRef = useRef(0);
  const [isLoading, setIsLoading] = useState(true);

  const markers = useMemo(
    () =>
      disasters
        .map(disaster => {
          const coords = parsePointLocation(disaster.location);
          if (!coords) return null;
          return {
            location: [coords[1], coords[0]] as [number, number],
            size: 0.04 + disaster.severity * 0.015,
            color: getDisasterColor(disaster.type),
          };
        })
        .filter((m): m is NonNullable<typeof m> => m !== null),
    [disasters]
  );

  const updatePointerInteraction = (clientX: number | null) => {
    pointerInteracting.current = clientX;
    if (clientX !== null) {
      pointerStartRotation.current = rotationRef.current;
    }
    if (canvasRef.current) {
      canvasRef.current.style.cursor = clientX !== null ? "grabbing" : "grab";
    }
  };

  const updateMovement = (clientX: number) => {
    if (pointerInteracting.current !== null) {
      const delta = clientX - pointerInteracting.current;
      rotationRef.current = pointerStartRotation.current + delta / 200;
    }
  };

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const getSize = () => {
      if (!containerRef.current) return 520;
      const { clientWidth, clientHeight } = containerRef.current;
      return Math.max(280, Math.min(clientWidth, clientHeight) - 16);
    };

    let size = getSize();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const onResize = () => {
      size = getSize();
      if (canvasRef.current) {
        canvasRef.current.style.width = `${size}px`;
        canvasRef.current.style.height = `${size}px`;
      }
    };

    onResize();
    window.addEventListener("resize", onResize);

    const globe = createGlobe(canvasRef.current, {
      width: size * dpr,
      height: size * dpr,
      devicePixelRatio: dpr,
      phi: 0,
      theta: 0.25,
      dark: 1,
      diffuse: 1.2,
      mapSamples: 8000,
      mapBrightness: 6,
      baseColor: [0.3, 0.3, 0.6],
      markerColor: [0.95, 0.35, 0.25],
      glowColor: [0.25, 0.45, 0.85],
      opacity: 0.95,
      markers,
      onRender: (state) => {
        if (pointerInteracting.current === null) {
          phiRef.current += 0.004;
        }
        state.phi = phiRef.current + rotationRef.current;
        state.width = size * dpr;
        state.height = size * dpr;
      },
    });

    const timer = setTimeout(() => {
      if (canvasRef.current) {
        canvasRef.current.style.opacity = "1";
        setIsLoading(false);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
      globe.destroy();
    };
  }, [markers]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full flex items-center justify-center overflow-hidden ${className}`}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="opacity-0 transition-opacity duration-500"
        style={{
          contain: "layout paint size",
          cursor: "grab",
        }}
        onPointerDown={(e) => updatePointerInteraction(e.clientX)}
        onPointerUp={() => updatePointerInteraction(null)}
        onPointerOut={() => updatePointerInteraction(null)}
        onMouseMove={(e) => updateMovement(e.clientX)}
        onTouchMove={(e) =>
          e.touches[0] && updateMovement(e.touches[0].clientX)
        }
      />
      <div className="absolute bottom-4 left-4 bg-black/55 backdrop-blur-sm border border-white/10 rounded-lg p-3">
        <div className="text-xs text-white space-y-1.5">
          <div className="font-semibold mb-1.5">Disaster Types ({markers.length})</div>
          {['earthquake', 'flood', 'hurricane', 'tornado', 'wildfire', 'tsunami'].map(type => (
            <div key={type} className="flex items-center space-x-2">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{
                  backgroundColor: `rgb(${getDisasterColor(type).map(c => Math.round(c * 255)).join(',')})`,
                }}
              />
              <span className="capitalize">{type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
