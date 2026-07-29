"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Car,
  Clock,
  ExternalLink,
  Loader2,
  MapPin,
  Train,
} from "lucide-react";
import { CommuteInfo as CommuteInfoType } from "@/types";
import { USER_INFO } from "@/data/resume";
import RouteMap from "./RouteMap";

interface CommuteInfoProps {
  destination: string;
  commuteInfo?: CommuteInfoType;
}

type CommuteApiResponse = CommuteInfoType & {
  configured?: boolean;
  origin?: string;
  destination?: string;
};

function hasUsableDestination(destination: string): boolean {
  const value = destination.trim();
  return value !== "" && value !== "미확인" && value.length >= 3;
}

function getDurationColor(duration: number): string {
  if (duration <= 30) return "text-green-600";
  if (duration <= 60) return "text-amber-600";
  return "text-red-500";
}

function formatDistance(distance?: number): string | null {
  if (!distance) return null;
  if (distance >= 1000) return `${(distance / 1000).toFixed(1)}km`;
  return `${distance}m`;
}

function toTransitAdjustedDuration(duration: number): number {
  return Math.max(1, Math.round(duration * 2.3));
}

function formatDuration(duration: number): string {
  if (duration < 60) return `${duration}분`;

  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;
  return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
}

export default function CommuteInfo({ destination, commuteInfo }: CommuteInfoProps) {
  const [apiInfo, setApiInfo] = useState<CommuteApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canCalculate = hasUsableDestination(destination);
  const needsCommuteRefresh =
    canCalculate &&
    (!commuteInfo ||
      !commuteInfo.staticMapUrl ||
      !commuteInfo.originPoint ||
      !commuteInfo.destinationPoint);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setApiInfo(null);
      setError(null);

      if (!needsCommuteRefresh) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch("/api/commute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ destination }),
          signal: controller.signal,
        });
        const data = (await res.json()) as CommuteApiResponse & { error?: string };

        if (!res.ok) {
          throw new Error(data.error || "통근 시간 계산에 실패했습니다.");
        }

        setApiInfo(data);
        setError(data.error ?? null);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "통근 시간 계산에 실패했습니다.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 0);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [destination, needsCommuteRefresh]);

  const info = apiInfo ?? commuteInfo;
  const distanceLabel = useMemo(() => formatDistance(info?.distance), [info?.distance]);

  if (!canCalculate) {
    return (
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-2">
        <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <Train className="w-4 h-4" />
          통근 정보
        </h4>
        <p className="text-xs text-gray-500 leading-relaxed">
          근무지 주소가 확인되면 네이버 지도 API로 위치를 확인합니다.
          공고 정보에서 근무지를 다시 추출해 주세요.
        </p>
      </div>
    );
  }

  if (loading || (!info && !error)) {
    return (
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-3">
        <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <Train className="w-4 h-4" />
          통근 정보
        </h4>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
          네이버 지도 API로 위치와 참고 경로를 확인하는 중입니다.
        </div>
      </div>
    );
  }

  const hasRealDuration = Boolean(info && info.duration > 0);
  const adjustedDuration = info && hasRealDuration ? toTransitAdjustedDuration(info.duration) : 0;
  const durationColor = hasRealDuration ? getDurationColor(adjustedDuration) : "text-gray-400";
  const originLabel = apiInfo?.origin ?? USER_INFO.homeAddress;
  const destinationLabel = apiInfo?.destination ?? destination;
  const isDrivingReference = info?.method === "자동차 참고";
  const CommuteIcon = isDrivingReference ? Car : Train;
  const canShowMap = Boolean(info?.staticMapUrl);

  return (
    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <CommuteIcon className="w-4 h-4" />
          통근 정보
        </h4>
        <span
          className={`text-[10px] rounded px-1.5 py-0.5 font-medium ${
            info?.isDummy
              ? "bg-amber-100 text-amber-600"
              : "bg-emerald-100 text-emerald-600"
          }`}
        >
          {info?.isDummy ? "API 확인 필요" : "네이버 API"}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-gray-500 min-w-0">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{originLabel}</span>
        </div>
        <span className="text-gray-300 shrink-0">→</span>
        <div className="flex items-center gap-1.5 text-xs text-gray-500 min-w-0">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{destinationLabel}</span>
        </div>
      </div>

      {hasRealDuration && info ? (
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Clock className={`w-5 h-5 ${durationColor}`} />
              <span className={`text-2xl font-bold ${durationColor}`}>
                {formatDuration(adjustedDuration)}
              </span>
            </div>
            <div className="text-xs text-gray-500">
              <p>
                {isDrivingReference ? "대중교통 환산" : info.method}
                {distanceLabel ? ` · ${distanceLabel}` : ""}
              </p>
            </div>
          </div>
          <RouteMap
            staticMapUrl={info.staticMapUrl}
            clientId={info.mapClientId}
            originPoint={info.originPoint}
            destinationPoint={info.destinationPoint}
            routePath={info.routePath}
          />
        </div>
      ) : canShowMap && info ? (
        <div className="space-y-3">
          <RouteMap
            staticMapUrl={info.staticMapUrl}
            clientId={info.mapClientId}
            originPoint={info.originPoint}
            destinationPoint={info.destinationPoint}
            routePath={info.routePath}
          />
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{error ?? info?.route ?? "네이버 지도 API 키를 설정하면 위치와 참고 경로를 확인할 수 있습니다."}</p>
        </div>
      )}

      {info?.mapUrl && (
        <div className="flex flex-wrap gap-2">
          <a
            href={info.mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-50"
          >
            웹 지도에서 보기
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      <p className="text-[11px] text-gray-400">
        * {USER_INFO.commuteBase} / 웹 지도는 오늘 오전 7:30 출발 기준으로 엽니다.
      </p>
    </div>
  );
}
