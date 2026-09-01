import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    {
      error:
        "Static Map 미리보기는 사용하지 않습니다. Dynamic Map을 사용할 수 있도록 Naver Cloud 서비스 환경을 확인해 주세요.",
    },
    { status: 410 }
  );
}
