import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { JobPositionDetail, ParseJobRequest, ParseJobResponse } from "@/types";
import { ONGOING_DEADLINE_LABEL, isOngoingDeadline } from "@/lib/deadline";
import { CURRENT_JOB_PARSER_VERSION } from "@/lib/jobParserVersion";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const PARSE_PROMPT = `당신은 채용 공고 파싱 전문가입니다.
주어진 채용 공고 텍스트에서 아래 정보를 추출해서 반드시 JSON 형식으로만 응답하세요.
다른 설명 없이 JSON만 출력하세요.

중요 원칙:
- 회사명, 직무명, 마감일, 마감시간, 근무지는 공고 본문/구조화 힌트에서 확인되는 값만 사용하세요.
- 사람인, 잡코리아, 원티드, 점핏, 링크드인 같은 채용 플랫폼 이름을 회사명으로 쓰지 마세요.
- 접수기간이 시작일~마감일 범위로 나오면 마지막 날짜를 deadline으로 쓰세요.
- 접수기간이 시작일~마감일 범위로 나오고 마지막 날짜 옆에 시간이 있으면 deadlineTime으로 쓰세요.
- 마감일이 "상시채용", "상시", "채용시", "수시채용"이면 날짜로 추정하지 말고 deadline을 "상시채용"으로 쓰세요.
- deadlineTime은 실제 마감 시간이 확인될 때만 HH:mm 형식으로 쓰고, 없으면 null로 두세요. 근무시간을 마감시간으로 쓰지 마세요.
- 근무지는 "근무지", "근무지역", "주소", "jobLocation"에 가까운 값을 우선하세요.
- 확실하지 않은 값은 추측하지 말고 "미확인" 또는 null로 두세요.

추출할 정보:
- companyName: 회사명 (없으면 "미확인")
- jobTitle: 직무명/포지션명 (없으면 "미확인")
- deadline: 마감일 (YYYY-MM-DD 형식. "상시채용", "상시", "채용시", "수시채용"이면 "상시채용". 없으면 null)
- deadlineTime: 마감 시간 (HH:mm 형식. 없으면 null)
- workplaceAddress: 근무지 주소 (없으면 "미확인")
- requiredSpecs: 요구 스펙 목록 (string 배열, 없으면 빈 배열)
- positionDetails: 모집분야가 여러 개인 경우 직무별 상세 목록. 각 항목은 { title, headcount, mainTasks, qualifications, preferredQualifications }
- mainTasks: 주요업무 원문 목록 (string 배열, 없으면 빈 배열)
- qualifications: 자격요건 원문 목록 (string 배열, 없으면 빈 배열)
- preferredQualifications: 우대사항 원문 목록 (string 배열, 없으면 빈 배열)
- hiringProcess: 채용전형/전형절차 원문 목록 (string 배열, 없으면 빈 배열)
- salary: 급여/연봉 정보 (없으면 "미확인")
- employmentType: 근무형태/고용형태 (예: 정규직, 계약직, 인턴. 없으면 "미확인")
- experienceLevel: 신입/경력 구분 ("신입", "경력", "신입/경력", "경력무관", "미확인" 중 하나)

응답 형식 예시:
{
  "companyName": "주식회사 예시",
  "jobTitle": "프론트엔드 개발자",
  "deadline": "2024-12-31",
  "deadlineTime": "18:00",
  "workplaceAddress": "서울시 강남구 테헤란로 123",
  "requiredSpecs": ["React 2년 이상", "TypeScript 필수", "Git 협업 경험"],
  "positionDetails": [],
  "mainTasks": ["서비스 프론트엔드 개발", "UI 성능 개선"],
  "qualifications": ["React 개발 경험", "TypeScript 사용 경험"],
  "preferredQualifications": ["Next.js 경험"],
  "hiringProcess": ["서류 전형 ＞ 직무 인터뷰 ＞ 최종 합격"],
  "salary": "회사 내규에 따름",
  "employmentType": "정규직",
  "experienceLevel": "신입/경력"
}`;

interface ParsedJobFields {
  companyName?: string;
  jobTitle?: string;
  deadline?: string | null;
  deadlineTime?: string | null;
  workplaceAddress?: string;
  requiredSpecs?: string[];
  positionDetails?: JobPositionDetail[];
  mainTasks?: string[];
  qualifications?: string[];
  preferredQualifications?: string[];
  hiringProcess?: string[];
  salary?: string;
  employmentType?: string;
  experienceLevel?: "신입" | "경력" | "신입/경력" | "경력무관" | "미확인";
  title?: string;
  description?: string;
  saraminApiUsed?: boolean;
}

type NaverGeocodeAddress = {
  roadAddress?: string;
  jibunAddress?: string;
  x?: string;
  y?: string;
};

type NaverGeocodeResponse = {
  status?: string;
  addresses?: NaverGeocodeAddress[];
  errorMessage?: string;
};

const JOB_BOARD_NAMES = [
  "사람인",
  "잡코리아",
  "원티드",
  "잡플래닛",
  "점핏",
  "링크드인",
  "LinkedIn",
  "인크루트",
];

const SARAMIN_HOST_PATTERN = /(^|\.)saramin\.co\.kr$/i;
const JOBKOREA_HOST_PATTERN = /(^|\.)jobkorea\.co\.kr$/i;
const SARAMIN_ACCESS_KEY = process.env.SARAMIN_ACCESS_KEY ?? process.env.SARAMIN_API_KEY;
const SARAMIN_API_URL = "https://oapi.saramin.co.kr/job-search";
const NAVER_MAP_CLIENT_ID =
  process.env.NAVER_MAP_CLIENT_ID ??
  process.env.NAVER_MAPS_CLIENT_ID ??
  process.env.NCP_MAP_CLIENT_ID;
const NAVER_MAP_CLIENT_SECRET =
  process.env.NAVER_MAP_CLIENT_SECRET ??
  process.env.NAVER_MAPS_CLIENT_SECRET ??
  process.env.NCP_MAP_CLIENT_SECRET;
const NAVER_MAP_API_BASE = "https://maps.apigw.ntruss.com";

function normalizeUrl(input: string): string {
  const value = input.trim();
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error();
    }
    return parsed.toString();
  } catch {
    throw new Error("올바른 URL 형식이 아닙니다. 예: https://www.saramin.co.kr/...");
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&middot;/g, "·");
}

async function fetchHtml(url: string): Promise<string> {
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
  return html;
}

function getSaraminMobileUrl(url: string): string | null {
  const recIdx = getSaraminJobIdFromUrl(url);
  return recIdx ? `https://m.saramin.co.kr/job-search/view?rec_idx=${encodeURIComponent(recIdx)}` : null;
}

function getSaraminJobIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!SARAMIN_HOST_PATTERN.test(parsed.hostname)) return null;

    const recIdx = parsed.searchParams.get("rec_idx") ?? parsed.searchParams.get("id");
    if (recIdx && /^\d+$/.test(recIdx)) return recIdx;

    const pathMatch = parsed.pathname.match(/(?:rec_idx|jobs?|view)[/_-]?(\d{6,})/i);
    if (pathMatch?.[1]) return pathMatch[1];

    return null;
  } catch {
    return null;
  }
}

function isSaraminUrl(url: string): boolean {
  try {
    return SARAMIN_HOST_PATTERN.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function isJobKoreaUrl(url: string): boolean {
  try {
    return JOBKOREA_HOST_PATTERN.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function getJobKoreaJobIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!JOBKOREA_HOST_PATTERN.test(parsed.hostname)) return null;

    const gno = parsed.searchParams.get("Gno") ?? parsed.searchParams.get("gno");
    if (gno && /^\d+$/.test(gno)) return gno;

    const pathMatch = parsed.pathname.match(/GI_Read\/(\d+)/i);
    return pathMatch?.[1] ?? null;
  } catch {
    return null;
  }
}

function getJobKoreaIframeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const jobId = getJobKoreaJobIdFromUrl(url);
    if (!jobId) return null;

    const params = new URLSearchParams(parsed.searchParams);
    params.set("Gno", jobId);
    if (!params.has("isHiringCenter")) params.set("isHiringCenter", "false");
    if (!params.has("hideMapView")) params.set("hideMapView", "false");

    return `${parsed.origin}/Recruit/GI_Read_Comt_Ifrm?${params.toString()}`;
  } catch {
    return null;
  }
}

function getSaraminNamedValue(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number") {
    const cleaned = cleanLine(String(value));
    return cleaned || undefined;
  }

  const record = asRecord(value);
  if (!record) return undefined;

  return getSaraminNamedValue(record.name);
}

function splitSaraminKeywords(...values: Array<string | undefined>): string[] {
  return uniqueStrings(
    values
      .filter((value): value is string => Boolean(value))
      .flatMap((value) => value.split(/,|ㆍ|·|>|\/|\|/))
      .map(cleanSectionLine)
      .filter((value) => value.length >= 2 && value.length <= 60)
      .filter((value) => !/^(전체|선택|무관)$/.test(value)),
    10
  );
}

function cleanSaraminApiLocation(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = cleanFieldValue(
    value
      .replace(/>/g, " ")
      .replace(/\s+/g, " ")
  );
  return cleaned !== "미확인" ? cleaned : undefined;
}

function normalizeSaraminApiExperience(value: unknown) {
  const record = asRecord(value);
  const code = record?.code !== undefined ? String(record.code) : "";
  const name = getSaraminNamedValue(value);

  if (code === "0") return "경력무관";
  if (code === "1") return "신입";
  if (code === "2") return "경력";
  if (code === "3") return "신입/경력";

  return normalizeExperienceLevel(name);
}

function normalizeSaraminApiDeadline(job: Record<string, unknown>): string | null | undefined {
  const closeType = job["close-type"];
  const closeName = getSaraminNamedValue(closeType);
  const closeCode = asRecord(closeType)?.code !== undefined ? String(asRecord(closeType)?.code) : "";

  if (closeName && /채용시|상시|수시/i.test(closeName)) return ONGOING_DEADLINE_LABEL;
  if (closeCode && ["2", "3", "4"].includes(closeCode)) return ONGOING_DEADLINE_LABEL;

  const expirationDate = normalizeIsoDate(job["expiration-date"]);
  if (expirationDate !== undefined) return expirationDate;

  const timestampRaw = job["expiration-timestamp"];
  const timestamp =
    typeof timestampRaw === "number"
      ? timestampRaw
      : typeof timestampRaw === "string"
      ? Number(timestampRaw)
      : Number.NaN;

  if (!Number.isFinite(timestamp) || timestamp <= 0) return undefined;
  const date = new Date(timestamp * 1000);
  return toKoreaDateString(date) ?? undefined;
}

function normalizeSaraminApiDeadlineTime(job: Record<string, unknown>): string | null | undefined {
  const closeType = job["close-type"];
  const closeName = getSaraminNamedValue(closeType);
  const closeCode = asRecord(closeType)?.code !== undefined ? String(asRecord(closeType)?.code) : "";

  if (closeName && /채용시|상시|수시/i.test(closeName)) return null;
  if (closeCode && ["2", "3", "4"].includes(closeCode)) return null;

  const expirationTime = normalizeDeadlineTimeValue(getSaraminNamedValue(job["expiration-date"]));
  if (expirationTime !== undefined) return expirationTime;

  const timestampRaw = job["expiration-timestamp"];
  const timestamp =
    typeof timestampRaw === "number"
      ? timestampRaw
      : typeof timestampRaw === "string"
      ? Number(timestampRaw)
      : Number.NaN;

  if (!Number.isFinite(timestamp) || timestamp <= 0) return undefined;
  return toKoreaTimeString(new Date(timestamp * 1000)) ?? undefined;
}

function parseSaraminApiJob(job: Record<string, unknown>): ParsedJobFields {
  const company = asRecord(job.company);
  const companyDetail = asRecord(company?.detail);
  const position = asRecord(job.position);
  const location = asRecord(position?.location);
  const jobType = position?.["job-type"];
  const experienceLevel = position?.["experience-level"];
  const jobCode = position?.["job-code"];
  const industryCode = position?.["industry-code"];
  const keywordSpecs = splitSaraminKeywords(
    getSaraminNamedValue(job.keyword),
    getSaraminNamedValue(jobCode),
    getSaraminNamedValue(industryCode)
  );

  return {
    saraminApiUsed: true,
    companyName: getSaraminNamedValue(companyDetail?.name ?? company?.name),
    jobTitle: getSaraminNamedValue(position?.title),
    deadline: normalizeSaraminApiDeadline(job),
    deadlineTime: normalizeSaraminApiDeadlineTime(job),
    workplaceAddress: cleanSaraminApiLocation(getSaraminNamedValue(location)),
    requiredSpecs: keywordSpecs.length > 0 ? keywordSpecs : undefined,
    salary: cleanSalaryValue(getSaraminNamedValue(job.salary) ?? ""),
    employmentType: getSaraminNamedValue(jobType),
    experienceLevel: normalizeSaraminApiExperience(experienceLevel),
  };
}

