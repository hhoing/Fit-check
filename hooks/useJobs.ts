"use client";

import { useState, useEffect, useCallback } from "react";
import { JobPosting, JobStatus } from "@/types";
import { CURRENT_JOB_PARSER_VERSION } from "@/lib/jobParserVersion";
import { withManualJobCategories } from "@/lib/jobCategories";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";

const STORAGE_KEY = "fit-check-jobs-v1";

type JobRow = {
  id: string;
  data: JobPosting;
  created_at?: string;
  updated_at?: string;
};

function migrate(raw: unknown): JobPosting[] {
  if (!Array.isArray(raw)) return [];
  return (raw as JobPosting[])
    .filter((j) => !String(j.id).startsWith("demo-"))
    .map(normalizeJob);
}

function normalizeJob(job: JobPosting): JobPosting {
  return withManualJobCategories({
    ...job,
    status: job.status ?? "관심",
    deadlineTime: job.deadlineTime ?? null,
    memo: job.memo ?? "",
    isFavorite: job.isFavorite ?? false,
    salary: job.salary ?? "미확인",
    employmentType: job.employmentType ?? "미확인",
    experienceLevel: job.experienceLevel ?? "미확인",
    positionDetails: job.positionDetails ?? [],
    mainTasks: job.mainTasks ?? [],
    qualifications: job.qualifications ?? [],
    preferredQualifications: job.preferredQualifications ?? [],
    hiringProcess: job.hiringProcess ?? [],
    parserVersion: job.parserVersion ?? 0,
    parsedAt: job.parsedAt ?? job.createdAt,
    lastParseError: job.lastParseError,
  });
}

function getStoredJobs(): JobPosting[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? migrate(JSON.parse(stored)) : [];
  } catch {
    return [];
  }
}

function saveLocalJobs(jobs: JobPosting[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  } catch {
    // localStorage 저장 실패는 Supabase 저장 흐름을 막지 않음
  }
}

function sortJobs(jobs: JobPosting[]): JobPosting[] {
  return [...jobs].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

async function fetchRemoteJobs(): Promise<JobPosting[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("jobs")
    .select("id,data,created_at,updated_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as JobRow[]).map((row) => normalizeJob(row.data));
}

async function upsertRemoteJob(job: JobPosting) {
  if (!supabase) return;

  const { error } = await supabase.from("jobs").upsert({
    id: job.id,
    data: job,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
}

async function deleteRemoteJob(id: string) {
  if (!supabase) return;

  const { error } = await supabase.from("jobs").delete().eq("id", id);
  if (error) throw error;
}

async function migrateLocalJobsToRemote(localJobs: JobPosting[], remoteJobs: JobPosting[]) {
  if (!supabase || localJobs.length === 0 || remoteJobs.length > 0) return;

  const rows = localJobs.map((job) => ({
    id: job.id,
    data: job,
    created_at: job.createdAt,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("jobs").upsert(rows);
  if (error) throw error;
}

export function useJobs(initialJobs: JobPosting[]) {
  const [jobs, setJobs] = useState<JobPosting[]>(initialJobs);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const localJobs = getStoredJobs();

      try {
        if (!isSupabaseConfigured) {
          setJobs(localJobs.length > 0 ? localJobs : initialJobs);
          return;
        }

        const remoteJobs = await fetchRemoteJobs();
        await migrateLocalJobsToRemote(localJobs, remoteJobs);
        const jobsFromDb = remoteJobs.length > 0 ? remoteJobs : localJobs;
        const normalized = sortJobs(jobsFromDb.length > 0 ? jobsFromDb : initialJobs);
        setJobs(normalized);
        saveLocalJobs(normalized);
      } catch (error) {
        console.error("jobs load failed:", error);
        setJobs(localJobs.length > 0 ? localJobs : initialJobs);
      } finally {
        setIsLoaded(true);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [initialJobs]);

  const addJob = useCallback((job: JobPosting) => {
    const normalized = normalizeJob({
      ...job,
      parserVersion: job.parserVersion ?? CURRENT_JOB_PARSER_VERSION,
      parsedAt: job.parsedAt ?? new Date().toISOString(),
    });

    setJobs((prev) => {
      const next = [normalized, ...prev];
      saveLocalJobs(next);
      return next;
    });

    void upsertRemoteJob(normalized).catch((error) => {
      console.error("job insert failed:", error);
    });
  }, []);

  const updateJob = useCallback((updated: JobPosting) => {
    const normalized = normalizeJob(updated);

    setJobs((prev) => {
      const next = prev.map((j) => (j.id === normalized.id ? normalized : j));
      saveLocalJobs(next);
      return next;
    });

    void upsertRemoteJob(normalized).catch((error) => {
      console.error("job update failed:", error);
    });
  }, []);

  const deleteJob = useCallback((id: string) => {
    setJobs((prev) => {
      const next = prev.filter((j) => j.id !== id);
      saveLocalJobs(next);
      return next;
    });

    void deleteRemoteJob(id).catch((error) => {
      console.error("job delete failed:", error);
    });
  }, []);

  const updateStatus = useCallback((id: string, status: JobStatus) => {
    setJobs((prev) => {
      const next = prev.map((j) => (j.id === id ? normalizeJob({ ...j, status }) : j));
      const updated = next.find((j) => j.id === id);
      saveLocalJobs(next);
      if (updated) {
        void upsertRemoteJob(updated).catch((error) => {
          console.error("job status update failed:", error);
        });
      }
      return next;
    });
  }, []);

  return { jobs, addJob, updateJob, deleteJob, updateStatus, isLoaded };
}
