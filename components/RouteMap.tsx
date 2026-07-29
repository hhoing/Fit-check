"use client";

import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
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

type StaticMapView = {
  center: MapPoint;
  level: number;
};

type ViewOverride = {
  key: string;
  view: StaticMapView;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  view: StaticMapView;
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

const STATIC_MAP_WIDTH = 900;
const STATIC_MAP_HEIGHT = 280;
const MIN_LEVEL = 5;
const MAX_LEVEL = 14;

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

function inferLevel(points: MapPoint[]): number {
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const southWest = { lat: Math.min(...lats), lng: Math.min(...lngs) };
  const northEast = { lat: Math.max(...lats), lng: Math.max(...lngs) };
  const diagonalKm = getDistanceKm(southWest, northEast);

  if (diagonalKm > 120) return 13;
  if (diagonalKm > 70) return 12;
  if (diagonalKm > 30) return 11;
  if (diagonalKm > 12) return 10;
  if (diagonalKm > 6) return 9;
  if (diagonalKm > 3) return 8;
  if (diagonalKm > 1.5) return 7;
  return 6;
}

function getCenter(points: MapPoint[]): MapPoint {
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);

  return {
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
    lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
  };
}

function clampLevel(level: number): number {
  return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.round(level)));
}

function project(point: MapPoint, level: number): { x: number; y: number } {
  const sinLat = Math.sin((point.lat * Math.PI) / 180);
  const worldSize = 256 * 2 ** level;

  return {
    x: ((point.lng + 180) / 360) * worldSize,
    y:
      (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) *
      worldSize,
  };
}

function unproject(point: { x: number; y: number }, level: number): MapPoint {
  const worldSize = 256 * 2 ** level;
  const lng = (point.x / worldSize) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * point.y) / worldSize;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));

  return { lat, lng };
}

function getStaticMapUrl(staticMapUrl: string | undefined, view: StaticMapView): string | undefined {
  if (!staticMapUrl) return undefined;

  const url = new URL(staticMapUrl, "https://fit-check.local");
  url.searchParams.set("clng", String(view.center.lng));
  url.searchParams.set("clat", String(view.center.lat));
  url.searchParams.set("level", String(view.level));

  return `${url.pathname}${url.search}`;
}

function toSvgPoints(points: MapPoint[], view: StaticMapView): string {
  const center = project(view.center, view.level);

  return points
    .map((point) => {
      const current = project(point, view.level);
      const x = current.x - center.x + STATIC_MAP_WIDTH / 2;
      const y = current.y - center.y + STATIC_MAP_HEIGHT / 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export default function RouteMap({
  staticMapUrl,
  clientId,
  originPoint,
  destinationPoint,
  routePath,
}: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [failedDynamicMapKey, setFailedDynamicMapKey] = useState<string | null>(null);
  const [failedStaticMapUrl, setFailedStaticMapUrl] = useState<string | null>(null);
  const [viewOverride, setViewOverride] = useState<ViewOverride | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const pathKey = useMemo(
    () => routePath?.map((point) => `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`).join("|"),
    [routePath]
  );
  const displayPath = useMemo(() => {
    if (routePath && routePath.length > 1) return routePath;
    if (originPoint && destinationPoint) return [originPoint, destinationPoint];
    return [];
  }, [destinationPoint, originPoint, routePath]);
  const staticViewKey =
    originPoint && destinationPoint
      ? [
          originPoint.lat.toFixed(6),
          originPoint.lng.toFixed(6),
          destinationPoint.lat.toFixed(6),
          destinationPoint.lng.toFixed(6),
          pathKey ?? "",
        ].join("|")
      : "empty";
  const defaultStaticView = useMemo<StaticMapView>(() => {
    const points = displayPath.length ? displayPath : originPoint && destinationPoint ? [originPoint, destinationPoint] : [];

    return {
      center: points.length ? getCenter(points) : { lat: 37.5665, lng: 126.978 },
      level: points.length ? clampLevel(inferLevel(points)) : 10,
    };
  }, [destinationPoint, displayPath, originPoint]);
  const staticView =
    viewOverride?.key === staticViewKey ? viewOverride.view : defaultStaticView;
  const currentStaticMapUrl = getStaticMapUrl(staticMapUrl, staticView);
  const linePoints = useMemo(
    () => (displayPath.length > 1 ? toSvgPoints(displayPath, staticView) : ""),
    [displayPath, staticView]
  );
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
  const showStaticMap = !canUseDynamicMap || failedDynamicMapKey === dynamicMapKey;
  const staticMapError = Boolean(currentStaticMapUrl && failedStaticMapUrl === currentStaticMapUrl);

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

  const updateStaticView = (view: StaticMapView) => {
    setViewOverride({ key: staticViewKey, view });
  };
  const handleZoom = (delta: number) => {
    updateStaticView({
      center: staticView.center,
      level: clampLevel(staticView.level + delta),
    });
  };
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!showStaticMap) return;

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      view: staticView,
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
  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const offset = {
      x: event.clientX - dragState.startX,
      y: event.clientY - dragState.startY,
    };
    const center = project(dragState.view.center, dragState.view.level);

    updateStaticView({
      center: unproject({ x: center.x - offset.x, y: center.y - offset.y }, dragState.view.level),
      level: dragState.view.level,
    });
    dragStateRef.current = null;
    setDragOffset({ x: 0, y: 0 });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  if (showStaticMap || !canUseDynamicMap) {
    if (!currentStaticMapUrl || staticMapError) {
      return (
        <div className="flex min-h-48 items-start gap-2 rounded-lg border border-amber-100 bg-white px-3 py-2 text-xs text-amber-700">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>지도 이미지를 불러오지 못했습니다. Naver Cloud 설정을 확인해 주세요.</p>
        </div>
      );
    }

    return (
      <div
        className="relative h-48 w-full touch-none overflow-hidden rounded-lg border border-slate-200 bg-white"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          className="absolute inset-0 cursor-grab active:cursor-grabbing"
          style={{ transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
        >
          <Image
            src={currentStaticMapUrl}
            alt="출발지에서 근무지까지의 참고 지도"
            fill
            unoptimized
            sizes="(max-width: 768px) 100vw, 900px"
            className="select-none object-cover"
            draggable={false}
            onError={() => setFailedStaticMapUrl(currentStaticMapUrl)}
          />
          {linePoints && (
            <svg
              viewBox={`0 0 ${STATIC_MAP_WIDTH} ${STATIC_MAP_HEIGHT}`}
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
        </div>

        <div className="absolute right-2 top-2 flex overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center text-slate-700 transition-colors hover:bg-slate-50"
            title="확대"
            onClick={() => handleZoom(1)}
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center border-l border-slate-200 text-slate-700 transition-colors hover:bg-slate-50"
            title="축소"
            onClick={() => handleZoom(-1)}
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-48 w-full overflow-hidden rounded-lg border border-slate-200 bg-white"
    />
  );
}