function getSaraminApiJobs(data: unknown): Record<string, unknown>[] {
  const root = asRecord(data);
  const jobs = asRecord(root?.jobs);
  const rawJob = jobs?.job;
  if (Array.isArray(rawJob)) {
    return rawJob
      .map(asRecord)
      .filter((job): job is Record<string, unknown> => Boolean(job));
  }

  const single = asRecord(rawJob);
  return single ? [single] : [];
}

async function fetchSaraminOfficialFields(recIdx: string): Promise<ParsedJobFields> {
  if (!SARAMIN_ACCESS_KEY) return {};

  const params = new URLSearchParams({
    "access-key": SARAMIN_ACCESS_KEY,
    id: recIdx,
    fields: "posting-date expiration-date keyword-code count",
  });

  const res = await fetch(`${SARAMIN_API_URL}?${params.toString()}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const text = await res.text();

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("사람인 API 응답을 해석하지 못했습니다.");
  }

  if (!res.ok) {
    const root = asRecord(data);
    throw new Error(getSaraminNamedValue(root?.message) ?? `사람인 API 오류 (HTTP ${res.status})`);
  }

  const firstJob = getSaraminApiJobs(data)[0];
  return firstJob ? parseSaraminApiJob(firstJob) : {};
}

function hasUsefulMetadata(metadata: ParsedJobFields): boolean {
  return Boolean(
    hasUsefulString(metadata.companyName) ||
      hasUsefulString(metadata.jobTitle) ||
      hasUsefulString(metadata.deadline ?? undefined) ||
      hasUsefulString(metadata.workplaceAddress) ||
      hasUsefulString(metadata.description) ||
      (metadata.mainTasks && metadata.mainTasks.length > 0) ||
      (metadata.qualifications && metadata.qualifications.length > 0) ||
      (metadata.positionDetails && metadata.positionDetails.length > 0)
  );
}

function buildTextFromMetadata(metadata: ParsedJobFields): string {
  const positionDetailsText = (metadata.positionDetails ?? [])
    .map((detail) =>
      [
        `모집분야: ${detail.title}`,
        detail.headcount ? `모집인원: ${detail.headcount}` : "",
        detail.mainTasks.length > 0 ? `주요업무: ${detail.mainTasks.join(" / ")}` : "",
        detail.qualifications.length > 0 ? `자격요건: ${detail.qualifications.join(" / ")}` : "",
        (detail.preferredQualifications ?? []).length > 0
          ? `우대사항: ${(detail.preferredQualifications ?? []).join(" / ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");

  return [
    metadata.companyName ? `회사명: ${metadata.companyName}` : "",
    metadata.jobTitle ? `직무: ${metadata.jobTitle}` : "",
    metadata.deadline ? `마감일: ${metadata.deadline}` : "",
    metadata.deadlineTime ? `마감시간: ${metadata.deadlineTime}` : "",
    metadata.workplaceAddress ? `근무지: ${metadata.workplaceAddress}` : "",
    metadata.salary ? `급여: ${metadata.salary}` : "",
    metadata.employmentType ? `근무형태: ${metadata.employmentType}` : "",
    metadata.experienceLevel ? `경력구분: ${metadata.experienceLevel}` : "",
    metadata.description,
    positionDetailsText,
    metadata.mainTasks?.length ? `주요업무:\n${metadata.mainTasks.join("\n")}` : "",
    metadata.qualifications?.length ? `자격요건:\n${metadata.qualifications.join("\n")}` : "",
    metadata.preferredQualifications?.length
      ? `우대사항:\n${metadata.preferredQualifications.join("\n")}`
      : "",
    metadata.hiringProcess?.length ? `채용전형:\n${metadata.hiringProcess.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function hasUsefulString(value: string | undefined): value is string {
  return Boolean(value && value.trim() && value.trim() !== "미확인");
}

function chooseSaraminWorkplaceAddress(
  htmlAddress: string | undefined,
  apiAddress: string | undefined
): string | undefined {
  if (!hasUsefulString(htmlAddress)) return hasUsefulString(apiAddress) ? apiAddress : undefined;
  if (!hasUsefulString(apiAddress)) return htmlAddress;

  const isDetailedHtmlAddress =
    htmlAddress.length > apiAddress.length + 8 ||
    /(로|길|대로|번길|읍|면|동|리)\s*\d|빌딩|타워|센터|층|호/.test(htmlAddress);

  return isDetailedHtmlAddress ? htmlAddress : apiAddress;
}

function chooseList(primary: string[] | undefined, fallback: string[] | undefined): string[] | undefined {
  if (primary && primary.length > 0) return primary;
  if (fallback && fallback.length > 0) return fallback;
  return undefined;
}

function mergeSaraminMetadata(
  htmlFields: ParsedJobFields,
  apiFields: ParsedJobFields
): ParsedJobFields {
  if (!apiFields.saraminApiUsed) return htmlFields;

  const mainTasks = chooseList(htmlFields.mainTasks, apiFields.mainTasks);
  const qualifications = chooseList(htmlFields.qualifications, apiFields.qualifications);
  const preferredQualifications = chooseList(
    htmlFields.preferredQualifications,
    apiFields.preferredQualifications
  );
  const hiringProcess = chooseList(htmlFields.hiringProcess, apiFields.hiringProcess);
  const requiredSpecs = deriveRequiredSpecsFromSections(
    { qualifications, preferredQualifications },
    htmlFields.requiredSpecs ?? apiFields.requiredSpecs ?? []
  );

  return {
    ...htmlFields,
    ...compactParsedFields(apiFields),
    workplaceAddress: chooseSaraminWorkplaceAddress(
      htmlFields.workplaceAddress,
      apiFields.workplaceAddress
    ),
    requiredSpecs: requiredSpecs.length > 0 ? requiredSpecs : undefined,
    mainTasks,
    qualifications,
    preferredQualifications,
    hiringProcess,
  };
}

function hasNaverMapApiKeys(): boolean {
  return Boolean(NAVER_MAP_CLIENT_ID && NAVER_MAP_CLIENT_SECRET);
}

async function geocodeWorkplaceAddress(address: string): Promise<string | undefined> {
  if (!hasNaverMapApiKeys()) return undefined;
  const cleaned = cleanWorkplaceAddressValue(address);
  if (!cleaned) return undefined;

  const params = new URLSearchParams({
    query: cleaned,
    count: "1",
  });
  const res = await fetch(`${NAVER_MAP_API_BASE}/map-geocode/v2/geocode?${params.toString()}`, {
    headers: {
      "x-ncp-apigw-api-key-id": NAVER_MAP_CLIENT_ID ?? "",
      "x-ncp-apigw-api-key": NAVER_MAP_CLIENT_SECRET ?? "",
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) return undefined;

  const data = (await res.json()) as NaverGeocodeResponse;
  const first = data.addresses?.[0];
  const canonical = cleanWorkplaceAddressValue(first?.roadAddress || first?.jibunAddress || "");

  return canonical;
}

function chooseMoreSpecificWorkplaceAddress(
  extracted: string,
  geocoded: string | undefined
): string {
  if (!geocoded) return extracted;
  if (scoreWorkplaceAddress(geocoded) >= scoreWorkplaceAddress(extracted) - 10) {
    return geocoded;
  }
  return extracted;
}

async function refineParseResultWorkplace(result: ParseJobResponse): Promise<ParseJobResponse> {
  const extracted = result.workplaceAddress;
  if (!extracted || extracted === "미확인") return result;
  const cleaned = cleanWorkplaceAddressValue(extracted);
  const address = cleaned ?? cleanFieldValue(extracted);

  let geocoded: string | undefined;
  try {
    geocoded = await geocodeWorkplaceAddress(address);
  } catch {
    geocoded = undefined;
  }

  return {
    ...result,
    workplaceAddress: chooseMoreSpecificWorkplaceAddress(address, geocoded),
  };
}

function extractJobKoreaDetailContentHtml(html: string): string {
  const start = html.indexOf('id="detail-content"');
  if (start < 0) return "";

  const endCandidates = [
    html.indexOf("<!--$-->", start),
    html.indexOf("<section", start),
    html.indexOf("<script", start),
  ].filter((index) => index > start);
  const end = endCandidates.length > 0 ? Math.min(...endCandidates) : html.length;

  return html.slice(start, end);
}

function splitFlattenedPositionItems(details: JobPositionDetail[]) {
  return {
    mainTasks: details.flatMap((detail) => detail.mainTasks),
    qualifications: details.flatMap((detail) => detail.qualifications),
    preferredQualifications: details.flatMap((detail) => detail.preferredQualifications ?? []),
  };
}

function extractJobKoreaPositionDetailsFromHtml(html: string): JobPositionDetail[] {
  const detailHtml = extractJobKoreaDetailContentHtml(html);
  if (!detailHtml) return [];

  const parts = detailHtml.split(/<td[^>]*class=["']header["'][^>]*>/i).slice(1);
  const details: JobPositionDetail[] = [];

  for (const part of parts) {
    const headerEnd = part.search(/<\/td>/i);
    if (headerEnd < 0) continue;

    const headerText = extractTextFromHtml(part.slice(0, headerEnd), 600);
    const headerLines = headerText
      .split(/\r?\n/)
      .map(cleanSectionLine)
      .filter(Boolean);
    const title = headerLines.find((line) => !/^\(?\s*○+\s*명\s*\)?$/.test(line));
    if (!title) continue;

    const headcount = headerLines.find((line) => /^\(?\s*○+\s*명\s*\)?$/.test(line));
    const contentHtml = part.slice(headerEnd);
    const contentText = extractTextFromHtml(contentHtml, 12000);
    const sections = extractDetailSectionsFromText(contentText);
    const hasContent =
      sections.mainTasks.length > 0 ||
      sections.qualifications.length > 0 ||
      sections.preferredQualifications.length > 0;

    if (!hasContent) continue;

    details.push({
      title,
      headcount,
      mainTasks: sections.mainTasks,
      qualifications: sections.qualifications,
      preferredQualifications: sections.preferredQualifications,
    });
  }

  return uniquePositionDetails(details, 8);
}

function extractJobKoreaDetailTextFromHtml(html: string): string {
  const detailHtml = extractJobKoreaDetailContentHtml(html);
  return detailHtml ? extractTextFromHtml(detailHtml, 40000) : "";
}

/** URL에서 HTML을 fetch하고 텍스트만 추출 */
async function fetchJobTextFromUrl(url: string): Promise<{
  text: string;
  metadata: ParsedJobFields;
}> {
  const saraminMobileUrl = getSaraminMobileUrl(url);
  const saraminJobId = getSaraminJobIdFromUrl(url);
  const isSaramin = isSaraminUrl(url);
  const supplementalTexts: string[] = [];
  const supplementalMetadata: ParsedJobFields = {};
  let apiMetadata: ParsedJobFields = {};

  if (saraminJobId && isSaramin) {
    try {
      apiMetadata = await fetchSaraminOfficialFields(saraminJobId);
    } catch (error) {
      console.warn(
        "Saramin API fallback:",
        error instanceof Error ? error.message : "unknown error"
      );
    }
  }

  const candidateUrls = saraminMobileUrl ? [saraminMobileUrl, url] : [url];
  let html = "";
  let fetchedUrl = "";
  let fetchError: unknown;

  for (const candidateUrl of candidateUrls) {
    try {
      html = await fetchHtml(candidateUrl);
      fetchedUrl = candidateUrl;
      break;
    } catch (error) {
      fetchError = error;
    }
  }

  if (!html) {
    if (hasUsefulMetadata(apiMetadata)) {
      return {
        text: buildTextFromMetadata(apiMetadata),
        metadata: apiMetadata,
      };
    }
    throw fetchError instanceof Error ? fetchError : new Error("URL 본문을 불러오지 못했습니다.");
  }

  if (!saraminMobileUrl && isJobKoreaUrl(url)) {
    const iframeUrl = getJobKoreaIframeUrl(url);
    if (iframeUrl) {
      try {
        const iframeHtml = await fetchHtml(iframeUrl);
        const iframeText = extractJobKoreaDetailTextFromHtml(iframeHtml);
        const positionDetails = extractJobKoreaPositionDetailsFromHtml(iframeHtml);
        if (positionDetails.length > 0) {
          const flattened = splitFlattenedPositionItems(positionDetails);
          supplementalMetadata.positionDetails = positionDetails;
          supplementalMetadata.mainTasks = flattened.mainTasks;
          supplementalMetadata.qualifications = flattened.qualifications;
          supplementalMetadata.preferredQualifications = flattened.preferredQualifications;
        }
        if (iframeText) supplementalTexts.push(iframeText);
      } catch {
        // 잡코리아 상세 iframe이 막힌 경우에도 기본 페이지 메타데이터 파싱은 계속 시도
      }
    }
  }

  const isSaraminMobileHtml = Boolean(saraminMobileUrl && fetchedUrl === saraminMobileUrl);
  const genericText = isSaraminMobileHtml ? "" : extractGenericJobTextFromHtml(html);
  const text = isSaraminMobileHtml
    ? extractSaraminTextFromHtml(html)
    : [
        ...(isJobKoreaUrl(url) ? supplementalTexts : []),
        genericText,
        ...(!isJobKoreaUrl(url) ? supplementalTexts : []),
      ]
        .filter(Boolean)
        .join("\n\n")
        .trim();
  const htmlMetadata = extractMetadataFromHtml(html);
  const combinedHtmlMetadata = {
    ...htmlMetadata,
    ...compactParsedFields(supplementalMetadata),
  };

  return {
    text: text || buildTextFromMetadata(apiMetadata),
    metadata: mergeSaraminMetadata(combinedHtmlMetadata, apiMetadata),
  };
}

/** HTML에서 가시적인 텍스트만 추출 */
function extractTextFromHtml(html: string, maxLength = 20000): string {
  // <script>, <style>, <noscript> 태그와 내용 제거
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");

  // 블록 요소 앞에 줄바꿈 추가 (가독성 유지)
  text = text.replace(/<\/?(p|div|section|article|li|br|h[1-6]|tr|td|th|dl|dt|dd)[^>]*>/gi, "\n");

  // 나머지 HTML 태그 제거
  text = text.replace(/<[^>]+>/g, " ");

  // HTML 엔티티 디코딩
  text = decodeHtmlEntities(text);

  // 연속 공백/줄바꿈 정리
  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text.slice(0, maxLength);
}

function extractSaraminMainHtml(html: string): string {
  const titleIndex = html.indexOf('class="corp_name"');
  const basicIndex = html.indexOf("section_basic_view");
  const startCandidates = [titleIndex, basicIndex].filter((index) => index >= 0);
  const start = startCandidates.length > 0 ? Math.max(0, Math.min(...startCandidates) - 800) : 0;

  const endCandidates = [
    html.indexOf("box_statistics_group", start),
    html.indexOf("추천 채용정보", start),
    html.indexOf("구직자 개인정보 보호", start),
  ].filter((index) => index > start);
  const end = endCandidates.length > 0 ? Math.min(...endCandidates) : Math.min(html.length, start + 90000);

  return html.slice(start, end);
}

function extractSaraminDecodedDetailHtml(html: string): string {
  const detailBlocks = [...html.matchAll(/contents:\s*'([^']+)'/g)]
    .map((match) => match[1])
    .filter(Boolean);

  return detailBlocks
    .map((encoded) => {
      try {
        return Buffer.from(encoded, "base64").toString("utf8");
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .join("\n");
}

function extractSaraminTextFromHtml(html: string): string {
  const mainText = extractTextFromHtml(extractSaraminMainHtml(html), 50000);
  const detailText = extractTextFromHtml(extractSaraminDecodedDetailHtml(html), 30000);

  return [mainText, detailText]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function extractGenericJobTextFromHtml(html: string): string {
  return [
    extractEmbeddedJsonTextFromHtml(html),
    extractHydrationScriptTextFromHtml(html),
    extractTextFromHtml(html, 50000),
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function cleanEmbeddedJsonText(value: string): string | undefined {
  const decoded = decodeHtmlEntities(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|section|article|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const cleaned = decoded
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean)
    .join("\n")
    .trim();

  if (cleaned.length < 2) return undefined;
  if (/^https?:\/\//i.test(cleaned) || /^\/[_a-z0-9/-]+$/i.test(cleaned)) return undefined;
  if (/data:image|base64|webpack|__next|chunk|font-face|stylesheet/i.test(cleaned)) return undefined;
  if (/^[\d.,:%\s()[\]/+-]+$/.test(cleaned)) return undefined;

  return cleaned.slice(0, 5000);
}

function detailKeyToHeading(key: string | undefined): string | null {
  if (!key) return null;
  const compact = key.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");

  if (
    /^(hiringorganization|organization|company|companyinfo|companyintro|introduction|benefit|benefits|welfare|tag|tags|skill|skills|category|categories|industry|industries|status|locale)$/.test(compact) ||
    /(image|logo|thumbnail|experiment|featureflag|analytics|user|search|recommend|reward)/.test(compact)
  ) {
    return null;
  }

  if (/(maintask|task|responsib|duty|whatyoulldo|jobdescription|jobdetail|role|주요|담당|업무)/.test(compact)) {
    return "주요업무";
  }
  if (/(qualif|require|eligib|필수|자격|요건|지원자격)/.test(compact)) {
    return "자격요건";
  }
  if (/(prefer|preferred|nice|plus|우대)/.test(compact)) {
    return "우대사항";
  }
  if (/(process|procedure|hiring|recruit|채용|전형|합류)/.test(compact)) {
    return "채용전형";
  }

  return null;
}

function shouldIgnoreEmbeddedJsonBranch(key: string | undefined): boolean {
  if (!key) return false;
  const compact = key.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");

  return (
    /^(hiringorganization|organization|company|companyinfo|companyintro|introduction|benefit|benefits|welfare|welfares|perk|perks|compensation|tag|tags|skill|skills|category|categories|industry|industries|status|locale|image|logo|thumbnail)$/.test(compact) ||
    /(benefit|welfare|perk|복지|혜택|복리후생|보상|tag|skill|image|logo|thumbnail|experiment|featureflag|analytics|user|search|recommend|reward)/.test(compact)
  );
}

function collectEmbeddedJsonStrings(
  value: unknown,
  parentKey: string | undefined,
  out: string[],
  activeHeading: string | null = null
) {
  if (shouldIgnoreEmbeddedJsonBranch(parentKey)) return;

  const heading = detailKeyToHeading(parentKey) ?? activeHeading;

  if (typeof value === "string") {
    const cleaned = cleanEmbeddedJsonText(value);
    if (!cleaned) return;

    if (heading && out[out.length - 1] !== heading) out.push(heading);
    out.push(cleaned);
    return;
  }

  if (typeof value === "number") {
    if (parentKey && /(salary|연봉|급여|deadline|마감|expiration)/i.test(parentKey)) {
      out.push(String(value));
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectEmbeddedJsonStrings(item, parentKey, out, heading));
    return;
  }

  const record = asRecord(value);
  if (!record) return;

  Object.entries(record).forEach(([key, nested]) => {
    collectEmbeddedJsonStrings(nested, key, out, heading);
  });
}

function isSyntheticSectionHeading(value: string): boolean {
  return value === "주요업무" || value === "자격요건" || value === "우대사항" || value === "채용전형";
}

function dedupeCrawlerText(items: string[], max: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items.map((value) => value.trim()).filter(Boolean)) {
    if (isSyntheticSectionHeading(item)) {
      if (result[result.length - 1] !== item) result.push(item);
      continue;
    }

    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= max) break;
  }

  return result;
}

function parseEmbeddedJsonBlock(raw: string): unknown | null {
  const cleaned = decodeHtmlEntities(raw)
    .replace(/^\s*<!--/, "")
    .replace(/-->\s*$/, "")
    .trim();

  if (!cleaned || cleaned.length < 2) return null;

  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function extractEmbeddedJsonTextFromHtml(html: string): string {
  const out: string[] = [];
  const scripts = html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi);

  for (const match of scripts) {
    const attrs = match[1] ?? "";
    if (/application\/ld\+json/i.test(attrs)) continue;
    if (!/(application\/json|__NEXT_DATA__)/i.test(attrs)) continue;

    const parsed = parseEmbeddedJsonBlock(match[2] ?? "");
    if (parsed) collectEmbeddedJsonStrings(parsed, undefined, out);
  }

  return dedupeCrawlerText(out, 160).join("\n");
}

function decodeJsStringLiteral(raw: string): string {
  try {
    return JSON.parse(`"${raw.replace(/"/g, '\\"')}"`) as string;
  } catch {
    return raw
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\n")
      .replace(/\\t/g, " ")
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, "\\");
  }
}

