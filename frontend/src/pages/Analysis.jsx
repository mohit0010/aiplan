import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Download,
  Edit3,
  Ruler,
  DoorOpen,
  Square,
  Home as HomeIcon,
  Bath,
  Sparkle,
  Grid2x2,
  Info,
  Loader2,
} from "lucide-react";
import Nav from "../components/Navbar";
import PlanViewer from "../components/PlanViewer";
import EditToolbar from "../components/EditToolbar";
import StatCard from "../components/StatCard";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";
import {
  getAnalysis,
  previewUrl,
  reportUrl,
  updateAnalysis,
} from "../lib/api";
import { ANALYSIS } from "../constants/testIds";

const AnalysisPage = () => {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [objects, setObjects] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const d = await getAnalysis(id);
        if (!alive) return;
        setData(d);
        setObjects(d.detected_objects || []);
      } catch (e) {
        setError(e?.response?.data?.detail || e.message);
      } finally {
        alive && setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const selected = useMemo(
    () => objects.find((o) => o.id === selectedId) || null,
    [objects, selectedId]
  );

  const handleAdd = (type) => {
    const newObj = {
      id: `edit_${Date.now()}`,
      type,
      label:
        type === "wall_internal"
          ? "New wall"
          : type === "door"
          ? "New door"
          : "New window",
      x: 0.4,
      y: 0.4,
      w: type === "wall_internal" ? 0.2 : 0.05,
      h: type === "wall_internal" ? 0.005 : 0.05,
      points:
        type === "wall_internal"
          ? [
              [0.4, 0.4],
              [0.6, 0.4],
            ]
          : [],
      length_ft: type === "wall_internal" ? 10 : null,
      width_ft: type === "door" || type === "window" ? 3 : null,
      confidence: 100,
    };
    setObjects((o) => [...o, newObj]);
    setSelectedId(newObj.id);
    toast.success(`${newObj.label} added — remember to Save.`);
  };

  const handleDelete = () => {
    if (!selectedId) return;
    setObjects((o) => o.filter((x) => x.id !== selectedId));
    setSelectedId(null);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const updated = await updateAnalysis(id, { detected_objects: objects });
      setData(updated);
      setObjects(updated.detected_objects || []);
      toast.success("Analysis updated");
      setEditMode(false);
      setSelectedId(null);
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Nav />
        <div className="max-w-[1440px] mx-auto px-6 py-24 flex items-center justify-center">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="font-mono-plex text-sm">Loading analysis…</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background">
        <Nav />
        <div className="max-w-[1440px] mx-auto px-6 py-24">
          <p className="text-destructive">{error || "Analysis not found."}</p>
          <Button className="mt-4" onClick={() => nav("/")}>
            Go home
          </Button>
        </div>
      </div>
    );
  }

  const previewSrc = data.preview_image
    ? `${process.env.REACT_APP_BACKEND_URL}${data.preview_image}`
    : previewUrl(id);

  return (
    <div className="min-h-screen bg-background" data-testid={ANALYSIS.page}>
      <Nav />

      {/* Header row */}
      <div className="max-w-[1440px] mx-auto px-6 pt-6 pb-4">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-mono-plex"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="overline">Analysis</div>
            <h1 className="font-display font-bold text-3xl md:text-4xl mt-1 tracking-tight">
              {data.filename}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-mono-plex text-muted-foreground">
              <Badge variant="outline" className="rounded-full">
                {data.approximate ? "Approximate" : "Measured"}
              </Badge>
              <span>·</span>
              <span>
                {data.scale_detected
                  ? data.scale_note || "Scale detected"
                  : data.scale_note || "No scale detected"}
              </span>
              <span>·</span>
              <span>
                Confidence {Math.round(data.confidence || 0)}%
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              data-testid={ANALYSIS.editModeToggle}
              variant={editMode ? "default" : "outline"}
              className="rounded-full gap-1.5"
              onClick={() => setEditMode((e) => !e)}
            >
              <Edit3 className="w-4 h-4" />
              {editMode ? "Editing" : "Edit mode"}
            </Button>
            <a
              href={reportUrl(id)}
              target="_blank"
              rel="noreferrer"
              data-testid={ANALYSIS.downloadReport}
            >
              <Button className="rounded-full gap-1.5">
                <Download className="w-4 h-4" />
                Download PDF
              </Button>
            </a>
          </div>
        </div>

        {data.approximate && !data.scale_detected && (
          <div className="mt-4 flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-4 py-3 text-sm">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">No drawing scale detected.</div>
              <div className="text-xs opacity-80 mt-0.5">
                Measurements are AI-estimated using standard residential
                proportions. Verify on site before construction decisions.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main content: viewer + details */}
      <div className="max-w-[1440px] mx-auto px-6 pb-24 grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-9 space-y-6">
          <PlanViewer
            image={previewSrc}
            width={data.preview_width}
            height={data.preview_height}
            objects={objects}
            selectedId={selectedId}
            onSelect={(o) => setSelectedId(o.id)}
            editMode={editMode}
          />

          {/* Stat cards */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-3"
          >
            <StatCard
              testid={ANALYSIS.statTotalWall}
              label="Total wall length"
              value={data.wall_length?.toFixed(1)}
              unit="ft"
              sub={`${data.wall_length_m?.toFixed(2)} m`}
              icon={Ruler}
            />
            <StatCard
              testid={ANALYSIS.statExternalWall}
              label="External walls"
              value={data.external_wall?.toFixed(1)}
              unit="ft"
              sub={`${data.external_wall_m?.toFixed(2)} m`}
              icon={Grid2x2}
            />
            <StatCard
              testid={ANALYSIS.statInternalWall}
              label="Internal walls"
              value={data.internal_wall?.toFixed(1)}
              unit="ft"
              sub={`${data.internal_wall_m?.toFixed(2)} m`}
              icon={Grid2x2}
            />
            <StatCard
              testid={ANALYSIS.statConfidence}
              label="AI confidence"
              value={Math.round(data.confidence || 0)}
              unit="%"
              sub={data.approximate ? "Approximate" : "Measured"}
              icon={Sparkle}
            />
            <StatCard
              testid={ANALYSIS.statRooms}
              label="Rooms"
              value={data.rooms}
              icon={HomeIcon}
            />
            <StatCard
              testid={ANALYSIS.statBathrooms}
              label="Bathrooms"
              value={data.bathrooms}
              icon={Bath}
            />
            <StatCard
              testid={ANALYSIS.statDoors}
              label="Doors"
              value={data.doors}
              icon={DoorOpen}
            />
            <StatCard
              testid={ANALYSIS.statWindows}
              label="Windows"
              value={data.windows}
              icon={Square}
            />
            {data.built_up_area_sqft ? (
              <StatCard
                testid={ANALYSIS.statArea}
                label="Built-up area"
                value={Math.round(data.built_up_area_sqft).toLocaleString()}
                unit="ft²"
                sub={
                  data.built_up_area_sqm
                    ? `${data.built_up_area_sqm.toFixed(1)} m²`
                    : ""
                }
                icon={Grid2x2}
              />
            ) : (
              <div
                data-testid={ANALYSIS.statArea}
                className="rounded-md border border-dashed border-border p-5 grid place-items-center text-center"
              >
                <div className="overline mb-1">Built-up area</div>
                <div className="text-xs text-muted-foreground">
                  Not detectable
                </div>
              </div>
            )}
          </motion.div>
        </div>

        {/* Right details panel */}
        <div className="xl:col-span-3" data-testid={ANALYSIS.detailPanel}>
          <div className="sticky top-24 space-y-4">
            <div className="rounded-md border border-border bg-card p-4">
              <div className="overline mb-2">Selection</div>
              {!selected && (
                <div className="text-xs text-muted-foreground">
                  Click any element on the plan to inspect it.
                </div>
              )}
              {selected && (
                <div className="space-y-1.5 text-sm">
                  <div className="font-display font-bold text-lg">
                    {selected.label || selected.type.replace("_", " ")}
                  </div>
                  <Row k="Type" v={selected.type.replace("_", " ")} />
                  {selected.length_ft != null && (
                    <Row k="Length" v={`${selected.length_ft.toFixed(1)} ft`} />
                  )}
                  {selected.width_ft != null && (
                    <Row k="Width" v={`${selected.width_ft} ft`} />
                  )}
                  <Row
                    k="Confidence"
                    v={`${Math.round(selected.confidence || 0)}%`}
                  />
                </div>
              )}
            </div>

            <div className="rounded-md border border-border bg-card p-4">
              <div className="overline mb-2">Rooms detected</div>
              {(data.room_list || []).length === 0 && (
                <div className="text-xs text-muted-foreground">
                  No labeled rooms.
                </div>
              )}
              <div className="space-y-1.5 max-h-72 overflow-auto pr-1">
                {(data.room_list || []).map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs py-1 border-b border-border/60 last:border-none"
                  >
                    <span className="flex items-center gap-1.5">
                      {r.is_bathroom ? (
                        <Bath className="w-3 h-3 text-[color:var(--bathroom-color)]" />
                      ) : (
                        <HomeIcon className="w-3 h-3 text-muted-foreground" />
                      )}
                      {r.name}
                    </span>
                    <span className="font-mono-plex text-muted-foreground">
                      {r.area_sqft ? `${Math.round(r.area_sqft)} ft²` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-border bg-card p-4">
              <div className="overline mb-2">Objects</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <SwatchRow color="var(--wall-color)" label="Walls" count={
                  objects.filter((o) => o.type.startsWith("wall")).length
                } />
                <SwatchRow color="var(--door-color)" label="Doors" count={
                  objects.filter((o) => o.type === "door").length
                } />
                <SwatchRow color="var(--window-color)" label="Windows" count={
                  objects.filter((o) => o.type === "window").length
                } />
                <SwatchRow color="var(--bathroom-color)" label="Baths" count={
                  objects.filter((o) => o.type === "bathroom").length
                } />
              </div>
            </div>
          </div>
        </div>
      </div>

      <EditToolbar
        visible={editMode}
        onAdd={handleAdd}
        onDelete={handleDelete}
        onSave={handleSave}
        onExit={() => {
          setEditMode(false);
          setSelectedId(null);
        }}
        hasSelection={!!selected}
        saving={saving}
      />
    </div>
  );
};

const Row = ({ k, v }) => (
  <div className="flex justify-between text-xs">
    <span className="text-muted-foreground">{k}</span>
    <span className="font-mono-plex">{v}</span>
  </div>
);

const SwatchRow = ({ color, label, count }) => (
  <div className="flex items-center justify-between rounded border border-border/70 px-2 py-1.5">
    <span className="inline-flex items-center gap-1.5">
      <span
        className="w-2 h-2 rounded-sm"
        style={{ background: color, boxShadow: `0 0 5px ${color}` }}
      />
      {label}
    </span>
    <span className="font-mono-plex">{count}</span>
  </div>
);

export default AnalysisPage;
