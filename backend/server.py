"""PlanMeasure AI — FastAPI backend."""
from __future__ import annotations

import base64
import io
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response, StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

from analyzer import (
    BuildingData,
    DetectedObject,
    analyze_floor_plan,
    recompute_from_objects,
)
from pdf_report import build_report_pdf


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("planmeasure")


# --------------------------------------------------------------------------
# MongoDB
# --------------------------------------------------------------------------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]
analyses_col = db["analyses"]

# --------------------------------------------------------------------------
# App
# --------------------------------------------------------------------------
app = FastAPI(title="PlanMeasure AI")
api = APIRouter(prefix="/api")

ALLOWED_EXT = {".pdf", ".png", ".jpg", ".jpeg"}
MAX_UPLOAD_MB = 20


# --------------------------------------------------------------------------
# Pydantic response models
# --------------------------------------------------------------------------
class AnalysisSummary(BaseModel):
    id: str
    filename: str
    created_at: str
    wall_length: float
    rooms: int
    bathrooms: int
    doors: int
    windows: int
    confidence: float
    approximate: bool


class ObjectUpdate(BaseModel):
    id: Optional[str] = None
    type: str
    label: Optional[str] = ""
    x: float = 0
    y: float = 0
    w: float = 0
    h: float = 0
    points: List[List[float]] = Field(default_factory=list)
    width_ft: Optional[float] = None
    length_ft: Optional[float] = None
    confidence: float = 95.0


class AnalysisUpdate(BaseModel):
    detected_objects: List[ObjectUpdate]
    room_list: Optional[List[Dict[str, Any]]] = None


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _bd_to_response(bd: BuildingData, doc: Dict[str, Any]) -> Dict[str, Any]:
    """Build API response for /analyze and /analysis/{id}."""
    return {
        "id": doc["id"],
        "filename": doc.get("filename", ""),
        "created_at": doc.get("created_at", ""),
        "wall_length": bd.wall_length,
        "external_wall": bd.external_wall,
        "internal_wall": bd.internal_wall,
        "wall_length_m": bd.wall_length_m,
        "external_wall_m": bd.external_wall_m,
        "internal_wall_m": bd.internal_wall_m,
        "rooms": bd.rooms,
        "bathrooms": bd.bathrooms,
        "doors": bd.doors,
        "windows": bd.windows,
        "built_up_area_sqft": bd.built_up_area_sqft,
        "built_up_area_sqm": bd.built_up_area_sqm,
        "confidence": bd.confidence,
        "scale_detected": bd.scale_detected,
        "scale_note": bd.scale_note,
        "approximate": bd.approximate,
        "room_list": bd.room_list,
        "detected_objects": [o.__dict__ for o in bd.detected_objects],
        "preview_width": bd.preview_width,
        "preview_height": bd.preview_height,
        "preview_image": f"/api/analysis/{doc['id']}/preview",
    }


def _doc_to_bd(doc: Dict[str, Any]) -> BuildingData:
    payload = doc.get("data", {})
    bd = BuildingData(
        wall_length=payload.get("wall_length", 0),
        external_wall=payload.get("external_wall", 0),
        internal_wall=payload.get("internal_wall", 0),
        wall_length_m=payload.get("wall_length_m", 0),
        external_wall_m=payload.get("external_wall_m", 0),
        internal_wall_m=payload.get("internal_wall_m", 0),
        rooms=payload.get("rooms", 0),
        bathrooms=payload.get("bathrooms", 0),
        doors=payload.get("doors", 0),
        windows=payload.get("windows", 0),
        built_up_area_sqft=payload.get("built_up_area_sqft"),
        built_up_area_sqm=payload.get("built_up_area_sqm"),
        confidence=payload.get("confidence", 0),
        scale_detected=payload.get("scale_detected", False),
        scale_note=payload.get("scale_note", ""),
        approximate=payload.get("approximate", True),
        room_list=payload.get("room_list", []),
        preview_width=payload.get("preview_width", 0),
        preview_height=payload.get("preview_height", 0),
    )
    for o in payload.get("detected_objects", []):
        bd.detected_objects.append(DetectedObject(**{k: v for k, v in o.items()
                                                     if k in DetectedObject.__annotations__}))
    return bd


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------
@api.get("/")
async def root():
    return {"service": "PlanMeasure AI", "version": "1.0"}


@api.get("/health")
async def health():
    return {"status": "ok", "time": _now_iso()}


