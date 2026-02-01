import type { FileItem } from "../types";
import { formatSize, formatTime, getOutputFileName, calculateCompression } from "../utils";
import { CheckIcon, CloseIcon, Spinner } from "./Icons";

interface FileCardProps {
  file: FileItem;
  onRemove: (id: string) => void;
}

export const FileCard = ({ file, onRemove }: FileCardProps) => {
  const { id, file: inputFile, status, progress, outputUrl, outputSize, conversionTime, error } = file;

  return (
    <div className={`file-card ${status}`}>
      <div className="file-header">
        <div className="file-info">
          <div className="file-name">{inputFile.name}</div>
          <div className="file-meta">
            <span>Input: {formatSize(inputFile.size)}</span>
            {outputSize > 0 && <span>Output: {formatSize(outputSize)}</span>}
          </div>
        </div>
        <div className="file-actions">
          <StatusBadge status={status} />
          {status === "completed" && outputUrl && (
            <a
              href={outputUrl}
              download={getOutputFileName(inputFile.name)}
              className="btn btn-success btn-sm"
            >
              Download
            </a>
          )}
          <button
            className="remove-btn"
            onClick={() => onRemove(id)}
            disabled={status === "converting"}
            title="Remove"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {status === "converting" && (
        <div className="progress-section">
          <div className="progress-bar-container">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="progress-text">
            <span>Converting...</span>
            <span>{progress}%</span>
          </div>
        </div>
      )}

      {status === "completed" && outputUrl && (
        <div className="result-section">
          <video className="video-preview" controls src={outputUrl} />
          <div className="result-stats">
            <span>
              Time: <strong>{formatTime(conversionTime || 0)}</strong>
            </span>
            <span>
              {calculateCompression(inputFile.size, outputSize) >= 0 ? "Compressed" : "Expanded"}:{" "}
              <strong>{Math.abs(calculateCompression(inputFile.size, outputSize)).toFixed(1)}%</strong>
            </span>
          </div>
        </div>
      )}

      {status === "error" && error && (
        <div className="progress-section">
          <p style={{ color: "var(--error)", fontSize: "0.85rem" }}>{error}</p>
        </div>
      )}
    </div>
  );
};

const StatusBadge = ({ status }: { status: FileItem["status"] }) => {
  switch (status) {
    case "pending":
      return <span className="badge badge-pending">Pending</span>;
    case "converting":
      return (
        <span className="badge badge-converting">
          <Spinner />
          Converting
        </span>
      );
    case "completed":
      return (
        <span className="badge badge-completed">
          <CheckIcon />
          Done
        </span>
      );
    case "error":
      return <span className="badge badge-error">Error</span>;
  }
};