function isUsefulHydrationScriptText(value: string): boolean {
  if (value.length < 8 || value.length > 5000) return false;
  if (!/[가-힣]/.test(value) && !/(Responsibilities|Requirements|Preferred|Hiring|Process|Location|Salary)/i.test(value)) {
    return false;
  }
  if (/^(className|children|href|src|alt|button|section|article|div|span|true|false|null)$/i.test(value)) {
    return false;
  }
  if (/webpack|__next|function\s*\(|=>|^\s*\/static\//i.test(value)) return false;

  return true;
}

function extractHydrationScriptTextFromHtml(html: string): string {
  const out: string[] = [];
  const scripts = html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi);

  for (const match of scripts) {
    const attrs = match[1] ?? "";
    const content = match[2] ?? "";
    if (/application\/json|application\/ld\+json|__NEXT_DATA__/i.test(attrs)) continue;
    if (!/(주요|업무|자격|요건|우대|채용|전형|근무지|경력|신입|원티드|wanted|잡플래닛|jobplanet|Responsibilities|Requirements|Preferred|Hiring)/i.test(content)) {
      continue;
    }

    const quotedStrings = content.matchAll(/"((?:\\.|[^"\\]){2,5000})"|'((?:\\.|[^'\\]){2,5000})'/g);
    for (const quoted of quotedStrings) {
      const raw = quoted[1] ?? quoted[2] ?? "";
      const cleaned = cleanEmbeddedJsonText(decodeJsStringLiteral(raw));
      if (cleaned && isUsefulHydrationScriptText(cleaned)) out.push(cleaned);
    }
  }

  return dedupeCrawlerText(out, 140).join("\n");
}

function getMetaContent(html: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return cleanLine(decodeHtmlEntities(match[1]));
  }

  return undefined;
}

function getTitleContent(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? cleanLine(decodeHtmlEntities(match[1])) : undefined;
}

function htmlFragmentToText(html: string, maxLength = 1200): string {
  return extractTextFromHtml(html, maxLength)
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSaraminValue(value: string): string {
  return cleanFieldValue(
    decodeHtmlEntities(value)
      .replace(/더보기|닫기|확대/g, " ")
      .replace(/\b외\s*\d+건\b/g, " ")
      .replace(/\s+/g, " ")
  );
}

function extractSaraminDlValue(html: string, labels: string[]): string {
  for (const label of labels) {
    const pattern = new RegExp(
      `<dt[^>]*>\\s*(?:<[^>]+>\\s*)*${escapeRegExp(label)}\\s*(?:<[^>]+>\\s*)*</dt>\\s*<dd[^>]*>([\\s\\S]*?)</dd>`,
      "i"
    );
    const match = html.match(pattern);
    if (!match?.[1]) continue;

    const value = cleanSaraminValue(htmlFragmentToText(match[1]));
    if (value !== "미확인") return value;
  }

  return "미확인";
}

function parseSaraminTitle(title: string | undefined): ParsedJobFields {
  if (!title) return {};

  const cleaned = stripJobBoardSuffix(title);
  const bracket = cleaned.match(/^\[([^\]]+)\]\s*(.+)$/);
  if (!bracket) return {};
  const companyName = cleanLine(bracket[1]);
  const jobTitle = removeCompanyPrefixFromTitle(cleanJobTitleCandidate(bracket[2]), companyName);

  return {
    companyName,
    jobTitle,
  };
}

function parseSaraminDescription(description: string | undefined): ParsedJobFields {
  if (!description) return {};

  const parts = description
    .split(/\s*,\s*/)
    .map(cleanLine)
    .filter(Boolean);

  const companyName = parts[0];
  const jobTitle = parts[1] ? removeCompanyPrefixFromTitle(cleanJobTitleCandidate(parts[1]), companyName) : undefined;
  const experiencePart = parts.find((part) => /^경력\s*:/.test(part));
  const deadlinePart = parts.find((part) => /^마감일\s*:/.test(part));
  const salaryPart = parts.find((part) =>
    /(회사\s*내규|면접\s*후\s*결정|연봉|월급|\d{2,5}\s*만\s*원|\d[,.\d]*\s*원)/.test(part)
  );
  const employmentMatch = description.match(/정규직|계약직|인턴|파견|프리랜서|아르바이트|병역특례|전환형/g);

  return {
    companyName: companyName && !isJobBoardName(companyName) ? companyName : undefined,
    jobTitle,
    deadline: deadlinePart ? extractDeadline(deadlinePart) ?? normalizeIsoDate(deadlinePart) : undefined,
    deadlineTime: deadlinePart
      ? extractDeadlineTime(deadlinePart) ?? normalizeDeadlineTimeValue(deadlinePart)
      : undefined,
    salary: salaryPart ? cleanSalaryValue(salaryPart.replace(/^(급여|연봉|월급)\s*[:：]?/, "")) : undefined,
    employmentType: employmentMatch ? Array.from(new Set(employmentMatch)).join(", ") : undefined,
    experienceLevel: normalizeExperienceLevel(experiencePart?.replace(/^경력\s*[:：]?/, "")),
  };
}

