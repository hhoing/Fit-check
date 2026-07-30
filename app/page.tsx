"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  ArrowUp,
  BriefcaseBusiness,
  CalendarDays,
  Clock3,
  Loader2,
  List,
  Plus,
  Star,
  Target,
  X,
} from "lucide-react";
import {
  AnalyzeFitResponse,
  JobPosting,
  JobStatus,
  ParseJobResponse,
  type JobCategory,
} from "@/types";
import { STATUS_LIST, STATUS_CONFIG } from "@/lib/constants";
import { getDeadlineSortTime, isDeadlineExpired } from "@/lib/deadline";
import { CURRENT_JOB_PARSER_VERSION } from "@/lib/jobParserVersion";
import {
  JOB_CATEGORY_CONFIG,
  JOB_CATEGORY_LIST,
  getPrimaryJobCategory,
  normalizeJobCategories,
  withManualJobCategories,
} from "@/lib/jobCategories";
import { useJobs } from "@/hooks/useJobs";
import JobCard from "@/components/JobCard";
import JobInput from "@/components/JobInput";
import JobModal from "@/components/JobModal";
import DeadlineCalendar from "@/components/DeadlineCalendar";

const INITIAL_JOBS: JobPosting[] = [];
const CANONICAL_SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://hhoing-fit-check.vercel.app";
const CANONICAL_SITE_HOST = new URL(CANONICAL_SITE_ORIGIN).host;

type StatusFilterTab = Exclude<JobStatus, "관심">;
type FilterTab = "전체" | "즐겨찾기" | StatusFilterTab;
const STATUS_FILTER_TABS = STATUS_LIST.filter(
  (status): status is StatusFilterTab => status !== "관심"
);
const FILTER_TABS: FilterTab[] = ["전체", "즐겨찾기", ...STATUS_FILTER_TABS];
type CategoryFilterTab = "전체" | JobCategory;
const CATEGORY_FILTER_TABS: CategoryFilterTab[] = ["전체", ...JOB_CATEGORY_LIST];
type SortMode = "deadline" | "fitScore";
type ViewMode = "list" | "calendar";

type RefreshPayload = { url: string } | { text: string };

function getJobRefreshPayload(job: JobPosting): RefreshPayload | null {
  const urlFromRawText = job.rawText.match(/^URL:\s*(https?:\/\/\S+)/)?.[1];
  const sourceUrl = job.sourceUrl ?? urlFromRawText;

  if (sourceUrl) return { url: sourceUrl };
  if (job.rawText.trim()) return { text: job.rawText };
  return null;
}

function mergeParsedJob(
  job: JobPosting,
  data: ParseJobResponse,
  payload: RefreshPayload
): JobPosting {
  return withManualJobCategories({
    ...job,
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
    rawText: data.rawText ?? job.rawText,
    sourceUrl: data.sourceUrl ?? ("url" in payload ? payload.url : job.sourceUrl),
    sourceType: data.sourceType ?? ("url" in payload ? "url" : job.sourceType),
    salary: data.salary ?? "미확인",
    employmentType: data.employmentType ?? "미확인",
    experienceLevel: data.experienceLevel ?? "미확인",
    parserVersion: CURRENT_JOB_PARSER_VERSION,
    parsedAt: new Date().toISOString(),
    lastParseError: undefined,
    commuteTime: undefined,
    fitScore: job.fitScore,
    fitAnalysis: job.fitAnalysis,
  });
}

