import type { JobCategory, JobPrimaryCategory, JobPosting } from "@/types";

export const JOB_CATEGORY_LIST: JobCategory[] = ["Data", "Sensor", "Vision", "Robot"];

export const JOB_CATEGORY_CONFIG: Record<
  JobCategory,
  { label: JobCategory; bg: string; text: string; border: string; active: string }
> = {
  Data: {
    label: "Data",
    bg: "bg-sky-50",
    text: "text-sky-700",
    border: "border-sky-100",
    active: "border-sky-200 bg-sky-50 text-sky-700 ring-sky-200",
  },
  Sensor: {
    label: "Sensor",
    bg: "bg-teal-50",
    text: "text-teal-700",
    border: "border-teal-100",
    active: "border-teal-200 bg-teal-50 text-teal-700 ring-teal-200",
  },
  Vision: {
    label: "Vision",
    bg: "bg-fuchsia-50",
    text: "text-fuchsia-700",
    border: "border-fuchsia-100",
    active: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
  },
  Robot: {
    label: "Robot",
    bg: "bg-lime-50",
    text: "text-lime-700",
    border: "border-lime-100",
    active: "border-lime-200 bg-lime-50 text-lime-700 ring-lime-200",
  },
};

function isJobCategory(value: unknown): value is JobCategory {
  return typeof value === "string" && (JOB_CATEGORY_LIST as string[]).includes(value);
}

export function normalizeJobCategories(categories?: unknown[]): JobCategory[] {
  const seen = new Set<JobCategory>();
  return (categories ?? []).filter(isJobCategory).filter((category) => {
    if (seen.has(category)) return false;
    seen.add(category);
    return true;
  });
}

export function getPrimaryJobCategory(categories?: unknown[]): JobPrimaryCategory {
  return normalizeJobCategories(categories)[0] ?? "Unclassified";
}

export function withManualJobCategories<T extends JobPosting>(job: T): T {
  const isManual = job.categorySource === "manual";
  const jobCategories = isManual ? normalizeJobCategories(job.jobCategories) : [];
  return {
    ...job,
    jobCategories,
    primaryCategory: getPrimaryJobCategory(jobCategories),
    categorySource: isManual ? "manual" : undefined,
  };
}