function compactParsedFields(fields: ParsedJobFields): ParsedJobFields {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined && value !== "미확인")
  ) as ParsedJobFields;
}

const KOREAN_REGION_PATTERN =
  /(서울|경기|인천|부산|대전|대구|광주|울산|세종|제주|강원|충북|충남|전북|전남|경북|경남|충청북도|충청남도|전라북도|전라남도|경상북도|경상남도|강원도|경기도|서울특별시|부산광역시|대전광역시|대구광역시|광주광역시|울산광역시|인천광역시|세종특별자치시|제주특별자치도)/;

function cleanWorkplaceAddressValue(value: string): string | undefined {
  const cleaned = cleanSaraminValue(value)
    .replace(/^(?:근무지\s*주소|근무지주소|근무지역|근무지|주소|위치)\s*(?:\([^)]+\))?\s*[:：]?\s*/i, "")
    .replace(/^(?:본사|서울\s*(?:본사|지점|사업장)?|[가-힣]+지점)\s*[:：-]\s*/i, "")
    .replace(/\s*[•ㆍ·|｜]?\s*(근무요일\/시간|근무요일|근무시간|근무조건|근무상세|복지 및 혜택|혜택 및 복지|복리후생|리프레시|접수기간|접수방법|담당자|채용담당자|사람인 공고|지도|길찾기|상세보기).*$/i, "")
    .replace(/\s+/g, " ")
    .replace(/[•ㆍ·|｜\s]+$/g, "")
    .trim();

  if (!cleaned || cleaned === "미확인") return undefined;
  if (!KOREAN_REGION_PATTERN.test(cleaned)) return undefined;
  if (/^(전국|재택|원격|해외|기타)$/.test(cleaned)) return undefined;
  return cleaned.slice(0, 120);
}

function scoreWorkplaceAddress(value: string): number {
  let score = value.length;
  if (/(로|길|대로|번길)\s*\d/.test(value)) score += 80;
  if (/(읍|면|동|리)\s*\d|번지/.test(value)) score += 45;
  if (/(빌딩|타워|센터|사옥|캠퍼스|공장|층|호)/.test(value)) score += 35;
  if (/^(?:본사|서울(?:본사|지점|사업장)?)\s*[:：-]?\s*서울/.test(value)) score += 180;
  if (/^서울(?:특별시)?\s/.test(value)) score += 120;
  if (/서울(?:본사|지점|사업장)/.test(value)) score += 70;
  if (/울산지점/.test(value) && /서울/.test(value)) score -= 50;
  if (/(전체|인근|부근|일대)/.test(value)) score -= 60;
  if (value.length < 8) score -= 40;
  return score;
}

function pickBestWorkplaceAddress(candidates: string[]): string | undefined {
  return candidates
    .map(cleanWorkplaceAddressValue)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => scoreWorkplaceAddress(b) - scoreWorkplaceAddress(a))[0];
}

function extractSaraminDetailAddress(detailText: string): string | undefined {
  const flat = normalizeFlatText(detailText);
  const labeledMatch = flat.match(
    /(?:근무지\s*주소|근무지주소|근무지|주소|위치)\s*(?:\([^)]+\))?\s*[:：]?\s*(.+?)(?=\s*(?:노출지역|근무지역|근무요일\/시간|근무요일|근무시간|근무조건|복지 및 혜택|혜택 및 복지|복리후생|리프레시|접수기간|접수방법|담당자|전형절차|제출서류|사람인 공고|$))/
  );
  const candidates: string[] = [];

  if (labeledMatch?.[1]) candidates.push(labeledMatch[1]);

  const branchAddressMatches = [
    ...detailText.matchAll(
      /(?:^|\n)\s*[-ㆍ·•]?\s*((?:본사|서울(?:본사|지점|사업장)?|울산지점|[가-힣]+지점)\s*[:：-]\s*(?:서울|경기|인천|부산|대전|대구|광주|울산|세종|제주|강원|충북|충남|전북|전남|경북|경남)[^\n]+)/g
    ),
  ];
  candidates.push(...branchAddressMatches.map((match) => match[1]));

  const addressLikeLines = detailText
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((line) => KOREAN_REGION_PATTERN.test(line))
    .filter((line) => /(시|군|구|읍|면|동|리|로|길|대로|번길)/.test(line))
    .filter((line) => !/(노출지역|근무지역|복리후생|접수기간|지원자격|담당업무|자격요건)/.test(line));

  candidates.push(...addressLikeLines);
  return pickBestWorkplaceAddress(candidates);
}

function uniqueStrings(items: string[], max: number): string[] {
  const seen = new Set<string>();
  return items
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, max);
}

function uniquePositionDetails(items: JobPositionDetail[], max: number): JobPositionDetail[] {
  const seen = new Set<string>();
  const result: JobPositionDetail[] = [];

  for (const item of items) {
    const title = cleanSectionLine(item.title);
    if (!title) continue;

    const normalized: JobPositionDetail = {
      title,
      headcount: item.headcount ? cleanSectionLine(item.headcount) : undefined,
      mainTasks: uniqueStrings((item.mainTasks ?? []).map(cleanSectionLine), 20),
      qualifications: uniqueStrings((item.qualifications ?? []).map(cleanSectionLine), 20),
      preferredQualifications: uniqueStrings(
        (item.preferredQualifications ?? []).map(cleanSectionLine),
        16
      ),
    };
    const hasDetail =
      normalized.mainTasks.length > 0 ||
      normalized.qualifications.length > 0 ||
      (normalized.preferredQualifications ?? []).length > 0;
    if (!hasDetail) continue;

    const key = [
      normalized.title,
      normalized.mainTasks.join("|"),
      normalized.qualifications.join("|"),
    ].join("::").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= max) break;
  }

  return result;
}

type DetailSectionKey =
  | "mainTasks"
  | "qualifications"
  | "preferredQualifications"
  | "hiringProcess";

type DetailSections = Record<DetailSectionKey, string[]>;

const DETAIL_SECTION_LABELS: Array<{ key: DetailSectionKey; labels: string[] }> = [
  {
    key: "mainTasks",
    labels: [
      "주요업무",
      "주요 업무",
      "담당업무",
      "담당 업무",
      "담당하실 업무",
      "수행업무",
      "업무내용",
      "업무 소개",
      "하는 일",
      "이런 일을 해요",
      "합류하면 함께 할 업무",
      "합류 후 하게 될 업무",
      "Responsibilities",
      "Main Responsibilities",
      "What you'll do",
      "What you will do",
    ],
  },
  {
    key: "qualifications",
    labels: [
      "자격요건",
      "자격 요건",
      "지원자격",
      "지원 자격",
      "필수요건",
      "필수 요건",
      "필수사항",
      "필수 사항",
      "필요역량",
      "필요 역량",
      "이런 분을 찾고 있어요",
      "이런 분과 함께하고 싶어요",
      "Requirements",
      "Minimum Qualifications",
      "Required Qualifications",
    ],
  },
  {
    key: "preferredQualifications",
    labels: [
      "우대사항",
      "우대 사항",
      "우대조건",
      "우대 조건",
      "우대요건",
      "우대 요건",
      "이런 분이면 더 좋아요",
      "Preferred Qualifications",
      "Nice to have",
      "Nice to Have",
    ],
  },
  {
    key: "hiringProcess",
    labels: [
      "채용전형",
      "채용 전형",
      "채용절차",
      "채용 절차",
      "전형절차",
      "전형 절차",
      "전형방법",
      "전형 방법",
      "채용 프로세스",
      "합류 여정",
      "합류 과정",
      "전형 안내",
      "Hiring Process",
      "Recruitment Process",
    ],
  },
];

const DETAIL_STOP_LABELS = [
  "포지션 상세",
  "근무조건",
  "근무 조건",
  "근무상세",
  "근무 상세",
  "근무환경",
  "근무 환경",
  "업무환경",
  "업무 환경",
  "복리후생",
  "복지 및 혜택",
  "복지",
  "혜택",
  "혜택 및 복지",
  "Benefits",
  "Benefit",
  "Welfare",
  "Perks",
  "Compensation & Benefits",
  "기술 스택",
  "기술 스택 • 툴",
  "기술스택",
  "태그",
  "상세 정보 더 보기",
  "상세정보 더 보기",
  "접수기간",
  "접수 기간",
  "접수기간 · 방법",
  "접수기간 방법",
  "접수방법",
  "접수 방법",
  "남은기간",
  "시작일",
  "제출서류",
  "제출 서류",
  "회사소개",
  "회사 소개",
  "기업정보",
  "기업 정보",
  "유의사항",
  "기타사항",
  "이 기업과 나의 적합도 체크",
  "적합도 체크",
  "AI추천공고",
  "근무지",
  "근무지 주소",
  "근무지역",
  "근무 시간",
  "휴게 시간",
  "급여",
  "연봉",
];

function createEmptyDetailSections(): DetailSections {
  return {
    mainTasks: [],
    qualifications: [],
    preferredQualifications: [],
    hiringProcess: [],
  };
}

function compactSectionHeading(value: string): string {
  return value.replace(/[^\w가-힣]/g, "").toLowerCase();
}

