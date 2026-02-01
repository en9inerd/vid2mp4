export const formatSize = (bytes: number): string => {
  if (bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

export const formatTime = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const getOutputFileName = (inputName: string): string => {
  return `${inputName.replace(/\.[^/.]+$/, "")}.mp4`;
};

export const calculateCompression = (inputSize: number, outputSize: number): number => {
  if (inputSize <= 0) return 0;
  return ((inputSize - outputSize) / inputSize) * 100;
};