export default function DashboardPage() {
  const { jobs, addJob, updateJob, deleteJob, isLoaded } = useJobs(INITIAL_JOBS);
  const [selectedJob, setSelectedJob] = useState<JobPosting | null>(null);
  const [jobToDelete, setJobToDelete] = useState<JobPosting | null>(null);
  const [showInput, setShowInput] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("전체");
  const [activeCategory, setActiveCategory] = useState<CategoryFilterTab>("전체");
  const [sortMode, setSortMode] = useState<SortMode>("deadline");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [upgradeProgress, setUpgradeProgress] = useState<{
    total: number;
    done: number;
    running: boolean;
  } | null>(null);
  const upgradingIdsRef = useRef<Set<string>>(new Set());
  const analyzingIdsRef = useRef<Set<string>>(new Set());
  const analysisAttemptedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (window.location.hostname.endsWith(".vercel.app")) {
      if (window.location.host !== CANONICAL_SITE_HOST) {
        window.location.replace(
          `${CANONICAL_SITE_ORIGIN}${window.location.pathname}${window.location.search}${window.location.hash}`
        );
      }
    }
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 420);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const analyzeAndStoreJob = useCallback(
    async (job: JobPosting, options: { force?: boolean } = {}) => {
      if (!options.force && job.fitScore !== undefined && job.fitAnalysis) return job;
      if (analyzingIdsRef.current.has(job.id)) return job;

      analyzingIdsRef.current.add(job.id);
      analysisAttemptedIdsRef.current.add(job.id);

      try {
        const res = await fetch("/api/analyze-fit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobPosting: job }),
        });
        if (!res.ok) throw new Error("적합도 분석에 실패했습니다.");

        const data = (await res.json()) as AnalyzeFitResponse;
        const analyzed: JobPosting = {
          ...job,
          fitScore: data.fitScore,
          fitAnalysis: data.fitAnalysis,
        };

        updateJob(analyzed);
        setSelectedJob((prev) => (prev?.id === analyzed.id ? analyzed : prev));
        return analyzed;
      } catch (error) {
        console.error("fit analysis failed:", error);
        return job;
      } finally {
        analyzingIdsRef.current.delete(job.id);
      }
    },
    [updateJob]
  );

  const handleParsed = useCallback(
    (data: ParseJobResponse, rawText: string, selectedCategories: JobCategory[]) => {
      const jobCategories = normalizeJobCategories(selectedCategories);
      const newJob: JobPosting = {
        id: `job-${Date.now()}`,
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
        rawText: data.rawText ?? rawText,
        sourceUrl: data.sourceUrl,
        sourceType: data.sourceType,
        parserVersion: CURRENT_JOB_PARSER_VERSION,
        parsedAt: new Date().toISOString(),
        salary: data.salary ?? "미확인",
        employmentType: data.employmentType ?? "미확인",
        experienceLevel: data.experienceLevel ?? "미확인",
        memo: "",
        isFavorite: false,
        createdAt: new Date().toISOString(),
        status: "관심",
        jobCategories,
        primaryCategory: getPrimaryJobCategory(jobCategories),
        categorySource: "manual",
      };
      addJob(newJob);
      setShowInput(false);
      setSelectedJob(newJob);
      void analyzeAndStoreJob(newJob);
    },
    [addJob, analyzeAndStoreJob]
  );

  useEffect(() => {
    if (!isLoaded) return;

    const jobsToUpgrade = jobs.filter((job) => {
      if ((job.parserVersion ?? 0) >= CURRENT_JOB_PARSER_VERSION) return false;
      if (upgradingIdsRef.current.has(job.id)) return false;
      return Boolean(getJobRefreshPayload(job));
    });

    if (jobsToUpgrade.length === 0) return;

    jobsToUpgrade.forEach((job) => upgradingIdsRef.current.add(job.id));
    setUpgradeProgress({ total: jobsToUpgrade.length, done: 0, running: true });

    void (async () => {
      let done = 0;
      for (const job of jobsToUpgrade) {
        const payload = getJobRefreshPayload(job);
        if (!payload) continue;

        try {
          const res = await fetch("/api/parse-job", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = (await res.json()) as ParseJobResponse & { error?: string };
          if (!res.ok) throw new Error(data.error || "공고 정보 업데이트에 실패했습니다.");

          const mergedJob = mergeParsedJob(job, data, payload);
          updateJob(mergedJob);
          setSelectedJob((prev) => (prev?.id === job.id ? mergedJob : prev));
          await analyzeAndStoreJob(mergedJob, { force: true });
        } catch (error) {
          const failedJob = {
            ...job,
            parserVersion: CURRENT_JOB_PARSER_VERSION,
            parsedAt: new Date().toISOString(),
            lastParseError:
              error instanceof Error ? error.message : "공고 정보 업데이트에 실패했습니다.",
          };
          updateJob(failedJob);
          setSelectedJob((prev) => (prev?.id === job.id ? failedJob : prev));
        } finally {
          done += 1;
          setUpgradeProgress({
            total: jobsToUpgrade.length,
            done,
            running: done < jobsToUpgrade.length,
          });
        }
      }
    })();
  }, [analyzeAndStoreJob, isLoaded, jobs, updateJob]);

  useEffect(() => {
    if (!isLoaded) return;

    const jobsToAnalyze = jobs.filter((job) => {
      if (job.fitScore !== undefined && job.fitAnalysis) return false;
      if ((job.parserVersion ?? 0) < CURRENT_JOB_PARSER_VERSION) return false;
      if (analysisAttemptedIdsRef.current.has(job.id)) return false;
      if (analyzingIdsRef.current.has(job.id)) return false;
      return true;
    });

    jobsToAnalyze.forEach((job) => {
      void analyzeAndStoreJob(job);
    });
  }, [analyzeAndStoreJob, isLoaded, jobs]);

  const handleUpdateJob = useCallback(
    (updated: JobPosting) => {
      updateJob(updated);
      setSelectedJob((prev) => (prev?.id === updated.id ? updated : prev));
    },
    [updateJob]
  );

  const requestDeleteJob = useCallback(
    (job: JobPosting, e: React.MouseEvent) => {
      e.stopPropagation();
      setJobToDelete(job);
    },
    []
  );

  const requestDeleteJobFromModal = useCallback((job: JobPosting) => {
    setJobToDelete(job);
  }, []);

  const confirmDeleteJob = useCallback(() => {
    if (!jobToDelete) return;
    const id = jobToDelete.id;
    deleteJob(id);
    if (selectedJob?.id === id) setSelectedJob(null);
    setJobToDelete(null);
  }, [deleteJob, jobToDelete, selectedJob]);

  const cancelDeleteJob = useCallback(() => {
    setJobToDelete(null);
  }, []);

  const selectJob = useCallback(
    (job: JobPosting) => {
      const latest = jobs.find((j) => j.id === job.id) ?? job;
      setSelectedJob(latest);
    },
    [jobs]
  );

  const toggleFavorite = useCallback(
    (job: JobPosting) => {
      const updated = { ...job, isFavorite: !job.isFavorite };
      updateJob(updated);
      setSelectedJob((prev) => (prev?.id === job.id ? updated : prev));
    },
    [updateJob]
  );

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // 상태 필터 + D-Day 기반 분리
  const now = new Date();

  const statusFilteredJobs =
    activeFilter === "전체"
      ? jobs
      : activeFilter === "즐겨찾기"
      ? jobs.filter((j) => j.isFavorite)
      : jobs.filter((j) => j.status === activeFilter);

  const filteredJobs =
    activeCategory === "전체"
      ? statusFilteredJobs
      : statusFilteredJobs.filter((j) => j.jobCategories?.includes(activeCategory));

  const sortedJobs = [...filteredJobs].sort((a, b) => {
    if (sortMode === "fitScore") {
      const scoreDiff = (b.fitScore ?? -1) - (a.fitScore ?? -1);
      if (scoreDiff !== 0) return scoreDiff;
    }

    const aDeadline = getDeadlineSortTime(a.deadline, a.deadlineTime);
    const bDeadline = getDeadlineSortTime(b.deadline, b.deadlineTime);
    return aDeadline - bDeadline;
  });

  const activeJobs = sortedJobs.filter((j) => !isDeadlineExpired(j.deadline, j.deadlineTime, now));
  const expiredJobs = sortedJobs.filter((j) => isDeadlineExpired(j.deadline, j.deadlineTime, now));
  const activeJobCount = jobs.filter((j) => !isDeadlineExpired(j.deadline, j.deadlineTime, now)).length;
  const expiredJobCount = jobs.filter((j) => isDeadlineExpired(j.deadline, j.deadlineTime, now)).length;
  const favoriteJobCount = jobs.filter((j) => j.isFavorite).length;
  const emptyFilterMessage =
    activeCategory !== "전체"
      ? `${activeCategory} 직무 필터에 맞는 공고가 없습니다.`
      : activeFilter === "즐겨찾기"
      ? "즐겨찾기한 공고가 없습니다."
      : `'${activeFilter}' 상태의 공고가 없습니다.`;

  // 각 상태별 카운트 (필터 탭 숫자 배지용)
  const countByStatus = STATUS_LIST.reduce(
    (acc, s) => ({ ...acc, [s]: jobs.filter((j) => j.status === s).length }),
    {} as Record<JobStatus, number>
  );
  const countByCategory = JOB_CATEGORY_LIST.reduce(
    (acc, category) => ({
      ...acc,
      [category]: statusFilteredJobs.filter((j) => j.jobCategories?.includes(category)).length,
    }),
    {} as Record<JobCategory, number>
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
              {activeJobCount}개 진행 중
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

        {upgradeProgress?.running && (
          <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-medium text-blue-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            기존 공고에 최신 파서와 적합도 점수 저장 기준을 적용 중입니다.
            <span className="ml-auto text-blue-400">
              {upgradeProgress.done}/{upgradeProgress.total}
            </span>
          </div>
        )}

        {/* 통계 카드 */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="전체 공고" value={jobs.length} color="text-gray-700" />
          <StatCard
            label="진행 중"
            value={activeJobCount}
            color="text-blue-500"
          />
          <StatCard
            label="마감됨"
            value={expiredJobCount}
            color="text-gray-400"
          />
        </div>

        {/* 상태 필터 탭 — 모바일에서 가로 스크롤 */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {FILTER_TABS.map((tab) => {
            const isActive = activeFilter === tab;
            const count =
              tab === "전체"
                ? jobs.length
                : tab === "즐겨찾기"
                ? favoriteJobCount
                : countByStatus[tab] ?? 0;
            const cfg =
              tab !== "전체" && tab !== "즐겨찾기" ? STATUS_CONFIG[tab] : null;

            return (
              <button
                key={tab}
                onClick={() => setActiveFilter(tab)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
                  transition-all border
                  ${
                    isActive
                      ? tab === "즐겨찾기"
                        ? "bg-amber-50 text-amber-600 border-amber-100 ring-1 ring-amber-200"
                        : cfg
                        ? `${cfg.bg} ${cfg.text} border-transparent ring-1 ${cfg.ring}`
                        : "bg-blue-500 text-white border-transparent"
                      : "bg-white text-gray-500 border-gray-100 hover:border-blue-200 hover:text-blue-500"
                  }`}
              >
                {tab === "즐겨찾기" && (
                  <Star className="h-3.5 w-3.5" fill={isActive ? "currentColor" : "none"} />
                )}
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

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {CATEGORY_FILTER_TABS.map((category) => {
            const isActive = activeCategory === category;
            const count = category === "전체" ? statusFilteredJobs.length : countByCategory[category];
            const cfg = category === "전체" ? null : JOB_CATEGORY_CONFIG[category];

            return (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
                  transition-all border
                  ${
                    isActive
                      ? cfg
                        ? `${cfg.active} ring-1`
                        : "border-gray-900 bg-gray-900 text-white"
                      : "bg-white text-gray-500 border-gray-100 hover:border-blue-200 hover:text-blue-500"
                  }`}
              >
                {category}
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full
                  ${isActive ? "bg-white/40" : "bg-gray-100 text-gray-400"}`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setSortMode("deadline")}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                sortMode === "deadline"
                  ? "border-blue-200 bg-blue-50 text-blue-600"
                  : "border-gray-100 bg-white text-gray-500 hover:border-blue-200 hover:text-blue-500"
              }`}
            >
              <Clock3 className="w-3.5 h-3.5" />
              마감임박순
            </button>
            <button
              onClick={() => setSortMode("fitScore")}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                sortMode === "fitScore"
                  ? "border-blue-200 bg-blue-50 text-blue-600"
                  : "border-gray-100 bg-white text-gray-500 hover:border-blue-200 hover:text-blue-500"
              }`}
            >
              <Target className="w-3.5 h-3.5" />
              타겟 적합도순
            </button>
          </div>

          <div className="inline-flex w-fit overflow-hidden rounded-lg border border-gray-100 bg-white text-xs font-semibold">
            <button
              onClick={() => setViewMode("list")}
              className={`inline-flex items-center gap-1.5 px-3 py-2 transition-colors ${
                viewMode === "list" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              <List className="w-3.5 h-3.5" />
              목록
            </button>
            <button
              onClick={() => setViewMode("calendar")}
              className={`inline-flex items-center gap-1.5 px-3 py-2 transition-colors ${
                viewMode === "calendar" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              달력
            </button>
          </div>
        </div>

        {viewMode === "calendar" && (
          <DeadlineCalendar jobs={sortedJobs} onSelectJob={selectJob} />
        )}

        {/* 진행 중 공고 */}
        {viewMode === "list" && activeJobs.length > 0 && (
          <section className="space-y-3">
            {activeFilter === "전체" && (
              <h2 className="text-sm font-semibold text-gray-700">진행 중인 공고</h2>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeJobs.map((job) => (
                <div key={job.id} className="relative group">
                  <JobCard
                    job={job}
                    onClick={() => selectJob(job)}
                    onToggleFavorite={() => toggleFavorite(job)}
                  />
                  <button
                    onClick={(e) => requestDeleteJob(job, e)}
                    className="absolute top-3 right-[92px] opacity-0 group-hover:opacity-100
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
        {viewMode === "list" && expiredJobs.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-400">마감된 공고</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
              {expiredJobs.map((job) => (
                <div key={job.id} className="relative group">
                  <JobCard
                    job={job}
                    onClick={() => selectJob(job)}
                    onToggleFavorite={() => toggleFavorite(job)}
                  />
                  <button
                    onClick={(e) => requestDeleteJob(job, e)}
                    className="absolute top-3 right-[92px] opacity-0 group-hover:opacity-100
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
              {emptyFilterMessage}
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
          key={`${selectedJob.id}-${selectedJob.parserVersion ?? 0}-${selectedJob.parsedAt ?? ""}-${selectedJob.fitScore ?? "pending"}`}
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onUpdate={handleUpdateJob}
          onRequestDelete={requestDeleteJobFromModal}
        />
      )}

      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-5 right-5 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-blue-100 bg-white text-blue-500 shadow-lg shadow-blue-100/70 transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50"
          title="맨 위로"
          aria-label="맨 위로"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      )}

      {jobToDelete && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
          onClick={cancelDeleteJob}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-bold text-gray-900">공고를 삭제할까요?</h2>
            <p className="mt-2 text-sm text-gray-500 leading-relaxed">
              <span className="font-semibold text-gray-800">
                {jobToDelete.companyName} - {jobToDelete.jobTitle}
              </span>
              을(를) 목록에서 삭제합니다.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={cancelDeleteJob}
                className="rounded-lg border border-gray-100 px-4 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={confirmDeleteJob}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
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
