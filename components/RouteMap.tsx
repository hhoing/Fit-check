/* eslint-disable @next/next/no-img-element -- Interactive map tiles use dynamic URLs. */
"use client";

import {
  PointerEvent,
  WheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AlertTriangle, Minus, Plus } from "lucide-react";
import { MapPoint } from "@/types";

interface RouteMapProps {
  staticMapUrl?: string;
  clientId?: string;
  originPoint?: MapPoint;
  destinationPoint?: MapPoint;
  routePath?: MapPoint[];
}

type NaverMapInstance = {
  fitBounds: (bounds: unknown) => void;
};

type NaverBounds = {
  extend: (point: unknown) => void;
};

type NaverMapsNamespace = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => NaverMapInstance;
  LatLng: new (lat: number, lng: number) => unknown;
  LatLngBounds: new () => NaverBounds;
  Marker: new (options: Record<string, unknown>) => unknown;
  Polyline: new (options: Record<string, unknown>) => unknown;
  PointingIcon?: {
    OPEN_ARROW?: string;
  };
};

type MapView = {
  center: MapPoint;
  zoom: number;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  view: MapView;
};

type Tile = {
  key: string;
  src: string;
  left: number;
  top: number;
};

declare global {
  interface Window {
    naver?: {
      maps?: NaverMapsNamespace;
    };
    navermap_authFailure?: () => void;
    __fitCheckNaverMapsPromise?: Promise<void>;
    __fitCheckNaverMapsReady?: () => void;
  }
}

const TILE_SIZE = 256;
const MIN_ZOOM = 7;
const MAX_ZOOM = 16;
const DEFAULT_SIZE = { width: 900, height: 192 };