function cleanSectionLine(line: string): string {
  return cleanLine(
    decodeHtmlEntities(line)
      .replace(/[\u00a0\u200b]/g, " ")
      .replace(/^#+\s*/, "")
      .replace(/^[📋✅✔️✓•\-–—·ㆍ○●▶▷■□◆◇]+\s*/u, "")
      .replace(/\s+/g, " ")
  );
}

function isStopSectionHeading(compact: string): boolean {
  const compactStopLabels = DETAIL_STOP_LABELS.map(compactSectionHeading);
  if (compactStopLabels.some((label) => compact === label || compact.startsWith(label))) {
    return true;
  }

  if (
    /^(근무상세|근무조건|근무환경|업무환경|혜택및복지|복리후생|복지|혜택|기술스택툴|기술스택|태그|상세정보더보기|마감일|근무지역|근무시간|휴게시간)$/.test(compact)
  ) {
    return true;
  }
  if (/^(active|inactive|regular|contract|intern|ko|en|treatment|control|show|failure|success|waiting|off|on)$/.test(compact)) {
    return true;
  }

  return /의업무환경$/.test(compact);
}

function getDetailSectionHeading(line: string): DetailSectionKey | "stop" | null {
  const compact = compactSectionHeading(line);
  if (!compact) return null;

  for (const { key, labels } of DETAIL_SECTION_LABELS) {
    if (labels.some((label) => compact === compactSectionHeading(label))) {
      return key;
    }
    if (
      labels.some((label) => {
        const pattern = new RegExp(
          `^${labelToLoosePattern(label)}\\s*\\([^)]{1,40}\\)\\s*$`,
          "i"
        );
        return pattern.test(line);
      })
    ) {
      return key;
    }
  }

  if (/^(전형절차및제출서류|채용전형및제출서류)$/.test(compact)) {
    return "hiringProcess";
  }

  if (isStopSectionHeading(compact)) return "stop";

  if (DETAIL_STOP_LABELS.some((label) => compact === compactSectionHeading(label))) {
    return "stop";
  }

  return null;
}

function labelToLoosePattern(label: string): string {
  return label
    .trim()
    .split("")
    .map((char) => (/\s/.test(char) ? "\\s*" : escapeRegExp(char)))
    .join("\\s*");
}

function extractInlineDetailSection(line: string): { key: DetailSectionKey; value: string } | null {
  for (const { key, labels } of DETAIL_SECTION_LABELS) {
    for (const label of [...labels].sort((a, b) => b.length - a.length)) {
      const pattern = new RegExp(
        `^${labelToLoosePattern(label)}(?:\\s*[:：\\-–—]\\s*|\\s+)(.+)$`,
        "i"
      );
      const match = line.match(pattern);
      const value = match?.[1] ? cleanSectionLine(match[1]) : "";
      if (value && getDetailSectionHeading(value) === null) return { key, value };
    }
  }

  return null;
}

function normalizeHiringProcessLine(line: string): string {
  return line
    .replace(/\s*(?:>|＞|›|→)\s*/g, " ＞ ")
    .replace(/\s+/g, " ")
    .trim();
}

function isCareerLevelOnlyLine(line: string): boolean {
  const compact = line.replace(/[^\w가-힣]/g, "");
  return /^(신입|경력|신입경력|경력신입|경력무관|무관|신입가능|경력직|인턴|인턴십)$/.test(compact);
}

function looksLikeHiringProcessLine(line: string): boolean {
  const compact = line.replace(/\s+/g, " ");
  if (/(서류\s*전형|서류\s*검토|직무\s*인터뷰|컬처\s*인터뷰|fit\s*면접|처우\s*협의|최종\s*합격|레퍼런스\s*체크)/i.test(compact) && /(＞|>|›|→|전형|면접|인터뷰|합격|협의|체크)/i.test(compact)) {
    return true;
  }

  return /^(각\s*전형|레퍼런스\s*체크|지원\s*서류|제출\s*서류|이력서\s*내|모든\s*서류|최종\s*합격\s*후)/.test(compact);
}

function inferDetailSectionFromLine(line: string): DetailSectionKey | null {
  if (looksLikeHiringProcessLine(line)) return "hiringProcess";
  return null;
}

function isUsefulDetailLine(line: string, key: DetailSectionKey): boolean {
  if (line.length < 2 || line.length > 1200) return false;
  if (getDetailSectionHeading(line)) return false;
  if (isCareerLevelOnlyLine(line)) return false;
  if (/^(스킬|핵심역량|핵심 역량|모집분야|모집 분야|모집인원|모집 인원)$/.test(line.replace(/\s+/g, ""))) {
    return false;
  }
  if (/^.+\(\s*○+\s*명\s*\)$/.test(line)) return false;
  if (/^\(?\s*○+\s*명\s*\)?$/.test(line)) return false;
  if (/^[가-힣A-Za-z/·]+$/.test(line) && line.length <= 12 && /(개발|생산|연구|영업|관리)$/.test(line)) {
    return false;
  }
  if (/^(상세보기|더보기|채용정보|확대|닫기)$/.test(line)) return false;
  if (/채용\s*공고|사람인|최저임금|무단 복사|게재를 금합니다|로그인|회원가입|개인정보|이용약관/.test(line)) {
    return false;
  }
  if (
    key === "preferredQualifications" &&
    /^(복지|혜택|복리후생|보상|Benefits?|Welfare|Perks?|Compensation)/i.test(line)
  ) {
    return false;
  }
  if (key === "hiringProcess" && /^(접수기간|접수방법|마감일|담당자|제출서류)\s*[:：]/.test(line)) {
    return false;
  }
  if (/^(경력|신입|학력|급여|지역|마감일|근무형태|고용형태)$/.test(line.replace(/\s+/g, ""))) {
    return false;
  }
  if (key !== "hiringProcess" && looksLikeHiringProcessLine(line)) {
    return false;
  }
  if (key !== "hiringProcess" && /^(서류전형|면접전형|최종합격|레퍼런스 체크|채용과제)$/.test(line)) {
    return false;
  }
  return true;
}

function addDetailLine(sections: DetailSections, key: DetailSectionKey, line: string) {
  const value = key === "hiringProcess" ? normalizeHiringProcessLine(line) : line;
  if (isUsefulDetailLine(value, key)) sections[key].push(value);
}

function isSummaryQualificationLine(line: string): boolean {
  if (/^(신입[·\/]경력|신입·경력|경력무관|대졸|초대졸|고졸|학력무관)/.test(line)) {
    return true;
  }
  return /^[가-힣\s,，]+$/.test(line) && /(성실성|창의성|협동심|윤리의식|자존감|적응성)/.test(line);
}

function refineDetailList(items: string[], key: DetailSectionKey): string[] {
  if (key !== "qualifications") return items;

  const hasDetailedQualifications = items.some((item) => /[:：]/.test(item) || item.length >= 28);
  if (!hasDetailedQualifications) return items;

  return items.filter((item) => !isSummaryQualificationLine(item));
}

function finalizeDetailSections(sections: DetailSections): DetailSections {
  const mainTasks = uniqueStrings(sections.mainTasks, 20);
  const qualifications = refineDetailList(uniqueStrings(sections.qualifications, 20), "qualifications");
  const preferredQualifications = uniqueStrings(sections.preferredQualifications, 16);
  const hiringProcess = uniqueStrings(sections.hiringProcess, 12);

  return {
    mainTasks,
    qualifications,
    preferredQualifications,
    hiringProcess,
  };
}

function extractDetailSectionsFromText(text: string): DetailSections {
  const sections = createEmptyDetailSections();
  const lines = text
    .split(/\r?\n/)
    .map(cleanSectionLine)
    .filter(Boolean);
  let current: DetailSectionKey | null = null;

  for (const line of lines) {
    const heading = getDetailSectionHeading(line);
    if (heading === "stop") {
      current = null;
      continue;
    }
    if (heading) {
      current = heading;
      continue;
    }

    const inline = extractInlineDetailSection(line);
    if (inline) {
      current = inline.key;
      addDetailLine(sections, inline.key, inline.value);
      continue;
    }

    const inferred = inferDetailSectionFromLine(line);
    if (inferred) {
      current = inferred;
      addDetailLine(sections, inferred, line);
      continue;
    }

    if (current) addDetailLine(sections, current, line);
  }

  return finalizeDetailSections(sections);
}

function extractSaraminDlLines(html: string, labels: string[], max = 8): string[] {
  for (const label of labels) {
    const pattern = new RegExp(
      `<dt[^>]*>\\s*(?:<[^>]+>\\s*)*${escapeRegExp(label)}\\s*(?:<[^>]+>\\s*)*</dt>\\s*<dd[^>]*>([\\s\\S]*?)</dd>`,
      "i"
    );
    const match = html.match(pattern);
    if (!match?.[1]) continue;

    const lines = extractTextFromHtml(match[1], 4000)
      .split(/\r?\n/)
      .map(cleanSectionLine)
      .filter((line) => isUsefulDetailLine(line, "hiringProcess"))
      .map(normalizeHiringProcessLine);
    if (lines.length > 0) return uniqueStrings(lines, max);
  }

  return [];
}

function deriveRequiredSpecsFromSections(fields: Partial<DetailSections>, fallback: string[] = []): string[] {
  const specs = [
    ...(fields.qualifications ?? []),
    ...(fields.preferredQualifications ?? []),
  ];

  return uniqueStrings(specs.length > 0 ? specs : fallback, 10);
}

function extractSaraminFieldsFromHtml(html: string, base: ParsedJobFields): ParsedJobFields {
  const titleFields = parseSaraminTitle(base.title);
  const descriptionFields = parseSaraminDescription(base.description);
  const mainHtml = extractSaraminMainHtml(html);
  const detailText = extractTextFromHtml(extractSaraminDecodedDetailHtml(html), 30000);
  const mainText = extractTextFromHtml(mainHtml, 50000);
  const detailSections = extractDetailSectionsFromText([detailText, mainText].filter(Boolean).join("\n"));

  const employmentType = extractSaraminDlValue(mainHtml, ["근무형태", "고용형태", "채용형태"]);
  const experienceLevel = extractSaraminDlValue(mainHtml, ["경력", "경력구분"]);
  const salary = extractSaraminDlValue(mainHtml, ["급여", "연봉", "월급"]);
  const hiringProcessFromSummary = extractSaraminDlLines(mainHtml, ["전형절차", "채용전형", "채용절차"]);
  const workplaceAddress =
    extractSaraminDetailAddress([detailText, mainText].filter(Boolean).join("\n")) ??
    extractSaraminDlValue(mainHtml, ["근무지주소", "근무지 주소", "근무지", "근무지역", "지역"]);
  const requiredSpecs = deriveRequiredSpecsFromSections(
    detailSections,
    extractRequiredSpecs(getUsefulLines(detailText || mainText), {})
  );

  return {
    ...compactParsedFields(titleFields),
    ...compactParsedFields(descriptionFields),
    employmentType:
      employmentType !== "미확인" ? employmentType : descriptionFields.employmentType,
    experienceLevel:
      normalizeExperienceLevel(experienceLevel) !== "미확인"
        ? normalizeExperienceLevel(experienceLevel)
        : descriptionFields.experienceLevel,
    salary: salary !== "미확인" ? cleanSalaryValue(salary) : descriptionFields.salary,
    workplaceAddress:
      workplaceAddress && workplaceAddress !== "미확인" ? workplaceAddress : undefined,
    requiredSpecs: requiredSpecs.length > 0 ? requiredSpecs : undefined,
    mainTasks: detailSections.mainTasks.length > 0 ? detailSections.mainTasks : undefined,
    qualifications: detailSections.qualifications.length > 0 ? detailSections.qualifications : undefined,
    preferredQualifications:
      detailSections.preferredQualifications.length > 0 ? detailSections.preferredQualifications : undefined,
    hiringProcess:
      hiringProcessFromSummary.length > 0
        ? hiringProcessFromSummary
        : detailSections.hiringProcess.length > 0
        ? detailSections.hiringProcess
        : undefined,
  };
}

function parseLdJsonBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const scriptPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const matches = html.matchAll(scriptPattern);

  for (const match of matches) {
    const raw = decodeHtmlEntities(match[1])
      .replace(/^\s*<!--/, "")
      .replace(/-->\s*$/, "")
      .trim();

    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // 구조화 데이터가 깨져 있으면 무시하고 본문/메타 기반으로 추출
    }
  }

  return blocks;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function flattenLd(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(flattenLd);

  const record = asRecord(value);
  if (!record) return [];

  const graph = record["@graph"];
  return [record, ...flattenLd(graph)];
}

function ldTypeIncludes(record: Record<string, unknown>, type: string): boolean {
  const rawType = record["@type"];
  const types = Array.isArray(rawType) ? rawType : [rawType];
  return types.some((t) => String(t).toLowerCase() === type.toLowerCase());
}

function stringifyLdValue(value: unknown): string | undefined {
  if (typeof value === "string") return cleanLine(value);
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value.map(stringifyLdValue).filter(Boolean).join(", ") || undefined;
  }

  const record = asRecord(value);
  if (!record) return undefined;

  const fields = [
    record.streetAddress,
    record.addressLocality,
    record.addressRegion,
    record.postalCode,
    record.addressCountry,
  ];

  const joined = fields
    .map(stringifyLdValue)
    .filter(Boolean)
    .join(" ");

  return joined || stringifyLdValue(record.name);
}

function splitLdListValue(value: unknown, max = 8): string[] {
  const text = stringifyLdValue(value);
  if (!text) return [];

  return uniqueStrings(
    text
      .split(/\n|,|ㆍ|·|;|•/)
      .map(cleanSectionLine)
      .filter((item) => item.length > 0),
    max
  );
}

function filterDetailCandidates(items: string[] | undefined, key: DetailSectionKey): string[] {
  return uniqueStrings(
    (items ?? [])
      .map(cleanSectionLine)
      .filter((item) => isUsefulDetailLine(item, key)),
    key === "preferredQualifications" ? 16 : key === "hiringProcess" ? 12 : 20
  );
}

function isLowQualityDetailList(items: string[], key: DetailSectionKey): boolean {
  if (items.length === 0) return true;
  if (items.every(isCareerLevelOnlyLine)) return true;
  if (key === "hiringProcess" && !items.some(looksLikeHiringProcessLine)) return true;
  if (items.every((item) => item.length <= 8)) return true;
  return false;
}

function chooseDetailList(
  metadataItems: string[] | undefined,
  extractedItems: string[],
  key: DetailSectionKey
): string[] {
  const metadataList = filterDetailCandidates(metadataItems, key);
  const extractedList = filterDetailCandidates(extractedItems, key);

  if (extractedList.length === 0) return metadataList;
  if (metadataList.length === 0 || isLowQualityDetailList(metadataList, key)) {
    return extractedList;
  }
  if (key !== "mainTasks" && extractedList.length >= metadataList.length) {
    return extractedList;
  }

  return metadataList;
}

function extractSalaryFromLd(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return cleanSalaryValue(value);

  const record = asRecord(value);
  if (!record) return stringifyLdValue(value);

  const currency = stringifyLdValue(record.currency);
  const unitText = stringifyLdValue(record.unitText);
  const salaryValue = asRecord(record.value);

  if (salaryValue) {
    const minValue = stringifyLdValue(salaryValue.minValue);
    const maxValue = stringifyLdValue(salaryValue.maxValue);
    const singleValue = stringifyLdValue(salaryValue.value);
    const range = minValue && maxValue ? `${minValue}~${maxValue}` : singleValue ?? minValue ?? maxValue;
    const salary = [currency, range, unitText].filter(Boolean).join(" ");
    return salary ? cleanSalaryValue(salary) : undefined;
  }

  const salary = stringifyLdValue(value);
  return salary ? cleanSalaryValue(salary) : undefined;
}

