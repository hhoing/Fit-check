import { JobStatus } from "@/types";

export const STATUS_LIST: JobStatus[] = [
  "관심",
  "서류 제출",
  "면접 진행",
  "결과 대기",
  "합격",
  "불합격",
];

export const STATUS_CONFIG: Record<
  JobStatus,
  { bg: string; text: string; ring: string; emoji: string }
> = {
  관심:     { bg: "bg-gray-100",   text: "text-gray-600",   ring: "ring-gray-200",   emoji: "🔖" },
  "서류 제출": { bg: "bg-blue-50",   text: "text-blue-600",   ring: "ring-blue-200",   emoji: "📄" },
  "면접 진행": { bg: "bg-purple-50", text: "text-purple-600", ring: "ring-purple-200", emoji: "🗣️" },
  "결과 대기": { bg: "bg-amber-50",  text: "text-amber-600",  ring: "ring-amber-200",  emoji: "⏳" },
  합격:     { bg: "bg-green-50",  text: "text-green-600",  ring: "ring-green-200",  emoji: "🎉" },
  불합격:   { bg: "bg-red-50",    text: "text-red-500",    ring: "ring-red-200",    emoji: "❌" },
};
