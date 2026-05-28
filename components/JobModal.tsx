"use client";

import { useEffect, useState, useCallback } from "react";
import {
  X,
  ExternalLink,
  Building2,
  MapPin,
  Calendar,
  Tag,
  Loader2,
} from "lucide-react";
import { JobPosting, JobStatus, AnalyzeFitResponse } from "@/types";
import { STATUS_LIST, STATUS_CONFIG } from "@/lib/constants";
import { useToast } from "@/components/Toast";
import GaugeChart from "./GaugeChart";
import FitAnalysis from "./FitAnalysis";
import CommuteInfo from "./CommuteInfo";

interface JobModalProps {
  job: JobPosting;
  onClose: () => void;
  onUpdate: (updated: JobPosting) => void;
}

export default function JobModal({ job, onClose, onUpdate }: JobModalProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [localJob, setLocalJob] = useState<JobPosting>(job);
  const { toast } = useToast();

  // Esc 키로 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const runAnalysis = useCallback(async () => {
    if (localJob.fitScore !== undefined) return;
    setAnalyzing(true);
    try {
      const res = await fetch("/api/analyze-fit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobPosting: localJob }),
      });
      if (!res.ok) throw new Error();
      const data: AnalyzeFitResponse = await res.json();
      const updated: JobPosting = {
        ...localJob,
        fitScore: data.fitScore,
        fitAnalysis: data.fitAnalysis,
      };
      setLocalJob(updated);
      onUpdate(updated);
      toast(
        `적합도 분석 완료: ${data.fitScore}점 (${
          data.fitScore >= 75 ? "상위 25%" : data.fitScore >= 50 ? "상위 50%" : "하위 50%"
        } 수준)`,
        data.fitScore >= 60 ? "success" : "info"
      );
    } catch {
      toast("적합도 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.", "error");
    } finally {
      setAnalyzing(false);
    }
  }, [localJob, onUpdate, toast]);

  useEffect(() => {
    runAnalysis();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStatusChange = useCallback(
    (status: JobStatus) => {
      const updated = { ...localJob, status };
      setLocalJob(updated);
      onUpdate(updated);
      toast(`상태가 '${status}'(으)로 변경되었습니다.`, "success");
    },
    [localJob, onUpdate, toast]
  );

  const jobplanetUrl = `https://www.jobplanet.co.kr/search?query=${encodeURIComponent(localJob.companyName)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* 배경 오버레이 */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 모달 패널 */}
      <div
        className="relative w-full sm:max-w-2xl max-h-[95dvh] sm:max-h-[90vh]
                      bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl
                      flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
      >
        {/* 헤더 */}
        <div className="flex items-start justify-between p-5 sm:p-6 pb-4 border-b border-gray-50 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-200 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-400 truncate">{localJob.companyName}</p>
              <h2 className="text-base sm:text-lg font-bold text-gray-900 truncate leading-tight">
                {localJob.jobTitle}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-400 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 지원 상태 선택 */}
        <div className="px-5 sm:px-6 py-3 border-b border-gray-50">
          <p className="text-xs text-gray-400 mb-2">지원 상태</p>
          <div className="flex gap-1.5 flex-wrap">
            {STATUS_LIST.map((s) => {
              const cfg = STATUS_CONFIG[s];
              const isActive = localJob.status === s;
              return (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all
                    ${
                      isActive
                        ? `${cfg.bg} ${cfg.text} ring-1 ${cfg.ring}`
                        : "bg-gray-50 text-gray-400 hover:bg-gray-100"
                    }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        {/* 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* AI 적합도 게이지 */}
          <section className="flex flex-col items-center py-2">
            {analyzing ? (
              <div className="flex flex-col items-center gap-2 py-8 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                <p className="text-sm">AI가 이력서와 비교 분석 중...</p>
                <div className="w-48 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-200 rounded-full animate-pulse w-3/4" />
                </div>
              </div>
            ) : (
              <GaugeChart score={localJob.fitScore ?? 0} />
            )}
          </section>

          {/* 공고 기본 정보 */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">공고 정보</h3>
            <div className="bg-gray-50 rounded-xl p-4 space-y-2.5">
              <InfoRow
                icon={<Building2 className="w-4 h-4" />}
                label="회사명"
                value={localJob.companyName}
              />
              <InfoRow
                icon={<MapPin className="w-4 h-4" />}
                label="근무지"
                value={localJob.workplaceAddress}
              />
              <InfoRow
                icon={<Calendar className="w-4 h-4" />}
                label="마감일"
                value={
                  localJob.deadline
                    ? new Date(localJob.deadline).toLocaleDateString("ko-KR", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })
                    : "마감일 미정"
                }
              />
            </div>
          </section>

          {/* 요구 스펙 */}
          {localJob.requiredSpecs.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                <Tag className="w-4 h-4" />
                요구 스펙
              </h3>
              <div className="flex flex-wrap gap-2">
                {localJob.requiredSpecs.map((spec, i) => (
                  <span
                    key={i}
                    className="text-xs bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-full border border-indigo-100"
                  >
                    {spec}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* 유리/불리 분석 */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">이력서 적합도 분석</h3>
            <FitAnalysis
              analysis={localJob.fitAnalysis}
              isLoading={analyzing}
            />
          </section>

          {/* 통근 시간 */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">통근 시간</h3>
            <CommuteInfo
              destination={localJob.workplaceAddress}
              commuteInfo={localJob.commuteTime}
            />
          </section>

          {/* 잡플래닛 */}
          <section>
            <a
              href={jobplanetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl
                         border-2 border-orange-200 text-orange-500 hover:bg-orange-50
                         text-sm font-semibold transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              잡플래닛에서 {localJob.companyName} 후기 보기
            </a>
          </section>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="text-gray-400 mt-0.5 shrink-0">{icon}</span>
      <div className="flex items-start gap-2 min-w-0">
        <span className="text-xs text-gray-400 shrink-0 w-14">{label}</span>
        <span className="text-xs text-gray-700 font-medium break-all">{value || "미확인"}</span>
      </div>
    </div>
  );
}