function normalizeIsoDate(value: unknown): string | null | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.match(/(20\d{2})-(\d{1,2})-(\d{1,2})/);
  if (!match) return undefined;
  return toDateString(Number(match[1]), Number(match[2]), Number(match[3]));
}

function normalizeDeadlineDateValue(value: unknown): string | null | undefined {
  if (typeof value !== "string") return undefined;

  const iso = normalizeIsoDate(value);
  if (iso !== undefined) return iso;

  const fullDate = extractLastFullDate(value);
  if (fullDate) return fullDate;

  if (value.length <= 80) return extractLastShortDate(value);
  return undefined;
}

function toTimeString(hours: number, minutes: number): string | null {
  if (hours === 24 && minutes === 0) return "23:59";
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function normalizeMeridiemHour(hour: number, meridiem: string | undefined): number {
  const normalized = meridiem?.toLowerCase();
  if (!normalized) return hour;

  if (normalized === "오전" || normalized === "am") {
    return hour === 12 ? 0 : hour;
  }

  if (normalized === "오후" || normalized === "pm") {
    return hour === 12 ? 12 : hour + 12;
  }

  return hour;
}

function toKoreaTimeString(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return toTimeString(Number(valueByType.hour), Number(valueByType.minute));
}

function normalizeDeadlineTimeValue(value: unknown): string | null | undefined {
  if (typeof value !== "string") return undefined;
  if (/자정|밤\s*12\s*시/.test(value)) return "00:00";

  const isoDateTime = value.match(
    /(20\d{2}-\d{1,2}-\d{1,2}T\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/
  );
  if (isoDateTime?.[1]) {
    const isoText = isoDateTime[1].replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
    if (/[zZ]|[+-]\d{2}:\d{2}$/.test(isoText)) {
      return toKoreaTimeString(new Date(isoText)) ?? undefined;
    }

    const localTime = isoText.match(/T(\d{1,2}):(\d{2})/);
    if (localTime) return toTimeString(Number(localTime[1]), Number(localTime[2]));
  }

  const timeMatches = [
    ...value.matchAll(/(?:(오전|오후|AM|PM)\s*)?(\d{1,2})\s*(?::|시(?!간))\s*(\d{1,2})?\s*(?:분)?/gi),
  ];
  for (const match of timeMatches.reverse()) {
    const hour = normalizeMeridiemHour(Number(match[2]), match[1]);
    const minute = match[3] ? Number(match[3]) : 0;
    const time = toTimeString(hour, minute);
    if (time) return time;
  }

  return undefined;
}

function extractJobPostingFromLd(html: string): ParsedJobFields {
  const records = parseLdJsonBlocks(html).flatMap(flattenLd);
  const job = records.find((record) => ldTypeIncludes(record, "JobPosting"));
  if (!job) return {};

  const hiringOrganization = asRecord(job.hiringOrganization);
  const jobLocation = Array.isArray(job.jobLocation)
    ? asRecord(job.jobLocation[0])
    : asRecord(job.jobLocation);
  const address = jobLocation ? stringifyLdValue(jobLocation.address) : undefined;

  const mainTasks = filterDetailCandidates(splitLdListValue(job.responsibilities, 20), "mainTasks");
  const qualifications = filterDetailCandidates(
    [
      ...splitLdListValue(job.qualifications, 20),
      ...splitLdListValue(job.experienceRequirements, 20),
    ],
    "qualifications"
  );

  return {
    companyName: stringifyLdValue(hiringOrganization?.name),
    jobTitle: stringifyLdValue(job.title),
    deadline: normalizeIsoDate(job.validThrough),
    deadlineTime: normalizeDeadlineTimeValue(job.validThrough),
    workplaceAddress: address,
    requiredSpecs: deriveRequiredSpecsFromSections({ qualifications }),
    mainTasks,
    qualifications,
    salary: extractSalaryFromLd(job.baseSalary),
    employmentType: normalizeEmploymentTypeValue(stringifyLdValue(job.employmentType)),
    experienceLevel: normalizeExperienceLevel(stringifyLdValue(job.experienceRequirements)),
  };
}

function extractMetadataFromHtml(html: string): ParsedJobFields {
  const ld = extractJobPostingFromLd(html);
  const title = getMetaContent(html, "og:title") ?? getMetaContent(html, "title") ?? getTitleContent(html);
  const description =
    getMetaContent(html, "og:description") ?? getMetaContent(html, "description");
  const visibleDeadline = extractDeadline([title, description].filter(Boolean).join("\n"));
  const visibleDeadlineTime = extractDeadlineTime([title, description].filter(Boolean).join("\n"));
  const base = {
    ...ld,
    deadline: visibleDeadline ?? ld.deadline,
    deadlineTime: visibleDeadlineTime ?? ld.deadlineTime,
    title,
    description,
  };
  const writer = getMetaContent(html, "writer");
  const isSaraminPage = writer === "사람인" || title?.includes("사람인") || html.includes("m_rec_view");

  return {
    ...base,
    ...(isSaraminPage ? compactParsedFields(extractSaraminFieldsFromHtml(html, base)) : {}),
  };
}

function toDateString(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d.toISOString().split("T")[0];
}

function cleanLine(line: string): string {
  return line
    .replace(/\s+/g, " ")
    .replace(/^[-*ㆍ·•\d.)\s]+/, "")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeFlatText(text: string): string {
  return cleanLine(
    text
      .replace(/\r?\n/g, " ")
      .replace(/[|｜]/g, " | ")
  );
}

function cleanFieldValue(value: string): string {
  const cleaned = cleanLine(value)
    .replace(/^[,:：\-–—|]+/, "")
    .replace(/\s*(상세보기|지도보기|복리후생|홈페이지|기업정보).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned ? cleaned.slice(0, 100) : "미확인";
}

function formatKrwAmount(value: number): string {
  const manwon = Math.round(value / 10000);
  return `${manwon.toLocaleString("ko-KR")}만원`;
}

function formatKrwSalary(value: string): string | undefined {
  const match = value.match(/KRW\s*([\d,]+)(?:\s*[~\-]\s*([\d,]+))?/i);
  if (!match?.[1]) return undefined;

  const min = Number(match[1].replace(/,/g, ""));
  const max = match[2] ? Number(match[2].replace(/,/g, "")) : undefined;
  if (!Number.isFinite(min) || min <= 0) return undefined;
  if (max !== undefined && (!Number.isFinite(max) || max <= 0)) return undefined;

  const range =
    max && max !== min
      ? `${formatKrwAmount(min)}~${formatKrwAmount(max)}`
      : formatKrwAmount(min);

  return `연봉 ${range}`;
}

function cleanSalaryValue(value: string): string {
  const cleaned = decodeHtmlEntities(value)
    .replace(/\s+/g, " ")
    .replace(/^[,:：\-–—|]+/, "")
    .replace(/\s*(?:급여\s*)?근무\s*시간[\s\S]*$/i, "")
    .replace(/\s*주\s*40시간\s*기준\s*최저임금[\s\S]*$/i, "")
    .replace(/\s*최저임금[\s\S]*$/i, "")
    .trim();

  if (/^KRW\s*0(?:\s*[~\-]\s*0)?$/i.test(cleaned)) return "미확인";

  const krwSalary = formatKrwSalary(cleaned);
  if (krwSalary) return krwSalary;

  const salaryMatch = cleaned.match(
    /(연봉|월급|시급|일급)\s*[\d,]+(?:\.\d+)?\s*(?:만\s*)?원?(?:\s*\([^)]+\))?|회사\s*내규에?\s*따름|면접\s*후\s*결정|[\d,]{2,7}\s*만\s*원(?:\s*\([^)]+\))?/i
  );

  return salaryMatch?.[0] ? salaryMatch[0].replace(/\s+/g, " ").trim() : cleaned || "미확인";
}

function normalizeEmploymentTypeValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parts = value
    .split(/[,/|｜]/)
    .map((part) => cleanLine(part))
    .filter(Boolean)
    .map((part) => {
      const compact = part.replace(/[\s_-]/g, "").toUpperCase();
      if (compact === "FULLTIME") return "정규직";
      if (compact === "PARTTIME") return "파트타임";
      if (compact === "CONTRACTOR" || compact === "TEMPORARY") return "계약직";
      if (compact === "INTERN" || compact === "INTERNSHIP") return "인턴";
      if (compact === "FREELANCE") return "프리랜서";
      return part;
    });

  return uniqueStrings(parts, 4).join(", ") || undefined;
}

function trimFieldAtStopLabels(value: string, ignoredLabels: string[] = []): string {
  let cleaned = cleanLine(value);

  for (const stopLabel of FIELD_STOP_LABELS.filter((label) => !ignoredLabels.includes(label))) {
    const pattern = new RegExp(`(?:^|\\s)${escapeRegExp(stopLabel)}\\s*[:：]?`, "i");
    const match = cleaned.match(pattern);
    if (match?.index && match.index > 0) {
      cleaned = cleaned.slice(0, match.index);
      break;
    }
  }

  return cleanFieldValue(cleaned);
}

function stripJobBoardSuffix(value: string): string {
  return cleanLine(value)
    .replace(/\s*[-|｜]\s*(사람인|잡코리아|원티드|점핏|인크루트|LinkedIn|링크드인).*$/i, "")
    .replace(/\s+(채용정보|기업정보)\s*[-|｜]\s*(사람인|잡코리아).*$/i, "")
    .trim();
}

function extractCompanyFromTitle(title: string | undefined): string | undefined {
  if (!title) return undefined;
  const cleaned = stripJobBoardSuffix(title);
  const bracketCompany = cleaned.match(/^\[([^\]]{2,40})\]/);
  if (bracketCompany?.[1]) return cleanLine(bracketCompany[1]);

  const hiringMatch = cleaned.match(/^(.{2,40}?)\s+(?:채용|공채|모집)\b/);
  if (hiringMatch?.[1] && !isJobBoardName(hiringMatch[1])) {
    return cleanLine(hiringMatch[1]);
  }

  return undefined;
}

function extractJobTitleFromMetadata(metadata: ParsedJobFields): string | undefined {
  if (!metadata.title) return undefined;
  const withoutBoard = stripJobBoardSuffix(metadata.title)
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/^.{2,40}?\s+(?:채용|공채)\s*[-–—:]?\s*/, "")
    .trim();

  if (!withoutBoard || isJobBoardName(withoutBoard)) return undefined;
  return cleanLine(withoutBoard).slice(0, 80);
}

function cleanJobTitleCandidate(value: string): string {
  return stripJobBoardSuffix(value)
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/^.{2,40}?\s+(?:채용|공채)\s*[-–—:]\s*/, "")
    .replace(/\s+채용$/, "")
    .trim();
}

function removeCompanyPrefixFromTitle(title: string, companyName: string | undefined): string {
  if (!companyName) return title;
  return title.replace(new RegExp(`^${escapeRegExp(companyName)}\\s*`), "").trim() || title;
}

const FIELD_STOP_LABELS = [
  "경력",
  "학력",
  "급여",
  "연봉",
  "월급",
  "근무형태",
  "고용형태",
  "채용형태",
  "근무지역",
  "근무지",
  "주소",
  "지역",
  "직급",
  "직책",
  "담당업무",
  "자격요건",
  "지원자격",
  "우대사항",
  "복리후생",
  "마감일",
  "접수기간",
  "기업정보",
  "회사소개",
];

function extractLabeledValueFromText(
  text: string,
  labels: string[],
  stopLabels: string[] = FIELD_STOP_LABELS
): string {
  const flat = normalizeFlatText(text);

  for (const label of [...labels].sort((a, b) => b.length - a.length)) {
    const stopPattern = stopLabels
      .filter((stopLabel) => !labels.includes(stopLabel))
      .map(escapeRegExp)
      .join("|");
    const pattern = new RegExp(
      `${escapeRegExp(label)}\\s*[:：]?\\s*(.{1,180}?)(?=\\s*(?:${stopPattern})\\s*[:：]?|$)`,
      "i"
    );
    const match = flat.match(pattern);
    if (!match?.[1]) continue;

    const value = trimFieldAtStopLabels(match[1], labels);
    if (value !== "미확인" && !labels.includes(value)) return value;
  }

  return "미확인";
}

function getUsefulLines(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((line) => line.length >= 2 && line.length <= 120)
    .filter((line) => {
      const normalized = line.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return ![
        "로그인",
        "회원가입",
        "검색",
        "공유",
        "지원하기",
        "스크랩",
        "이전",
        "다음",
      ].includes(line);
    });
}

function extractLastFullDate(text: string): string | null {
  const fullDates = [
    ...text.matchAll(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/g),
  ];
  if (fullDates.length === 0) return null;

  const last = fullDates[fullDates.length - 1];
  return toDateString(Number(last[1]), Number(last[2]), Number(last[3]));
}