function loadNaverMaps(clientId: string): Promise<void> {
  if (window.naver?.maps) return Promise.resolve();
  if (window.__fitCheckNaverMapsPromise) return window.__fitCheckNaverMapsPromise;

  window.__fitCheckNaverMapsPromise = new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      window.__fitCheckNaverMapsPromise = undefined;
      reject(new Error("지도 SDK 초기화 시간이 초과되었습니다."));
    }, 10000);

    const resolveIfReady = () => {
      window.clearTimeout(timeoutId);
      delete window.__fitCheckNaverMapsReady;

      if (window.naver?.maps) {
        resolve();
        return;
      }

      window.__fitCheckNaverMapsPromise = undefined;
      reject(new Error("지도 SDK를 불러왔지만 지도 객체를 찾지 못했습니다."));
    };

    const fail = () => {
      window.clearTimeout(timeoutId);
      delete window.__fitCheckNaverMapsReady;
      window.__fitCheckNaverMapsPromise = undefined;
      reject(new Error("지도 SDK 로드에 실패했습니다."));
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-fit-check-naver-map="true"]'
    );

    if (existingScript) {
      existingScript.addEventListener("load", resolveIfReady, { once: true });
      existingScript.addEventListener("error", fail, { once: true });
      return;
    }

    window.__fitCheckNaverMapsReady = resolveIfReady;

    const script = document.createElement("script");
    script.dataset.fitCheckNaverMap = "true";
    script.async = true;
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(
      clientId
    )}&callback=__fitCheckNaverMapsReady`;
    script.onerror = fail;
    document.head.appendChild(script);
  });

  return window.__fitCheckNaverMapsPromise;
}

function toLatLng(maps: NaverMapsNamespace, point: MapPoint): unknown {
  return new maps.LatLng(point.lat, point.lng);
}

function hasAuthFailureText(element: HTMLElement): boolean {
  return element.innerText.includes("인증") && element.innerText.includes("실패");
}

function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(zoom)));
}

function getDistanceKm(a: MapPoint, b: MapPoint): number {
  const radiusKm = 6371;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  return 2 * radiusKm * Math.asin(Math.sqrt(haversine));
}

function inferZoom(points: MapPoint[]): number {
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const southWest = { lat: Math.min(...lats), lng: Math.min(...lngs) };
  const northEast = { lat: Math.max(...lats), lng: Math.max(...lngs) };
  const diagonalKm = getDistanceKm(southWest, northEast);

  if (diagonalKm > 80) return 9;
  if (diagonalKm > 40) return 10;
  if (diagonalKm > 20) return 11;
  if (diagonalKm > 10) return 12;
  if (diagonalKm > 5) return 13;
  if (diagonalKm > 2) return 14;
  return 15;
}

function getCenter(points: MapPoint[]): MapPoint {
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);

  return {
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
    lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
  };
}

function project(point: MapPoint, zoom: number): { x: number; y: number } {
  const sinLat = Math.sin((point.lat * Math.PI) / 180);
  const worldSize = TILE_SIZE * 2 ** zoom;

  return {
    x: ((point.lng + 180) / 360) * worldSize,
    y:
      (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) *
      worldSize,
  };
}

function unproject(point: { x: number; y: number }, zoom: number): MapPoint {
  const worldSize = TILE_SIZE * 2 ** zoom;
  const lng = (point.x / worldSize) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * point.y) / worldSize;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));

  return { lat, lng };
}

function wrapTileX(x: number, zoom: number): number {
  const max = 2 ** zoom;
  return ((x % max) + max) % max;
}

function getScreenPoint(
  point: MapPoint,
  view: MapView,
  size: { width: number; height: number }
) {
  const center = project(view.center, view.zoom);
  const current = project(point, view.zoom);

  return {
    x: current.x - center.x + size.width / 2,
    y: current.y - center.y + size.height / 2,
  };
}

function toSvgPoints(
  points: MapPoint[],
  view: MapView,
  size: { width: number; height: number }
): string {
  return points
    .map((point) => {
      const screen = getScreenPoint(point, view, size);
      return `${screen.x.toFixed(1)},${screen.y.toFixed(1)}`;
    })
    .join(" ");
}

function useElementSize() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState(DEFAULT_SIZE);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
      });
    };
    const resizeObserver = new ResizeObserver(updateSize);

    updateSize();
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, []);

  return { ref, size };
}

function OSMFallbackMap({
  originPoint,
  destinationPoint,
  routePath,
}: {
  originPoint?: MapPoint;
  destinationPoint?: MapPoint;
  routePath?: MapPoint[];
}) {
  const { ref, size } = useElementSize();
  const dragStateRef = useRef<DragState | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const displayPath = useMemo(() => {
    if (routePath && routePath.length > 1) return routePath;
    if (originPoint && destinationPoint) return [originPoint, destinationPoint];
    return [];
  }, [destinationPoint, originPoint, routePath]);
  const defaultView = useMemo<MapView>(() => {
    const points = displayPath.length ? displayPath : [{ lat: 37.5665, lng: 126.978 }];

    return {
      center: getCenter(points),
      zoom: clampZoom(inferZoom(points)),
    };
  }, [displayPath]);
  const [view, setView] = useState<MapView>(defaultView);
  const tiles = useMemo<Tile[]>(() => {
    const center = project(view.center, view.zoom);
    const topLeft = {
      x: center.x - size.width / 2,
      y: center.y - size.height / 2,
    };
    const minTileX = Math.floor(topLeft.x / TILE_SIZE) - 1;
    const maxTileX = Math.floor((topLeft.x + size.width) / TILE_SIZE) + 1;
    const minTileY = Math.max(0, Math.floor(topLeft.y / TILE_SIZE) - 1);
    const maxTileY = Math.min(
      2 ** view.zoom - 1,
      Math.floor((topLeft.y + size.height) / TILE_SIZE) + 1
    );
    const nextTiles: Tile[] = [];

    for (let x = minTileX; x <= maxTileX; x += 1) {
      for (let y = minTileY; y <= maxTileY; y += 1) {
        const tileX = wrapTileX(x, view.zoom);
        nextTiles.push({
          key: `${view.zoom}-${x}-${y}`,
          src: `https://tile.openstreetmap.org/${view.zoom}/${tileX}/${y}.png`,
          left: x * TILE_SIZE - topLeft.x,
          top: y * TILE_SIZE - topLeft.y,
        });
      }
    }

    return nextTiles;
  }, [size.height, size.width, view]);
  const linePoints = useMemo(
    () => (displayPath.length > 1 ? toSvgPoints(displayPath, view, size) : ""),
    [displayPath, size, view]
  );
  const originScreen = originPoint ? getScreenPoint(originPoint, view, size) : null;
  const destinationScreen = destinationPoint ? getScreenPoint(destinationPoint, view, size) : null;

  const zoomBy = (delta: number, anchor?: { x: number; y: number }) => {
    const nextZoom = clampZoom(view.zoom + delta);
    if (nextZoom === view.zoom) return;

    const cursor = anchor ?? { x: size.width / 2, y: size.height / 2 };
    const oldCenter = project(view.center, view.zoom);
    const oldTopLeft = {
      x: oldCenter.x - size.width / 2,
      y: oldCenter.y - size.height / 2,
    };
    const anchorPoint = unproject(
      { x: oldTopLeft.x + cursor.x, y: oldTopLeft.y + cursor.y },
      view.zoom
    );
    const nextAnchor = project(anchorPoint, nextZoom);
    const nextCenter = {
      x: nextAnchor.x - cursor.x + size.width / 2,
      y: nextAnchor.y - cursor.y + size.height / 2,
    };

    setView({
      center: unproject(nextCenter, nextZoom),
      zoom: nextZoom,
    });
  };
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      view,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    setDragOffset({
      x: event.clientX - dragState.startX,
      y: event.clientY - dragState.startY,
    });
  };
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const offset = {
      x: event.clientX - dragState.startX,
      y: event.clientY - dragState.startY,
    };
    const center = project(dragState.view.center, dragState.view.zoom);

    setView({
      center: unproject({ x: center.x - offset.x, y: center.y - offset.y }, dragState.view.zoom),
      zoom: dragState.view.zoom,
    });
    dragStateRef.current = null;
    setDragOffset({ x: 0, y: 0 });

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();

    zoomBy(event.deltaY < 0 ? 1 : -1, {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  };

  if (!originPoint || !destinationPoint) {
    return (
      <div className="flex min-h-48 items-start gap-2 rounded-lg border border-amber-100 bg-white px-3 py-2 text-xs text-amber-700">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <p>지도에 표시할 좌표가 부족합니다.</p>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="relative h-48 w-full touch-none overflow-hidden rounded-lg border border-slate-200 bg-[#edf2f7]"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onWheel={handleWheel}
    >
      <div
        className="absolute inset-0 cursor-grab select-none active:cursor-grabbing"
        style={{ transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
      >
        {tiles.map((tile) => (
          <img
            key={tile.key}
            src={tile.src}
            alt=""
            draggable={false}
            className="absolute h-64 w-64 select-none"
            style={{ left: tile.left, top: tile.top }}
          />
        ))}
        {linePoints && (
          <svg
            viewBox={`0 0 ${size.width} ${size.height}`}
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            <polyline
              points={linePoints}
              fill="none"
              stroke="#059669"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity="0.95"
              strokeWidth="8"
            />
          </svg>
        )}
        {originScreen && (
          <div
            className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-blue-500 shadow"
            style={{ left: originScreen.x, top: originScreen.y }}
          />
        )}
        {destinationScreen && (
          <div
            className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-red-500 shadow"
            style={{ left: destinationScreen.x, top: destinationScreen.y }}
          />
        )}
      </div>

      <div className="absolute right-2 top-2 z-10 flex overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center text-slate-700 transition-colors hover:bg-slate-50"
          title="확대"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            zoomBy(1);
          }}
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center border-l border-slate-200 text-slate-700 transition-colors hover:bg-slate-50"
          title="축소"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            zoomBy(-1);
          }}
        >
          <Minus className="h-4 w-4" />
        </button>
      </div>

      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-1 right-1 z-10 rounded bg-white/85 px-1.5 py-0.5 text-[10px] text-slate-500"
        onPointerDown={(event) => event.stopPropagation()}
      >
        OpenStreetMap
      </a>
    </div>
  );
}

