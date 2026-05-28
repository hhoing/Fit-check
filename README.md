# Fit Check — AI 취업 매니저 대시보드

채용 공고를 붙여넣으면 AI가 자동으로 파싱하고, 내 이력서와 비교해 적합도를 분석해주는 개인용 취업 관리 도구입니다.

## 주요 기능

- **공고 파싱** — 텍스트/URL 입력 시 Claude AI가 회사명·직무·마감일·근무지·요구스펙 자동 추출
- **적합도 분석** — 이력서와 공고를 비교해 유리한 조건(✓)과 부족한 조건(✗) 분류, 0~100점 게이지 시각화
- **지원 상태 관리** — 관심 / 서류 제출 / 면접 진행 / 결과 대기 / 합격 / 불합격 추적
- **통근 시간 계산** — 출발지 기준 대중교통 예상 시간 표시 (네이버/카카오 API 연동 준비됨)
- **잡플래닛 연동** — 기업 후기 바로가기 링크
- **영구 저장** — localStorage로 새로고침해도 공고 목록 유지

## 기술 스택

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS
- **AI**: Anthropic Claude (claude-haiku-4-5)
- **Icons**: Lucide React
- **Language**: TypeScript

## 시작하기

### 1. 환경변수 설정

```bash
cp .env.example .env.local
```

`.env.local`을 열어 아래 값을 채워주세요:

```
ANTHROPIC_API_KEY=sk-ant-...       # Claude API 키 (없으면 더미 데이터로 동작)
NEXT_PUBLIC_HOME_ADDRESS=서울시 ... # 출발지 주소 (통근 시간 계산 기준)
```

### 2. 이력서 등록

`data/resume.ts`의 `RESUME_TEXT` 변수에 본인의 이력서 내용을 붙여넣으세요.

### 3. 개발 서버 실행

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000)에서 확인하세요.

## 프로젝트 구조

```
├── app/
│   ├── api/
│   │   ├── parse-job/      # 공고 파싱 API (Claude)
│   │   └── analyze-fit/    # 적합도 분석 API (Claude)
│   ├── page.tsx            # 메인 대시보드
│   └── layout.tsx
├── components/
│   ├── JobCard.tsx         # 공고 카드 (D-Day, 상태 뱃지)
│   ├── JobModal.tsx        # 상세 모달 (분석 결과, 상태 변경)
│   ├── JobInput.tsx        # 공고 입력
│   ├── GaugeChart.tsx      # 반원 게이지 차트
│   ├── FitAnalysis.tsx     # 유리/불리 분석
│   ├── CommuteInfo.tsx     # 통근 시간
│   └── Toast.tsx           # 알림 시스템
├── hooks/
│   └── useJobs.ts          # localStorage 영구 저장 훅
├── lib/
│   └── constants.ts        # 지원 상태 설정
├── data/
│   └── resume.ts           # 이력서 데이터 (직접 수정)
├── types/
│   └── index.ts            # TypeScript 타입 정의
└── .env.example            # 환경변수 템플릿
```

## API 키 없이 사용하기

`ANTHROPIC_API_KEY`를 설정하지 않아도 더미 데이터로 모든 UI 기능을 확인할 수 있습니다.
