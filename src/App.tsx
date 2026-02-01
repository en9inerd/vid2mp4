import { useState, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import type { ProcessingMode } from "./types";
import { useConverter } from "./hooks/useConverter";
import { FileCard } from "./components/FileCard";
import { UploadIcon, PlayIcon, Spinner, GlobeIcon, GitHubIcon } from "./components/Icons";

const App = () => {
  const [mode, setMode] = useState<ProcessingMode>("sequential");
  const {
    isReady,
    isProcessing,
    files,
    addFiles,
    removeFile,
    clearCompleted,
    clearAll,
    startConversion,
    stopConversion,
  } = useConverter();

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: addFiles,
    accept: { "video/*": [] },
    disabled: !isReady,
  });

  const stats = useMemo(() => ({
    total: files.length,
    pending: files.filter((f) => f.status === "pending").length,
    converting: files.filter((f) => f.status === "converting").length,
    completed: files.filter((f) => f.status === "completed").length,
  }), [files]);

  const handleConvert = () => startConversion(mode);

  return (
    <div className="app">
      <header className="header">
        <h1>Video to MP4</h1>
        <p>Convert any video format to MP4 in your browser</p>
      </header>

      <div {...getRootProps()} className={`dropzone ${isDragActive ? "active" : ""}`}>
        <input {...getInputProps()} />
        <UploadIcon className="dropzone-icon" size={48} />
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
                onClick={handleConvert}
                disabled={stats.pending === 0 || !isReady}
              >
                <PlayIcon />
                Convert {stats.pending} file{stats.pending !== 1 ? "s" : ""}
              </button>
            ) : (
              <button className="btn btn-secondary" onClick={stopConversion}>
                <Spinner />
                Stop
              </button>
            )}

            {stats.completed > 0 && (
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
              <strong>{stats.total}</strong> file{stats.total !== 1 ? "s" : ""} •{" "}
              <strong>{stats.pending}</strong> pending •{" "}
              <strong>{stats.converting}</strong> converting •{" "}
              <strong>{stats.completed}</strong> completed
            </span>
          </div>

          <div className="file-list">
            {files.map((file) => (
              <FileCard key={file.id} file={file} onRemove={removeFile} />
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
            <GlobeIcon />
          </a>
          <a href="https://github.com/en9inerd/vid2mp4" target="_blank" rel="noreferrer">
            <GitHubIcon />
          </a>
        </div>
      </footer>
    </div>
  );
};

export default App;
