export const ONGOING_DEADLINE_LABEL = "상시채용";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
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

export function parseDeadlineTime(value: string | null | undefined): {
  hours: number;
  minutes: number;
} | null {
  if (!value) return null;
  const match = value.match(TIME_PATTERN);
  if (!match) return null;

  return {
    hours: Number(match[1]),
    minutes: Number(match[2]),
  };
}

export function getDeadlineDateTime(
  value: string | null | undefined,
  time: string | null | undefined
): Date | null {
  const date = parseDeadlineDate(value);
  if (!date) return null;

  const parsedTime = parseDeadlineTime(time);
  if (parsedTime) {
    date.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);
    return date;
  }

  date.setHours(23, 59, 59, 999);
  return date;
}

export function getDeadlineSortTime(
  value: string | null | undefined,
  time?: string | null
): number {
  return getDeadlineDateTime(value, time)?.getTime() ?? Number.POSITIVE_INFINITY;
}

export function isDeadlineExpired(
  value: string | null | undefined,
  time: string | null | undefined = null,
  today: Date = new Date()
): boolean {
  const deadline = getDeadlineDateTime(value, time);
  if (!deadline) return false;

  return deadline < today;
}

export function formatDeadlineShort(
  value: string | null | undefined,
  time?: string | null
): string {
  if (!value) return "미정";
  if (isOngoingDeadline(value)) return ONGOING_DEADLINE_LABEL;

  const date = parseDeadlineDate(value);
  if (!date) return value;

  const dateLabel = date.toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });

  return parseDeadlineTime(time) ? `${dateLabel} ${time}` : dateLabel;
}

export function formatDeadlineLong(
  value: string | null | undefined,
  time?: string | null
): string {
  if (!value) return "마감일 미정";
  if (isOngoingDeadline(value)) return ONGOING_DEADLINE_LABEL;

  const date = parseDeadlineDate(value);
  if (!date) return value;

  const dateLabel = date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return parseDeadlineTime(time) ? `${dateLabel} ${time} 마감` : `${dateLabel} 시간 미정`;
}

export function getDeadlineBadge(
  value: string | null | undefined,
  time?: string | null
): {
  label: string;
  urgent: boolean;
} {
  if (!value) return { label: "미정", urgent: false };
  if (isOngoingDeadline(value)) {
    return { label: ONGOING_DEADLINE_LABEL, urgent: false };
  }

  const today = new Date();
  const due = getDeadlineDateTime(value, time);

  if (!due) return { label: value, urgent: false };

  if (due < today) return { label: "마감", urgent: false };

  const normalizedToday = new Date(today);
  normalizedToday.setHours(0, 0, 0, 0);
  const normalizedDue = new Date(due);
  normalizedDue.setHours(0, 0, 0, 0);
  const diff = Math.round(
    (normalizedDue.getTime() - normalizedToday.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diff === 0) return { label: "D-Day", urgent: true };
  return { label: `D-${diff}`, urgent: diff <= 3 };
}
