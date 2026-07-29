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
  const [failedDynamicMapKey, setFailedDynamicMapKey] = useState<string | null>(null);
  const [failedStaticMapUrl, setFailedStaticMapUrl] = useState<string | null>(null);
  const pathKey = useMemo(
    () => routePath?.map((point) => `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`).join("|"),
    [routePath]
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
  const staticMapError = Boolean(staticMapUrl && failedStaticMapUrl === staticMapUrl);

  useEffect(() => {
    if (!canUseDynamicMap || !clientId || !originPoint || !destinationPoint) {
      return;
    }

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
        const displayPath =
          routePath && routePath.length > 1 ? routePath : [originPoint, destinationPoint];
        const center = displayPath[Math.floor(displayPath.length / 2)] ?? originPoint;
        const map = new maps.Map(container, {
          center: toLatLng(maps, center),
          zoom: 11,
          zoomControl: false,
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
      if (window.navermap_authFailure === previousAuthFailure) return;
      window.navermap_authFailure = previousAuthFailure;
    };
  }, [canUseDynamicMap, clientId, destinationPoint, dynamicMapKey, originPoint, routePath]);

  if (showStaticMap || !canUseDynamicMap) {
    if (!staticMapUrl || staticMapError) {
      return (
        <div className="flex min-h-48 items-start gap-2 rounded-lg border border-amber-100 bg-white px-3 py-2 text-xs text-amber-700">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>지도 이미지를 불러오지 못했습니다. Naver Cloud 설정을 확인해 주세요.</p>
        </div>
      );
    }

    return (
      <Image
        src={staticMapUrl}
        alt="출발지에서 근무지까지의 참고 지도"
        width={900}
        height={280}
        unoptimized
        className="h-48 w-full rounded-lg border border-slate-200 bg-white object-cover"
        onError={() => setFailedStaticMapUrl(staticMapUrl)}
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
