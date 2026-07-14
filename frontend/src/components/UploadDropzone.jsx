import React, { useCallback, useRef, useState } from "react";
import { UploadCloud, FileText, X, Loader2, Sparkles, Cpu, Zap } from "lucide-react";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { uploadPlan } from "../lib/api";
import { HOME } from "../constants/testIds";

const ACCEPT = ".pdf,.png,.jpg,.jpeg";
const ACCEPT_MIME = ["application/pdf", "image/png", "image/jpeg"];

const UploadDropzone = () => {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("idle"); // idle | uploading | analyzing | done | error
  const [drag, setDrag] = useState(false);
  const [mode, setMode] = useState("auto");
  const inputRef = useRef(null);
  const navigate = useNavigate();

  const pickFile = () => inputRef.current?.click();

  const onFile = (f) => {
    if (!f) return;
    const okType =
      ACCEPT_MIME.includes(f.type) ||
      /\.(pdf|png|jpe?g)$/i.test(f.name);
    if (!okType) {
      toast.error("Unsupported file. Use PDF, PNG, or JPG.");
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      toast.error("File too large. Max 20MB.");
      return;
    }
    setFile(f);
    setProgress(0);
    setStatus("idle");
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    onFile(f);
  }, []);

  const analyze = async () => {
    if (!file) return;
    try {
      setStatus("uploading");
      setProgress(0);
      const result = await uploadPlan(file, (p) => {
        setProgress(p);
        if (p >= 100) setStatus("analyzing");
      }, mode);
      setStatus("done");
      if (result.fallback_note) {
        toast.info(result.fallback_note);
      } else {
        toast.success(
          `Analysis complete (${result.analysis_mode === "heuristic" ? "Local" : "AI Vision"})`
        );
      }
      navigate(`/analysis/${result.id}`);
    } catch (err) {
      setStatus("error");
      const msg =
        err?.response?.data?.detail || err?.message || "Analysis failed";
      toast.error(String(msg));
    }
  };

  const clear = () => {
    setFile(null);
    setProgress(0);
    setStatus("idle");
    if (inputRef.current) inputRef.current.value = "";
  };

  const busy = status === "uploading" || status === "analyzing";
  const label =
    status === "uploading"
      ? `Uploading… ${progress}%`
      : status === "analyzing"
      ? "Analyzing plan with AI vision…"
      : "";

  return (
    <div
      data-testid={HOME.uploadDropzone}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
      className={`relative rounded-xl border-2 border-dashed border-border bg-card p-8 md:p-12 transition-all ${
        drag ? "dropzone-active" : ""
      }`}
    >
      <div className="absolute inset-0 bp-grid-dot opacity-40 rounded-xl pointer-events-none" />
      <input
        ref={inputRef}
        data-testid={HOME.uploadInput}
        type="file"
        accept={ACCEPT}
        className="plain-hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      <div className="relative flex flex-col items-start gap-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg border border-border bg-background grid place-items-center">
            <UploadCloud className="w-5 h-5 text-primary" strokeWidth={2.2} />
          </div>
          <div>
            <div className="overline">Step 01 · Upload</div>
            <div className="text-xl font-display font-bold mt-0.5">
              Drop a floor plan
            </div>
          </div>
        </div>

        <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
          Drag &amp; drop a{" "}
          <span className="font-mono-plex">PDF · PNG · JPG</span> (max 20 MB).
          Our vision model reads walls, doors, windows, dimensions and room
          labels in one pass.
        </p>

        {/* Analysis mode toggle */}
        <div className="w-full">
          <div className="overline mb-2">Analysis mode</div>
          <div className="inline-flex gap-1 rounded-full border border-border bg-background/70 p-1">
            <ModeChip
              icon={Zap}
              label="Auto"
              hint="LLM → local fallback"
              active={mode === "auto"}
              onClick={() => setMode("auto")}
              testid={HOME.modeAuto}
            />
            <ModeChip
              icon={Sparkles}
              label="AI Vision"
              hint="Gemini 3 Flash"
              active={mode === "llm"}
              onClick={() => setMode("llm")}
              testid={HOME.modeLlm}
            />
            <ModeChip
              icon={Cpu}
              label="Local"
              hint="OpenCV + OCR"
              active={mode === "heuristic"}
              onClick={() => setMode("heuristic")}
              testid={HOME.modeHeuristic}
            />
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground font-mono-plex">
            {mode === "auto" && "Tries AI vision first, gracefully falls back to the LLM-free pipeline if the key is unavailable."}
            {mode === "llm" && "Uses Gemini 3 Flash vision. Highest accuracy — requires Emergent Universal Key with balance."}
            {mode === "heuristic" && "Pure OpenCV + Tesseract. Runs fully offline. Calibrate scale afterwards for real measurements."}
          </div>
        </div>

        {!file && (
          <Button
            onClick={pickFile}
            data-testid={HOME.uploadButton}
            className="rounded-full px-5"
          >
            Select file
          </Button>
        )}

        {file && (
          <div className="w-full border border-border rounded-lg bg-background/80 p-4">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{file.name}</div>
                <div className="text-xs text-muted-foreground font-mono-plex">
                  {(file.size / 1024).toFixed(0)} KB
                </div>
              </div>
              {!busy && (
                <button
                  onClick={clear}
                  className="p-1 text-muted-foreground hover:text-foreground"
                  aria-label="Remove"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {busy && (
              <div className="mt-3 space-y-2" data-testid={HOME.uploadProgress}>
                <Progress value={status === "analyzing" ? 100 : progress} />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>{label}</span>
                </div>
              </div>
            )}

            {!busy && (
              <div className="mt-3 flex gap-2">
                <Button
                  onClick={analyze}
                  data-testid={HOME.uploadButton}
                  className="rounded-full px-5"
                >
                  Analyze plan
                </Button>
                <Button
                  onClick={pickFile}
                  variant="outline"
                  className="rounded-full"
                >
                  Change file
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadDropzone;

const ModeChip = ({ icon: Icon, label, hint, active, onClick, testid }) => (
  <button
    onClick={onClick}
    data-testid={testid}
    title={hint}
    className={`h-8 px-3 rounded-full text-xs inline-flex items-center gap-1.5 transition-colors ${
      active
        ? "bg-primary text-primary-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground"
    }`}
  >
    <Icon className="w-3.5 h-3.5" />
    {label}
  </button>
);
