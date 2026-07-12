import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Minus, RotateCcw, Layers } from "lucide-react";
import { Button } from "./ui/button";
import { ANALYSIS } from "../constants/testIds";

/**
 * PlanViewer — renders an uploaded floor plan image with SVG object overlays.
 * Supports zoom, pan, hover tooltips, layer toggles.
 *
 * Props:
 *   image       string URL of preview image
 *   width       number pixel width of image (from analysis.preview_width)
 *   height      number pixel height (from analysis.preview_height)
 *   objects     array<{id,type,x,y,w,h,points,label,length_ft,width_ft,confidence}>
 *   onSelect    (obj) => void
 *   selectedId  string
 *   editMode    boolean — when true, clicking an object selects it (for deletion)
 */
const LAYER_TYPES = {
  walls: ["wall_external", "wall_internal"],
  doors: ["door"],
  windows: ["window"],
  rooms: ["room", "bathroom"],
};

const PlanViewer = ({
  image,
  width = 1000,
  height = 700,
  objects = [],
  onSelect,
  selectedId,
  editMode = false,
}) => {
  const wrapRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState(null);
  const [hover, setHover] = useState(null);
  const [layers, setLayers] = useState({
    walls: true,
    doors: true,
    windows: true,
    rooms: true,
  });

  const visible = useMemo(() => {
    return objects.filter((o) => {
      for (const [layer, types] of Object.entries(LAYER_TYPES)) {
        if (types.includes(o.type)) return layers[layer];
      }
      return true;
    });
  }, [objects, layers]);

  const zoomIn = () => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(0.25, +(z - 0.25).toFixed(2)));
  const reset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const onWheel = (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    setZoom((z) => Math.max(0.25, Math.min(4, +(z + delta).toFixed(2))));
  };

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    setDrag({ sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y });
  };
  const onMouseMove = (e) => {
    if (drag) {
      setOffset({ x: drag.ox + (e.clientX - drag.sx), y: drag.oy + (e.clientY - drag.sy) });
    }
  };
  const onMouseUp = () => setDrag(null);

  useEffect(() => {
    const w = wrapRef.current;
    if (!w) return;
    w.addEventListener("wheel", onWheel, { passive: false });
    return () => w.removeEventListener("wheel", onWheel);
  }, []);

  // Compute display size fitting to container width
  const [box, setBox] = useState({ w: 900, h: 600 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const aspect = width / height || 1.4;
      const w = r.width;
      const h = Math.min(r.height, w / aspect);
      setBox({ w, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height]);

  const displayAspect = width / height || 1.4;
  const svgW = box.w;
  const svgH = box.w / displayAspect;

  const classFor = (t) => {
    switch (t) {
      case "wall_external": return "overlay-wall-external overlay-hit";
      case "wall_internal": return "overlay-wall-internal overlay-hit";
      case "door": return "overlay-door overlay-hit";
      case "window": return "overlay-window overlay-hit";
      case "bathroom": return "overlay-bathroom overlay-hit";
      case "room": return "overlay-room overlay-hit";
      default: return "overlay-hit";
    }
  };

  const renderObj = (o, idx) => {
    const px = (v) => v * svgW;
    const py = (v) => v * svgH;
    const isSelected = o.id === selectedId;
    const handleClick = (e) => {
      e.stopPropagation();
      onSelect && onSelect(o);
    };
    const handleEnter = (e) => setHover({ obj: o, x: e.clientX, y: e.clientY });
    const handleLeave = () => setHover(null);
    const strokeExtra = isSelected ? { strokeWidth: 4, filter: "drop-shadow(0 0 8px currentColor)" } : {};

    if (o.type === "wall_external" || o.type === "wall_internal") {
      if (o.points && o.points.length >= 2) {
        const d = o.points
          .map((p, i) => `${i === 0 ? "M" : "L"} ${px(p[0])} ${py(p[1])}`)
          .join(" ");
        return (
          <path
            key={o.id || idx}
            d={d}
            className={classFor(o.type)}
            style={strokeExtra}
            onClick={handleClick}
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}
            data-testid={`obj-${o.id}`}
          />
        );
      }
      // fallback: use bbox as a line
      return (
        <line
          key={o.id || idx}
          x1={px(o.x)} y1={py(o.y)}
          x2={px(o.x + (o.w || 0.05))} y2={py(o.y + (o.h || 0))}
          className={classFor(o.type)}
          style={strokeExtra}
          onClick={handleClick}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        />
      );
    }
    return (
      <rect
        key={o.id || idx}
        x={px(o.x)} y={py(o.y)}
        width={Math.max(4, px(o.w))} height={Math.max(4, py(o.h))}
        rx={o.type === "door" || o.type === "window" ? 2 : 4}
        className={classFor(o.type)}
        style={strokeExtra}
        onClick={handleClick}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        data-testid={`obj-${o.id}`}
      />
    );
  };

  return (
    <div className="relative rounded-lg border border-border bg-card overflow-hidden">
      {/* Layers toolbar */}
      <div className="absolute top-3 left-3 z-20 glass rounded-lg border border-border p-1 flex items-center gap-0.5">
        <div className="px-2.5 py-1 text-[10px] uppercase tracking-widest text-muted-foreground font-mono-plex flex items-center gap-1.5">
          <Layers className="w-3 h-3" />
          Layers
        </div>
        {["walls", "doors", "windows", "rooms"].map((k) => (
          <button
            key={k}
            data-testid={ANALYSIS[`layer${k[0].toUpperCase() + k.slice(1)}`]}
            onClick={() => setLayers((l) => ({ ...l, [k]: !l[k] }))}
            className={`px-2.5 py-1 text-xs rounded capitalize transition-colors ${
              layers[k]
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary/60"
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      {/* Zoom controls */}
      <div className="absolute top-3 right-3 z-20 glass rounded-lg border border-border p-1 flex items-center gap-1">
        <Button
          data-testid={ANALYSIS.zoomOut}
          variant="ghost"
          size="icon"
          className="w-7 h-7"
          onClick={zoomOut}
        >
          <Minus className="w-3.5 h-3.5" />
        </Button>
        <span className="text-xs font-mono-plex min-w-[36px] text-center">
          {(zoom * 100).toFixed(0)}%
        </span>
        <Button
          data-testid={ANALYSIS.zoomIn}
          variant="ghost"
          size="icon"
          className="w-7 h-7"
          onClick={zoomIn}
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
        <Button
          data-testid={ANALYSIS.zoomReset}
          variant="ghost"
          size="icon"
          className="w-7 h-7"
          onClick={reset}
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Canvas */}
      <div
        ref={wrapRef}
        data-testid={ANALYSIS.planViewer}
        className="relative bp-grid-sm overflow-hidden select-none plan-canvas-cursor"
        style={{ height: 600 }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => {
          onMouseUp();
          setHover(null);
        }}
      >
        <div
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            transition: drag ? "none" : "transform 0.12s ease",
            width: svgW,
            height: svgH,
            position: "absolute",
            left: "50%",
            top: "50%",
            marginLeft: -svgW / 2,
            marginTop: -svgH / 2,
          }}
        >
          {image && (
            <img
              src={image}
              alt="floor plan"
              draggable={false}
              className="w-full h-full object-contain pointer-events-none"
              style={{ background: "white" }}
            />
          )}
          <svg
            width={svgW}
            height={svgH}
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="absolute inset-0"
          >
            {visible.map(renderObj)}
          </svg>
        </div>
      </div>

      {/* Hover tooltip */}
      {hover && (
        <div
          className="fixed z-50 pointer-events-none rounded-md border border-border bg-popover text-popover-foreground text-xs shadow-lg px-3 py-2 font-mono-plex"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          <div className="font-semibold text-foreground mb-0.5">
            {hover.obj.label || labelFor(hover.obj)}
          </div>
          <div className="text-muted-foreground">
            Type: {hover.obj.type.replace("_", " ")}
          </div>
          {hover.obj.width_ft != null && (
            <div className="text-muted-foreground">
              Width: {hover.obj.width_ft} ft
            </div>
          )}
          {hover.obj.length_ft != null && (
            <div className="text-muted-foreground">
              Length: {hover.obj.length_ft.toFixed(1)} ft
            </div>
          )}
          <div className="text-muted-foreground">
            Confidence: {Math.round(hover.obj.confidence || 0)}%
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-20 glass rounded-lg border border-border px-3 py-2 flex flex-wrap items-center gap-4 text-[11px] font-mono-plex">
        <LegendItem color="var(--wall-color)" label="Walls" />
        <LegendItem color="var(--door-color)" label="Doors" />
        <LegendItem color="var(--window-color)" label="Windows" />
        <LegendItem color="var(--bathroom-color)" label="Bathrooms" />
        <LegendItem color="var(--room-color)" label="Rooms" />
      </div>
    </div>
  );
};

const labelFor = (o) => {
  const map = {
    wall_external: "External Wall",
    wall_internal: "Internal Wall",
    door: "Door",
    window: "Window",
    bathroom: "Bathroom",
    room: "Room",
  };
  return map[o.type] || o.type;
};

const LegendItem = ({ color, label }) => (
  <span className="inline-flex items-center gap-1.5">
    <span
      className="w-2.5 h-2.5 rounded-sm"
      style={{ background: color, boxShadow: `0 0 6px ${color}` }}
    />
    {label}
  </span>
);

export default PlanViewer;
