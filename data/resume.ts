export const USER_INFO = {
  name: "본인 이름",
  // 집 주소는 .env.local의 NEXT_PUBLIC_HOME_ADDRESS에서 로드
  homeAddress: process.env.NEXT_PUBLIC_HOME_ADDRESS ?? "출발지 주소를 .env.local에 설정해주세요",
  commuteBase: "평일 오전 7:30 출발 기준",
};

// ─────────────────────────────────────────────
// 이 변수에 실제 이력서 내용이 저장되어 있습니다.
// LLM이 채용 공고와 비교 분석할 때 사용됩니다.
// ─────────────────────────────────────────────
export const RESUME_TEXT = `
# 지원자 이력서

## 기본 정보
- 이름: (미입력 — data/resume.ts에서 직접 수정)
- 이메일: (미입력)
- 연락처: (미입력)
- GitHub: (미입력)

---

## 핵심 기술 스택

### AI / 머신러닝 / 딥러닝
- YOLOv4 (Darknet 프레임워크 기반) — 객체 탐지 모델 커스터마이징 및 학습 경험
- Transfer Learning, Fine-Tuning (사전학습 가중치 활용, 파라미터 효율적 전이학습)
- Semi-Supervised Learning, Self-Supervised Learning (이론 및 적용 이해)
- Data Augmentation (mixup, TTA 등 고급 기법 포함)
- 딥러닝 최적화 (SGD, Adam, Batch Normalization, Loss Landscape 분석)

### 데이터 분석
- Python (Pandas, NumPy, Matplotlib, Seaborn)
- SQL (데이터베이스 쿼리, 전처리)
- 통계분석, 탐색적 데이터 분석(EDA)
- BI 및 데이터 시각화 (대시보드 구현)

### 임베디드 / IoT / 하드웨어
- Arduino (UNO), Wio Terminal (ATSAMD51P19, Cortex-M4F), C/C++
- 센서 연동: MPU-6050 (자이로/가속도계), BME280 (온습도), 토양 수분 센서
- MQTT 프로토콜, Azure IoT Central, Power Automate
- LVGL (임베디드 GUI 라이브러리)
- 센서 융합 필터링: 보완 필터, Kalman 필터, Madgwick 필터

### 컴퓨터 비전 / 자율주행
- OpenCV (영상처리, 실시간 추론)
- ROS2 (노드 설계, 토픽 통신, Stanley Controller 기반 주행 제어)
- Lane Detection, 객체 인식, 신호등 제어 로직

### 기타
- Git / GitHub
- Google Colab (GPU 학습 환경 활용)
- LabelImg (YOLO 포맷 데이터 라벨링)

---

## 교육 및 수료

### 멋쟁이사자처럼 AI 데이터분석 부트캠프 (수료)
- 기간: 5개월 과정 (총 496H+)
- 1개월차: Python 기초·활용, 자료구조 및 알고리즘, SQL, 데이터 전처리
- 2개월차: 통계분석, 탐색적 데이터 분석(EDA), BI 시각화 / 미드 프로젝트 수행
- 3개월차: 데이터 시각화 고급, 파이널 프로젝트 (머신러닝/딥러닝 기반 비즈니스 문제 해결)
- 4개월차: 인공지능 기반 데이터 분석 모델링, 딥러닝 입문, 모델 평가·개선 / 데이터톤 프로젝트
- 5개월차: 기업 연계 프로젝트 — 실제 기업/공공기관 데이터로 대시보드 구현 및 분석 리포트 작성
- 특강: Git / GitHub (8H)

### AI 온라인 인턴십 심화과정 (수료)
- 주관: 서울대학교 데이터사이언스대학원 (김태섭 교수)
- 과정명: Model-Centric & Data-Centric Deep Learning
- 수강 배경: YOLOv4 프로젝트에서 Fine-Tuning·Transfer Learning 이론 보완 필요성을 느끼고 자발적으로 수강
- 학습 내용:
  - [Lec1] 딥러닝 개론 — End-to-End 학습 구조, 스케일 특성 분석
  - [Lec2] 딥러닝 최적화 — ERM, Gradient Descent / SGD / Mini-batch, Adam, Batch Normalization
  - [Lec3] Data Augmentation — VRM, mixup, Label Invariant Transformation, TTA
  - [Lec4] Semi-Supervised Learning — Pseudo Labeling, Consistency Regularization, Mean Teacher
  - [Lec5] Self-Supervised Learning — SimCLR, MoCo, Contrastive Learning, CLIP 확장
  - [Lec6] Transfer Learning — Fine-Tuning, Adapter-BERT, Prefix-Tuning, Meta Learning

---

## 프로젝트 경험

### 1. YOLOv4 기반 실시간 신호등 인식 및 자율주행 제어 시스템
- **소속/계기**: 2024 대학생 창작 모빌리티 대회 - 무인모빌리티 부문 (예선 통과, 본선 탈락)
- **담당 역할**: Camera-LiDAR 부서 / 신호등 판단 미션 단독 담당
- **기술 스택**: YOLOv4 (Darknet), OpenCV, Python, ROS2, LabelImg, Google Colab
- **주요 기여**:
  - Ubuntu 환경 구축 및 Lane Detection 알고리즘 수정으로 기본 개념 습득
  - 실제 도로 신호등 영상 확보 및 LabelImg로 수백 장 직접 라벨링 (적/황/녹 3클래스)
  - YOLOv4 구조 수정(3클래스), Transfer Learning(yolov4.conv.137 사전 가중치 활용)으로 모델 학습
  - 학습된 모델을 OpenCV 기반 Python 코드에 연동하여 실시간 신호등 인식 구현
  - ROS2 기반 Trafficlight 노드 설계 — bounding_boxes 토픽 구독, 신호등 ID 기반 적/녹 판별 로직 구현
  - Stanley Controller와 연동하여 적색 신호 감지 시 정지(속도 0), 녹색 신호 감지 시 주행 재개 제어
  - 총 7개 신호등 구간에서 정지/출발 판단 성공, 탐지 정확도 90% 이상 달성
  - 신호 누락/오탐 대비 타이머 기반 안정성 로직 추가

### 2. Terra Garden — Wio Terminal 기반 IoT 스마트 테라리움 제어 시스템
- **목적**: 밀폐형 고습 환경(테라리움)의 온·습도 실시간 모니터링 및 자동 물분사 제어, 감성 UX 통합
- **기술 스택**: Wio Terminal (ATSAMD51P19), Grove BME280, Grove Water Atomization, DFPlayer mini, LVGL, Arduino/PlatformIO, Wi-Fi, MicroSD, Google Sheets
- **주요 기능**:
  - BME280 센서로 온도·습도·기압 주기 측정
  - LVGL 기반 실시간 UI — 임계치별 색상(정상/주의/위험) 및 아이콘으로 상태 시각화
  - 버튼/조이스틱으로 물분사 ON/OFF 및 강도 수동 조절 + 임계치 기반 자동 제어
  - DFPlayer를 통한 자연음(비·바다·숲) ASMR 재생, 볼륨·트랙 선택 기능
  - Wi-Fi를 활용한 원격 제어 및 Google Sheets 기반 데이터 로깅 연동

### 3. 마이크로컨트롤러 — 에어마우스(AirMouse) 개발
- **기술 스택**: Arduino UNO, MPU-6050 (3축 자이로 + 3축 가속도계), Processing
- **주요 내용**:
  - Pitch → 커서 수직 이동 / Yaw → 커서 수평 이동 매핑
  - 자이로 드리프트 보정을 위한 보완 필터 / Madgwick 필터 / Kalman 필터 적용
  - 임계값 및 감도 조정 기능 구현, 반복 테스트를 통한 안정성 개선

### 4. 마이크로컨트롤러 — Wio Terminal 스마트 화분 상태 관리 시스템
- **기술 스택**: Wio Terminal, BME280, 아날로그 토양 수분 센서, MQTT, Azure IoT Central, Power Automate
- **주요 내용**:
  - 실시간 온도·습도·토양 수분 데이터 수집 및 LCD 이모지/컬러 상태 표시
  - Azure IoT Central로 실시간 텔레메트리 전송 (MQTT 기반)
  - Power Automate 연동으로 하루 평균 상태 분석 → 감성 메시지("생존일기") 자동 전송

---

## 대회 참가

| 대회명 | 연도 | 결과 | 역할 |
|---|---|---|---|
| 대학생 창작 모빌리티 - 무인모빌리티 부문 | 2024 | 예선 통과 / 본선 탈락 | Camera-LiDAR 부서, 신호등 인식·제어 단독 개발 |

---

## 강점 요약 (LLM 분석 참고용)
- **AI/딥러닝 실무 경험**: YOLOv4 커스터마이징, 데이터 라벨링, Transfer Learning, ROS2 연동까지 전체 파이프라인 경험
- **데이터 분석 역량**: 5개월 부트캠프를 통한 EDA, 통계분석, 시각화, 머신러닝 파이프라인 구축 능력
- **임베디드·IoT 역량**: Arduino, Wio Terminal 기반 하드웨어·펌웨어 개발, 클라우드 연동(MQTT, Azure) 경험
- **이론 기반 실력 보완 능력**: 실무에서 부족함을 느끼면 서울대 심화과정 등을 자발적으로 수강하는 자기주도 학습 태도
- **부족한 부분**: 팀 협업 개발(GitHub Flow, PR 리뷰) 경험 및 웹/앱 개발 경험 상대적으로 부족
`;
