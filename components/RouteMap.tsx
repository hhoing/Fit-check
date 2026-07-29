"use client";

import { useState } from "react";
import Image from "next/image";
import { AlertTriangle } from "lucide-react";

interface RouteMapProps {
  staticMapUrl?: string;
}

export default function RouteMap({ staticMapUrl }: RouteMapProps) {
  const [hasError, setHasError] = useState(false);

  if (!staticMapUrl || hasError) {
    return (
      <div className="flex min-h-48 items-start gap-2 rounded-lg border border-amber-100 bg-white px-3 py-2 text-xs text-amber-700">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          지도 이미지를 불러오지 못했습니다. Naver Cloud에서 Static Map이 활성화되어
          있는지 확인해 주세요.
        </p>
      </div>
    );
  }

  return (
    <Image
      src={staticMapUrl}
      alt="출발지에서 근무지까지의 참고 경로 지도"
      width={900}
      height={280}
      unoptimized
      className="h-48 w-full rounded-lg border border-slate-200 bg-white object-cover"
      onError={() => setHasError(true)}
    />
  );
}