@api.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    """Upload a plan and run analysis. Returns full BuildingData JSON."""
    if not file.filename:
        raise HTTPException(400, "No filename")
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"Unsupported file type: {ext}. Allowed: PDF, PNG, JPG")

    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Empty file")
    if len(raw) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(400, f"File too large (>{MAX_UPLOAD_MB} MB)")

    analysis_id = str(uuid.uuid4())
    logger.info("Analyzing %s (%d bytes) -> %s", file.filename, len(raw), analysis_id)

    try:
        bd, preview_png = await analyze_floor_plan(raw, file.filename, session_id=analysis_id)
    except Exception as e:
        logger.exception("Analysis failed")
        raise HTTPException(500, f"Analysis failed: {e}")

    doc = {
        "id": analysis_id,
        "filename": file.filename,
        "created_at": _now_iso(),
        "data": bd.to_dict(),
        "preview_b64": base64.b64encode(preview_png).decode("ascii"),
    }
    await analyses_col.insert_one(doc)

    return _bd_to_response(bd, doc)


@api.get("/analysis/{aid}")
async def get_analysis(aid: str):
    doc = await analyses_col.find_one({"id": aid}, {"_id": 0, "preview_b64": 0})
    if not doc:
        raise HTTPException(404, "Analysis not found")
    bd = _doc_to_bd(doc)
    return _bd_to_response(bd, doc)


@api.get("/analysis/{aid}/preview")
async def get_preview(aid: str):
    doc = await analyses_col.find_one({"id": aid}, {"_id": 0, "preview_b64": 1})
    if not doc:
        raise HTTPException(404, "Analysis not found")
    b64 = doc.get("preview_b64", "")
    if not b64:
        raise HTTPException(404, "Preview missing")
    png = base64.b64decode(b64)
    return Response(content=png, media_type="image/png",
                    headers={"Cache-Control": "public, max-age=86400"})


@api.put("/analysis/{aid}")
async def update_analysis(aid: str, body: AnalysisUpdate):
    """Apply manual corrections (edit mode). Recomputes counts + wall lengths."""
    doc = await analyses_col.find_one({"id": aid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Analysis not found")

    bd = _doc_to_bd(doc)
    # Replace detected_objects with the edited set
    new_objs: List[DetectedObject] = []
    for i, o in enumerate(body.detected_objects):
        new_objs.append(DetectedObject(
            id=o.id or f"obj_{i}",
            type=o.type,
            label=o.label or "",
            x=o.x, y=o.y, w=o.w, h=o.h,
            points=o.points or [],
            width_ft=o.width_ft,
            length_ft=o.length_ft,
            confidence=o.confidence,
        ))
    bd.detected_objects = new_objs
    if body.room_list is not None:
        bd.room_list = body.room_list

    bd = recompute_from_objects(bd)

    await analyses_col.update_one(
        {"id": aid},
        {"$set": {"data": bd.to_dict(), "updated_at": _now_iso()}},
    )
    doc["data"] = bd.to_dict()
    return _bd_to_response(bd, doc)


@api.get("/analyses", response_model=List[AnalysisSummary])
async def list_analyses():
    cursor = analyses_col.find({}, {"_id": 0, "preview_b64": 0}).sort("created_at", -1).limit(50)
    out: List[AnalysisSummary] = []
    async for d in cursor:
        data = d.get("data", {})
        out.append(AnalysisSummary(
            id=d["id"],
            filename=d.get("filename", ""),
            created_at=d.get("created_at", ""),
            wall_length=data.get("wall_length", 0),
            rooms=data.get("rooms", 0),
            bathrooms=data.get("bathrooms", 0),
            doors=data.get("doors", 0),
            windows=data.get("windows", 0),
            confidence=data.get("confidence", 0),
            approximate=data.get("approximate", True),
        ))
    return out


@api.delete("/analysis/{aid}")
async def delete_analysis(aid: str):
    r = await analyses_col.delete_one({"id": aid})
    if r.deleted_count == 0:
        raise HTTPException(404, "Analysis not found")
    return {"deleted": True}


@api.get("/analysis/{aid}/report")
async def download_report(aid: str):
    doc = await analyses_col.find_one({"id": aid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Analysis not found")
    preview_png = None
    if doc.get("preview_b64"):
        try:
            preview_png = base64.b64decode(doc["preview_b64"])
        except Exception:
            preview_png = None
    pdf = build_report_pdf(doc.get("data", {}), preview_png, doc.get("filename", "plan"))
    safe_name = os.path.splitext(doc.get("filename", "plan"))[0]
    return StreamingResponse(
        io.BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition":
                 f'attachment; filename="planmeasure_{safe_name}.pdf"'},
    )


# --------------------------------------------------------------------------
# App wiring
# --------------------------------------------------------------------------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
