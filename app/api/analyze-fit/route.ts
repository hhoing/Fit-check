import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { AnalyzeFitRequest, AnalyzeFitResponse, JobPosting } from "@/types";
import { RESUME_TEXT } from "@/data/resume";
import { withJobCategories } from "@/lib/jobCategories";
import {
  CAREER_AVOID_SIGNALS,
  CAREER_FIT_CRITERIA_TEXT,
  CAREER_TARGET_GROUPS,
} from "@/data/careerFitCriteria";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const ANALYZE_PROMPT = `당신은 지원자 맞춤 채용 적합도 분석 전문가입니다.
지원자의 이력서와 채용 공고를 비교하여 분석 결과를 반드시 JSON 형식으로만 출력하세요.
다른 설명 없이 JSON만 출력하세요.

분석 기준:
- 일반적인 서류 합격률이 아니라, 지원자의 커리어 타겟 점수표 기준 적합도를 평가하세요.
- 메인 타겟: 센서 데이터 분석, 머신비전/비전 검사 SW, 로봇 SW 테스트/검증
- 서브 타겟: 로봇 데이터 분석, 로그 분석, 데이터 검증, 장비/설비/공정 데이터 분석, AI 모델 검증
- 순수 웹 프론트엔드/백엔드/모바일 앱 공고는 React/TypeScript가 있어도 높은 점수를 주지 마세요.
- 펌웨어/PCB/회로/모터 드라이버/석사 필수/고급 C++/CUDA/논문 구현 중심 공고는 감점하세요.
- "신입/경력", "경력무관", "신입 가능"처럼 신입에게도 열린 공고는 경력 공고로 단정하지 마세요.
- 경력 연차 문구가 있어도 신입 병행 공고라면 큰 감점 대신 실제 지원 가능 범위 확인 항목으로 다루세요.
- 장점은 지원자의 실제 경험과 공고 요구가 만나는 지점만 쓰고, 없는 경험을 지어내지 마세요.
- 부족한 조건은 보완 방향이 드러나게 쓰세요.
- advantages/disadvantages는 매번 공고 본문 키워드와 이력서 근거를 조합해서 새로 작성하세요.
- "타겟과 연결됩니다", "경험 보유" 같은 고정 문구만 반복하지 말고, 공고의 구체 키워드와 지원자의 프로젝트명을 함께 언급하세요.
- 공고에 없는 조건을 가정하지 말고, 근거가 약하면 "확인 필요"로 표현하세요.

분석 항목:
- fitScore: 0~100 사이의 정수 (커리어 타겟 기준 적합도 점수)
- advantages: 지원자에게 유리한 조건 목록 (string 배열, 3~6개)
- disadvantages: 지원자에게 부족한 조건 목록 (string 배열, 2~5개)
- summary: 종합 평가 한 줄 (50자 이내)

응답 형식 예시:
{
  "fitScore": 78,
  "advantages": ["React 실무 경험 보유", "TypeScript 능숙"],
  "disadvantages": ["백엔드 경험 부족", "클라우드 인프라 경험 없음"],
  "summary": "프론트엔드 역량은 충분하나 백엔드 경험 보완 필요"
}`;

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.toLowerCase().includes(keyword.toLowerCase()));
}

function countMatches(text: string, keywords: string[]): number {
  return keywords.filter((keyword) => text.toLowerCase().includes(keyword.toLowerCase())).length;
}

function clampScore(score: number): number {
  return Math.max(5, Math.min(95, Math.round(score)));
}

function uniqueItems(items: string[], max: number): string[] {
  const seen = new Set<string>();
  return items
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, max);
}

function getJobText(jobPosting: JobPosting): string {
  const positionDetailsText = (jobPosting.positionDetails ?? [])
    .map((detail) =>
      [
        detail.title,
        (detail.mainTasks ?? []).join(" "),
        (detail.qualifications ?? []).join(" "),
        (detail.preferredQualifications ?? []).join(" "),
      ].join(" ")
    )
    .join(" ");

  return [
    jobPosting.companyName,
    jobPosting.jobTitle,
    jobPosting.workplaceAddress,
    jobPosting.salary,
    jobPosting.employmentType,
    jobPosting.experienceLevel,
    positionDetailsText,
    jobPosting.mainTasks?.join(" "),
    jobPosting.qualifications?.join(" "),
    jobPosting.preferredQualifications?.join(" "),
    jobPosting.hiringProcess?.join(" "),
    (jobPosting.requiredSpecs ?? []).join(" "),
    jobPosting.rawText ?? "",
  ].join("\n");
}

