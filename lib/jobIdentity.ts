import type { JobPosting } from "@/types";

type JobIdentityCandidate = Partial<
  Pick<JobPosting, "companyName" | "jobTitle" | "deadline" | "rawText" | "sourceUrl">
>;

const TRACKING_PARAM_PATTERNS = [
  /^utm_/i,
  /^t_ref/i,
  /^recommend/i,
  /^relay/i,
  /^refer/i,
  /^search/i,
  /^immediately_/i,
  /^paid_/i,
  /^isMypage$/i,
  /^view_type$/i,
  /^gz$/i,
  /^logpath$/i,
  /^listno$/i,
  /^stext$/i,
  /^sc$/i,
  /^Oem_Code$/i,
];

function extractUrl(value: string | null | undefined): string | null {
  if (!value) return null;

  const markdownUrl = value.match(/\((https?:\/\/[^)\s]+)\)/i)?.[1];
  if (markdownUrl) return markdownUrl;

  const plainUrl = value.match(/https?:\/\/[^\s)]+/i)?.[0];
  return plainUrl ?? value.trim();
}

function parseUrl(value: string | null | undefined): URL | null {
  const extracted = extractUrl(value);
  if (!extracted) return null;

  try {
    const withProtocol = /^https?:\/\//i.test(extracted) ? extracted : `https://${extracted}`;
    return new URL(withProtocol);
  } catch {
    return null;
  }
}

function getSearchValue(url: URL, names: string[]): string | null {
  for (const name of names) {
    const value = url.searchParams.get(name);
    if (value && /^\d+$/.test(value)) return value;
  }
  return null;
}

function getPathNumber(url: URL, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = url.pathname.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function getHost(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

export function getJobUrlIdentity(value: string | null | undefined): string | null {
  const url = parseUrl(value);
  if (!url) return null;

  const host = getHost(url);

  if (host.endsWith("saramin.co.kr")) {
    const recIdx =
      getSearchValue(url, ["rec_idx", "id"]) ??
      getPathNumber(url, [/(?:rec_idx|jobs?|view)[/_-]?(\d{6,})/i]);
    if (recIdx) return `saramin:${recIdx}`;
  }

  if (host.endsWith("jobkorea.co.kr")) {
    const jobId =
      getPathNumber(url, [/\/GI_Read\/(\d+)/i, /\/Recruit\/.*?(\d{6,})/i]) ??
      getSearchValue(url, ["GI_No", "gi_no", "recruitNo"]);
    if (jobId) return `jobkorea:${jobId}`;
  }

  if (host.endsWith("wanted.co.kr")) {
    const wantedId = getPathNumber(url, [/\/wd\/(\d+)/i]);
    if (wantedId) return `wanted:${wantedId}`;
  }

  if (host.endsWith("jumpit.co.kr")) {
    const jumpitId = getPathNumber(url, [/\/position\/(\d+)/i, /\/jobs\/(\d+)/i]);
    if (jumpitId) return `jumpit:${jumpitId}`;
  }

  const normalized = new URL(url.toString());
  normalized.hash = "";
  normalized.hostname = host;

  for (const key of Array.from(normalized.searchParams.keys())) {
    if (TRACKING_PARAM_PATTERNS.some((pattern) => pattern.test(key))) {
      normalized.searchParams.delete(key);
    }
  }

  const params = Array.from(normalized.searchParams.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  normalized.search = "";
  for (const [key, valueParam] of params) {
    normalized.searchParams.append(key, valueParam);
  }

  const pathname = normalized.pathname.replace(/\/+$/, "") || "/";
  return `url:${host}${pathname}${normalized.search}`;
}

function normalizeTextField(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
  return normalized === "미확인" ? "" : normalized;
}

function getJobTextIdentity(candidate: JobIdentityCandidate): string | null {
  const companyName = normalizeTextField(candidate.companyName);
  const jobTitle = normalizeTextField(candidate.jobTitle);
  const deadline = normalizeTextField(candidate.deadline);
  if (!companyName || !jobTitle || !deadline) return null;

  return `text:${companyName}|${jobTitle}|${deadline}`;
}

export function getJobIdentities(candidate: JobIdentityCandidate): string[] {
  const identities = new Set<string>();
  const sourceUrl = candidate.sourceUrl ?? extractUrl(candidate.rawText);
  const urlIdentity = getJobUrlIdentity(sourceUrl);
  const textIdentity = getJobTextIdentity(candidate);

  if (urlIdentity) identities.add(urlIdentity);
  if (textIdentity) identities.add(textIdentity);

  return Array.from(identities);
}

export function findDuplicateJob(
  jobs: JobPosting[],
  candidate: JobIdentityCandidate
): JobPosting | null {
  const candidateIdentities = new Set(getJobIdentities(candidate));
  if (candidateIdentities.size === 0) return null;

  return (
    jobs.find((job) =>
      getJobIdentities(job).some((identity) => candidateIdentities.has(identity))
    ) ?? null
  );
}
