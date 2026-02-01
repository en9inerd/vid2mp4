import { useEffect, useRef, useState, useCallback } from "react";
import { FFmpeg } from "@diffusion-studio/ffmpeg-js";
import type { FileItem, ProcessingMode } from "../types";
import { generateId } from "../utils";

const FFMPEG_CONFIG = {
  log: false,
  config: "gpl-extended" as const,
};

const CONVERSION_ARGS = [
  "-c:v", "libx264",
  "-preset", "superfast",
  "-movflags", "faststart",
  "-crf", "30",
  "-progress", "-",
  "-v", "",
  "-y",
];

export const useConverter = () => {
  const ffmpegRef = useRef<FFmpeg>(null);
  const processingRef = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    ffmpegRef.current = new FFmpeg(FFMPEG_CONFIG);
    ffmpegRef.current.whenReady(() => setIsReady(true));
  }, []);

  const updateFile = useCallback((id: string, updates: Partial<FileItem>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  }, []);

  const convertFile = useCallback(
    async (fileItem: FileItem, useSharedInstance: boolean): Promise<void> => {
      let ffmpeg: FFmpeg;

      if (useSharedInstance) {
        if (!ffmpegRef.current) return;
        ffmpeg = ffmpegRef.current;
      } else {
        ffmpeg = new FFmpeg(FFMPEG_CONFIG);
        await new Promise<void>((resolve) => ffmpeg.whenReady(() => resolve()));
      }

      updateFile(fileItem.id, { status: "converting", progress: 0 });

      try {
        const startTime = performance.now();
        const inputData = new Blob([await fileItem.file.arrayBuffer()]);

        const meta = await ffmpeg.meta(inputData);
        const duration = meta.duration;

        const uniquePrefix = useSharedInstance ? "" : `${fileItem.id}_`;
        const inputFileName = `${uniquePrefix}${fileItem.file.name}`;
        const outputFileName = `${uniquePrefix}${fileItem.file.name.replace(/\.[^/.]+$/, "")}.mp4`;

        await ffmpeg.writeFile(inputFileName, inputData);

        ffmpeg.onMessage((msg) => {
          const [type, value] = msg.split("=");
          if (type === "out_time_ms" && duration) {
            const progress = Math.min(99, Math.round((parseInt(value) / (duration * 1e6)) * 100));
            updateFile(fileItem.id, { progress });
          }
          if (type === "total_size") {
            updateFile(fileItem.id, { outputSize: parseInt(value) });
          }
        });

        await ffmpeg.exec(["-i", inputFileName, ...CONVERSION_ARGS, outputFileName]);

        const data = ffmpeg.readFile(outputFileName);
        const url = URL.createObjectURL(
          new Blob([data.buffer as ArrayBuffer], { type: "video/mp4" })
        );

        updateFile(fileItem.id, {
          status: "completed",
          progress: 100,
          outputUrl: url,
          conversionTime: Math.round(performance.now() - startTime),
        });
      } catch (error) {
        updateFile(fileItem.id, {
          status: "error",
          error: error instanceof Error ? error.message : "Conversion failed",
        });
      }
    },
    [updateFile]
  );

  const startConversion = useCallback(
    async (mode: ProcessingMode) => {
      if (processingRef.current) return;
      processingRef.current = true;
      setIsProcessing(true);

      const pendingFiles = files.filter((f) => f.status === "pending");

      if (mode === "sequential") {
        for (const file of pendingFiles) {
          if (!processingRef.current) break;
          await convertFile(file, true);
        }
      } else {
        await Promise.all(pendingFiles.map((file) => convertFile(file, false)));
      }

      processingRef.current = false;
      setIsProcessing(false);
    },
    [files, convertFile]
  );

  const stopConversion = useCallback(() => {
    processingRef.current = false;
    setIsProcessing(false);
  }, []);

  const addFiles = useCallback((newFiles: File[]) => {
    const fileItems: FileItem[] = newFiles.map((file) => ({
      id: generateId(),
      file,
      status: "pending",
      progress: 0,
      outputUrl: null,
      outputSize: 0,
      conversionTime: null,
    }));
    setFiles((prev) => [...prev, ...fileItems]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.outputUrl) URL.revokeObjectURL(file.outputUrl);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const clearCompleted = useCallback(() => {
    setFiles((prev) => {
      prev.filter((f) => f.status === "completed" && f.outputUrl)
        .forEach((f) => URL.revokeObjectURL(f.outputUrl!));
      return prev.filter((f) => f.status !== "completed");
    });
  }, []);

  const clearAll = useCallback(() => {
    setFiles((prev) => {
      prev.forEach((f) => {
        if (f.outputUrl) URL.revokeObjectURL(f.outputUrl);
      });
      return [];
    });
  }, []);

  return {
    isReady,
    isProcessing,
    files,
    addFiles,
    removeFile,
    clearCompleted,
    clearAll,
    startConversion,
    stopConversion,
  };
};
