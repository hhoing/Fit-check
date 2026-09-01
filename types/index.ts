export type JobStatus =
  | "관심"
  | "서류 제출"
  | "면접 진행"
  | "결과 대기"
  | "합격"
  | "불합격";

export type JobCategory = "Data" | "Sensor" | "Vision" | "Robot" | "PM";
export type JobPrimaryCategory = JobCategory | "Unclassified";

export interface JobPosting {
  id: string;
  companyName: string;
  jobTitle: string;
  deadline: string | null; // ISO date string, "상시채용", or null
  deadlineTime: string | null; // HH:mm string or null
  workplaceAddress: string;
  requiredSpecs: string[];
  positionDetails?: JobPositionDetail[];
  mainTasks?: string[];
  qualifications?: string[];
  preferredQualifications?: string[];
  hiringProcess?: string[];
  rawText: string;
  sourceUrl?: string;
  sourceType?: "text" | "url" | "image";
  parserVersion?: number;
  parsedAt?: string;
  lastParseError?: string;
  jobCategories?: JobCategory[];
  primaryCategory?: JobPrimaryCategory;
  categorySource?: "manual";
  salary?: string;
  employmentType?: string;
  experienceLevel?: "신입" | "경력" | "신입/경력" | "경력무관" | "미확인";
  memo?: string;
  isFavorite: boolean;
  createdAt: string;
  status: JobStatus;
  fitScore?: number;
  fitAnalysis?: FitAnalysis;
  commuteTime?: CommuteInfo;
}

export interface JobPositionDetail {
  title: string;
  headcount?: string;
  mainTasks: string[];
  qualifications: string[];
  preferredQualifications?: string[];
}

export interface FitAnalysis {
  advantages: string[];   // 유리한 조건
  disadvantages: string[]; // 부족한 조건
  summary: string;
}

export interface CommuteInfo {
  duration: number; // minutes
  method: string;   // e.g. "자동차", "지하철 + 도보"
  route: string;    // e.g. "웹 지도 경로 확인"
  isDummy: boolean;
  distance?: number; // meters
  provider?: "naver" | "fallback";
  error?: string;
  mapUrl?: string;
  staticMapUrl?: string;
  mapClientId?: string;
  originPoint?: MapPoint;
  destinationPoint?: MapPoint;
  routePath?: MapPoint[];
}

export interface MapPoint {
  lat: number;
  lng: number;
}

export interface ParseJobRequest {
  text?: string;
  url?: string;
}

export interface ParseJobResponse {
  companyName: string;
  jobTitle: string;
  deadline: string | null;
  deadlineTime?: string | null;
  workplaceAddress: string;
  requiredSpecs: string[];
  positionDetails?: JobPositionDetail[];
  mainTasks?: string[];
  qualifications?: string[];
  preferredQualifications?: string[];
  hiringProcess?: string[];
  salary?: string;
  employmentType?: string;
  experienceLevel?: "신입" | "경력" | "신입/경력" | "경력무관" | "미확인";
  rawText?: string;
  sourceUrl?: string;
  sourceType?: "text" | "url" | "image";
  parserMode?: "ai" | "fallback";
  parserVersion?: number;
}

export interface AnalyzeFitRequest {
  jobPosting: JobPosting;
}

export interface AnalyzeFitResponse {
  fitScore: number;
  fitAnalysis: FitAnalysis;
  analysisMode?: "ai" | "fallback";
}