export default function RouteMap({
  clientId,
  originPoint,
  destinationPoint,
  routePath,
}: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [failedDynamicMapKey, setFailedDynamicMapKey] = useState<string | null>(null);
  const pathKey = useMemo(
    () => routePath?.map((point) => `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`).join("|"),
    [routePath]
  );
  const displayPath = useMemo(() => {
    if (routePath && routePath.length > 1) return routePath;
    if (originPoint && destinationPoint) return [originPoint, destinationPoint];
    return [];
  }, [destinationPoint, originPoint, routePath]);
  const canUseDynamicMap = Boolean(clientId && originPoint && destinationPoint);
  const dynamicMapKey =
    canUseDynamicMap && clientId && originPoint && destinationPoint
      ? [
          clientId,
          originPoint.lat.toFixed(6),
          originPoint.lng.toFixed(6),
          destinationPoint.lat.toFixed(6),
          destinationPoint.lng.toFixed(6),
          pathKey ?? "",
        ].join("|")
      : null;
  const fallbackMapKey = dynamicMapKey ?? pathKey ?? "fallback-map";
  const showFallback = !canUseDynamicMap || failedDynamicMapKey === dynamicMapKey;

  useEffect(() => {
    if (!canUseDynamicMap || !clientId || !originPoint || !destinationPoint) return;

    let cancelled = false;
    const previousAuthFailure = window.navermap_authFailure;
    const authFailureTimerIds: number[] = [];

    window.navermap_authFailure = () => {
      previousAuthFailure?.();
      if (!cancelled) setFailedDynamicMapKey(dynamicMapKey);
    };

    const initMap = async () => {
      try {
        await loadNaverMaps(clientId);
        if (cancelled) return;

        const maps = window.naver?.maps;
        const container = containerRef.current;

        if (!maps || !container) {
          throw new Error("지도 SDK를 초기화하지 못했습니다.");
        }

        container.innerHTML = "";
        const center = displayPath[Math.floor(displayPath.length / 2)] ?? originPoint;
        const map = new maps.Map(container, {
          center: toLatLng(maps, center),
          zoom: 11,
          zoomControl: true,
        });
        const bounds = new maps.LatLngBounds();
        const linePath = displayPath.map((point) => toLatLng(maps, point));

        bounds.extend(toLatLng(maps, originPoint));
        bounds.extend(toLatLng(maps, destinationPoint));
        linePath.forEach((point) => bounds.extend(point));

        new maps.Polyline({
          map,
          path: linePath,
          strokeColor: "#059669",
          strokeOpacity: 0.9,
          strokeWeight: 6,
          endIcon: maps.PointingIcon?.OPEN_ARROW,
        });
        new maps.Marker({
          map,
          position: toLatLng(maps, originPoint),
          title: "출발지",
        });
        new maps.Marker({
          map,
          position: toLatLng(maps, destinationPoint),
          title: "근무지",
        });

        map.fitBounds(bounds);

        authFailureTimerIds.push(
          window.setTimeout(() => {
            if (!cancelled && hasAuthFailureText(container)) {
              setFailedDynamicMapKey(dynamicMapKey);
            }
          }, 1200)
        );
      } catch {
        if (!cancelled) setFailedDynamicMapKey(dynamicMapKey);
      }
    };

    initMap();

    return () => {
      cancelled = true;
      authFailureTimerIds.forEach((timerId) => window.clearTimeout(timerId));
      if (window.navermap_authFailure !== previousAuthFailure) {
        window.navermap_authFailure = previousAuthFailure;
      }
    };
  }, [canUseDynamicMap, clientId, destinationPoint, displayPath, dynamicMapKey, originPoint]);

  if (showFallback) {
    return (
      <OSMFallbackMap
        key={fallbackMapKey}
        originPoint={originPoint}
        destinationPoint={destinationPoint}
        routePath={routePath}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-48 w-full overflow-hidden rounded-lg border border-slate-200 bg-white"
    />
  );
}
