"use client";

import { Train, Clock, MapPin } from "lucide-react";
import { CommuteInfo as CommuteInfoType } from "@/types";
import { USER_INFO } from "@/data/resume";

interface CommuteInfoProps {
  destination: string;
  commuteInfo?: CommuteInfoType;
}

// 실제 API 연동 전 더미 데이터 생성 함수
function generateDummyCommute(destination: string): CommuteInfoType {
  // 주소 키워드 기반 간단한 더미 로직 (실제로는 네이버/카카오 API 사용)
  const isGangnam = destination.includes("강남") || destination.includes("서초") || destination.includes("테헤란");
  const isMapo = destination.includes("마포") || destination.includes("홍대") || destination.includes("합정");
  const isSongpa = destination.includes("송파") || destination.includes("잠실");

  if (isGangnam) return { duration: 52, method: "지하철 + 도보", route: "7호선 → 2호선 강남역", isDummy: true };
  if (isMapo) return { duration: 38, method: "지하철", route: "7호선 → 6호선 합정역", isDummy: true };
  if (isSongpa) return { duration: 45, method: "지하철 + 도보", route: "7호선 → 8호선 잠실역", isDummy: true };
  return { duration: 60, method: "지하철 + 도보", route: "7호선 환승", isDummy: true };
}

export default function CommuteInfo({ destination, commuteInfo }: CommuteInfoProps) {
  const info = commuteInfo ?? generateDummyCommute(destination);
  const durationColor =
    info.duration <= 30
      ? "text-green-600"
      : info.duration <= 60
      ? "text-amber-600"
      : "text-red-500";

  return (
    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <Train className="w-4 h-4" />
          통근 예상 시간
        </h4>
        {info.isDummy && (
          <span className="text-[10px] bg-amber-100 text-amber-600 rounded px-1.5 py-0.5 font-medium">
            더미 데이터
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{USER_INFO.homeAddress}</span>
        </div>
        <span className="text-gray-300">→</span>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{destination || "미확인"}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Clock className={`w-5 h-5 ${durationColor}`} />
          <span className={`text-2xl font-bold ${durationColor}`}>
            {info.duration}분
          </span>
        </div>
        <div className="text-xs text-gray-500">
          <p>{info.method}</p>
          <p className="text-gray-400">{info.route}</p>
        </div>
      </div>

      <p className="text-[11px] text-gray-400">
        * {USER_INFO.commuteBase} 기준 / 네이버 API 연동 시 실시간 업데이트 예정
      </p>
    </div>
  );
}
