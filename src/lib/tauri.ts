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
  original_content: string;
  resolved_count: number;
  total_count: number;
  saved: boolean;
  undo_stack: UndoEntry[];
  redo_stack: UndoEntry[];
  /** Branch name for the local (ours) side, parsed from conflict markers */
  local_branch: string;
  /** Branch name for the remote (theirs) side, parsed from conflict markers */
  remote_branch: string;
}

export interface UndoEntry {
  description: string;
  statuses: [number, ConflictStatus][];
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
  filePath: string,
  conflictId: number,
  action: ResolveAction
): Promise<MergeSession> {
  return invoke<MergeSession>("resolve_conflict", {
    filePath,
    conflictId,
    action,
  });
}

export async function magicMerge(
  filePath: string
): Promise<MergeSession> {
  return invoke<MergeSession>("magic_merge", { filePath });
}

export async function saveFile(
  filePath: string
): Promise<void> {
  return invoke<void>("save_file", { filePath });
}

export async function closeSession(
  filePath: string
): Promise<void> {
  return invoke<void>("close_session", { filePath });
}

export async function undo(filePath: string): Promise<MergeSession> {
  return invoke<MergeSession>("undo", { filePath });
}

export async function redo(filePath: string): Promise<MergeSession> {
  return invoke<MergeSession>("redo", { filePath });
}

export async function getBaseVersion(
  filePath: string
): Promise<string | null> {
  return invoke<string | null>("get_base_version", { filePath });
}

// ── Diff types ──

export type WordChangeStatus = "unchanged" | "added" | "removed" | "modified";

export interface WordChange {
  text: string;
  status: WordChangeStatus;
}

export type LineDiff = "Unchanged" | "Added" | "Removed" | "Modified";

export interface BlockDiff {
  local_vs_base: LineDiff[];
  remote_vs_base: LineDiff[];
  local_word_changes: WordChange[][];
  remote_word_changes: WordChange[][];
}

/// Compute word-level diffs for all conflict blocks in the active session.
export async function computeDiffs(
  filePath: string
): Promise<BlockDiff[]> {
  return invoke<BlockDiff[]>("compute_diffs", { filePath });
}

// ── Mergetool configuration ──

/// Configure Splice as the global git mergetool via `git config --global`.
/// Returns the mergetool command string on success.
export async function configureMergetool(): Promise<string> {
  return invoke<string>("configure_mergetool");
}

// ── Conflict auto-launch hooks ──

export interface HookStatus {
  installed: boolean;
  hooks_path: string;
  has_merge_hook: boolean;
  has_commit_msg_hook: boolean;
}

/// Install global git hooks that auto-launch Splice on merge/rebase conflicts.
/// Returns the hooks directory path on success.
export async function installConflictHook(): Promise<string> {
  return invoke<string>("install_conflict_hook");
}

/// Remove the Splice conflict hooks and unset `core.hooksPath`.
export async function uninstallConflictHook(): Promise<void> {
  return invoke<void>("uninstall_conflict_hook");
}

/// Check whether the Splice conflict hooks are installed.
export async function getConflictHookStatus(): Promise<HookStatus> {
  return invoke<HookStatus>("get_conflict_hook_status");
}

// ── Conflict Watcher Daemon ──

export interface ConflictDetectedPayload {
  repo_root: string;
  file_path: string;
  conflict_count: number;
  all_files: string[];
}

export interface ConflictsResolvedPayload {
  repo_root: string;
}

export interface WatcherStatusPayload {
  running: boolean;
  watched_repos: string[];
  poll_interval_secs: number;
}

/// Start the conflict watcher daemon.
export async function startWatcher(): Promise<WatcherStatusPayload> {
  return invoke<WatcherStatusPayload>("start_watcher");
}

/// Stop the conflict watcher daemon.
export async function stopWatcher(): Promise<WatcherStatusPayload> {
  return invoke<WatcherStatusPayload>("stop_watcher");
}

/// Add a directory to the watched repos list.
export async function addWatchedRepo(path: string): Promise<WatcherStatusPayload> {
  return invoke<WatcherStatusPayload>("add_watched_repo", { path });
}

/// Remove a directory from the watched repos list.
export async function removeWatchedRepo(path: string): Promise<WatcherStatusPayload> {
  return invoke<WatcherStatusPayload>("remove_watched_repo", { path });
}

/// Detail for a single watched repository.
export interface WatchedRepoDetail {
  path: string;
  name: string;
  has_conflicts: boolean;
  has_merge_op: boolean;
}

/// Response from get_watched_repo_details.
export interface WatchedRepoDetailsPayload {
  running: boolean;
  repos: WatchedRepoDetail[];
}

/// Get the current watcher status.
export async function getWatcherStatus(): Promise<WatcherStatusPayload> {
  return invoke<WatcherStatusPayload>("get_watcher_status");
}

/// Get detailed info about each watched repository.
export async function getWatchedRepoDetails(): Promise<WatchedRepoDetailsPayload> {
  return invoke<WatchedRepoDetailsPayload>("get_watched_repo_details");
}

/// Get the list of conflicted (unmerged) files in a watched repository.
/// Returns absolute paths.
export async function getRepoConflictedFiles(path: string): Promise<string[]> {
  return invoke<string[]>("get_repo_conflicted_files", { path });
}

// ── Mergetool Initial Session ──

/// Get the pre-loaded session from mergetool mode (if any).
/// Returns None if the app was not started via `git mergetool`.
export async function getInitialSession(): Promise<MergeSession | null> {
  return invoke<MergeSession | null>("get_initial_session");
}
