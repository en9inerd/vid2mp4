import { useEffect, useRef, useState, useCallback } from "react";
import { FFmpeg } from "@diffusion-studio/ffmpeg-js";
import { useDropzone } from "react-dropzone";

interface FileItem {
  id: string;
  file: File;
  status: "pending" | "converting" | "completed" | "error";
  progress: number;
  outputUrl: string | null;
  outputSize: number;
  conversionTime: number | null;
  error?: string;
}

type ProcessingMode = "sequential" | "parallel";

const App = () => {
  const ffmpegRef = useRef<FFmpeg>(null);
  const [isReady, setIsReady] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [mode, setMode] = useState<ProcessingMode>("sequential");
  const [isProcessing, setIsProcessing] = useState(false);
  const processingRef = useRef(false);

  useEffect(() => {
    ffmpegRef.current = new FFmpeg({
      log: false,
      config: "gpl-extended",
    });
    ffmpegRef.current.whenReady(() => {
      setIsReady(true);
    });
  }, []);

  const updateFile = useCallback((id: string, updates: Partial<FileItem>) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
    );
  }, []);

  const convertFile = useCallback(
    async (fileItem: FileItem, useSharedInstance: boolean = true): Promise<void> => {
      let ffmpeg: FFmpeg;
      
      if (useSharedInstance) {
        if (!ffmpegRef.current) return;
        ffmpeg = ffmpegRef.current;
      } else {
        // Create a new instance for parallel processing
        ffmpeg = new FFmpeg({
          log: false,
          config: "gpl-extended",
        });
        await new Promise<void>((resolve) => ffmpeg.whenReady(() => resolve()));
      }

      updateFile(fileItem.id, { status: "converting", progress: 0 });

      try {
        const startTime = performance.now();
        const inputData = await fetch(
          URL.createObjectURL(fileItem.file)
        ).then((res) => res.blob());

        const meta = await ffmpeg.meta(inputData);
        const duration = meta.duration;

        // Use unique filenames to avoid conflicts in parallel mode
        const uniquePrefix = useSharedInstance ? "" : `${fileItem.id}_`;
        const inputFileName = `${uniquePrefix}${fileItem.file.name}`;
        const outputFileName = `${uniquePrefix}${fileItem.file.name.replace(/\.[^/.]+$/, "")}.mp4`;

        await ffmpeg.writeFile(inputFileName, inputData);

        ffmpeg.onMessage((msg) => {
          const [type, data] = msg.split("=");
          if (type === "out_time_ms" && duration) {
            const progress = Math.min(
              99,
              Math.round((parseInt(data) / (duration * 1e6)) * 100)
            );
            updateFile(fileItem.id, { progress });
          }
          if (type === "total_size") {
            updateFile(fileItem.id, { outputSize: parseInt(data) });
          }
        });

        await ffmpeg.exec([
          "-i",
          inputFileName,
          "-c:v",
          "libx264",
          "-preset",
          "superfast",
          "-movflags",
          "faststart",
          "-crf",
          "30",
          "-progress",
          "-",
          "-v",
          "",
          "-y",
          outputFileName,
        ]);

        const data = ffmpeg.readFile(outputFileName);
        const url = URL.createObjectURL(
          new Blob([data.buffer as ArrayBuffer], { type: "video/mp4" })
        );

        const endTime = performance.now();

        updateFile(fileItem.id, {
          status: "completed",
          progress: 100,
          outputUrl: url,
          conversionTime: Math.round(endTime - startTime),
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

  const startConversion = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);

    const pendingFiles = files.filter((f) => f.status === "pending");

    if (mode === "sequential") {
      // Sequential: use shared FFmpeg instance
      for (const file of pendingFiles) {
        if (!processingRef.current) break;
        await convertFile(file, true);
      }
    } else {
      // Parallel: each file gets its own FFmpeg instance
      await Promise.all(pendingFiles.map((file) => convertFile(file, false)));
    }

    processingRef.current = false;
    setIsProcessing(false);
  }, [files, mode, convertFile]);

  const stopConversion = useCallback(() => {
    processingRef.current = false;
    setIsProcessing(false);
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: FileItem[] = acceptedFiles.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      status: "pending",
      progress: 0,
      outputUrl: null,
      outputSize: 0,
      conversionTime: null,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.outputUrl) {
        URL.revokeObjectURL(file.outputUrl);
      }
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const clearCompleted = useCallback(() => {
    setFiles((prev) => {
      prev
        .filter((f) => f.status === "completed" && f.outputUrl)
        .forEach((f) => URL.revokeObjectURL(f.outputUrl!));
      return prev.filter((f) => f.status !== "completed");
    });
  }, []);

  const clearAll = useCallback(() => {
    files.forEach((f) => {
      if (f.outputUrl) URL.revokeObjectURL(f.outputUrl);
    });
    setFiles([]);
  }, [files]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "video/*": [] },
    disabled: !isReady,
  });

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const completedCount = files.filter((f) => f.status === "completed").length;
  const convertingCount = files.filter((f) => f.status === "converting").length;

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Video to MP4</h1>
        <p>Convert any video format to MP4 in your browser</p>
      </header>

      <div
        {...getRootProps()}
        className={`dropzone ${isDragActive ? "active" : ""}`}
      >
        <input {...getInputProps()} />
        <svg
          className="dropzone-icon"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        {!isReady ? (
          <>
            <h3>Loading converter...</h3>
            <p>Please wait while the converter initializes</p>
          </>
        ) : isDragActive ? (
          <>
            <h3>Drop files here</h3>
            <p>Release to add videos</p>
          </>
        ) : (
          <>
            <h3>Drop videos here or click to browse</h3>
            <p>Supports all common video formats</p>
          </>
        )}
      </div>

      {files.length > 0 && (
        <>
          <div className="controls">
            <div className="mode-toggle">
              <button
                className={`mode-btn ${mode === "sequential" ? "active" : ""}`}
                onClick={() => setMode("sequential")}
                disabled={isProcessing}
              >
                Sequential
              </button>
              <button
                className={`mode-btn ${mode === "parallel" ? "active" : ""}`}
                onClick={() => setMode("parallel")}
                disabled={isProcessing}
              >
                Parallel
              </button>
            </div>

            {!isProcessing ? (
              <button
                className="btn btn-primary"
                onClick={startConversion}
                disabled={pendingCount === 0 || !isReady}
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Convert {pendingCount} file{pendingCount !== 1 ? "s" : ""}
              </button>
            ) : (
              <button className="btn btn-secondary" onClick={stopConversion}>
                <span className="loading-spinner" />
                Stop
              </button>
            )}

            {completedCount > 0 && (
              <button className="btn btn-secondary btn-sm" onClick={clearCompleted}>
                Clear completed
              </button>
            )}

            <button className="btn btn-secondary btn-sm" onClick={clearAll} disabled={isProcessing}>
              Clear all
            </button>
          </div>

          <div className="status-bar">
            <span className="status-text">
              <strong>{files.length}</strong> file{files.length !== 1 ? "s" : ""} •{" "}
              <strong>{pendingCount}</strong> pending •{" "}
              <strong>{convertingCount}</strong> converting •{" "}
              <strong>{completedCount}</strong> completed
            </span>
          </div>

          <div className="file-list">
            {files.map((fileItem) => (
              <div
                key={fileItem.id}
                className={`file-card ${fileItem.status}`}
              >
                <div className="file-header">
                  <div className="file-info">
                    <div className="file-name">{fileItem.file.name}</div>
                    <div className="file-meta">
                      <span>Input: {formatSize(fileItem.file.size)}</span>
                      {fileItem.outputSize > 0 && (
                        <span>Output: {formatSize(fileItem.outputSize)}</span>
                      )}
                    </div>
                  </div>
                  <div className="file-actions">
                    {fileItem.status === "pending" && (
                      <span className="badge badge-pending">Pending</span>
                    )}
                    {fileItem.status === "converting" && (
                      <span className="badge badge-converting">
                        <span className="loading-spinner" />
                        Converting
                      </span>
                    )}
                    {fileItem.status === "completed" && (
                      <>
                        <span className="badge badge-completed">
                          <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                          Done
                        </span>
                        <a
                          href={fileItem.outputUrl!}
                          download={`${fileItem.file.name.replace(/\.[^/.]+$/, "")}.mp4`}
                          className="btn btn-success btn-sm"
                        >
                          Download
                        </a>
                      </>
                    )}
                    {fileItem.status === "error" && (
                      <span className="badge badge-error">Error</span>
                    )}
                    <button
                      className="remove-btn"
                      onClick={() => removeFile(fileItem.id)}
                      disabled={fileItem.status === "converting"}
                      title="Remove"
                    >
                      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {fileItem.status === "converting" && (
                  <div className="progress-section">
                    <div className="progress-bar-container">
                      <div
                        className="progress-bar-fill"
                        style={{ width: `${fileItem.progress}%` }}
                      />
                    </div>
                    <div className="progress-text">
                      <span>Converting...</span>
                      <span>{fileItem.progress}%</span>
                    </div>
                  </div>
                )}

                {fileItem.status === "completed" && fileItem.outputUrl && (
                  <div className="result-section">
                    <video
                      className="video-preview"
                      controls
                      src={fileItem.outputUrl}
                    />
                    <div className="result-stats">
                      <span>
                        Time: <strong>{formatTime(fileItem.conversionTime || 0)}</strong>
                      </span>
                      <span>
                        Compression:{" "}
                        <strong>
                          {(
                            ((fileItem.file.size - fileItem.outputSize) /
                              fileItem.file.size) *
                            100
                          ).toFixed(1)}
                          %
                        </strong>
                      </span>
                    </div>
                  </div>
                )}

                {fileItem.status === "error" && fileItem.error && (
                  <div className="progress-section">
                    <p style={{ color: "var(--error)", fontSize: "0.85rem" }}>
                      {fileItem.error}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {files.length === 0 && isReady && (
        <div className="empty-state">
          <p>No videos added yet. Drop some files above to get started.</p>
        </div>
      )}

      <footer className="footer">
        <p>© 2026 - All rights reserved</p>
        <div className="footer-links">
          <a href="https://blog.sideeffect.dev/about" target="_blank" rel="noreferrer">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
              <path d="M2 12h20" />
            </svg>
          </a>
          <a href="https://github.com/en9inerd/vid2mp4" target="_blank" rel="noreferrer">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor">
              <path d="M256,32C132.3,32,32,134.9,32,261.7c0,101.5,64.2,187.5,153.2,217.9a17.56,17.56,0,0,0,3.8.4c8.3,0,11.5-6.1,11.5-11.4,0-5.5-.2-19.9-.3-39.1a102.4,102.4,0,0,1-22.6,2.7c-43.1,0-52.9-33.5-52.9-33.5-10.2-26.5-24.9-33.6-24.9-33.6-19.5-13.7-.1-14.1,1.4-14.1h.1c22.5,2,34.3,23.8,34.3,23.8,11.2,19.6,26.2,25.1,39.6,25.1a63,63,0,0,0,25.6-6c2-14.8,7.8-24.9,14.2-30.7-49.7-5.8-102-25.5-102-113.5,0-25.1,8.7-45.6,23-61.6-2.3-5.8-10-29.2,2.2-60.8a18.64,18.64,0,0,1,5-.5c8.1,0,26.4,3.1,56.6,24.1a208.21,208.21,0,0,1,112.2,0c30.2-21,48.5-24.1,56.6-24.1a18.64,18.64,0,0,1,5,.5c12.2,31.6,4.5,55,2.2,60.8,14.3,16.1,23,36.6,23,61.6,0,88.2-52.4,107.6-102.3,113.3,8,7.1,15.2,21.1,15.2,42.5,0,30.7-.3,55.5-.3,63,0,5.4,3.1,11.5,11.4,11.5a19.35,19.35,0,0,0,4-.4C415.9,449.2,480,363.1,480,261.7,480,134.9,379.7,32,256,32Z" />
            </svg>
          </a>
        </div>
      </footer>
    </div>
  );
};

export default App;
