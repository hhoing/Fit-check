export const ONGOING_DEADLINE_LABEL = "상시채용";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ONGOING_DEADLINE_PATTERN = /상시\s*채용|상시|채용\s*시|수시\s*채용|수시/i;

export function isOngoingDeadline(value: string | null | undefined): boolean {
  return typeof value === "string" && ONGOING_DEADLINE_PATTERN.test(value);
}

export function parseDeadlineDate(value: string | null | undefined): Date | null {
  if (!value || !ISO_DATE_PATTERN.test(value)) return null;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function getDeadlineSortTime(value: string | null | undefined): number {
  return parseDeadlineDate(value)?.getTime() ?? Number.POSITIVE_INFINITY;
}

export function isDeadlineExpired(
  value: string | null | undefined,
  today: Date = new Date()
): boolean {
  const deadline = parseDeadlineDate(value);
  if (!deadline) return false;

  const normalizedToday = new Date(today);
  normalizedToday.setHours(0, 0, 0, 0);
  deadline.setHours(0, 0, 0, 0);

  return deadline < normalizedToday;
}

export function formatDeadlineShort(value: string | null | undefined): string {
  if (!value) return "미정";
  if (isOngoingDeadline(value)) return ONGOING_DEADLINE_LABEL;

  const date = parseDeadlineDate(value);
  if (!date) return value;

  return date.toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
}

export function formatDeadlineLong(value: string | null | undefined): string {
  if (!value) return "마감일 미정";
  if (isOngoingDeadline(value)) return ONGOING_DEADLINE_LABEL;

  const date = parseDeadlineDate(value);
  if (!date) return value;

  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function getDeadlineBadge(value: string | null | undefined): {
  label: string;
  urgent: boolean;
} {
  if (!value) return { label: "미정", urgent: false };
  if (isOngoingDeadline(value)) {
    return { label: ONGOING_DEADLINE_LABEL, urgent: false };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = parseDeadlineDate(value);

  if (!due) return { label: value, urgent: false };

  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diff < 0) return { label: "마감", urgent: false };
  if (diff === 0) return { label: "D-Day", urgent: true };
  return { label: `D-${diff}`, urgent: diff <= 3 };
}
