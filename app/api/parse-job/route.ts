import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { ParseJobRequest, ParseJobResponse } from "@/types";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const PARSE_PROMPT = `당신은 채용 공고 파싱 전문가입니다.
주어진 채용 공고 텍스트에서 아래 정보를 추출해서 반드시 JSON 형식으로만 응답하세요.
다른 설명 없이 JSON만 출력하세요.

추출할 정보:
- companyName: 회사명 (없으면 "미확인")
- jobTitle: 직무명/포지션명 (없으면 "미확인")
- deadline: 마감일 (YYYY-MM-DD 형식. 없거나 "상시" 등이면 null)
- workplaceAddress: 근무지 주소 (없으면 "미확인")
- requiredSpecs: 요구 스펙 목록 (string 배열, 없으면 빈 배열)

응답 형식 예시:
{
  "companyName": "주식회사 예시",
  "jobTitle": "프론트엔드 개발자",
  "deadline": "2024-12-31",
  "workplaceAddress": "서울시 강남구 테헤란로 123",
  "requiredSpecs": ["React 2년 이상", "TypeScript 필수", "Git 협업 경험"]
}`;

export async function POST(req: NextRequest) {
  try {
    const body: ParseJobRequest = await req.json();
    const inputText = body.text || body.url || "";

    if (!inputText.trim()) {
      return NextResponse.json(
        { error: "공고 텍스트 또는 URL을 입력해주세요." },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      // API 키 없을 때 더미 응답 반환
      return NextResponse.json(getDummyParseResult(inputText));
    }

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `${PARSE_PROMPT}\n\n채용 공고 내용:\n${inputText}`,
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type");
    }

    // JSON 블록 추출 (```json ... ``` 또는 순수 JSON)
    const jsonMatch = content.text.match(/```json\s*([\s\S]*?)```/) ||
      content.text.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content.text;
    const parsed: ParseJobResponse = JSON.parse(jsonStr.trim());

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("parse-job error:", error);
    return NextResponse.json(
      { error: "공고 파싱 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

function getDummyParseResult(text: string): ParseJobResponse {
  return {
    companyName: "테크 주식회사",
    jobTitle: "프론트엔드 개발자",
    deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    workplaceAddress: "서울시 강남구 테헤란로 427",
    requiredSpecs: [
      "React / Next.js 2년 이상 경험",
      "TypeScript 필수",
      "REST API 연동 경험",
      "Git 협업 경험",
      "UI/UX 감각 보유자",
    ],
  };
}
