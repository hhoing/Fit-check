"use client";

import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { FitAnalysis as FitAnalysisType } from "@/types";

interface FitAnalysisProps {
  analysis: FitAnalysisType | undefined;
  isLoading: boolean;
}

export default function FitAnalysis({ analysis, isLoading }: FitAnalysisProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 gap-2 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">AI가 이력서와 공고를 비교 분석 중...</span>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        분석 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {analysis.summary && (
        <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-4 py-3 border border-gray-100">
          {analysis.summary}
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* 유리한 조건 */}
        <div>
          <h4 className="text-sm font-semibold text-blue-600 mb-2 flex items-center gap-1">
            <CheckCircle className="w-4 h-4" />
            유리한 조건
          </h4>
          <ul className="space-y-1.5">
            {analysis.advantages.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-blue-700">
                <CheckCircle className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        {/* 부족한 조건 */}
        <div>
          <h4 className="text-sm font-semibold text-red-500 mb-2 flex items-center gap-1">
            <XCircle className="w-4 h-4" />
            보완이 필요한 조건
          </h4>
          <ul className="space-y-1.5">
            {analysis.disadvantages.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-red-600">
                <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
