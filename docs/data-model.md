# Data Model

## JobPosting

채용 공고 하나를 나타내는 핵심 데이터입니다.

현재 주요 필드:

- `id`: 공고 ID
- `companyName`: 회사명
- `jobTitle`: 직무명
- `deadline`: 마감일
- `workplaceAddress`: 근무지
- `requiredSpecs`: 요구 스펙 목록
- `rawText`: 원본 공고 텍스트
- `createdAt`: 등록일
- `status`: 지원 상태
- `fitScore`: 적합도 점수
- `fitAnalysis`: 적합도 분석 결과
- `commuteTime`: 통근 시간 정보

## 추가 후보 필드

- `sourceUrl`: 공고 원본 URL
- `sourceType`: 공고 입력 방식, 예: `text`, `url`, `image`
- `memo`: 개인 메모
- `priority`: 우선순위
- `appliedAt`: 지원일
- `reminderAt`: 알림 예정일
- `closedAt`: 마감 또는 보관 처리일
- `companyReviewUrl`: 회사 후기 링크

## JobStatus

지원 상태를 나타냅니다.

- 관심
- 서류 제출
- 면접 진행
- 결과 대기
- 합격
- 불합격

## FitAnalysis

이력서와 공고를 비교한 결과입니다.

- `advantages`: 유리한 조건
- `disadvantages`: 보완이 필요한 조건
- `summary`: 종합 요약

## CommuteInfo

통근 시간 정보를 나타냅니다.

- `duration`: 예상 소요 시간, 분 단위
- `method`: 이동 방식
- `route`: 이동 경로
- `isDummy`: 더미 데이터 여부
