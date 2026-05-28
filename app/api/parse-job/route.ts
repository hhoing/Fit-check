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

/** URL에서 HTML을 fetch하고 텍스트만 추출 */
async function fetchJobTextFromUrl(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      // 일반 브라우저처럼 보이게 해서 기본적인 봇 차단 우회
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
    },
    // 리다이렉트 자동 처리
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`URL 접근 실패 (HTTP ${res.status}). 해당 사이트가 크롤링을 차단하고 있을 수 있습니다.`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    throw new Error("HTML 페이지가 아닙니다. 공고 페이지 URL을 다시 확인해주세요.");
  }

  const html = await res.text();
  return extractTextFromHtml(html);
}

/** HTML에서 가시적인 텍스트만 추출 */
function extractTextFromHtml(html: string): string {
  // <script>, <style>, <noscript> 태그와 내용 제거
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");

  // 블록 요소 앞에 줄바꿈 추가 (가독성 유지)
  text = text.replace(/<\/?(p|div|li|br|h[1-6]|tr|td|th)[^>]*>/gi, "\n");

  // 나머지 HTML 태그 제거
  text = text.replace(/<[^>]+>/g, " ");

  // HTML 엔티티 디코딩
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&middot;/g, "·");

  // 연속 공백/줄바꿈 정리
  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // LLM 토큰 절약을 위해 최대 6000자로 제한
  return text.slice(0, 6000);
}

export async function POST(req: NextRequest) {
  try {
    const body: ParseJobRequest = await req.json();
    const { text, url } = body;

    if (!text?.trim() && !url?.trim()) {
      return NextResponse.json(
        { error: "공고 텍스트 또는 URL을 입력해주세요." },
        { status: 400 }
      );
    }

    // URL이 입력된 경우 서버에서 직접 페이지 내용을 가져옴
    let inputText = text ?? "";
    if (url?.trim()) {
      try {
        inputText = await fetchJobTextFromUrl(url.trim());
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : "URL 내용을 가져오지 못했습니다.";
        // 원티드, 링크드인처럼 JS 렌더링에 의존하거나 크롤링 차단 사이트 안내
        return NextResponse.json(
          {
            error: `${msg}\n\n💡 해결 방법: 공고 페이지에서 텍스트를 직접 복사해 '텍스트' 모드로 붙여넣어 주세요.`,
          },
          { status: 422 }
        );
      }

      if (inputText.length < 100) {
        return NextResponse.json(
          {
            error:
              "페이지에서 충분한 텍스트를 추출하지 못했습니다. 원티드·링크드인 등 일부 사이트는 JavaScript로 렌더링되어 직접 파싱이 어렵습니다.\n\n💡 공고 내용을 복사해 텍스트 모드로 붙여넣어 주세요.",
          },
          { status: 422 }
        );
      }
    }

    if (!process.env.ANTHROPIC_API_KEY) {
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

    const jsonMatch =
      content.text.match(/```json\s*([\s\S]*?)```/) ||
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
  void text;
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
