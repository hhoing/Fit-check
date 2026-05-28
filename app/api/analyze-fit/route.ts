import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { AnalyzeFitRequest, AnalyzeFitResponse } from "@/types";
import { RESUME_TEXT } from "@/data/resume";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const ANALYZE_PROMPT = `당신은 채용 적합도 분석 전문가입니다.
지원자의 이력서와 채용 공고를 비교하여 분석 결과를 반드시 JSON 형식으로만 출력하세요.
다른 설명 없이 JSON만 출력하세요.

분석 항목:
- fitScore: 0~100 사이의 정수 (서류 합격 가능성 점수)
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

export async function POST(req: NextRequest) {
  try {
    const body: AnalyzeFitRequest = await req.json();
    const { jobPosting } = body;

    if (!jobPosting) {
      return NextResponse.json(
        { error: "공고 정보가 없습니다." },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(getDummyAnalysis());
    }

    const jobInfo = `
회사명: ${jobPosting.companyName}
직무: ${jobPosting.jobTitle}
근무지: ${jobPosting.workplaceAddress}
요구 스펙:
${jobPosting.requiredSpecs.map((s) => `- ${s}`).join("\n")}

공고 원문:
${jobPosting.rawText.slice(0, 2000)}
`;

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: ANALYZE_PROMPT,
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
        advantages: raw.advantages ?? [],
        disadvantages: raw.disadvantages ?? [],
        summary: raw.summary ?? "",
      },
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("analyze-fit error:", error);
    return NextResponse.json(
      { error: "적합도 분석 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

function getDummyAnalysis(): AnalyzeFitResponse {
  return {
    fitScore: 74,
    fitAnalysis: {
      advantages: [
        "React / Next.js 실무 인턴 경험 보유",
        "TypeScript 프로젝트 경험",
        "REST API 연동 및 상태 관리 경험",
        "정보처리기사 자격증 보유",
        "팀 프로젝트 협업 경험 (Git, Jira)",
      ],
      disadvantages: [
        "실무 경력 6개월로 요구 경력 미달 가능성",
        "백엔드/인프라 경험 상대적으로 부족",
        "대규모 서비스 운영 경험 없음",
      ],
      summary: "프론트엔드 핵심 역량은 충분하나 경력 연차 보완 필요",
    },
  };
}
