export const USER_INFO = {
  name: "홍길동",
  // 집 주소는 .env.local의 NEXT_PUBLIC_HOME_ADDRESS에서 로드
  homeAddress: process.env.NEXT_PUBLIC_HOME_ADDRESS ?? "출발지 주소를 .env.local에 설정해주세요",
  commuteBase: "평일 오전 7:30 출발 기준",
};

// 이 변수에 실제 이력서/포트폴리오 내용을 붙여넣으세요
export const RESUME_TEXT = `
== 기본 정보 ==
이름: 홍길동
이메일: example@gmail.com
연락처: 010-0000-0000
GitHub: github.com/example

== 학력 ==
2018.03 ~ 2024.02  OO대학교 컴퓨터공학과 학사 졸업 (GPA 3.8/4.5)

== 경력 ==
2023.07 ~ 2023.12  (주)테크스타트업 — 프론트엔드 개발 인턴
  - React, TypeScript 기반 관리자 대시보드 개발
  - REST API 연동 및 상태 관리(Zustand) 구현
  - Jest를 활용한 단위 테스트 작성 (커버리지 70% 달성)

== 기술 스택 ==
Languages   : TypeScript, JavaScript, Python, Java
Frontend    : React, Next.js, Tailwind CSS, Zustand, React Query
Backend     : Node.js, Express, Spring Boot (기초)
Database    : PostgreSQL, MySQL, Redis (기초)
DevOps      : Git, GitHub Actions, Docker (기초), AWS S3/EC2
Tools       : Figma, Notion, Jira

== 프로젝트 ==
1. 개인 포트폴리오 사이트 (2024.01)
   - Next.js 13 App Router + Tailwind CSS 로 구축
   - Vercel 배포

2. 팀 프로젝트: 중고거래 플랫폼 (2023.03 ~ 2023.06)
   - React + Spring Boot 풀스택 개발 (팀원 4명)
   - 실시간 채팅 기능 (WebSocket), 결제 연동(아임포트)
   - AWS EC2 배포

== 자격증 ==
- 정보처리기사 (2023.11 취득)
- SQLD (2023.09 취득)
- TOEIC 850점 (2022.12)

== 수상 ==
- OO 해커톤 2023 장려상 (AI 기반 일정 관리 앱)

== 자기소개 ==
사용자 경험을 중시하는 프론트엔드 개발자를 목표로 하며, React 및 Next.js 기반 웹 개발에 강점이 있습니다.
인턴 경험을 통해 실무 협업 경험을 쌓았으며, 새로운 기술 스택 습득에 빠른 적응력을 보유하고 있습니다.
백엔드(Node.js, Spring Boot 기초)에 대한 이해를 바탕으로 풀스택 역할도 소화 가능합니다.
`;
