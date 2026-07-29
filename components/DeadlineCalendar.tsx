"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { JobPosting } from "@/types";
import { parseDeadlineDate } from "@/lib/deadline";

interface DeadlineCalendarProps {
  jobs: JobPosting[];
  onSelectJob: (job: JobPosting) => void;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthCells(monthDate: Date): Date[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const start = new Date(year, month, 1 - firstDay.getDay());

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return date;
  });
}

export default function DeadlineCalendar({ jobs, onSelectJob }: DeadlineCalendarProps) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const jobsByDate = useMemo(() => {
    return jobs.reduce((acc, job) => {
      const deadline = job.deadline;
      if (!deadline || !parseDeadlineDate(deadline)) return acc;
      acc[deadline] = [...(acc[deadline] ?? []), job];
      return acc;
    }, {} as Record<string, JobPosting[]>);
  }, [jobs]);

  const cells = useMemo(() => getMonthCells(visibleMonth), [visibleMonth]);
  const monthLabel = visibleMonth.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
  });

  const moveMonth = (diff: number) => {
    setVisibleMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + diff, 1));
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <CalendarDays className="w-4 h-4" />
          마감 달력
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => moveMonth(-1)}
            className="w-8 h-8 rounded-lg border border-gray-100 bg-white text-gray-400 hover:text-blue-500 hover:border-blue-200 inline-flex items-center justify-center"
            title="이전 달"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <p className="min-w-28 text-center text-sm font-semibold text-gray-700">{monthLabel}</p>
          <button
            onClick={() => moveMonth(1)}
            className="w-8 h-8 rounded-lg border border-gray-100 bg-white text-gray-400 hover:text-blue-500 hover:border-blue-200 inline-flex items-center justify-center"
            title="다음 달"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
          {WEEKDAYS.map((day) => (
            <div key={day} className="px-2 py-2 text-center text-[11px] font-semibold text-gray-400">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((date) => {
            const key = getDateKey(date);
            const dayJobs = jobsByDate[key] ?? [];
            const inMonth = date.getMonth() === visibleMonth.getMonth();
            const isToday = key === getDateKey(new Date());

            return (
              <div
                key={key}
                className={`min-h-24 border-r border-b border-gray-50 p-2 last:border-r-0 ${
                  inMonth ? "bg-white" : "bg-gray-50/70"
                }`}
              >
                <div
                  className={`mb-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${
                    isToday
                      ? "bg-blue-500 text-white"
                      : inMonth
                      ? "text-gray-500"
                      : "text-gray-300"
                  }`}
                >
                  {date.getDate()}
                </div>
                <div className="space-y-1">
                  {dayJobs.slice(0, 3).map((job) => (
                    <button
                      key={job.id}
                      onClick={() => onSelectJob(job)}
                      className="block w-full truncate rounded-md bg-blue-50 px-1.5 py-1 text-left text-[11px] font-medium text-blue-700 hover:bg-blue-100"
                      title={`${job.companyName} - ${job.jobTitle}`}
                    >
                      {job.companyName} - {job.jobTitle}
                    </button>
                  ))}
                  {dayJobs.length > 3 && (
                    <p className="text-[10px] font-semibold text-gray-400">+{dayJobs.length - 3}개</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
