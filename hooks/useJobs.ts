"use client";

import { useState, useEffect, useCallback } from "react";
import { JobPosting, JobStatus } from "@/types";
import { CURRENT_JOB_PARSER_VERSION } from "@/lib/jobParserVersion";

const STORAGE_KEY = "fit-check-jobs-v1";

function migrate(raw: unknown): JobPosting[] {
  if (!Array.isArray(raw)) return [];
  return (raw as JobPosting[])
    .filter((j) => !String(j.id).startsWith("demo-"))
    .map((j) => ({
      ...j,
      status: j.status ?? "관심",
      memo: j.memo ?? "",
      salary: j.salary ?? "미확인",
      employmentType: j.employmentType ?? "미확인",
      experienceLevel: j.experienceLevel ?? "미확인",
      positionDetails: j.positionDetails ?? [],
      mainTasks: j.mainTasks ?? [],
      qualifications: j.qualifications ?? [],
      preferredQualifications: j.preferredQualifications ?? [],
      hiringProcess: j.hiringProcess ?? [],
      parserVersion: j.parserVersion ?? 0,
      parsedAt: j.parsedAt ?? j.createdAt,
      lastParseError: j.lastParseError,
    }));
}

export function useJobs(initialJobs: JobPosting[]) {
  const [jobs, setJobs] = useState<JobPosting[]>(initialJobs);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = migrate(JSON.parse(stored));
          if (parsed.length > 0) {
            setJobs(parsed);
          }
        }
      } catch {
        // localStorage 접근 실패 시 초기 데이터 사용
      } finally {
        setIsLoaded(true);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  // jobs 변경 시 localStorage 동기화
  useEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
    } catch {
      // 저장 실패 시 무시 (용량 초과 등)
    }
  }, [isLoaded, jobs]);

  const addJob = useCallback((job: JobPosting) => {
    setJobs((prev) => [
      {
        ...job,
        parserVersion: job.parserVersion ?? CURRENT_JOB_PARSER_VERSION,
        parsedAt: job.parsedAt ?? new Date().toISOString(),
      },
      ...prev,
    ]);
  }, []);

  const updateJob = useCallback((updated: JobPosting) => {
    setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
  }, []);

  const deleteJob = useCallback((id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  const updateStatus = useCallback((id: string, status: JobStatus) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, status } : j))
    );
  }, []);

  return { jobs, addJob, updateJob, deleteJob, updateStatus, isLoaded };
}
