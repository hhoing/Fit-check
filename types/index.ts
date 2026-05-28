export type JobStatus =
  | "관심"
  | "서류 제출"
  | "면접 진행"
  | "결과 대기"
  | "합격"
  | "불합격";

export interface JobPosting {
  id: string;
  companyName: string;
  jobTitle: string;
  deadline: string | null; // ISO date string or null
  workplaceAddress: string;
  requiredSpecs: string[];
  rawText: string;
  createdAt: string;
  status: JobStatus;
  fitScore?: number;
  fitAnalysis?: FitAnalysis;
  commuteTime?: CommuteInfo;
}

export interface FitAnalysis {
  advantages: string[];   // 유리한 조건
  disadvantages: string[]; // 부족한 조건
  summary: string;
}

export interface CommuteInfo {
  duration: number; // minutes
  method: string;   // e.g. "지하철 + 도보"
  route: string;    // e.g. "7호선 → 2호선"
  isDummy: boolean;
}

export interface ParseJobRequest {
  text?: string;
  url?: string;
}

export interface ParseJobResponse {
  companyName: string;
  jobTitle: string;
  deadline: string | null;
  workplaceAddress: string;
  requiredSpecs: string[];
}

export interface AnalyzeFitRequest {
  jobPosting: JobPosting;
}

export interface AnalyzeFitResponse {
  fitScore: number;
  fitAnalysis: FitAnalysis;
}
