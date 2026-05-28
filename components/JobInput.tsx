"use client";

import { useState } from "react";
import { Loader2, Plus, Link, FileText, AlertCircle, X } from "lucide-react";
import { ParseJobResponse } from "@/types";
import { useToast } from "@/components/Toast";

interface JobInputProps {
  onParsed: (data: ParseJobResponse, rawText: string) => void;
}

export default function JobInput({ onParsed }: JobInputProps) {
  const [mode, setMode] = useState<"text" | "url">("text");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleModeChange = (m: "text" | "url") => {
    setMode(m);
    setError(null);
  };

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/parse-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "url" ? { url: trimmed } : { text: trimmed }
        ),
      });

      if (!res.ok) {
        const err = await res.json();
        // URL 관련 오류는 인라인 박스로, 나머지는 Toast
        if (mode === "url" || res.status === 422) {
          setError(err.error || "URL 파싱에 실패했습니다.");
        } else {
          toast(err.error || "공고 파싱 중 오류가 발생했습니다.", "error");
        }
        return;
      }

      const data: ParseJobResponse = await res.json();
      onParsed(data, mode === "text" ? trimmed : `URL: ${trimmed}`);
      setInput("");
      setError(null);
      toast("공고가 등록되었습니다. AI 적합도 분석이 시작됩니다.", "success");
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
        <div className="flex rounded-lg overflow-hidden border border-gray-100 text-xs">
          <button
            onClick={() => handleModeChange("text")}
            className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors
              ${mode === "text"
                ? "bg-blue-500 text-white"
                : "bg-white text-gray-500 hover:bg-gray-50"
              }`}
          >
            <FileText className="w-3.5 h-3.5" />
            텍스트
          </button>
          <button
            onClick={() => handleModeChange("url")}
            className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors
              ${mode === "url"
                ? "bg-blue-500 text-white"
                : "bg-white text-gray-500 hover:bg-gray-50"
              }`}
          >
            <Link className="w-3.5 h-3.5" />
            URL
          </button>
        </div>
      </div>

      {mode === "text" ? (
        <textarea
          className="w-full h-32 text-sm border border-gray-100 rounded-xl px-3 py-2.5
                     resize-none focus:outline-none focus:ring-2 focus:ring-blue-200
                     placeholder:text-gray-300 text-gray-700 bg-gray-50"
          placeholder="채용 공고 전체 내용을 여기에 붙여넣으세요..."
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(null); }}
          disabled={loading}
        />
      ) : (
        <>
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
          {/* URL 모드 안내 */}
          {!error && (
            <p className="text-[11px] text-gray-400">
              사람인·잡코리아·점핏 등 서버 렌더링 사이트에서 잘 동작합니다.
              원티드·링크드인 등은 텍스트 모드를 이용해주세요.
            </p>
          )}
        </>
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
          <span>
            {mode === "url"
              ? "페이지를 불러오고 AI가 분석 중입니다..."
              : "AI가 공고를 분석하고 있습니다. 잠시만 기다려 주세요..."}
          </span>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading || !input.trim()}
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