function getKoreaYear(): number {
  const year = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
  }).format(new Date());

  return Number(year);
}

function extractLastShortDate(text: string): string | null {
  const shortDates = [
    ...text.matchAll(/(?:^|[^\d])(\d{1,2})\s*[./월]\s*(\d{1,2})(?!\d)/g),
  ];
  if (shortDates.length === 0) return null;

  const last = shortDates[shortDates.length - 1];
  return toDateString(getKoreaYear(), Number(last[1]), Number(last[2]));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toKoreaDateString(date: Date): string | null {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return toDateString(
    Number(valueByType.year),
    Number(valueByType.month),
    Number(valueByType.day)
  );
}

function extractRelativeDeadline(text: string): string | null {
  const compact = text.replace(/\s+/g, "");

  if (/오늘마감|D-?Day/i.test(compact)) return toKoreaDateString(new Date());
  if (/내일마감/.test(compact)) return toKoreaDateString(addDays(new Date(), 1));

  const dDay = compact.match(/D-?(\d{1,3})/i);
  if (dDay) return toKoreaDateString(addDays(new Date(), Number(dDay[1])));

  const remaining =
    text.match(/남은\s*기간\s*(\d{1,3})\s*일/) ??
    text.match(/(\d{1,3})\s*일\s*(?:남음|남았습니다)/);
  if (remaining?.[1]) return toKoreaDateString(addDays(new Date(), Number(remaining[1])));

  return null;
}

function getSegmentsAfterLabel(line: string, pattern: RegExp): string[] {
  const matches = [...line.matchAll(pattern)];

  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? line.length;
    return line.slice(start, end).trim();
  });
}

function getSegmentsAfterLabelWithFollowingLines(
  lines: string[],
  index: number,
  pattern: RegExp,
  followingLineCount = 4
): string[] {
  const currentLine = lines[index] ?? "";
  const nextLines = lines.slice(index + 1, index + 1 + followingLineCount).join(" ");

  return getSegmentsAfterLabel([currentLine, nextLines].filter(Boolean).join(" "), pattern);
}

function extractDeadlineFromSegment(segment: string): string | null {
  const candidate = segment.slice(0, 160);
  const date =
    extractLastFullDate(candidate) ??
    extractLastShortDate(candidate) ??
    extractRelativeDeadline(candidate);

  if (date) return date;
  if (isOngoingDeadline(candidate)) return ONGOING_DEADLINE_LABEL;
  return null;
}

function extractDeadline(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const deadlineSegments = getSegmentsAfterLabelWithFollowingLines(
      lines,
      lineIndex,
      /(?:마감일(?!\s*은)|접수\s*마감(?:일)?|지원\s*마감(?:일)?|지원마감(?:일)?)\s*[:：]?/gi
    ).reverse();
    for (const segment of deadlineSegments) {
      const deadline = extractDeadlineFromSegment(segment);
      if (deadline) return deadline;
    }
  }

  for (const line of lines) {
    const validThroughSegments = getSegmentsAfterLabel(line, /validThrough\s*[:：]?/gi);
    for (const segment of validThroughSegments) {
      const deadline = normalizeDeadlineDateValue(segment);
      if (deadline) return deadline;
    }
  }

  for (const line of lines) {
    const rangeSegments = getSegmentsAfterLabel(
      line,
      /(?:접수\s*기간|접수기간|지원\s*기간|지원기간)\s*[:：]?/gi
    );
    for (const segment of rangeSegments) {
      if (!/[~～]|부터|까지/.test(segment)) continue;
      const deadline = extractDeadlineFromSegment(segment);
      if (deadline) return deadline;
    }
  }

  return null;
}

function extractDeadlineTimeFromSegment(segment: string): string | null {
  const candidate = segment.slice(0, 160);
  return normalizeDeadlineTimeValue(candidate) ?? null;
}

function extractDeadlineTime(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const deadlineSegments = getSegmentsAfterLabelWithFollowingLines(
      lines,
      lineIndex,
      /(?:마감일(?!\s*은)|접수\s*마감(?:일)?|지원\s*마감(?:일)?|지원마감(?:일)?)\s*[:：]?/gi
    ).reverse();
    for (const segment of deadlineSegments) {
      const deadlineTime = extractDeadlineTimeFromSegment(segment);
      if (deadlineTime) return deadlineTime;
    }
  }

  for (const line of lines) {
    const validThroughSegments = getSegmentsAfterLabel(line, /validThrough\s*[:：]?/gi);
    for (const segment of validThroughSegments) {
      const deadlineTime = normalizeDeadlineTimeValue(segment);
      if (deadlineTime) return deadlineTime;
    }
  }

  for (const line of lines) {
    const rangeSegments = getSegmentsAfterLabel(
      line,
      /(?:접수\s*기간|접수기간|지원\s*기간|지원기간)\s*[:：]?/gi
    );
    for (const segment of rangeSegments) {
      if (!/[~～]|부터|까지/.test(segment)) continue;
      const deadlineTime = extractDeadlineTimeFromSegment(segment);
      if (deadlineTime) return deadlineTime;
    }
  }

  return null;
}

function extractCompanyName(lines: string[], metadata: ParsedJobFields): string {
  if (metadata.companyName) return metadata.companyName;

  const titleCompany = extractCompanyFromTitle(metadata.title);
  if (titleCompany) return titleCompany.slice(0, 40);

  const bracketLine = lines.find((line) => /^\[[^\]]{2,40}\]/.test(line));
  const bracketCompany = bracketLine?.match(/^\[([^\]]{2,40})\]/)?.[1];
  if (bracketCompany) return cleanLine(bracketCompany).slice(0, 40);

  const companyPattern = /(?:회사명|기업명)\s*[:：]?\s*(.+)/;
  for (const line of lines) {
    const match = line.match(companyPattern);
    if (match?.[1]) return cleanLine(match[1]).slice(0, 40);
  }

  const companyLike = lines.find((line) =>
    /(주식회사|\(주\)|㈜|유한회사|Inc\.|Corporation|Corp\.)/.test(line)
  );
  if (companyLike) return companyLike.slice(0, 40);

  return "미확인";
}

function extractJobTitle(lines: string[], metadata: ParsedJobFields): string {
  if (metadata.jobTitle) return metadata.jobTitle;

  const metadataTitle = extractJobTitleFromMetadata(metadata);
  if (metadataTitle) return metadataTitle.slice(0, 60);

  const titlePattern = /(?:직무|포지션|모집부문|채용공고|공고명)\s*[:：]?\s*(.+)/;
  for (const line of lines) {
    const match = line.match(titlePattern);
    if (match?.[1]) return cleanJobTitleCandidate(match[1]).slice(0, 60);
  }

  const titleLike = lines.find((line) =>
    /(개발자|엔지니어|프론트엔드|백엔드|풀스택|데이터|AI|ML|머신러닝|인턴|신입|경력|채용)/i.test(line)
  );

  if (titleLike) return cleanJobTitleCandidate(titleLike).slice(0, 60);
  return "미확인";
}

function extractWorkplaceAddress(lines: string[], metadata: ParsedJobFields, text: string): string {
  if (metadata.workplaceAddress) return metadata.workplaceAddress;

  const addressPattern = /(?:근무지주소|근무지역|근무지|주소|위치)\s*[:：]?\s*(.+)/;
  for (const line of lines) {
    const match = line.match(addressPattern);
    if (match?.[1]) return cleanLine(match[1]).slice(0, 80);
  }

  const labeled = extractLabeledValueFromText(text, ["근무지", "근무지역", "근무지주소", "주소", "지역"]);
  if (labeled !== "미확인") return labeled.slice(0, 80);

  const addressLike = lines.find((line) =>
    /(서울|경기|인천|부산|대전|대구|광주|울산|세종|제주|강원|충청|전라|경상).*(시|도|구|군|로|길)/.test(line)
  );

  return addressLike ? addressLike.slice(0, 80) : "미확인";
}

function extractLabeledValue(lines: string[], labels: string[], text?: string): string {
  const labelPattern = [...labels]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
  const pattern = new RegExp(`(?:${labelPattern})\\s*[:：]?\\s*(.+)`);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.match(pattern);
    if (match?.[1]) return trimFieldAtStopLabels(match[1], labels).slice(0, 80);

    if (labels.some((label) => line === label) && lines[i + 1]) {
      return trimFieldAtStopLabels(lines[i + 1], labels).slice(0, 80);
    }
  }

  if (text) return extractLabeledValueFromText(text, labels);
  return "미확인";
}

function normalizeExperienceLevel(
  value: string | undefined
): "신입" | "경력" | "신입/경력" | "경력무관" | "미확인" {
  if (!value) return "미확인";
  const compact = value.replace(/\s+/g, "");

  if (/신입(?:불가|제외)/.test(compact)) return "경력";
  if (/경력직/.test(compact) && !/신입/.test(compact)) return "경력";
  if (/경력무관|무관/i.test(compact)) return "경력무관";
  if (/신입[\/·,및&+~-]?경력|경력[\/·,및&+~-]?신입|신입.*경력|경력.*신입/.test(compact)) {
    return "신입/경력";
  }
  if (/신입/.test(compact)) return "신입";
  if (/경력/.test(compact) || /\d+\s*년\s*이상/.test(value)) return "경력";

  return "미확인";
}

function extractExperienceLevel(lines: string[], metadata: ParsedJobFields, text: string) {
  if (metadata.experienceLevel) return metadata.experienceLevel;

  const labeled = extractLabeledValue(lines, ["경력", "경력구분", "지원자격"], text);
  const normalizedLabeled = normalizeExperienceLevel(labeled);
  if (normalizedLabeled !== "미확인") return normalizedLabeled;

  const focusedLines = lines.filter((line) => /(경력|신입|자격요건|지원자격|경험)/.test(line));
  const focusedText = focusedLines.join(" ");
  const normalizedFocused = normalizeExperienceLevel(focusedText);
  if (normalizedFocused !== "미확인") return normalizedFocused;

  return normalizeExperienceLevel(lines.join(" "));
}

function extractSalary(lines: string[], metadata: ParsedJobFields, text: string): string {
  if (metadata.salary) return metadata.salary;

  const flat = normalizeFlatText(text);
  const flatMatch = flat.match(
    /(회사\s*내규에?\s*따름|면접\s*후\s*결정|(연봉|월급|시급|일급)\s*[\d,]+(?:\.\d+)?\s*(?:만\s*)?원?(?:\s*\([^)]+\))?(?:\s*~\s*[\d,]+(?:\.\d+)?\s*(?:만\s*)?원?)?|[\d,]{2,7}\s*만\s*원|\d[,.\d]*\s*원)/
  );
  if (flatMatch?.[1]) return cleanSalaryValue(flatMatch[1]);

  const labeled = extractLabeledValue(lines, ["급여", "연봉", "월급", "보수", "임금"], text);
  if (labeled !== "미확인") return cleanSalaryValue(labeled);

  const salaryLike = lines.find((line) =>
    /(회사\s*내규|면접\s*후\s*결정|\d{2,4}\s*만\s*원|\d[,.\d]*\s*원|연봉|월급|급여)/.test(line)
  );

  return salaryLike ? cleanSalaryValue(salaryLike.slice(0, 120)) : "미확인";
}

function extractEmploymentType(lines: string[], metadata: ParsedJobFields, text: string): string {
  const labeled = extractLabeledValue(lines, ["근무형태", "고용형태", "채용형태"], text);
  if (labeled !== "미확인") return normalizeEmploymentTypeValue(labeled) ?? labeled;

  const metadataEmploymentType = normalizeEmploymentTypeValue(metadata.employmentType);
  if (metadataEmploymentType) return metadataEmploymentType;

  const flatMatches = normalizeFlatText(text).match(/정규직|계약직|인턴|파견|프리랜서|아르바이트|병역특례|전환형/g);
  if (flatMatches?.length) {
    return Array.from(new Set(flatMatches)).slice(0, 3).join(", ");
  }

  const typeLike = lines.find((line) =>
    /(정규직|계약직|인턴|파견|프리랜서|아르바이트|병역특례|전환형)/.test(line)
  );

  return typeLike ? typeLike.slice(0, 80) : "미확인";
}

