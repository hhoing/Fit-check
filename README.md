# Fit Check

채용 공고 URL을 한곳에 저장하고, 마감일과 지원 상태를 놓치지 않게 관리하는 개인용 취업 매니저입니다.

공고를 등록하면 회사명, 직무명, 마감일, 근무지, 급여, 근무형태, 경력구분, 주요업무, 자격요건, 우대사항, 채용전형을 정리하고, 내 이력서 기준의 적합도 분석 결과를 저장합니다.

## 현재 상태

- URL 기반 공고 등록
- 등록 시 수동 직무 카테고리 선택
  - `Data`
  - `Sensor`
  - `Vision`
  - `Robot`
- 사람인, 원티드, 잡코리아, 잡플래닛 등 채용 공고 URL 파싱
- 사람인 공고는 공식 API와 페이지 정보를 함께 활용
- 회사명, 직무명, 마감일, 마감시간, 근무지 추출
- 급여, 근무형태, 경력구분 추출
- 주요업무, 자격요건, 우대사항, 채용전형 표시
- 상시채용 공고 별도 표시
- 이력서 기반 적합도 점수와 유리한 조건/보완 조건 분석
- 분석된 적합도 점수 저장
- 마감임박순, 타겟 적합도순 정렬
- 전체, 즐겨찾기, 마감됨, 지원 상태별 필터
- `Data / Sensor / Vision / Robot` 직무 카테고리 필터
- 마감 달력 보기
- 서류 제출 공고는 달력에서 체크 표시
- 공고별 메모 작성
- 즐겨찾기
- 삭제 전 확인 모달
- 상세 모달에서 원본 공고, 잡플래닛, 좋소판별기 링크 연결
- 네이버 지도 기반 통근 정보와 지도 표시
- Supabase 저장, 미설정 시 localStorage fallback
- Vercel 배포

## 사용 흐름

1. `공고 추가`를 누릅니다.
2. `Data / Sensor / Vision / Robot` 중 해당 직무 카테고리를 직접 선택합니다.
3. 채용 공고 URL을 붙여넣고 등록합니다.
4. 공고 정보가 저장되고 적합도 분석이 시작됩니다.
5. 목록, 필터, 정렬, 달력에서 공고를 관리합니다.
6. 지원하면 상태를 `서류 제출`로 바꿔 달력과 목록에서 확인합니다.

## 데이터 모델

공고 하나는 대략 아래 정보를 가집니다.

- `companyName`: 회사명
- `jobTitle`: 직무명
- `deadline`: 마감일, 상시채용 또는 `null`
- `deadlineTime`: 마감시간
- `workplaceAddress`: 근무지
- `jobCategories`: 사용자가 직접 고른 직무 카테고리
- `primaryCategory`: 대표 직무 카테고리
- `categorySource`: 수동 선택 여부
- `salary`: 급여/연봉
- `employmentType`: 근무형태/고용형태
- `experienceLevel`: 신입/경력 구분
- `mainTasks`: 주요업무
- `qualifications`: 자격요건
- `preferredQualifications`: 우대사항
- `hiringProcess`: 채용전형
- `fitScore`: 이력서 적합도 점수
- `fitAnalysis`: 유리한 조건, 보완 조건, 요약
- `memo`: 개인 메모
- `isFavorite`: 즐겨찾기 여부
- `status`: 지원 상태
- `sourceUrl`: 원본 공고 URL
- `commuteTime`: 통근 정보

## 적합도 분석 기준

적합도 분석은 `data/resume.ts`의 이력서 내용과 `data/careerFitCriteria.ts`의 커리어 타겟 기준을 함께 사용합니다.

중점적으로 보는 방향은 다음과 같습니다.

- 센서 데이터 분석
- 머신비전/비전 검사 SW
- 로봇 SW 테스트/검증
- 제조/장비 데이터 분석
- AI 모델/데이터 검증

`ANTHROPIC_API_KEY`가 있으면 AI 분석을 사용하고, 실패하거나 키가 없으면 기본 키워드 기반 fallback 분석을 사용합니다.

## 저장 방식

- Supabase 환경변수가 있으면 Supabase `jobs` 테이블에 저장합니다.
- Supabase가 설정되지 않은 환경에서는 브라우저 `localStorage`에 저장합니다.
- 공고 데이터는 `jobs.data` JSON 필드에 저장되는 구조입니다.

## 환경변수

`.env.example`을 복사해서 `.env.local`을 만들고 값을 채웁니다.

```bash
cp .env.example .env.local
```

주요 환경변수:

```env
ANTHROPIC_API_KEY=
SARAMIN_ACCESS_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=https://hhoing-fit-check.vercel.app
NEXT_PUBLIC_HOME_ADDRESS=
NAVER_MAP_CLIENT_ID=
NAVER_MAP_CLIENT_SECRET=
```

## 보안 주의

비밀번호, API 키, Supabase 접속 정보, 개인 메모 파일은 Git에 올리지 않습니다.

이미 GitHub에 올라간 비밀값은 파일을 삭제해도 Git 히스토리에 남을 수 있습니다. 노출된 값은 반드시 Supabase/Vercel/Naver Cloud 등 원본 서비스에서 재발급하거나 비밀번호를 변경해야 합니다.

## 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 접속합니다.

```txt
http://localhost:3000
```

검증 명령:

```bash
npm run lint
npm run build
```

## 프로젝트 구조

```txt
app/
  api/
    analyze-fit/
    commute/
    parse-job/
  page.tsx
components/
  CommuteInfo.tsx
  DeadlineCalendar.tsx
  FitAnalysis.tsx
  GaugeChart.tsx
  JobCard.tsx
  JobInput.tsx
  JobModal.tsx
  RouteMap.tsx
  Toast.tsx
data/
  careerFitCriteria.ts
  resume.ts
hooks/
  useJobs.ts
lib/
  constants.ts
  deadline.ts
  jobCategories.ts
  jobParserVersion.ts
  supabaseClient.ts
types/
  index.ts
docs/
  product-plan.md
  development-roadmap.md
  data-model.md
  ideas.md
```

## 앞으로 개선할 일

- OCR 기반 공고 이미지 등록
- 마감 임박 알림
- 공고 검색
- 전체 공고 재파싱/재분석 버튼
- 지원일, 제출 서류, 자소서 버전 관리
- 계정별 로그인과 RLS 정책 강화
- 공고별 캘린더 외부 연동
