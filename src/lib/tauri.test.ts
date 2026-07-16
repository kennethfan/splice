import { describe, it, expect, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  openFile,
  resolveConflict,
  magicMerge,
  saveFile,
  closeSession,
  undo,
  redo,
  getBaseVersion,
} from "./tauri";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("tauri IPC wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("openFile calls invoke with correct args", async () => {
    const mockSession = {
      file_path: "/path/to/file.ts",
      file_extension: "ts",
      conflicts: [],
      all_local_content: "local",
      all_remote_content: "remote",
      all_base_content: null,
      original_content: "original",
      resolved_count: 0,
      total_count: 0,
      saved: false,
      undo_stack: [],
      redo_stack: [],
      local_branch: "",
      remote_branch: "",
    };
    vi.mocked(invoke).mockResolvedValue(mockSession);

    const result = await openFile("/path/to/file.ts");
    expect(invoke).toHaveBeenCalledWith("open_file", { path: "/path/to/file.ts" });
    expect(result).toEqual(mockSession);
  });

  it("resolveConflict calls invoke with correct args", async () => {
    vi.mocked(invoke).mockResolvedValue({} as any);
    await resolveConflict("file.ts", 1, "Local");
    expect(invoke).toHaveBeenCalledWith("resolve_conflict", {
      filePath: "file.ts",
      conflictId: 1,
      action: "Local",
    });
  });

  it("resolveConflict with Manual action", async () => {
    vi.mocked(invoke).mockResolvedValue({} as any);
    await resolveConflict("file.ts", 1, { Manual: "custom code" });
    expect(invoke).toHaveBeenCalledWith("resolve_conflict", {
      filePath: "file.ts",
      conflictId: 1,
      action: { Manual: "custom code" },
    });
  });

  it("magicMerge calls invoke with correct args", async () => {
    vi.mocked(invoke).mockResolvedValue({} as any);
    await magicMerge("file.ts");
    expect(invoke).toHaveBeenCalledWith("magic_merge", { filePath: "file.ts" });
  });

  it("saveFile calls invoke with correct args", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await saveFile("file.ts");
    expect(invoke).toHaveBeenCalledWith("save_file", { filePath: "file.ts" });
  });

  it("closeSession calls invoke with correct args", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await closeSession("file.ts");
    expect(invoke).toHaveBeenCalledWith("close_session", { filePath: "file.ts" });
  });

  it("undo calls invoke with correct args", async () => {
    vi.mocked(invoke).mockResolvedValue({} as any);
    await undo("file.ts");
    expect(invoke).toHaveBeenCalledWith("undo", { filePath: "file.ts" });
  });

  it("redo calls invoke with correct args", async () => {
    vi.mocked(invoke).mockResolvedValue({} as any);
    await redo("file.ts");
    expect(invoke).toHaveBeenCalledWith("redo", { filePath: "file.ts" });
  });

  it("getBaseVersion calls invoke with correct args", async () => {
    vi.mocked(invoke).mockResolvedValue("base content");
    const result = await getBaseVersion("file.ts");
    expect(invoke).toHaveBeenCalledWith("get_base_version", { filePath: "file.ts" });
    expect(result).toBe("base content");
  });

  it("handles invoke errors gracefully", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("Tauri error"));
    await expect(openFile("bad.ts")).rejects.toThrow("Tauri error");
  });
});
