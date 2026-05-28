"use client";

import { useState, useCallback } from "react";
import { BriefcaseBusiness, Plus, X } from "lucide-react";
import { JobPosting, JobStatus, ParseJobResponse } from "@/types";
import { STATUS_LIST, STATUS_CONFIG } from "@/lib/constants";
import { useJobs } from "@/hooks/useJobs";
import JobCard from "@/components/JobCard";
import JobInput from "@/components/JobInput";
import JobModal from "@/components/JobModal";

// 초기 더미 공고 (localStorage가 비어 있을 때만 사용)
const INITIAL_JOBS: JobPosting[] = [
  {
    id: "demo-1",
    companyName: "카카오",
    jobTitle: "프론트엔드 개발자 (React)",
    deadline: (() => {
      const d = new Date();
      d.setDate(d.getDate() + 5);
      return d.toISOString().split("T")[0];
    })(),
    workplaceAddress: "경기도 성남시 분당구 판교역로 166",
    requiredSpecs: ["React 3년 이상", "TypeScript 필수", "웹 성능 최적화 경험", "GraphQL 우대"],
    rawText: "카카오 프론트엔드 개발자 채용 공고입니다.",
    createdAt: new Date().toISOString(),
    status: "서류 제출",
    fitScore: 78,
    fitAnalysis: {
      advantages: [
        "React 실무 경험 보유",
        "TypeScript 프로젝트 진행 경험",
        "REST API 연동 및 상태 관리 역량",
        "팀 협업(Git/Jira) 경험",
      ],
      disadvantages: [
        "실무 경력 6개월 (3년 요구 미달)",
        "GraphQL 경험 없음",
        "대규모 트래픽 서비스 경험 없음",
      ],
      summary: "핵심 기술 스택 일치하나 경력 연차 보완이 관건",
    },
  },
  {
    id: "demo-2",
    companyName: "토스",
    jobTitle: "웹 프론트엔드 엔지니어",
    deadline: (() => {
      const d = new Date();
      d.setDate(d.getDate() + 12);
      return d.toISOString().split("T")[0];
    })(),
    workplaceAddress: "서울시 강남구 테헤란로 311",
    requiredSpecs: ["Next.js 경험", "TypeScript", "성능 최적화", "자기주도적 업무"],
    rawText: "토스 웹 프론트엔드 엔지니어 채용 공고입니다.",
    createdAt: new Date().toISOString(),
    status: "관심",
    fitScore: 82,
    fitAnalysis: {
      advantages: [
        "Next.js 개인 프로젝트 경험",
        "TypeScript 능숙",
        "정보처리기사 자격증 보유",
        "자기주도적 학습 능력 입증",
      ],
      disadvantages: [
        "금융 도메인 이해도 부족",
        "실무 경력 상대적으로 짧음",
      ],
      summary: "기술 적합도는 높으나 핀테크 도메인 경험 추가 어필 필요",
    },
  },
  {
    id: "demo-3",
    companyName: "라인플러스",
    jobTitle: "iOS 앱 개발자",
    deadline: (() => {
      const d = new Date();
      d.setDate(d.getDate() + 2);
      return d.toISOString().split("T")[0];
    })(),
    workplaceAddress: "경기도 성남시 분당구 불정로 6",
    requiredSpecs: ["Swift 3년 이상", "UIKit", "SwiftUI", "앱스토어 배포 경험"],
    rawText: "라인플러스 iOS 개발자 채용 공고입니다.",
    createdAt: new Date().toISOString(),
    status: "관심",
    fitScore: 22,
    fitAnalysis: {
      advantages: ["일본어 관심 (우대사항 해당 가능성)"],
      disadvantages: [
        "Swift / iOS 개발 경험 전무",
        "UIKit / SwiftUI 경험 없음",
        "모바일 앱스토어 배포 경험 없음",
        "요구 직무와 보유 기술 스택 불일치",
      ],
      summary: "보유 역량과 요구 직무 간 불일치로 지원 재검토 권장",
    },
  },
];

type FilterTab = "전체" | JobStatus;
const FILTER_TABS: FilterTab[] = ["전체", ...STATUS_LIST];