function extractRequiredSpecs(lines: string[], metadata: ParsedJobFields): string[] {
  if (metadata.requiredSpecs && metadata.requiredSpecs.length > 0) {
    return metadata.requiredSpecs;
  }

  const keywords =
    /(Python|SQL|OpenCV|YOLO|ROS2?|MQTT|Azure|IoT|센서|로그|데이터|이상탐지|비전|머신비전|영상처리|검증|QA|SQA|성능평가|장비|설비|제조|공정|품질|스마트팩토리|React|Next\.?js|TypeScript|JavaScript|Java|Spring|Node\.?js|AWS|Docker|Kubernetes|Git|Figma|경력|신입|자격요건|우대사항|필수|경험|역량|년 이상)/i;

  return lines
    .filter((line) => keywords.test(line))
    .filter((line) => line.length >= 5)
    .filter((line) => !/^(회사명|기업명|직무|포지션|공고명|마감일|접수기간|근무지|근무지역|주소|급여|연봉|월급|보수|임금|근무형태|고용형태|채용형태|경력)\s*[:：]/.test(line))
    .filter((line) => !/^(경력|신입|학력|우대사항|자격요건|지원자격|채용정보|기업정보|상세요강)$/.test(line))
    .filter((line) => !/^\[[^\]]+\].*채용|채용\s*공고|채용$/.test(line))
    .filter((line) => !/^(자격요건|지원자격|담당업무|우대사항)$/.test(line.replace(/[^\w가-힣]/g, "")))
    .filter((line) => !/사람인$|,\s*경력\s*:|마감일\s*:|홈페이지\s*:/.test(line))
    .filter((line) => !/(학력|급여|근무형태|근무지역).*(급여|근무형태|근무지역)/.test(line))
    .filter((line) => !/(로그인|회원가입|개인정보|이용약관|최저임금|무단 복사|게재를 금합니다)/.test(line))
    .map((line) => line.slice(0, 80))
    .slice(0, 8);
}

async function getFallbackParseResult(
  text: string,
  sourceUrl: string | undefined,
  metadata: ParsedJobFields
): Promise<ParseJobResponse> {
  const combinedText = [metadata.title, metadata.description, text]
    .filter(Boolean)
    .join("\n");
  const lines = getUsefulLines(combinedText);
  const detailSections = extractDetailSectionsFromText(combinedText);
  const mainTasks = chooseDetailList(metadata.mainTasks, detailSections.mainTasks, "mainTasks");
  const qualifications = chooseDetailList(
    metadata.qualifications,
    detailSections.qualifications,
    "qualifications"
  );
  const preferredQualifications = chooseDetailList(
    metadata.preferredQualifications,
    detailSections.preferredQualifications,
    "preferredQualifications"
  );
  const hiringProcess = chooseDetailList(
    metadata.hiringProcess,
    detailSections.hiringProcess,
    "hiringProcess"
  );
  const positionDetails = uniquePositionDetails(metadata.positionDetails ?? [], 8);
  const fallbackSpecs = extractRequiredSpecs(lines, metadata);
  const extractedDeadline = extractDeadline(combinedText);
  const deadline = metadata.deadline ?? extractedDeadline;
  const extractedDeadlineTime = extractDeadlineTime(combinedText);
  const deadlineTime =
    deadline && !isOngoingDeadline(deadline)
      ? metadata.deadlineTime ?? extractedDeadlineTime ?? null
      : null;

  return refineParseResultWorkplace({
    companyName: extractCompanyName(lines, metadata),
    jobTitle: extractJobTitle(lines, metadata),
    deadline,
    deadlineTime,
    workplaceAddress: extractWorkplaceAddress(lines, metadata, combinedText),
    requiredSpecs: deriveRequiredSpecsFromSections(
      { qualifications, preferredQualifications },
      fallbackSpecs
    ),
    positionDetails,
    mainTasks,
    qualifications,
    preferredQualifications,
    hiringProcess,
    salary: extractSalary(lines, metadata, combinedText),
    employmentType: extractEmploymentType(lines, metadata, combinedText),
    experienceLevel: extractExperienceLevel(lines, metadata, combinedText),
    rawText: text,
    sourceUrl,
    sourceType: sourceUrl ? "url" : "text",
    parserMode: "fallback",
    parserVersion: CURRENT_JOB_PARSER_VERSION,
  });
}

function hasValue(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value.trim() !== "미확인";
}

function isJobBoardName(value: string): boolean {
  return JOB_BOARD_NAMES.some((name) => value.toLowerCase().includes(name.toLowerCase()));
}

function chooseField(value: unknown, fallback: string): string {
  if (!hasValue(value)) return fallback;
  const cleaned = cleanLine(value);
  if (isJobBoardName(cleaned) && fallback !== "미확인") return fallback;
  return cleaned;
}

function chooseDeadline(value: unknown, fallback: string | null): string | null {
  if (isOngoingDeadline(fallback)) return ONGOING_DEADLINE_LABEL;
  if (typeof value !== "string") return fallback;
  const normalized =
    normalizeDeadlineDateValue(value) ??
    extractDeadline(value) ??
    (isOngoingDeadline(value) && !fallback ? ONGOING_DEADLINE_LABEL : null);
  return normalized ?? fallback;
}

function chooseDeadlineTime(
  value: unknown,
  fallback: string | null | undefined,
  deadline: string | null
): string | null {
  if (!deadline || isOngoingDeadline(deadline)) return null;
  if (typeof value !== "string") return fallback ?? null;

  const normalized = normalizeDeadlineTimeValue(value) ?? extractDeadlineTime(value);
  return normalized ?? fallback ?? null;
}

function chooseSpecs(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const specs = value
    .filter((item): item is string => typeof item === "string")
    .map(cleanLine)
    .filter(Boolean)
    .slice(0, 8);

  return specs.length > 0 ? specs : fallback;
}

function chooseStringList(primary: unknown, fallback: unknown, max: number): string[] {
  const normalize = (value: unknown) =>
    Array.isArray(value)
      ? uniqueStrings(
          value
            .filter((item): item is string => typeof item === "string")
            .map(cleanSectionLine)
            .filter(Boolean),
          max
        )
      : [];

  const primaryList = normalize(primary);
  if (primaryList.length > 0) return primaryList;
  return normalize(fallback);
}

function choosePositionDetails(primary: unknown, fallback: unknown): JobPositionDetail[] {
  const normalize = (value: unknown): JobPositionDetail[] => {
    if (!Array.isArray(value)) return [];

    return uniquePositionDetails(
      value
        .map(asRecord)
        .filter((item): item is Record<string, unknown> => Boolean(item))
        .map((item) => ({
          title: typeof item.title === "string" ? item.title : "",
          headcount: typeof item.headcount === "string" ? item.headcount : undefined,
          mainTasks: Array.isArray(item.mainTasks)
            ? item.mainTasks.filter((task): task is string => typeof task === "string")
            : [],
          qualifications: Array.isArray(item.qualifications)
            ? item.qualifications.filter((qualification): qualification is string => typeof qualification === "string")
            : [],
          preferredQualifications: Array.isArray(item.preferredQualifications)
            ? item.preferredQualifications.filter((qualification): qualification is string => typeof qualification === "string")
            : [],
        })),
      8
    );
  };

  const primaryList = normalize(primary);
  if (primaryList.length > 0) return primaryList;
  return normalize(fallback);
}

function chooseExperienceLevel(
  value: unknown,
  fallback: "신입" | "경력" | "신입/경력" | "경력무관" | "미확인" | undefined
) {
  const normalized = normalizeExperienceLevel(typeof value === "string" ? value : undefined);
  return normalized !== "미확인" ? normalized : fallback ?? "미확인";
}

function chooseTrustedField(trusted: boolean, value: unknown, fallback: string): string {
  if (trusted && hasValue(fallback)) return fallback;
  return chooseField(value, fallback);
}

function chooseTrustedDeadline(
  trusted: boolean,
  value: unknown,
  fallback: string | null
): string | null {
  if (trusted) return fallback;
  return chooseDeadline(value, fallback);
}

function chooseTrustedDeadlineTime(
  trusted: boolean,
  value: unknown,
  fallback: string | null | undefined,
  deadline: string | null
): string | null {
  if (!deadline || isOngoingDeadline(deadline)) return null;
  if (trusted) return fallback ?? null;
  return chooseDeadlineTime(value, fallback, deadline);
}

function chooseTrustedExperienceLevel(
  trusted: boolean,
  value: unknown,
  fallback: "신입" | "경력" | "신입/경력" | "경력무관" | "미확인" | undefined
) {
  if (trusted && fallback && fallback !== "미확인") return fallback;
  return chooseExperienceLevel(value, fallback);
}

export async function POST(req: NextRequest) {
  try {
    const body: ParseJobRequest = await req.json();
    const { text, url } = body;

    if (!text?.trim() && !url?.trim()) {
      return NextResponse.json(
        { error: "공고 URL을 입력해주세요." },
        { status: 400 }
      );
    }

    // URL이 입력된 경우 서버에서 직접 페이지 내용을 가져옴
    let inputText = text ?? "";
    let normalizedUrl: string | undefined;
    let metadata: ParsedJobFields = {};
    if (url?.trim()) {
      try {
        normalizedUrl = normalizeUrl(url);
        const fetched = await fetchJobTextFromUrl(normalizedUrl);
        inputText = fetched.text;
        metadata = fetched.metadata;
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : "URL 내용을 가져오지 못했습니다.";
        // 원티드, 링크드인처럼 JS 렌더링에 의존하거나 크롤링 차단 사이트 안내
        return NextResponse.json(
          {
            error: `${msg}\n\n해당 사이트는 URL 자동 추출이 제한될 수 있습니다. 공고 URL이 맞는지 다시 확인해 주세요.`,
          },
          { status: 422 }
        );
      }

      if (inputText.length < 100) {
        return NextResponse.json(
          {
            error:
              "페이지에서 충분한 텍스트를 추출하지 못했습니다. 일부 사이트는 JavaScript 렌더링이나 접근 제한 때문에 직접 파싱이 어려울 수 있습니다.",
          },
          { status: 422 }
        );
      }
    }

    const fallback = await getFallbackParseResult(inputText, normalizedUrl, metadata);

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(fallback);
    }

    try {
      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `${PARSE_PROMPT}\n\n구조화 힌트:\n${JSON.stringify(metadata, null, 2)}\n\n채용 공고 내용:\n${inputText.slice(0, 12000)}`,
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
      const parsed = JSON.parse(jsonStr.trim()) as ParseJobResponse;
      const mainTasks = chooseStringList(fallback.mainTasks, parsed.mainTasks, 20);
      const qualifications = chooseStringList(fallback.qualifications, parsed.qualifications, 20);
      const preferredQualifications = chooseStringList(
        fallback.preferredQualifications,
        parsed.preferredQualifications,
        16
      );
      const hiringProcess = chooseStringList(fallback.hiringProcess, parsed.hiringProcess, 12);
      const positionDetails = choosePositionDetails(fallback.positionDetails, parsed.positionDetails);
      const requiredSpecs = deriveRequiredSpecsFromSections(
        { qualifications, preferredQualifications },
        chooseSpecs(parsed.requiredSpecs, fallback.requiredSpecs)
      );
      const hasTrustedSaraminApi = Boolean(metadata.saraminApiUsed);
      const deadline = chooseTrustedDeadline(hasTrustedSaraminApi, parsed.deadline, fallback.deadline);

      const result = await refineParseResultWorkplace({
        companyName: chooseTrustedField(hasTrustedSaraminApi, parsed.companyName, fallback.companyName),
        jobTitle: chooseTrustedField(hasTrustedSaraminApi, parsed.jobTitle, fallback.jobTitle),
        deadline,
        deadlineTime: chooseTrustedDeadlineTime(
          hasTrustedSaraminApi,
          parsed.deadlineTime,
          fallback.deadlineTime,
          deadline
        ),
        workplaceAddress: chooseTrustedField(
          hasTrustedSaraminApi,
          parsed.workplaceAddress,
          fallback.workplaceAddress
        ),
        requiredSpecs,
        positionDetails,
        mainTasks,
        qualifications,
        preferredQualifications,
        hiringProcess,
        salary: cleanSalaryValue(
          chooseTrustedField(hasTrustedSaraminApi, parsed.salary, fallback.salary ?? "미확인")
        ),
        employmentType:
          normalizeEmploymentTypeValue(
            chooseTrustedField(
              hasTrustedSaraminApi,
              parsed.employmentType,
              fallback.employmentType ?? "미확인"
            )
          ) ?? "미확인",
        experienceLevel: chooseTrustedExperienceLevel(
          hasTrustedSaraminApi,
          parsed.experienceLevel,
          fallback.experienceLevel
        ),
        rawText: inputText,
        sourceUrl: normalizedUrl,
        sourceType: normalizedUrl ? "url" : "text",
        parserMode: "ai",
        parserVersion: CURRENT_JOB_PARSER_VERSION,
      });

      return NextResponse.json(result);
    } catch (error) {
      console.warn(
        "AI parse fallback:",
        error instanceof Error ? error.message : "unknown error"
      );
      return NextResponse.json(fallback);
    }
  } catch (error) {
    console.error("parse-job error:", error);
    return NextResponse.json(
      { error: "공고 파싱 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
