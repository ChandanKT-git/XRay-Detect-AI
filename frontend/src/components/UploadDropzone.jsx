import { useRef, useState } from "react";
import { UploadCloud, X, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export default function UploadDropzone({ onFile, file, preview, onClear, disabled }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");

  const handleFiles = (files) => {
    setError("");
    const f = files?.[0];
    if (!f) return;
    if (!ACCEPTED.includes(f.type)) {
      setError("Only JPG, PNG, or WEBP images are accepted.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("File is larger than 10 MB.");
      return;
    }
    onFile(f);
  };

  if (file && preview) {
    return (
      <div
        className="relative rounded-xl border border-border bg-card overflow-hidden"
        data-testid="upload-preview"
      >
        <img src={preview} alt="preview" className="w-full max-h-[420px] object-contain bg-black/5 dark:bg-black/40" />
        <div className="flex items-center justify-between p-4 border-t border-border">
          <div className="flex items-center gap-3 min-w-0">
            <ImageIcon className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium truncate" title={file.name}>{file.name}</div>
              <div className="text-xs text-muted-foreground">
                {(file.size / 1024).toFixed(1)} KB · {file.type}
              </div>
            </div>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={onClear}
              className="text-muted-foreground hover:text-destructive transition-colors p-2"
              data-testid="upload-clear"
              aria-label="Remove image"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        data-testid="upload-dropzone"
        className={cn(
          "w-full p-12 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center transition-all bg-secondary/40",
          "hover:border-primary/50 hover:bg-secondary/60",
          over ? "border-primary bg-primary/5" : "border-border",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <UploadCloud className="w-7 h-7 text-primary" />
        </div>
        <h3 className="font-display text-lg font-semibold mb-1">Drop a medical image here</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Drag &amp; drop your X-ray, MRI, or CT scan, or <span className="text-primary font-medium">browse files</span>.
          JPG, PNG, WEBP up to 10 MB.
        </p>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        data-testid="upload-input"
      />
      {error && (
        <p className="mt-2 text-xs text-destructive" data-testid="upload-error">
          {error}
        </p>
      )}
    </div>
  );
}
