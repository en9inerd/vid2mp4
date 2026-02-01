export interface FileItem {
  id: string;
  file: File;
  status: FileStatus;
  progress: number;
  outputUrl: string | null;
  outputSize: number;
  conversionTime: number | null;
  error?: string;
}

export type FileStatus = "pending" | "converting" | "completed" | "error";

export type ProcessingMode = "sequential" | "parallel";
