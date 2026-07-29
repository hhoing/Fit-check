"use client";

import { useEffect, useState, useCallback } from "react";
import {
  X,
  ExternalLink,
  Building2,
  MapPin,
  Calendar,
  ClipboardList,
  ListChecks,
  Loader2,
  RefreshCw,
  Wallet,
  Briefcase,
  UserRound,
  NotebookPen,
  Star,
  Trash2,
} from "lucide-react";
import {
  JobPosting,
  JobPositionDetail,
  JobStatus,
  AnalyzeFitResponse,
  ParseJobResponse,
} from "@/types";
import { STATUS_LIST, STATUS_CONFIG } from "@/lib/constants";
import { CURRENT_JOB_PARSER_VERSION } from "@/lib/jobParserVersion";
import { formatDeadlineLong } from "@/lib/deadline";
import { useToast } from "@/components/Toast";
import GaugeChart from "./GaugeChart";
import FitAnalysis from "./FitAnalysis";
import CommuteInfo from "./CommuteInfo";

interface JobModalProps {
  job: JobPosting;
  onClose: () => void;
  onUpdate: (updated: JobPosting) => void;
  onRequestDelete: (job: JobPosting) => void;
}

const STATUS_ACTION_LIST = STATUS_LIST.filter(
  (status): status is Exclude<JobStatus, "관심"> => status !== "관심"
);

