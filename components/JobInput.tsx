"use client";

import { useState } from "react";
import { AlertCircle, Link, Loader2, Plus, X } from "lucide-react";
import type { JobCategory, JobPosting, ParseJobResponse } from "@/types";
import { JOB_CATEGORY_CONFIG, JOB_CATEGORY_LIST } from "@/lib/jobCategories";
import { useToast } from "@/components/Toast";

type ParsedJobResult =
  | { status: "added" }
  | { status: "duplicate"; job: JobPosting };

interface JobInputProps {
  onParsed: (
    data: ParseJobResponse,
    rawText: string,
    jobCategories: JobCategory[]
  ) => ParsedJobResult;
  onFindDuplicate: (url: string) => JobPosting | null;
  onSelectDuplicate: (job: JobPosting) => void;
}

export default function JobInput({
  onParsed,
  onFindDuplicate,
  onSelectDuplicate,
}: JobInputProps) {
  const [input, setInput] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<JobCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const toggleCategory = (category: JobCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((item) => item !== category)
        : [...prev, category]
    );
    setError(null);
  };

  const showDuplicateJob = (job: JobPosting) => {
    const message = `이미 등록된 공고입니다.\n${job.companyName} - ${job.jobTitle}`;
    setError(`${message}\n\n기존 공고를 열어뒀어요.`);
    toast(message, "info");
    onSelectDuplicate(job);
  };

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (selectedCategories.length === 0) {
      setError("직무 카테고리를 하나 이상 선택해주세요.");
      return;
    }

    const duplicateBeforeParse = onFindDuplicate(trimmed);
    if (duplicateBeforeParse) {
      showDuplicateJob(duplicateBeforeParse);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/parse-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "URL 파싱에 실패했습니다.");
        return;
      }

      const data: ParseJobResponse = await res.json();
      const result = onParsed(data, data.rawText ?? `URL: ${trimmed}`, selectedCategories);
      if (result.status === "duplicate") {
        showDuplicateJob(result.job);
        return;
      }

      setInput("");
      setSelectedCategories([]);
      setError(null);
      toast(
        data.parserMode === "fallback"
          ? "공고가 등록되었습니다. 기본 추출 결과로 저장했어요."
          : "공고가 등록되었습니다. AI 적합도 분석이 시작됩니다.",
        "success"
      );
    } catch {
      toast("네트워크 오류가 발생했습니다. 연결 상태를 확인해주세요.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">공고 추가</h2>
        <div className="flex items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-600">
          <Link className="w-3.5 h-3.5" />
          URL
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500">직무 카테고리</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {JOB_CATEGORY_LIST.map((category) => {
            const cfg = JOB_CATEGORY_CONFIG[category];
            const isActive = selectedCategories.includes(category);
            return (
              <button
                key={category}
                type="button"
                onClick={() => toggleCategory(category)}
                disabled={loading}
                className={`rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
                  isActive
                    ? `${cfg.active} ring-1`
                    : "border-gray-100 bg-gray-50 text-gray-400 hover:border-blue-200 hover:bg-white hover:text-blue-500"
                }`}
              >
                {category}
              </button>
            );
          })}
        </div>
      </div>

      <input
        type="url"
        className={`w-full text-sm border rounded-xl px-3 py-2.5
                   focus:outline-none focus:ring-2 focus:ring-blue-200
                   placeholder:text-gray-300 text-gray-700 bg-gray-50
                   ${error ? "border-red-200" : "border-gray-100"}`}
        placeholder="https://www.saramin.co.kr/..."
        value={input}
        onChange={(e) => { setInput(e.target.value); setError(null); }}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        disabled={loading}
      />
      {!error && (
        <p className="text-[11px] text-gray-400">
          사람인 공고 URL을 붙여넣으면 모집요강과 상세요강을 함께 불러옵니다.
        </p>
      )}

      {/* 에러 박스 (URL 파싱 실패 시 상세 안내) */}
      {error && (
        <div className="relative bg-red-50 border border-red-100 rounded-xl px-4 py-3 pr-8">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-600 leading-relaxed whitespace-pre-line">
              {error}
            </p>
          </div>
          <button
            onClick={() => setError(null)}
            className="absolute top-2.5 right-2.5 text-red-300 hover:text-red-500"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 로딩 상태 */}
      {loading && (
        <div className="flex items-center gap-2 text-xs text-blue-500 bg-blue-50 rounded-lg px-3 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          <span>페이지를 불러오고 공고 정보를 분석 중입니다...</span>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading || !input.trim() || selectedCategories.length === 0}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                   bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold
                   disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            분석 중...
          </>
        ) : (
          <>
            <Plus className="w-4 h-4" />
            공고 등록
          </>
        )}
      </button>
    </div>
  );
}
