"use client";

import { Building2, Calendar, MapPin, NotebookPen } from "lucide-react";
import { JobPosting } from "@/types";
import { STATUS_CONFIG } from "@/lib/constants";

interface JobCardProps {
  job: JobPosting;
  onClick: () => void;
}

function calcDDay(deadline: string | null): { label: string; urgent: boolean } {
  if (!deadline) return { label: "상시", urgent: false };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(deadline);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { label: "마감", urgent: false };
  if (diff === 0) return { label: "D-Day", urgent: true };
  return { label: `D-${diff}`, urgent: diff <= 3 };
}

export default function JobCard({ job, onClick }: JobCardProps) {
  const { label: dDay, urgent } = calcDDay(job.deadline);
  const score = job.fitScore;
  const statusCfg = STATUS_CONFIG[job.status ?? "관심"];
  const hasJobMeta = [job.experienceLevel, job.employmentType, job.salary].some(
    (value) => value && value !== "미확인"
  );

  const scoreColor =
    score !== undefined
      ? score >= 75
        ? "text-blue-500"
        : score >= 50
        ? "text-amber-500"
        : "text-red-400"
      : "text-gray-300";

  return (
    <button
      onClick={onClick}
      className="group w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm
                 hover:shadow-md hover:border-blue-200 hover:-translate-y-0.5
                 transition-all duration-200 p-5 flex flex-col gap-3"
    >
      {/* 상단: 회사명 + D-Day */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4 text-blue-500" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-400 truncate">{job.companyName}</p>
            <p className="text-sm font-semibold text-gray-800 truncate leading-tight">
              {job.jobTitle}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {job.status === "서류 제출" && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 ring-1 ring-blue-100">
              ✅ 제출
            </span>
          )}
          <span
            className={`text-xs font-bold px-2.5 py-1 rounded-full
              ${dDay === "마감"
                ? "bg-gray-100 text-gray-400"
                : urgent
                ? "bg-red-50 text-red-500 ring-1 ring-red-200"
                : "bg-blue-50 text-blue-600"
              }`}
          >
            {dDay}
          </span>
        </div>
      </div>

      {/* 근무지 */}
      {job.workplaceAddress && job.workplaceAddress !== "미확인" && (
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{job.workplaceAddress}</span>
        </div>
      )}

      {/* 요구 스펙 태그 */}
      {hasJobMeta && (
        <div className="flex flex-wrap gap-1.5">
          {job.experienceLevel && job.experienceLevel !== "미확인" && (
            <span className="text-[11px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100">
              {job.experienceLevel}
            </span>
          )}
          {job.employmentType && job.employmentType !== "미확인" && (
            <span className="text-[11px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full border border-emerald-100">
              {job.employmentType.length > 16 ? job.employmentType.slice(0, 16) + "…" : job.employmentType}
            </span>
          )}
          {job.salary && job.salary !== "미확인" && (
            <span className="text-[11px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full border border-amber-100">
              {job.salary.length > 16 ? job.salary.slice(0, 16) + "…" : job.salary}
            </span>
          )}
        </div>
      )}

      {job.memo?.trim() && (
        <div className="flex items-start gap-1.5 rounded-lg bg-yellow-50/80 px-2.5 py-2 text-xs text-yellow-800 border border-yellow-100">
          <NotebookPen className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span className="line-clamp-2 break-words">{job.memo}</span>
        </div>
      )}

      {/* 하단: 상태 뱃지 + 마감일 + 적합도 */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-50 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* 지원 상태 뱃지 */}
          <span
            className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full
              ${statusCfg.bg} ${statusCfg.text}`}
          >
            {job.status}
          </span>
          <div className="flex items-center gap-1 text-xs text-gray-400 min-w-0">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {job.deadline
                ? new Date(job.deadline).toLocaleDateString("ko-KR", {
                    month: "short",
                    day: "numeric",
                  })
                : "미정"}
            </span>
          </div>
        </div>
        {score !== undefined && (
          <span className={`shrink-0 text-xs font-bold ${scoreColor}`}>
            {score}점
          </span>
        )}
      </div>
    </button>
  );
}
