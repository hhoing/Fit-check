"use client";

import { useState } from "react";
import { Loader2, Plus, Link, FileText } from "lucide-react";
import { ParseJobResponse } from "@/types";
import { useToast } from "@/components/Toast";

interface JobInputProps {
  onParsed: (data: ParseJobResponse, rawText: string) => void;
}

export default function JobInput({ onParsed }: JobInputProps) {
  const [mode, setMode] = useState<"text" | "url">("text");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    setLoading(true);
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
        throw new Error(err.error || "파싱 실패");
      }

      const data: ParseJobResponse = await res.json();
      onParsed(data, mode === "text" ? trimmed : `URL: ${trimmed}`);
      setInput("");
      toast("공고가 등록되었습니다. AI 적합도 분석이 시작됩니다.", "success");
    } catch (e) {
      toast(
        e instanceof Error ? e.message : "공고 파싱 중 오류가 발생했습니다.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">공고 추가</h2>
        {/* 탭 */}
        <div className="flex rounded-lg overflow-hidden border border-gray-100 text-xs">
          <button
            onClick={() => setMode("text")}
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
            onClick={() => setMode("url")}
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
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
      ) : (
        <input
          type="url"
          className="w-full text-sm border border-gray-100 rounded-xl px-3 py-2.5
                     focus:outline-none focus:ring-2 focus:ring-blue-200
                     placeholder:text-gray-300 text-gray-700 bg-gray-50"
          placeholder="https://www.saramin.co.kr/..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          disabled={loading}
        />
      )}

      {/* 로딩 진행 상태 */}
      {loading && (
        <div className="flex items-center gap-2 text-xs text-blue-500 bg-blue-50 rounded-lg px-3 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          <span>AI가 공고를 분석하고 있습니다. 잠시만 기다려 주세요...</span>
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
