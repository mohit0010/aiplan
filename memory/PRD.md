# PlanMeasure AI — PRD

## Original problem statement
Build a full-stack AI web application called "PlanMeasure AI" that accepts a
residential/commercial floor plan (PDF, JPG, PNG) upload and produces:
Total Wall Length (ft & m), External/Internal Wall Length, Room count,
Bathroom count, Door count, Window count, Built-up Area (if detectable),
AI Confidence Score. Includes an interactive plan viewer with SVG overlays
(walls=blue, doors=green, windows=orange, bathrooms=purple, rooms=gray),
manual correction / edit mode, PDF report download, and a modular architecture
that lets future modules (BOQ, Brick, Paint, Plaster, Cost Estimator) reuse
the same extracted building data.

## Stack
- Frontend: React (CRA) + React Router + Framer Motion + Tailwind + shadcn/ui + sonner
- Backend: FastAPI + MongoDB (motor)
- CV/PDF: OpenCV (headless), PyMuPDF, Pillow
- LLM Vision: Gemini 3 Flash via emergentintegrations + EMERGENT_LLM_KEY
- Report: ReportLab
- Fonts: Cabinet Grotesk (display) + IBM Plex Sans/Mono (body/data)

## Architecture
- `backend/analyzer.py` — modular `BuildingData` dataclass shared across
  future modules (BOQ, Brick, Paint, Cost). Pipeline: bytes -> PNG preview
  -> OpenCV wall-hint pre-pass -> Gemini 3 Flash structured JSON extraction
  -> `BuildingData`.
- `backend/pdf_report.py` — ReportLab PDF generator consuming `BuildingData`.
- `backend/server.py` — FastAPI endpoints under `/api/*`.
  - POST `/api/analyze` (multipart file)
  - GET `/api/analysis/{id}`
  - PUT `/api/analysis/{id}` (manual corrections, triggers recompute)
  - GET `/api/analysis/{id}/preview` (PNG)
  - GET `/api/analysis/{id}/report` (PDF)
  - GET `/api/analyses` (history)
  - DELETE `/api/analysis/{id}`

## User personas
- Estimator / Quantity Surveyor: quick QTO baseline from unstructured plans.
- Architect / Interior Designer: sanity-check room + opening counts.
- Contractor: pre-bid summary + shareable PDF report.

## Core requirements (static)
- Support PDF, PNG, JPG (≤20 MB). Convert PDF pages to high-res PNG.
- Detect walls (external / internal), doors, windows, rooms, bathrooms.
- Read dimensions and infer scale where possible.
- Return normalized bounding boxes + polylines for SVG overlays.
- Always return confidence + approximate flag.
- Interactive plan viewer with zoom/pan/hover tooltips + layer toggles.
- Manual correction: add / delete / relabel walls, doors, windows.
- PDF report with preview, metrics, and room list.
- Light + Dark mode.

## Implemented (2026-02-13)
- [x] Full backend pipeline with modular BuildingData model.
- [x] Gemini 3 Flash vision integration for structured extraction.
- [x] Homepage with hero + upload dropzone (drag & drop, progress, validation).
- [x] Analysis page with SVG plan viewer, layer toggles, zoom/pan, hover
      tooltips, selection panel.
- [x] Stat card grid: total/ext/int walls (ft+m), rooms, baths, doors,
      windows, built-up area, confidence.
- [x] Manual correction toolbar (add/delete wall/door/window, save recompute).
- [x] History page + delete flow.
- [x] Professional PDF report (ReportLab) with preview + metrics + room list.
- [x] Light/Dark themes with Cabinet Grotesk + IBM Plex.
- [x] `data-testid` on all interactive/critical elements.

## Known blocker (P0 — external)
- **EMERGENT_LLM_KEY balance = 0** at runtime.
  All endpoints work; `POST /api/analyze` returns 500 with
  `Budget has been exceeded! Current cost: 0.0, Max budget: 0.0` until the
  user tops up via Profile → Universal Key → Add Balance (or supplies their
  own Gemini API key).

## Backlog
- P1: Scale calibration prompt — allow user to draw a segment and enter a
      known length when scale is not detected.
- P1: Move / resize objects in Edit Mode (currently add + delete + rename).
- P1: Auth (JWT or Google) so history is per-user rather than global.
- P2: Batch upload / multi-page PDF (all pages).
- P2: Downstream modules — Brick Calc, BOQ, Paint Calc — consuming
      `BuildingData` (module scaffolding already isolated).
- P2: Diff view — compare original AI output vs manually corrected version.

## Next tasks
1. Ask user to top up EMERGENT_LLM_KEY (or provide own Gemini key) so the
   `/analyze` flow can be exercised end-to-end.
2. Re-run testing agent with a real analysis after the top-up.
3. Ship scale-calibration UI + move-object edit primitive.
