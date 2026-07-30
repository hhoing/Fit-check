import type { JobCategory, JobCategoryScores, JobPosting } from "@/types";

export const JOB_CATEGORY_LIST: JobCategory[] = ["Data", "Sensor", "Vision", "Robot"];

export const JOB_CATEGORY_CONFIG: Record<
  JobCategory,
  { label: JobCategory; bg: string; text: string; border: string; active: string }
> = {
  Data: {
    label: "Data",
    bg: "bg-sky-50",
    text: "text-sky-700",
    border: "border-sky-100",
    active: "border-sky-200 bg-sky-50 text-sky-700 ring-sky-200",
  },
  Sensor: {
    label: "Sensor",
    bg: "bg-teal-50",
    text: "text-teal-700",
    border: "border-teal-100",
    active: "border-teal-200 bg-teal-50 text-teal-700 ring-teal-200",
  },
  Vision: {
    label: "Vision",
    bg: "bg-fuchsia-50",
    text: "text-fuchsia-700",
    border: "border-fuchsia-100",
    active: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
  },
  Robot: {
    label: "Robot",
    bg: "bg-lime-50",
    text: "text-lime-700",
    border: "border-lime-100",
    active: "border-lime-200 bg-lime-50 text-lime-700 ring-lime-200",
  },
};

const CATEGORY_KEYWORDS: Record<JobCategory, { strong: string[]; normal: string[] }> = {
  Data: {
    strong: [
      "데이터 분석",
      "데이터 검증",
      "데이터 품질",
      "로그 분석",
      "이상탐지",
      "품질 데이터",
      "공정 데이터",
      "제조 데이터",
      "데이터 엔지니어",
      "데이터 사이언티스트",
      "BI",
      "SQL",
      "Python",
    ],
    normal: [
      "데이터",
      "통계",
      "EDA",
      "대시보드",
      "시각화",
      "리포트",
      "모델 평가",
      "머신러닝",
      "분석",
    ],
  },
  Sensor: {
    strong: [
      "센서",
      "Sensor",
      "IoT",
      "MQTT",
      "Azure IoT",
      "장비 데이터",
      "설비 데이터",
      "계측",
      "상태 판단",
      "예지보전",
      "DAQ",
    ],
    normal: [
      "임베디드",
      "모니터링",
      "PLC",
      "SCADA",
      "텔레메트리",
      "디바이스",
      "하드웨어",
      "제어기",
      "펌웨어",
    ],
  },
  Vision: {
    strong: [
      "머신비전",
      "비전 검사",
      "영상처리",
      "OpenCV",
      "YOLO",
      "불량 검출",
      "AI 검사",
      "객체 탐지",
      "검사 SW",
    ],
    normal: [
      "Vision",
      "비전",
      "이미지",
      "카메라",
      "OCR",
      "라벨링",
      "검출",
      "인식",
      "품질 검사",
    ],
  },
  Robot: {
    strong: [
      "로봇",
      "Robot",
      "ROS",
      "ROS2",
      "자율주행",
      "로봇 SW",
      "로봇 QA",
      "주행 테스트",
      "필드 테스트",
      "성능평가",
      "SLAM",
      "AMR",
      "AGV",
    ],
    normal: [
      "제어",
      "모션",
      "주행",
      "SQA",
      "시뮬레이션",
      "경로 계획",
      "내비게이션",
    ],
  },
};

function getComparableText(job: Partial<JobPosting>): string {
  const positionDetailsText = (job.positionDetails ?? [])
    .map((detail) =>
      [
        detail.title,
        detail.headcount,
        (detail.mainTasks ?? []).join(" "),
        (detail.qualifications ?? []).join(" "),
        (detail.preferredQualifications ?? []).join(" "),
      ].join(" ")
    )
    .join(" ");

  return [
    job.companyName,
    job.jobTitle,
    job.workplaceAddress,
    job.salary,
    job.employmentType,
    job.experienceLevel,
    positionDetailsText,
    (job.mainTasks ?? []).join(" "),
    (job.qualifications ?? []).join(" "),
    (job.preferredQualifications ?? []).join(" "),
    (job.requiredSpecs ?? []).join(" "),
    job.rawText,
  ]
    .filter(Boolean)
    .join("\n");
}

function countKeywordScore(text: string, keywords: string[], weight: number): number {
  const lowerText = text.toLowerCase();
  return keywords.reduce((score, keyword) => {
    return lowerText.includes(keyword.toLowerCase()) ? score + weight : score;
  }, 0);
}

export function classifyJobPosting(job: Partial<JobPosting>) {
  const text = getComparableText(job);
  const scores = JOB_CATEGORY_LIST.reduce((acc, category) => {
    const keywords = CATEGORY_KEYWORDS[category];
    acc[category] =
      countKeywordScore(text, keywords.strong, 3) +
      countKeywordScore(text, keywords.normal, 1);
    return acc;
  }, {} as JobCategoryScores);

  const jobCategories = JOB_CATEGORY_LIST
    .filter((category) => scores[category] > 0)
    .sort((a, b) => scores[b] - scores[a]);

  return {
    jobCategories,
    primaryCategory: jobCategories[0] ?? "Unclassified",
    categoryScores: scores,
  };
}

export function withJobCategories<T extends JobPosting>(job: T): T {
  return {
    ...job,
    ...classifyJobPosting(job),
  };
}
