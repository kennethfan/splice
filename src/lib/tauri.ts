// Tauri IPC wrappers for Splice backend commands

import { invoke } from "@tauri-apps/api/core";

// Types shared between frontend and backend
export interface ConflictBlock {
  id: number;
  local_lines: string[];
  base_lines: string[] | null;
  remote_lines: string[];
  status: ConflictStatus;
  start_line: number;
  end_line: number;
}

export type ConflictStatus =
  | "Unresolved"
  | "ResolvedWithLocal"
  | "ResolvedWithRemote"
  | "ResolvedWithBoth"
  | { ResolvedManual: string };

export interface MergeSession {
  file_path: string;
  file_extension: string;
  conflicts: ConflictBlock[];
  all_local_content: string;
  all_remote_content: string;
  all_base_content: string | null;
  resolved_count: number;
  total_count: number;
  saved: boolean;
}

export interface MagicMergeResult {
  auto_resolved: number;
  remaining: number;
}

export type ResolveAction =
  | "Local"
  | "Remote"
  | "Both"
  | { Manual: string };

// IPC Commands

export async function openFile(path: string): Promise<MergeSession> {
  return invoke<MergeSession>("open_file", { path });
}

export async function resolveConflict(
  sessionId: number,
  conflictId: number,
  action: ResolveAction
): Promise<MergeSession> {
  return invoke<MergeSession>("resolve_conflict", {
    sessionId,
    conflictId,
    action,
  });
}

export async function magicMerge(
  sessionId: number
): Promise<MagicMergeResult> {
  return invoke<MagicMergeResult>("magic_merge", { sessionId });
}

export async function saveFile(sessionId: number): Promise<void> {
  return invoke<void>("save_file", { sessionId });
}

export async function getBaseVersion(
  filePath: string
): Promise<string | null> {
  return invoke<string | null>("get_base_version", { filePath });
}
