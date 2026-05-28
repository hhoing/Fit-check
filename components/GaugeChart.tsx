"use client";

import { useMemo } from "react";

interface GaugeChartProps {
  score: number; // 0 ~ 100
}

export default function GaugeChart({ score }: GaugeChartProps) {
  const clamped = Math.max(0, Math.min(100, score));

  // SVG 반원 게이지 파라미터
  const R = 80;
  const cx = 100;
  const cy = 100;
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
  const largeArc = clamped > 50 ? 1 : 0;

  const trackPath = `M ${start.x} ${start.y} A ${R} ${R} 0 1 1 ${end.x} ${end.y}`;
  const fillPath = `M ${start.x} ${start.y} A ${R} ${R} 0 ${largeArc} 1 ${fill.x} ${fill.y}`;

  const color = useMemo(() => {
    if (clamped >= 75) return { stroke: "#3b82f6", text: "text-blue-500" };
    if (clamped >= 50) return { stroke: "#f59e0b", text: "text-amber-500" };
    return { stroke: "#ef4444", text: "text-red-500" };
  }, [clamped]);

  const percentileText = useMemo(() => {
    if (clamped >= 90) return "상위 10% 수준";
    if (clamped >= 75) return "상위 25% 수준";
    if (clamped >= 60) return "상위 40% 수준";
    if (clamped >= 45) return "상위 55% 수준";
    return "하위 50% 수준";
  }, [clamped]);

  return (
    <div className="flex flex-col items-center">
      <svg width="200" height="120" viewBox="0 0 200 120">
        {/* 배경 트랙 */}
        <path
          d={trackPath}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="16"
          strokeLinecap="round"
        />
        {/* 점수 채움 */}
        {clamped > 0 && (
          <path
            d={fillPath}
            fill="none"
            stroke={color.stroke}
            strokeWidth="16"
            strokeLinecap="round"
          />
        )}
        {/* 점수 텍스트 */}
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="28"
          fontWeight="bold"
          fill={color.stroke}
        >
          {clamped}
        </text>
        <text
          x={cx}
          y={cy + 24}
          textAnchor="middle"
          fontSize="11"
          fill="#6b7280"
        >
          / 100
        </text>
        {/* 눈금 라벨 */}
        <text x="16" y="108" fontSize="9" fill="#9ca3af">0</text>
        <text x="93" y="22" fontSize="9" fill="#9ca3af">50</text>
        <text x="175" y="108" fontSize="9" fill="#9ca3af">100</text>
      </svg>
      <p className={`text-sm font-semibold mt-1 ${color.text}`}>
        {percentileText}
      </p>
      <p className="text-xs text-gray-400 mt-0.5">AI 서류 합격률 예측</p>
    </div>
  );
}