export default function JobModal({ job, onClose, onUpdate, onRequestDelete }: JobModalProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [refreshingInfo, setRefreshingInfo] = useState(false);
  const [localJob, setLocalJob] = useState<JobPosting>(job);
  const { toast } = useToast();

  // Esc 키로 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const analyzeJob = useCallback(
    async (jobToAnalyze: JobPosting) => {
      setAnalyzing(true);
      try {
        const res = await fetch("/api/analyze-fit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobPosting: jobToAnalyze }),
        });
        if (!res.ok) throw new Error();
        const data: AnalyzeFitResponse = await res.json();
        const updated: JobPosting = {
          ...jobToAnalyze,
          fitScore: data.fitScore,
          fitAnalysis: data.fitAnalysis,
        };
        setLocalJob(updated);
        onUpdate(updated);
        const modeLabel = data.analysisMode === "ai" ? "AI" : "기본";
        toast(
          `${modeLabel} 적합도 분석 완료: ${data.fitScore}점`,
          data.fitScore >= 60 ? "success" : "info"
        );
        return updated;
      } catch {
        toast("적합도 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.", "error");
        return null;
      } finally {
        setAnalyzing(false);
      }
    },
    [onUpdate, toast]
  );

  const runAnalysis = useCallback(async (force = false) => {
    if (!force && localJob.fitScore !== undefined) return;
    await analyzeJob(localJob);
  }, [analyzeJob, localJob]);

  const getRefreshPayload = useCallback((jobToRefresh: JobPosting) => {
    const urlFromRawText = jobToRefresh.rawText.match(/^URL:\s*(https?:\/\/\S+)/)?.[1];
    const sourceUrl = jobToRefresh.sourceUrl ?? urlFromRawText;

    if (sourceUrl) return { url: sourceUrl };
    if (jobToRefresh.rawText.trim()) return { text: jobToRefresh.rawText };
    return null;
  }, []);

  const refreshJobInfo = useCallback(async () => {
    const payload = getRefreshPayload(localJob);
    if (!payload) {
      toast("다시 추출할 원본 공고 내용이 없습니다.", "error");
      return;
    }

    setRefreshingInfo(true);
    try {
      const res = await fetch("/api/parse-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as ParseJobResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || "공고 정보 재추출에 실패했습니다.");

      const refreshed: JobPosting = {
        ...localJob,
        companyName: data.companyName,
        jobTitle: data.jobTitle,
        deadline: data.deadline,
        deadlineTime: data.deadlineTime ?? null,
        workplaceAddress: data.workplaceAddress,
        requiredSpecs: data.requiredSpecs,
        positionDetails: data.positionDetails ?? [],
        mainTasks: data.mainTasks ?? [],
        qualifications: data.qualifications ?? [],
        preferredQualifications: data.preferredQualifications ?? [],
        hiringProcess: data.hiringProcess ?? [],
        salary: data.salary ?? "미확인",
        employmentType: data.employmentType ?? "미확인",
        experienceLevel: data.experienceLevel ?? "미확인",
        rawText: data.rawText ?? localJob.rawText,
        sourceUrl: data.sourceUrl ?? ("url" in payload ? payload.url : localJob.sourceUrl),
        sourceType: data.sourceType ?? ("url" in payload ? "url" : localJob.sourceType),
        parserVersion: CURRENT_JOB_PARSER_VERSION,
        parsedAt: new Date().toISOString(),
        lastParseError: undefined,
        commuteTime: undefined,
        fitScore: localJob.fitScore,
        fitAnalysis: localJob.fitAnalysis,
      };

      setLocalJob(refreshed);
      onUpdate(refreshed);
      toast("공고 정보를 다시 추출했습니다. 적합도도 새 기준으로 재분석합니다.", "success");
      await analyzeJob(refreshed);
    } catch (error) {
      const message = error instanceof Error ? error.message : "공고 정보 재추출에 실패했습니다.";
      toast(message, "error");
    } finally {
      setRefreshingInfo(false);
    }
  }, [analyzeJob, getRefreshPayload, localJob, onUpdate, toast]);

  const handleStatusChange = useCallback(
    (status: JobStatus) => {
      const updated = { ...localJob, status };
      setLocalJob(updated);
      onUpdate(updated);
      toast(`상태가 '${status}'(으)로 변경되었습니다.`, "success");
    },
    [localJob, onUpdate, toast]
  );

  const handleMemoChange = useCallback(
    (memo: string) => {
      const updated = { ...localJob, memo };
      setLocalJob(updated);
      onUpdate(updated);
    },
    [localJob, onUpdate]
  );

  const handleFavoriteToggle = useCallback(() => {
    const updated = { ...localJob, isFavorite: !localJob.isFavorite };
    setLocalJob(updated);
    onUpdate(updated);
    toast(updated.isFavorite ? "즐겨찾기에 추가했습니다." : "즐겨찾기에서 해제했습니다.", "success");
  }, [localJob, onUpdate, toast]);

  const handleDeleteRequest = useCallback(() => {
    onRequestDelete(localJob);
  }, [localJob, onRequestDelete]);

  const jobplanetUrl = `https://www.jobplanet.co.kr/search?query=${encodeURIComponent(localJob.companyName)}`;
  const jotsoUrl = `https://jotso.net/search?q=${encodeURIComponent(localJob.companyName)}`;
  const hasPositionDetails = (localJob.positionDetails ?? []).some(
    (detail) =>
      detail.mainTasks.length > 0 ||
      detail.qualifications.length > 0 ||
      (detail.preferredQualifications ?? []).length > 0
  );
  const hasPositionPreferred = (localJob.positionDetails ?? []).some(
    (detail) => (detail.preferredQualifications ?? []).length > 0
  );

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
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={handleDeleteRequest}
              className="p-2 rounded-xl border border-gray-100 text-gray-300 transition-colors hover:border-red-100 hover:bg-red-50 hover:text-red-400"
              title="공고 삭제"
              aria-label="공고 삭제"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <button
              onClick={handleFavoriteToggle}
              className={`p-2 rounded-xl border transition-colors ${
                localJob.isFavorite
                  ? "border-amber-200 bg-amber-50 text-amber-400"
                  : "border-gray-100 text-gray-300 hover:border-amber-200 hover:text-amber-400"
              }`}
              title={localJob.isFavorite ? "즐겨찾기 해제" : "즐겨찾기"}
              aria-label={localJob.isFavorite ? "즐겨찾기 해제" : "즐겨찾기"}
            >
              <Star className="w-5 h-5" fill={localJob.isFavorite ? "currentColor" : "none"} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-400"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 지원 상태 선택 */}
        <div className="px-5 sm:px-6 py-3 border-b border-gray-50">
          <p className="text-xs text-gray-400 mb-2">지원 상태</p>
          <div className="flex gap-1.5 flex-wrap">
            {STATUS_ACTION_LIST.map((s) => {
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
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-700">공고 정보</h3>
              <button
                onClick={refreshJobInfo}
                disabled={refreshingInfo || analyzing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:border-blue-200 hover:text-blue-500 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshingInfo ? "animate-spin" : ""}`} />
                다시 추출
              </button>
            </div>
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
                value={formatDeadlineLong(localJob.deadline, localJob.deadlineTime)}
              />
              <InfoRow
                icon={<Wallet className="w-4 h-4" />}
                label="급여"
                value={localJob.salary || "미확인"}
              />
              <InfoRow
                icon={<Briefcase className="w-4 h-4" />}
                label="근무형태"
                value={localJob.employmentType || "미확인"}
              />
              <InfoRow
                icon={<UserRound className="w-4 h-4" />}
                label="경력구분"
                value={localJob.experienceLevel || "미확인"}
              />
              {localJob.sourceUrl && (
                <div className="flex items-start gap-2.5">
                  <span className="text-gray-400 mt-0.5 shrink-0">
                    <ExternalLink className="w-4 h-4" />
                  </span>
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="text-xs text-gray-400 shrink-0 w-14">원본</span>
                    <a
                      href={localJob.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-500 font-medium break-all hover:underline"
                    >
                      공고 링크 열기
                    </a>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <NotebookPen className="w-4 h-4" />
              메모
            </h3>
            <textarea
              value={localJob.memo ?? ""}
              onChange={(e) => handleMemoChange(e.target.value)}
              className="w-full min-h-24 resize-none rounded-xl border border-gray-100 bg-yellow-50/40 px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-yellow-200 focus:ring-2 focus:ring-yellow-100 placeholder:text-gray-300"
              placeholder="지원 전략, 확인할 점, 자기소개서 포인트를 짧게 적어두세요."
            />
          </section>

          <PositionDetailsSection details={localJob.positionDetails} />
          {!hasPositionDetails && (
            <>
              <DetailSection
                title="주요업무"
                icon={<ClipboardList className="w-4 h-4" />}
                items={localJob.mainTasks}
              />
              <DetailSection
                title="자격요건"
                icon={<ListChecks className="w-4 h-4" />}
                items={localJob.qualifications}
              />
            </>
          )}
          {!hasPositionPreferred && (
            <DetailSection
              title="우대사항"
              icon={<ListChecks className="w-4 h-4" />}
              items={localJob.preferredQualifications}
            />
          )}
          <DetailSection
            title="채용전형"
            icon={<ClipboardList className="w-4 h-4" />}
            items={localJob.hiringProcess}
          />

          {/* 유리/불리 분석 */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-700">이력서 적합도 분석</h3>
              <button
                onClick={() => runAnalysis(true)}
                disabled={analyzing || refreshingInfo}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:border-blue-200 hover:text-blue-500 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${analyzing ? "animate-spin" : ""}`} />
                재분석
              </button>
            </div>
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

          {/* 외부 기업 검색 */}
          <section className="grid gap-2 sm:grid-cols-2">
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
            <a
              href={jotsoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl
                         border-2 border-slate-200 text-slate-600 hover:bg-slate-50
                         text-sm font-semibold transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              좋소판별기에서 {localJob.companyName} 검색
            </a>
          </section>
        </div>
      </div>
    </div>
  );
}

function PositionDetailsSection({ details }: { details?: JobPositionDetail[] }) {
  const visibleDetails = (details ?? []).filter(
    (detail) =>
      detail.title.trim() &&
      (detail.mainTasks.length > 0 ||
        detail.qualifications.length > 0 ||
        (detail.preferredQualifications ?? []).length > 0)
  );

  if (visibleDetails.length === 0) return null;

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
        <ClipboardList className="w-4 h-4" />
        직무별 모집내용
      </h3>
      <div className="space-y-2">
        {visibleDetails.map((detail, index) => (
          <div
            key={`${detail.title}-${index}`}
            className="rounded-xl border border-gray-100 bg-white px-4 py-3"
          >
            <div className="mb-3 flex items-center gap-2">
              <p className="text-sm font-bold text-gray-800">{detail.title}</p>
              {detail.headcount && (
                <span className="rounded-full bg-gray-50 px-2 py-0.5 text-[11px] font-semibold text-gray-400">
                  {detail.headcount}
                </span>
              )}
            </div>
            <PositionDetailList title="자격요건" items={detail.qualifications} />
            <PositionDetailList title="주요업무" items={detail.mainTasks} />
            <PositionDetailList title="우대사항" items={detail.preferredQualifications} />
          </div>
        ))}
      </div>
    </section>
  );
}

function PositionDetailList({ title, items }: { title: string; items?: string[] }) {
  const visibleItems = items?.filter((item) => item.trim()) ?? [];
  if (visibleItems.length === 0) return null;

  return (
    <div className="mt-3 first:mt-0">
      <p className="mb-1.5 text-xs font-bold text-gray-500">{title}</p>
      <ul className="space-y-1.5">
        {visibleItems.map((item, i) => (
          <li key={`${title}-${i}`} className="flex gap-2 text-xs leading-relaxed text-gray-700">
            <span className="mt-0.5 text-gray-300">•</span>
            <span className="min-w-0 break-words">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DetailSection({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items?: string[];
}) {
  const visibleItems = items?.filter((item) => item.trim()) ?? [];
  if (visibleItems.length === 0) return null;

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
        {icon}
        {title}
      </h3>
      <div className="rounded-xl border border-gray-100 bg-white px-4 py-3">
        <ul className="space-y-2">
          {visibleItems.map((item, i) => (
            <li key={`${title}-${i}`} className="flex gap-2 text-xs leading-relaxed text-gray-700">
              <span className="mt-0.5 text-gray-300">•</span>
              <span className="min-w-0 break-words">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
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
