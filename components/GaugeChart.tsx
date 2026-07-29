"use client";

import { useMemo } from "react";

interface GaugeChartProps {
  score: number; // 0 ~ 100
}

export default function GaugeChart({ score }: GaugeChartProps) {
  const clamped = Math.round(Math.max(0, Math.min(100, score)));

  // SVG 반원 게이지 파라미터
  const R = 82;
  const cx = 120;
  const cy = 112;
  const startAngle = Math.PI; // 왼쪽 (180°)
  const endAngle = 0;         // 오른쪽 (0°)
  const totalArc = Math.PI;   // 반원

  const toXY = (angle: number) => ({
    x: cx + R * Math.cos(angle),
    y: cy - R * Math.sin(angle),
  });

  const scoreAngle = Math.PI - (clamped / 100) * totalArc;
  const start = toXY(startAngle);
  const end = toXY(endAngle);
  const fill = toXY(scoreAngle);

  const trackPath = `M ${start.x} ${start.y} A ${R} ${R} 0 0 1 ${end.x} ${end.y}`;
  const fillPath = `M ${start.x} ${start.y} A ${R} ${R} 0 0 1 ${fill.x} ${fill.y}`;

  const color = useMemo(() => {
    if (clamped >= 75) return { stroke: "#3b82f6", text: "text-blue-500" };
    if (clamped >= 50) return { stroke: "#f59e0b", text: "text-amber-500" };
    return { stroke: "#ef4444", text: "text-red-500" };
  }, [clamped]);

  const fitLabel = useMemo(() => {
    if (clamped >= 85) return "강한 적합";
    if (clamped >= 70) return "주요 타겟";
    if (clamped >= 55) return "검토 가능";
    if (clamped >= 40) return "보완 필요";
    return "낮은 적합";
  }, [clamped]);

  return (
    <div className="flex flex-col items-center">
      <svg
        className="w-full max-w-[240px]"
        height="150"
        viewBox="0 0 240 150"
        role="img"
        aria-label={`타겟 적합도 ${clamped}점`}
      >
        {/* 배경 트랙 */}
        <path
          d={trackPath}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="18"
          strokeLinecap="round"
        />
        {/* 점수 채움 */}
        {clamped > 0 && (
          <path
            d={fillPath}
            fill="none"
            stroke={color.stroke}
            strokeWidth="18"
            strokeLinecap="round"
          />
        )}
        {/* 점수 텍스트 */}
        <text
          x={cx}
          y={cy - 13}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="34"
          fontWeight="bold"
          fill={color.stroke}
        >
          {clamped}
        </text>
        <text
          x={cx}
          y={cy + 10}
          textAnchor="middle"
          fontSize="11"
          fill="#9ca3af"
        >
          타겟 적합도
        </text>
        {/* 눈금 라벨 */}
        <text x="32" y="136" fontSize="10" fill="#9ca3af">0</text>
        <text x="114" y="24" fontSize="10" textAnchor="middle" fill="#9ca3af">50</text>
        <text x="205" y="136" fontSize="10" fill="#9ca3af">100</text>
      </svg>
      <p className={`text-sm font-semibold mt-1 ${color.text}`}>
        {fitLabel}
      </p>
      <p className="text-xs text-gray-400 mt-0.5">커리어 타겟 기준 분석</p>
    </div>
  );
}
