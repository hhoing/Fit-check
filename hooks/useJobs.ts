"use client";

import { useState, useEffect, useCallback } from "react";
import { JobPosting, JobStatus } from "@/types";

const STORAGE_KEY = "fit-check-jobs-v1";

function migrate(raw: unknown): JobPosting[] {
  if (!Array.isArray(raw)) return [];
  return (raw as JobPosting[]).map((j) => ({
    ...j,
    status: j.status ?? "관심",
  }));
}

export function useJobs(initialJobs: JobPosting[]) {
  const [jobs, setJobs] = useState<JobPosting[]>(() => {
    if (typeof window === "undefined") return initialJobs;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = migrate(JSON.parse(stored));
        if (parsed.length > 0) return parsed;
      }
    } catch {
      // localStorage 접근 실패 시 초기 데이터 사용
    }
    return initialJobs;
  });

  // jobs 변경 시 localStorage 동기화
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
    } catch {
      // 저장 실패 시 무시 (용량 초과 등)
    }
  }, [jobs]);

  const addJob = useCallback((job: JobPosting) => {
    setJobs((prev) => [job, ...prev]);
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

  return { jobs, addJob, updateJob, deleteJob, updateStatus };
}
