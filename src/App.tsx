import React, { useState } from "react";
import Ffmpeg from "@ffmpeg/ffmpeg";
import { useDropzone } from "react-dropzone";
import { get, set } from 'idb-keyval';

const KEY = "ffmpeg-core.wasm";

async function getFfmpegWasmPath() {
  let buffer = await get(KEY);
  if (!buffer) {
    console.log("fetching wasm file...");
    const response = await fetch(
      "https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.wasm"
    );
    buffer = await response.arrayBuffer();
    set(KEY, buffer);
    console.log("wasm file fetched and stored in indexedDB");
  }
  console.log("wasm file loaded");
  const blob = new Blob([buffer], { type: "application/wasm" });
  const url = URL.createObjectURL(blob);

  return url;
}

const App: React.FC = () => {
  const [inputFile, setInputFile] = useState<File | null>(null);
  const [outputFile, setOutputFile] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [conversionTime, setConversionTime] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  const handleConvert = async () => {
    setIsDownloading(true)
    const wasmPath = await getFfmpegWasmPath()
    setIsDownloading(false)
    const ffmpeg = Ffmpeg.createFFmpeg({
      wasmPath,
      log: true,
    });

    await ffmpeg.load();

    if (!inputFile) {
      return;
    }

    // Read the input file
    ffmpeg.FS("writeFile", "input.webm", await fetchFile(inputFile));

    // Run the ffmpeg command to convert the file
    const startTime = performance.now();
    ffmpeg.setProgress(({ ratio }) =>
      setProgress(Math.round(ratio * 100))
    );
    await ffmpeg.run("-i", "input.webm", "output.mp4", "-row-mt", "1");
    const endTime = performance.now();
    setConversionTime(Math.round(endTime - startTime));

    // Read the output file
    const data = ffmpeg.FS("readFile", "output.mp4");
    const url = URL.createObjectURL(
      new Blob([data.buffer], { type: "video/mp4" })
    );

    setOutputFile(url);
    setProgress(null);
  };

  const fetchFile = async (file: File) => {
    const response = await fetch(URL.createObjectURL(file));
    return new Uint8Array(await response.arrayBuffer());
  };

  const onDrop = (acceptedFiles: File[]) => {
    setInputFile(acceptedFiles[0]);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100">
      <div className="bg-white rounded-lg p-8">
        <h1 className="text-3xl font-bold mb-4">WebM to MP4 Converter</h1>
        <div
          {...getRootProps()}
          className="border-2 border-dashed rounded-md p-6 mt-4"
        >
          <input {...getInputProps()} />
          {isDragActive ? (
            <p>Drop the file here ...</p>
          ) : (
            <p>Drag and drop a WebM file here, or click to select a file</p>
          )}
        </div>
        {inputFile && (
          <div className="mt-4">
            <p>Selected file: {inputFile.name}</p>
            <button
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mt-4"
              onClick={handleConvert}
            >
              Convert
            </button>
          </div>
        )}
        {isDownloading && <p className="mt-2"> Downloading the converter... </p>}
        {progress !== null && (
          <div className="mt-4">
            <p> Converting... </p>
            <progress className="w-full mt-2" max={100} value={progress} />
            <p className="mt-2">{progress}%</p>
          </div>
        )}
        {outputFile && (
          <div className="mt-4">
            <video className="w-full" controls src={outputFile} />
            <p className="mt-2">
              Conversion time: {Number(conversionTime) / 1000} s
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
