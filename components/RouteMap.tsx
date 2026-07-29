"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { MapPoint } from "@/types";

interface RouteMapProps {
  clientId?: string;
  originPoint?: MapPoint;
  destinationPoint?: MapPoint;
  routePath?: MapPoint[];
}

type NaverMapInstance = {
  fitBounds: (bounds: unknown) => void;
  setCenter: (point: unknown) => void;
  setZoom: (zoom: number) => void;
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

declare global {
  interface Window {
    naver?: {
      maps?: NaverMapsNamespace;
    };
    __fitCheckNaverMapsPromise?: Promise<void>;
  }
}

function loadNaverMaps(clientId: string): Promise<void> {
  if (window.naver?.maps) return Promise.resolve();
  if (window.__fitCheckNaverMapsPromise) return window.__fitCheckNaverMapsPromise;

  window.__fitCheckNaverMapsPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-fit-check-naver-map="true"]'
    );

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("지도 SDK 로드 실패")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.dataset.fitCheckNaverMap = "true";
    script.async = true;
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("지도 SDK 로드 실패"));
    document.head.appendChild(script);
  });

  return window.__fitCheckNaverMapsPromise;
}

function toLatLng(maps: NaverMapsNamespace, point: MapPoint): unknown {
  return new maps.LatLng(point.lat, point.lng);
}

export default function RouteMap({
  clientId,
  originPoint,
  destinationPoint,
  routePath,
}: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pathKey = useMemo(
    () => routePath?.map((point) => `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`).join("|"),
    [routePath]
  );

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setError(null);

      if (!clientId || !originPoint || !destinationPoint) {
        setError("지도에 표시할 좌표가 부족합니다.");
        return;
      }

      try {
        await loadNaverMaps(clientId);
        const maps = window.naver?.maps;
        const container = containerRef.current;

        if (!maps || !container) {
          throw new Error("지도 SDK를 초기화하지 못했습니다.");
        }

        container.innerHTML = "";
        const center = routePath?.[Math.floor(routePath.length / 2)] ?? originPoint;
        const map = new maps.Map(container, {
          center: toLatLng(maps, center),
          zoom: 11,
        });
        const path = routePath?.map((point) => toLatLng(maps, point)) ?? [];
        const bounds = new maps.LatLngBounds();

        bounds.extend(toLatLng(maps, originPoint));
        bounds.extend(toLatLng(maps, destinationPoint));
        path.forEach((point) => bounds.extend(point));

        if (path.length > 1) {
          new maps.Polyline({
            map,
            path,
            strokeColor: "#059669",
            strokeOpacity: 0.9,
            strokeWeight: 5,
            endIcon: maps.PointingIcon?.OPEN_ARROW,
          });
        }
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
      } catch (err) {
        setError(err instanceof Error ? err.message : "지도를 표시하지 못했습니다.");
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [clientId, destinationPoint, originPoint, pathKey, routePath]);

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-xs text-amber-700">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <p>{error}</p>
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