function normalizeJobPosting(jobPosting: JobPosting): JobPosting {
  return withJobCategories({
    ...jobPosting,
    companyName: jobPosting.companyName ?? "미확인",
    jobTitle: jobPosting.jobTitle ?? "미확인",
    deadline: jobPosting.deadline ?? null,
    deadlineTime: jobPosting.deadlineTime ?? null,
    workplaceAddress: jobPosting.workplaceAddress ?? "미확인",
    requiredSpecs: jobPosting.requiredSpecs ?? [],
    positionDetails: (jobPosting.positionDetails ?? []).map((detail) => ({
      title: detail.title ?? "모집분야",
      headcount: detail.headcount,
      mainTasks: detail.mainTasks ?? [],
      qualifications: detail.qualifications ?? [],
      preferredQualifications: detail.preferredQualifications ?? [],
    })),
    mainTasks: jobPosting.mainTasks ?? [],
    qualifications: jobPosting.qualifications ?? [],
    preferredQualifications: jobPosting.preferredQualifications ?? [],
    hiringProcess: jobPosting.hiringProcess ?? [],
    rawText: jobPosting.rawText ?? "",
    isFavorite: jobPosting.isFavorite ?? false,
    createdAt: jobPosting.createdAt ?? new Date().toISOString(),
    status: jobPosting.status ?? "관심",
  });
}

function getFallbackAnalysis(jobPosting: JobPosting): AnalyzeFitResponse {
  const jobText = getJobText(jobPosting);
  const matchedGroups = CAREER_TARGET_GROUPS
    .map((group) => ({
      ...group,
      matchCount: countMatches(jobText, group.keywords),
    }))
    .filter((group) => group.matchCount > 0)
    .sort((a, b) => b.matchCount - a.matchCount);

  const bestGroup = matchedGroups[0];
  const avoidMatches = CAREER_AVOID_SIGNALS.filter((signal) =>
    jobText.toLowerCase().includes(signal.toLowerCase())
  );
  const practicalSkillMatches = [
    "Python",
    "SQL",
    "OpenCV",
    "YOLO",
    "ROS2",
    "MQTT",
    "Azure",
    "데이터 시각화",
    "이상탐지",
    "로그 분석",
  ].filter((skill) => jobText.toLowerCase().includes(skill.toLowerCase()));

  const entryFriendlyLevels = ["신입", "신입/경력", "경력무관"];
  const hasEntryFriendlyLevel = entryFriendlyLevels.includes(jobPosting.experienceLevel ?? "");
  const hasNewGradSignal =
    hasEntryFriendlyLevel ||
    includesAny(jobText, ["신입", "주니어", "인턴", "경력무관", "신입 가능"]);
  const hasSeniorTextSignal = /([3-9]|10)\s*년\s*이상|시니어|리드|책임/.test(jobText);
  const hasSeniorSignal = hasSeniorTextSignal && !hasNewGradSignal;
  const hasMasterSignal = includesAny(jobText, ["석사", "박사", "논문"]);
  const hasPureWebSignal =
    includesAny(jobText, ["프론트엔드", "백엔드", "React", "Next.js", "웹 개발"]) &&
    matchedGroups.length === 0;

  let score = 34;
  if (bestGroup) {
    score += bestGroup.tier === "main" ? 24 : 17;
    score += Math.min(12, bestGroup.matchCount * 3);
    score += Math.min(10, Math.max(0, matchedGroups.length - 1) * 3);
  }
  score += Math.min(12, practicalSkillMatches.length * 2);
  if (hasNewGradSignal) score += 7;
  if (hasSeniorSignal) score -= 10;
  if (hasSeniorTextSignal && hasNewGradSignal) score -= 3;
  if (hasMasterSignal) score -= 12;
  if (hasPureWebSignal) score -= 18;
  score -= Math.min(28, avoidMatches.length * 7);
  if (!bestGroup) score = Math.min(score, 42);

  const advantages: string[] = [];
  if (bestGroup) {
    advantages.push(`${bestGroup.name} 타겟과 공고 키워드가 연결됩니다.`);
    advantages.push(...bestGroup.strengths);
  }
  if (practicalSkillMatches.length > 0) {
    advantages.push(`${practicalSkillMatches.slice(0, 4).join(", ")} 경험을 공고 요구와 연결할 수 있습니다.`);
  }
  if (hasNewGradSignal) {
    advantages.push("신입/주니어 지원 가능성이 보여 현재 준비 단계와 맞습니다.");
  }
  if (advantages.length === 0) {
    advantages.push("프로젝트를 문제 정의-데이터-결과 중심으로 정리하면 일부 어필 여지는 있습니다.");
  }

  const disadvantages: string[] = [];
  if (!bestGroup) {
    disadvantages.push("메인 타겟인 센서 데이터, 비전 검사, 로봇 SW 검증과 직접 연결이 약합니다.");
  }
  if (hasPureWebSignal) {
    disadvantages.push("순수 웹 개발 공고는 현재 커리어 타겟 점수표 기준 우선순위가 낮습니다.");
  }
  if (hasSeniorSignal) {
    disadvantages.push("경력 연차 요구가 높아 신입 포트폴리오만으로 설득이 어려울 수 있습니다.");
  } else if (hasSeniorTextSignal && hasNewGradSignal) {
    disadvantages.push("신입 병행 공고지만 경력 상세 요건이 있어 지원 가능 범위 확인이 필요합니다.");
  }
  if (hasMasterSignal) {
    disadvantages.push("석사/논문 중심 요구가 있으면 현재 학부 프로젝트 기반 포지셔닝과 충돌합니다.");
  }
  if (avoidMatches.length > 0) {
    disadvantages.push(`${avoidMatches.slice(0, 4).join(", ")} 중심이면 피해야 할 공고 신호에 가깝습니다.`);
  }
  if (jobPosting.workplaceAddress === "미확인") {
    disadvantages.push("근무지가 미확인이라 통근/근무 조건 판단이 아직 불완전합니다.");
  }
  if (disadvantages.length === 0) {
    disadvantages.push("지원 전 공고의 실제 업무 범위가 데이터/검증 중심인지 확인이 필요합니다.");
  }

  const fitScore = clampScore(score);
  const summary = bestGroup
    ? `${bestGroup.name} 기준으로 ${fitScore >= 70 ? "우선 검토할 만한 공고" : "보완 후 검토할 공고"}`
    : "현재 타겟 직무 기준으로는 우선순위가 낮음";

  return {
    fitScore,
    fitAnalysis: {
      advantages: uniqueItems(advantages, 6),
      disadvantages: uniqueItems(disadvantages, 5),
      summary,
    },
    analysisMode: "fallback",
  };
}