export default function DashboardPage() {
  const { jobs, addJob, updateJob, deleteJob } = useJobs(INITIAL_JOBS);
  const [selectedJob, setSelectedJob] = useState<JobPosting | null>(null);
  const [showInput, setShowInput] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("전체");

  const handleParsed = useCallback(
    (data: ParseJobResponse, rawText: string) => {
      const newJob: JobPosting = {
        id: `job-${Date.now()}`,
        companyName: data.companyName,
        jobTitle: data.jobTitle,
        deadline: data.deadline,
        workplaceAddress: data.workplaceAddress,
        requiredSpecs: data.requiredSpecs,
        rawText,
        createdAt: new Date().toISOString(),
        status: "관심",
      };
      addJob(newJob);
      setShowInput(false);
      setSelectedJob(newJob);
    },
    [addJob]
  );

  const handleUpdateJob = useCallback(
    (updated: JobPosting) => {
      updateJob(updated);
      setSelectedJob((prev) => (prev?.id === updated.id ? updated : prev));
    },
    [updateJob]
  );

  const handleDeleteJob = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      deleteJob(id);
      if (selectedJob?.id === id) setSelectedJob(null);
    },
    [deleteJob, selectedJob]
  );

  // 상태 필터 + D-Day 기반 분리
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const filteredJobs =
    activeFilter === "전체"
      ? jobs
      : jobs.filter((j) => j.status === activeFilter);

  const activeJobs = filteredJobs.filter(
    (j) => !j.deadline || new Date(j.deadline) >= today
  );
  const expiredJobs = filteredJobs.filter(
    (j) => j.deadline && new Date(j.deadline) < today
  );

  // 각 상태별 카운트 (필터 탭 숫자 배지용)
  const countByStatus = STATUS_LIST.reduce(
    (acc, s) => ({ ...acc, [s]: jobs.filter((j) => j.status === s).length }),
    {} as Record<JobStatus, number>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
      {/* 헤더 */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500 flex items-center justify-center">
              <BriefcaseBusiness className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900">Fit Check</h1>
              <p className="text-[10px] text-gray-400 leading-none">AI 취업 매니저</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-xs text-gray-400">
              {jobs.filter((j) => !j.deadline || new Date(j.deadline) >= today).length}개 진행 중
            </span>
            <button
              onClick={() => setShowInput((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold
                transition-all duration-200
                ${
                  showInput
                    ? "bg-gray-100 text-gray-600"
                    : "bg-blue-500 hover:bg-blue-600 text-white shadow-sm shadow-blue-200"
                }`}
            >
              {showInput ? (
                <>
                  <X className="w-3.5 h-3.5" />
                  닫기
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  공고 추가
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* 공고 입력 패널 */}
        {showInput && (
          <div className="animate-in slide-in-from-top-2 duration-200">
            <JobInput onParsed={handleParsed} />
          </div>
        )}

        {/* 통계 카드 */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="전체 공고" value={jobs.length} color="text-gray-700" />
          <StatCard
            label="진행 중"
            value={jobs.filter((j) => !j.deadline || new Date(j.deadline) >= today).length}
            color="text-blue-500"
          />
          <StatCard
            label="마감됨"
            value={jobs.filter((j) => j.deadline && new Date(j.deadline) < today).length}
            color="text-gray-400"
          />
        </div>

        {/* 상태 필터 탭 — 모바일에서 가로 스크롤 */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {FILTER_TABS.map((tab) => {
            const isActive = activeFilter === tab;
            const count =
              tab === "전체" ? jobs.length : countByStatus[tab as JobStatus] ?? 0;
            const cfg = tab !== "전체" ? STATUS_CONFIG[tab as JobStatus] : null;

            return (
              <button
                key={tab}
                onClick={() => setActiveFilter(tab)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
                  transition-all border
                  ${
                    isActive
                      ? cfg
                        ? `${cfg.bg} ${cfg.text} border-transparent ring-1 ${cfg.ring}`
                        : "bg-blue-500 text-white border-transparent"
                      : "bg-white text-gray-500 border-gray-100 hover:border-blue-200 hover:text-blue-500"
                  }`}
              >
                {tab}
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full
                  ${isActive ? "bg-white/30" : "bg-gray-100 text-gray-400"}`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* 진행 중 공고 */}
        {activeJobs.length > 0 && (
          <section className="space-y-3">
            {activeFilter === "전체" && (
              <h2 className="text-sm font-semibold text-gray-700">진행 중인 공고</h2>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeJobs.map((job) => (
                <div key={job.id} className="relative group">
                  <JobCard job={job} onClick={() => setSelectedJob(job)} />
                  <button
                    onClick={(e) => handleDeleteJob(job.id, e)}
                    className="absolute top-3 right-[52px] opacity-0 group-hover:opacity-100
                               transition-opacity p-1 rounded-lg hover:bg-red-50
                               text-gray-300 hover:text-red-400"
                    title="공고 삭제"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 마감된 공고 */}
        {expiredJobs.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-400">마감된 공고</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
              {expiredJobs.map((job) => (
                <div key={job.id} className="relative group">
                  <JobCard job={job} onClick={() => setSelectedJob(job)} />
                  <button
                    onClick={(e) => handleDeleteJob(job.id, e)}
                    className="absolute top-3 right-[52px] opacity-0 group-hover:opacity-100
                               transition-opacity p-1 rounded-lg hover:bg-red-50
                               text-gray-300 hover:text-red-400"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 필터 결과 없음 */}
        {filteredJobs.length === 0 && jobs.length > 0 && (
          <div className="text-center py-16 space-y-2">
            <p className="text-gray-400 text-sm">
              &apos;{activeFilter}&apos; 상태의 공고가 없습니다.
            </p>
            <button
              onClick={() => setActiveFilter("전체")}
              className="text-xs text-blue-500 underline underline-offset-2"
            >
              전체 보기
            </button>
          </div>
        )}

        {/* 공고 자체가 없는 경우 */}
        {jobs.length === 0 && (
          <div className="text-center py-20 space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto">
              <BriefcaseBusiness className="w-8 h-8 text-blue-300" />
            </div>
            <p className="text-gray-500 font-medium">등록된 공고가 없습니다</p>
            <p className="text-sm text-gray-400">
              공고 추가 버튼을 눌러 채용 공고를 등록해보세요.
            </p>
          </div>
        )}
      </main>

      {/* 상세 모달 */}
      {selectedJob && (
        <JobModal
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onUpdate={handleUpdateJob}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 text-center shadow-sm">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}
