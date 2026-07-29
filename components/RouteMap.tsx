"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AlertTriangle } from "lucide-react";
import { MapPoint } from "@/types";

interface RouteMapProps {
  staticMapUrl?: string;
  clientId?: string;
  originPoint?: MapPoint;
  destinationPoint?: MapPoint;
  routePath?: MapPoint[];
}

type NaverMapInstance = {
  fitBounds: (bounds: unknown, options?: Record<string, unknown>) => void;
  setSize: (size: unknown) => void;
};

type NaverBounds = {
  extend: (point: unknown) => void;
};

type NaverMapsNamespace = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => NaverMapInstance;
  LatLng: new (lat: number, lng: number) => unknown;
  LatLngBounds: new () => NaverBounds;
  Size: new (width: number, height: number) => unknown;
  Marker: new (options: Record<string, unknown>) => unknown;
  Polyline: new (options: Record<string, unknown>) => unknown;
  Event: {
    once: (target: unknown, eventName: string, listener: () => void) => void;
  };
  PointingIcon?: {
    OPEN_ARROW?: string;
  };
};

type MapStatus = "loading" | "ready" | "fallback";
const CANONICAL_SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://hhoing-fit-check.vercel.app";

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

export default function RouteMap({
  staticMapUrl,
  clientId,
  originPoint,
  destinationPoint,
  routePath,
}: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [readyMapKey, setReadyMapKey] = useState<string | null>(null);
  const [failedMapKey, setFailedMapKey] = useState<string | null>(null);
  const pathKey = useMemo(
    () => routePath?.map((point) => `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`).join("|"),
    [routePath]
  );
  const displayPath = useMemo(() => {
    if (routePath && routePath.length > 1) return routePath;
    if (originPoint && destinationPoint) return [originPoint, destinationPoint];
    return [];
  }, [destinationPoint, originPoint, routePath]);
  const mapKey =
    clientId && originPoint && destinationPoint
      ? [
          clientId,
          originPoint.lat.toFixed(6),
          originPoint.lng.toFixed(6),
          destinationPoint.lat.toFixed(6),
          destinationPoint.lng.toFixed(6),
          pathKey ?? "",
        ].join("|")
      : "missing-map-data";
  const hasMapData = Boolean(clientId && originPoint && destinationPoint);
  const status: MapStatus = !hasMapData
    ? "fallback"
    : failedMapKey === mapKey
      ? "fallback"
      : readyMapKey === mapKey
        ? "ready"
        : "loading";

  useEffect(() => {
    if (!clientId || !originPoint || !destinationPoint) return;

    let cancelled = false;
    const previousAuthFailure = window.navermap_authFailure;
    const authFailureTimerIds: number[] = [];

    window.navermap_authFailure = () => {
      previousAuthFailure?.();
      if (!cancelled) setFailedMapKey(mapKey);
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
          draggable: true,
          scrollWheel: true,
          pinchZoom: true,
          keyboardShortcuts: true,
        });
        const bounds = new maps.LatLngBounds();
        const linePath = displayPath.map((point) => toLatLng(maps, point));

        bounds.extend(toLatLng(maps, originPoint));
        bounds.extend(toLatLng(maps, destinationPoint));
        linePath.forEach((point) => bounds.extend(point));

        maps.Event.once(map, "init", () => {
          if (cancelled) return;

          const width = container.clientWidth;
          const height = container.clientHeight;
          if (width > 0 && height > 0) {
            map.setSize(new maps.Size(width, height));
          }

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

          map.fitBounds(bounds, { top: 24, right: 24, bottom: 24, left: 24 });
          setReadyMapKey(mapKey);

          authFailureTimerIds.push(
            window.setTimeout(() => {
              if (!cancelled && hasAuthFailureText(container)) setFailedMapKey(mapKey);
            }, 1200)
          );
        });
      } catch {
        if (!cancelled) setFailedMapKey(mapKey);
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
  }, [clientId, destinationPoint, displayPath, mapKey, originPoint]);

  if (status === "fallback") {
    if (!staticMapUrl) {
      return (
        <div className="flex min-h-48 items-start gap-2 rounded-lg border border-amber-100 bg-white px-3 py-2 text-xs text-amber-700">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>지도에 표시할 정보가 부족합니다.</p>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <Image
          src={staticMapUrl}
          alt="출발지에서 근무지까지의 네이버 지도 미리보기"
          width={900}
          height={280}
          unoptimized
          className="h-48 w-full rounded-lg border border-slate-200 bg-white object-cover"
        />
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            네이버 Dynamic Map 인증이 실패해서 미리보기로 표시 중입니다. Naver Cloud
            Maps 서비스 환경에 {CANONICAL_SITE_ORIGIN} 주소를 등록하면 드래그/확대가 가능한
            네이버 지도로 표시됩니다.
          </p>
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