export async function POST(req: NextRequest) {
  try {
    const body: AnalyzeFitRequest = await req.json();
    const jobPosting = body.jobPosting ? normalizeJobPosting(body.jobPosting) : null;

    if (!jobPosting) {
      return NextResponse.json(
        { error: "공고 정보가 없습니다." },
        { status: 400 }
      );
    }

    const fallback = getFallbackAnalysis(jobPosting);

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(fallback);
    }

    try {
      const jobInfo = `
회사명: ${jobPosting.companyName}
직무: ${jobPosting.jobTitle}
근무지: ${jobPosting.workplaceAddress}
급여: ${jobPosting.salary ?? "미확인"}
근무형태: ${jobPosting.employmentType ?? "미확인"}
경력구분: ${jobPosting.experienceLevel ?? "미확인"}
자동 직무 분류: ${jobPosting.primaryCategory ?? "Unclassified"}${
        jobPosting.jobCategories?.length ? ` (${jobPosting.jobCategories.join(", ")})` : ""
      }
원본 URL: ${jobPosting.sourceUrl ?? "없음"}
직무별 모집내용:
${(jobPosting.positionDetails ?? [])
  .map(
    (detail) => `- ${detail.title}${detail.headcount ? ` ${detail.headcount}` : ""}
  자격요건: ${detail.qualifications.join(" / ") || "미확인"}
  주요업무: ${detail.mainTasks.join(" / ") || "미확인"}
  우대사항: ${(detail.preferredQualifications ?? []).join(" / ") || "미확인"}`
  )
  .join("\n") || "- 미확인"}

주요업무:
${(jobPosting.mainTasks ?? []).map((s) => `- ${s}`).join("\n") || "- 미확인"}

자격요건:
${(jobPosting.qualifications ?? []).map((s) => `- ${s}`).join("\n") || "- 미확인"}

우대사항:
${(jobPosting.preferredQualifications ?? []).map((s) => `- ${s}`).join("\n") || "- 미확인"}

채용전형:
${(jobPosting.hiringProcess ?? []).map((s) => `- ${s}`).join("\n") || "- 미확인"}

기존 요구 스펙:
${(jobPosting.requiredSpecs ?? []).map((s) => `- ${s}`).join("\n")}

공고 원문:
${(jobPosting.rawText ?? "").slice(0, 6000)}
`;

      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: `${ANALYZE_PROMPT}\n\n${CAREER_FIT_CRITERIA_TEXT}`,
        messages: [
          {
            role: "user",
            content: `=== 지원자 이력서 ===\n${RESUME_TEXT}\n\n=== 채용 공고 ===\n${jobInfo}`,
          },
        ],
      });

      const content = message.content[0];
      if (content.type !== "text") {
        throw new Error("Unexpected response type");
      }

      const jsonMatch = content.text.match(/```json\s*([\s\S]*?)```/) ||
        content.text.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content.text;
      const raw = JSON.parse(jsonStr.trim());

      const result: AnalyzeFitResponse = {
        fitScore: Math.max(0, Math.min(100, Number(raw.fitScore))),
        fitAnalysis: {
          advantages: Array.isArray(raw.advantages) ? raw.advantages : fallback.fitAnalysis.advantages,
          disadvantages: Array.isArray(raw.disadvantages)
            ? raw.disadvantages
            : fallback.fitAnalysis.disadvantages,
          summary: typeof raw.summary === "string" ? raw.summary : fallback.fitAnalysis.summary,
        },
        analysisMode: "ai",
      };

      return NextResponse.json(result);
    } catch (error) {
      console.warn(
        "AI analysis fallback:",
        error instanceof Error ? error.message : "unknown error"
      );
      return NextResponse.json(fallback);
    }
  } catch (error) {
    console.error("analyze-fit error:", error);
    return NextResponse.json(
      { error: "적합도 분석 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
