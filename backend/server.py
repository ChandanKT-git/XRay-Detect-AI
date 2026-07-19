import asyncio
import logging
import os
import uuid
import re
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import List

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from fastapi import APIRouter, BackgroundTasks, Depends, FastAPI, HTTPException, Query  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
import certifi

from auth import (  # noqa: E402
    create_access_token,
    get_current_user_payload,
    hash_password,
    require_admin,
    verify_password,
)
from email_service import send_scan_email  # noqa: E402
from groq_service import GroqVisionError, analyze_medical_image  # noqa: E402
from models import (  # noqa: E402
    AdminStats,
    AuditEntry,
    Review,
    ReviewEditRequest,
    Scan,
    ScanCreate,
    ScanResult,
    ScanSummary,
    SignOffRequest,
    TokenResponse,
    UserCreate,
    UserLogin,
    UserPublic,
    UserUpdate,
)

# MongoDB
mongo_url = os.environ["MONGO_URL"]
import certifi
client = AsyncIOMotorClient(
    mongo_url,
    tlsCAFile=certifi.where(),
    serverSelectionTimeoutMS=5000
)
db = client[os.environ["DB_NAME"]]

users_col = db["users"]
scans_col = db["scans"]

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("medai")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events."""
    # Startup
    await users_col.create_index("email", unique=True)
    await users_col.create_index("id", unique=True)
    await scans_col.create_index("id", unique=True)
    await scans_col.create_index("user_id")
    await scans_col.create_index("created_at")

    admin_email = os.environ.get("DEFAULT_ADMIN_EMAIL")
    admin_password = os.environ.get("DEFAULT_ADMIN_PASSWORD")
    if admin_email and admin_password:
        existing = await users_col.find_one({"email": admin_email}, {"_id": 0})
        if not existing:
            now = datetime.now(timezone.utc).isoformat()
            await users_col.insert_one(
                {
                    "id": str(uuid.uuid4()),
                    "email": admin_email,
                    "password_hash": hash_password(admin_password),
                    "full_name": "System Administrator",
                    "role": "admin",
                    "specialty": "System",
                    "license_number": None,
                    "active": True,
                    "created_at": now,
                }
            )
            logger.info("Seeded default admin: %s", admin_email)
    
    yield
    
    # Shutdown
    client.close()


app = FastAPI(title="MedAI Diagnosis API", version="1.0.0", lifespan=lifespan)
api = APIRouter(prefix="/api")


# ============ Helpers ============

def _user_to_public(doc: dict) -> UserPublic:
    return UserPublic(
        id=doc["id"],
        email=doc["email"],
        full_name=doc["full_name"],
        role=doc["role"],
        specialty=doc.get("specialty"),
        license_number=doc.get("license_number"),
        active=doc.get("active", True),
        created_at=_parse_dt(doc.get("created_at")),
    )


def _parse_dt(value) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            pass
    return datetime.now(timezone.utc)


def _scan_to_summary(doc: dict) -> ScanSummary:
    result = doc.get("final_result") or doc.get("result") or {}
    review = doc.get("review") or {}
    return ScanSummary(
        id=doc["id"],
        user_id=doc["user_id"],
        user_name=doc.get("user_name", ""),
        patient_name=doc["patient_name"],
        patient_age=doc.get("patient_age"),
        patient_gender=doc.get("patient_gender"),
        scan_type=doc.get("scan_type", "xray"),
        body_part=doc.get("body_part"),
        status=doc.get("status", "completed"),
        primary_finding=result.get("primary_finding") if result else None,
        confidence=result.get("confidence") if result else None,
        severity=result.get("severity") if result else None,
        review_status=review.get("status", "pending"),
        review_edited=bool(review.get("edited", False)),
        created_at=_parse_dt(doc.get("created_at")),
    )


# ============ Auth ============

@api.get("/")
async def root():
    return {"service": "MedAI Diagnosis API", "status": "ok"}


@api.post("/auth/register", response_model=TokenResponse)
async def register(payload: UserCreate):
    existing = await users_col.find_one({"email": payload.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    # First user via register cannot self-elevate to admin unless no admin exists.
    role = payload.role
    if role == "admin":
        any_admin = await users_col.find_one({"role": "admin"}, {"_id": 0})
        if any_admin:
            role = "doctor"

    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": user_id,
        "email": payload.email,
        "password_hash": hash_password(payload.password),
        "full_name": payload.full_name,
        "role": role,
        "specialty": payload.specialty,
        "license_number": payload.license_number,
        "active": True,
        "created_at": now,
    }
    await users_col.insert_one(doc)
    public = _user_to_public(doc)
    token = create_access_token(user_id, payload.email, role)
    return TokenResponse(access_token=token, user=public)


@api.post("/auth/login", response_model=TokenResponse)
async def login(payload: UserLogin):
    doc = await users_col.find_one({"email": payload.email}, {"_id": 0})
    if not doc or not verify_password(payload.password, doc["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not doc.get("active", True):
        raise HTTPException(status_code=403, detail="Account is disabled")
    public = _user_to_public(doc)
    token = create_access_token(doc["id"], doc["email"], doc["role"])
    return TokenResponse(access_token=token, user=public)


@api.get("/auth/me", response_model=UserPublic)
async def me(payload: dict = Depends(get_current_user_payload)):
    doc = await users_col.find_one({"id": payload["sub"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_to_public(doc)


# ============ Scans ============

async def _run_ai_analysis(scan_id: str, payload: ScanCreate, actor_name: str) -> None:
    """Background task — runs the Groq vision call and updates the DB."""
    try:
        result_dict = await analyze_medical_image(
            image_base64=payload.image_base64,
            image_mime=payload.image_mime,
            scan_type=payload.scan_type,
            body_part=payload.body_part,
            patient_age=payload.patient_age,
            patient_gender=payload.patient_gender,
            notes=payload.notes,
        )
        result = ScanResult(**result_dict)
        now = datetime.now(timezone.utc)
        audit = AuditEntry(
            action="ai_completed",
            user_id="system",
            user_name="AI · MedAI",
            at=now,
            detail=f"Primary finding: {result.primary_finding} ({int(result.confidence)}%)",
        )
        await scans_col.update_one(
            {"id": scan_id},
            {
                "$set": {
                    "status": "completed",
                    "result": result.model_dump(mode="json"),
                    "completed_at": now.isoformat(),
                },
                "$push": {"audit": audit.model_dump(mode="json")},
            },
        )
        # Notify uploader by email (best-effort)
        fresh = await scans_col.find_one({"id": scan_id}, {"_id": 0, "image_base64": 0})
        if fresh:
            await send_scan_email(
                "completed", fresh, fresh.get("user_email", ""), fresh.get("user_name", "")
            )
    except GroqVisionError as e:
        logger.exception("AI analysis failed")
        now = datetime.now(timezone.utc)
        audit = AuditEntry(
            action="ai_failed", user_id="system", user_name="AI · MedAI", at=now, detail=str(e)[:300]
        )
        await scans_col.update_one(
            {"id": scan_id},
            {
                "$set": {"status": "error", "error_message": str(e)[:500]},
                "$push": {"audit": audit.model_dump(mode="json")},
            },
        )
        fresh = await scans_col.find_one({"id": scan_id}, {"_id": 0, "image_base64": 0})
        if fresh:
            await send_scan_email(
                "error", fresh, fresh.get("user_email", ""), fresh.get("user_name", "")
            )
    except Exception as e:  # noqa: BLE001 safety net
        logger.exception("Unexpected error during AI analysis")
        now = datetime.now(timezone.utc)
        audit = AuditEntry(
            action="ai_failed",
            user_id="system",
            user_name="AI · MedAI",
            at=now,
            detail=f"Unexpected error: {e}"[:300],
        )
        await scans_col.update_one(
            {"id": scan_id},
            {
                "$set": {"status": "error", "error_message": f"Unexpected error: {e}"[:500]},
                "$push": {"audit": audit.model_dump(mode="json")},
            },
        )
        fresh = await scans_col.find_one({"id": scan_id}, {"_id": 0, "image_base64": 0})
        if fresh:
            await send_scan_email(
                "error", fresh, fresh.get("user_email", ""), fresh.get("user_name", "")
            )


@api.post("/scans", response_model=Scan)
async def create_scan(
    payload: ScanCreate,
    background: BackgroundTasks,
    auth: dict = Depends(get_current_user_payload),
):
    user_doc = await users_col.find_one({"id": auth["sub"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    scan_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    created_audit = AuditEntry(
        action="created",
        user_id=user_doc["id"],
        user_name=user_doc["full_name"],
        at=now,
        detail=f"Uploaded {payload.scan_type.upper()} for {payload.patient_name}",
    )
    review = Review()

    scan_doc = {
        "id": scan_id,
        "user_id": user_doc["id"],
        "user_email": user_doc["email"],
        "user_name": user_doc["full_name"],
        "patient_name": payload.patient_name,
        "patient_age": payload.patient_age,
        "patient_gender": payload.patient_gender,
        "patient_id": payload.patient_id,
        "scan_type": payload.scan_type,
        "body_part": payload.body_part,
        "notes": payload.notes,
        "image_base64": payload.image_base64,
        "image_mime": payload.image_mime,
        "status": "processing",
        "error_message": None,
        "result": None,
        "final_result": None,
        "review": review.model_dump(mode="json"),
        "audit": [created_audit.model_dump(mode="json")],
        "created_at": now.isoformat(),
        "completed_at": None,
    }
    await scans_col.insert_one(scan_doc)

    # Kick off AI analysis in the background so the HTTP request returns immediately.
    background.add_task(_run_ai_analysis, scan_id, payload, user_doc["full_name"])

    return Scan(**scan_doc)


@api.get("/scans", response_model=List[ScanSummary])
async def list_scans(
    auth: dict = Depends(get_current_user_payload),
    limit: int = Query(100, ge=1, le=500),
    all_users: bool = Query(False),
):
    """List scans. Doctors see only their own. Admins can pass all_users=true to see everyone."""
    query: dict = {}
    if auth.get("role") != "admin" or not all_users:
        query["user_id"] = auth["sub"]

    cursor = scans_col.find(
        query,
        {"_id": 0, "image_base64": 0},
    ).sort("created_at", -1).limit(limit)
    docs = await cursor.to_list(length=limit)
    return [_scan_to_summary(d) for d in docs]


@api.get("/scans/{scan_id}", response_model=Scan)
async def get_scan(scan_id: str, auth: dict = Depends(get_current_user_payload)):
    doc = await scans_col.find_one({"id": scan_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Scan not found")
    if auth.get("role") != "admin" and doc["user_id"] != auth["sub"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    return Scan(**doc)


@api.delete("/scans/{scan_id}")
async def delete_scan(scan_id: str, auth: dict = Depends(get_current_user_payload)):
    doc = await scans_col.find_one({"id": scan_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Scan not found")
    if auth.get("role") != "admin" and doc["user_id"] != auth["sub"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    await scans_col.delete_one({"id": scan_id})
    return {"deleted": True, "id": scan_id}


def _is_signed(doc: dict) -> bool:
    return bool((doc.get("review") or {}).get("status") == "signed")


def _authorize_review(doc: dict, auth: dict) -> None:
    """Only the scan owner or an admin may review/sign off."""
    if auth.get("role") != "admin" and doc["user_id"] != auth["sub"]:
        raise HTTPException(status_code=403, detail="Forbidden")


@api.put("/scans/{scan_id}/review", response_model=Scan)
async def review_scan(
    scan_id: str,
    payload: ReviewEditRequest,
    auth: dict = Depends(get_current_user_payload),
):
    """Clinician edits the AI findings. Must be called before sign-off.

    Any supplied field overrides the AI result; omitted fields keep the AI value.
    """
    doc = await scans_col.find_one({"id": scan_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Scan not found")
    _authorize_review(doc, auth)

    if doc.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Scan is not ready for review yet")
    if _is_signed(doc):
        raise HTTPException(status_code=400, detail="Scan is already signed off and cannot be edited")

    user_doc = await users_col.find_one({"id": auth["sub"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    # Start from existing final_result (if any) else from AI result
    base = doc.get("final_result") or doc.get("result") or {}
    edits = payload.model_dump(exclude_unset=True)
    clinician_notes = edits.pop("notes", None)

    merged = {
        "primary_finding": edits.get("primary_finding", base.get("primary_finding", "Inconclusive")),
        "confidence": edits.get("confidence", base.get("confidence", 0.0)),
        "severity": edits.get("severity", base.get("severity", "moderate")),
        "description": edits.get("description", base.get("description", "")),
        "regions": edits.get("regions", base.get("regions", [])),
        "differential_diagnoses": edits.get(
            "differential_diagnoses", base.get("differential_diagnoses", [])
        ),
        "recommendations": edits.get("recommendations", base.get("recommendations", [])),
        "raw_observations": base.get("raw_observations"),
    }
    if isinstance(merged["regions"], list):
        merged["regions"] = [
            r.model_dump() if hasattr(r, "model_dump") else r for r in merged["regions"]
        ]
    final = ScanResult(**merged)

    edited = bool(edits) or (doc.get("final_result") is not None)
    now = datetime.now(timezone.utc)
    review_update = {
        "status": "pending",
        "edited": edited,
        "signed_by_id": None,
        "signed_by_name": None,
        "signed_by_license": None,
        "signed_at": None,
        "notes": clinician_notes if clinician_notes is not None else (doc.get("review") or {}).get("notes"),
    }
    audit_detail = (
        f"Edited fields: {', '.join(sorted(edits.keys()))}"
        if edits
        else "Review opened"
    )
    audit = AuditEntry(
        action="edited",
        user_id=user_doc["id"],
        user_name=user_doc["full_name"],
        at=now,
        detail=audit_detail,
    )
    await scans_col.update_one(
        {"id": scan_id},
        {
            "$set": {
                "final_result": final.model_dump(mode="json"),
                "review": review_update,
            },
            "$push": {"audit": audit.model_dump(mode="json")},
        },
    )

    new_doc = await scans_col.find_one({"id": scan_id}, {"_id": 0})
    if not new_doc:
        raise HTTPException(status_code=404, detail="Scan not found")
    return Scan(**new_doc)


@api.post("/scans/{scan_id}/signoff", response_model=Scan)
async def signoff_scan(
    scan_id: str,
    payload: SignOffRequest,
    auth: dict = Depends(get_current_user_payload),
):
    """Lock the scan's final_result as the clinician's formal read. Irreversible."""
    doc = await scans_col.find_one({"id": scan_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Scan not found")
    _authorize_review(doc, auth)
    if doc.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Scan is not ready for sign-off yet")
    if _is_signed(doc):
        raise HTTPException(status_code=400, detail="Scan is already signed off")

    user_doc = await users_col.find_one({"id": auth["sub"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    now = datetime.now(timezone.utc)
    # If no clinician edits were made, snapshot the AI result into final_result so the
    # signed record is self-contained.
    set_fields: dict = {
        "review": {
            "status": "signed",
            "edited": bool(doc.get("final_result")),
            "signed_by_id": user_doc["id"],
            "signed_by_name": user_doc["full_name"],
            "signed_by_license": user_doc.get("license_number"),
            "signed_at": now.isoformat(),
            "notes": payload.notes or (doc.get("review") or {}).get("notes"),
        }
    }
    if not doc.get("final_result") and doc.get("result"):
        set_fields["final_result"] = doc["result"]

    audit = AuditEntry(
        action="signed_off",
        user_id=user_doc["id"],
        user_name=user_doc["full_name"],
        at=now,
        detail=(payload.notes or "No notes")[:300],
    )
    await scans_col.update_one(
        {"id": scan_id},
        {"$set": set_fields, "$push": {"audit": audit.model_dump(mode="json")}},
    )
    new_doc = await scans_col.find_one({"id": scan_id}, {"_id": 0})
    if not new_doc:
        raise HTTPException(status_code=404, detail="Scan not found")
    # Notify uploader by email (best-effort, fire-and-forget)
    notify_doc = {k: v for k, v in new_doc.items() if k != "image_base64"}
    asyncio.create_task(
        send_scan_email(
            "signed_off", notify_doc, new_doc.get("user_email", ""), new_doc.get("user_name", "")
        )
    )
    return Scan(**new_doc)


# ============ Patients (aggregated views over scans) ============

def _normalize_name(name: str) -> str:
    return " ".join((name or "").lower().split())


def _patient_key(doc: dict) -> tuple[str, str]:
    """Return (key, kind) identifying the patient — patient_id preferred, else normalised name."""
    pid = (doc.get("patient_id") or "").strip()
    if pid:
        return pid, "id"
    return _normalize_name(doc.get("patient_name", "")), "name"


@api.get("/patients")
async def list_patients(
    auth: dict = Depends(get_current_user_payload),
    all_users: bool = Query(False),
):
    """Aggregate scans into patient groups."""
    query: dict = {}
    if auth.get("role") != "admin" or not all_users:
        query["user_id"] = auth["sub"]

    cursor = scans_col.find(
        query,
        {"_id": 0, "image_base64": 0},
    ).sort("created_at", -1)
    docs = await cursor.to_list(length=2000)

    groups: dict[str, dict] = {}
    for d in docs:
        key, kind = _patient_key(d)
        if not key:
            continue
        group_key = f"{kind}:{key}"
        g = groups.get(group_key)
        if not g:
            result = d.get("final_result") or d.get("result") or {}
            review = d.get("review") or {}
            g = {
                "identifier": group_key,
                "key_kind": kind,
                "patient_id": d.get("patient_id"),
                "patient_name": d.get("patient_name"),
                "patient_age": d.get("patient_age"),
                "patient_gender": d.get("patient_gender"),
                "scan_count": 0,
                "signed_count": 0,
                "draft_count": 0,
                "error_count": 0,
                "processing_count": 0,
                "last_scan_at": d.get("created_at"),
                "last_finding": result.get("primary_finding") if result else None,
                "last_severity": result.get("severity") if result else None,
                "last_status": d.get("status"),
                "last_review_status": review.get("status", "pending"),
                "modalities": set(),
            }
            groups[group_key] = g
        g["scan_count"] += 1
        scan_status = d.get("status")
        review_status = (d.get("review") or {}).get("status", "pending")
        if scan_status == "error":
            g["error_count"] += 1
        elif scan_status == "processing":
            g["processing_count"] += 1
        elif scan_status == "completed":
            if review_status == "signed":
                g["signed_count"] += 1
            else:
                g["draft_count"] += 1
        modality = (d.get("scan_type") or "").upper()
        if modality:
            g["modalities"].add(modality)

    result = []
    for g in groups.values():
        g["modalities"] = sorted(g["modalities"])
        result.append(g)
    # Sort by last_scan_at desc
    result.sort(key=lambda x: x.get("last_scan_at") or "", reverse=True)
    return result


@api.get("/patients/timeline", response_model=List[Scan])
async def patient_timeline(
    identifier: str,
    auth: dict = Depends(get_current_user_payload),
    all_users: bool = Query(False),
):
    """Return all scans for a patient identified by either 'id:<patient_id>' or 'name:<normalised>'."""
    kind, _, value = identifier.partition(":")
    if not value:
        raise HTTPException(status_code=400, detail="Identifier must be 'id:<patient_id>' or 'name:<patient_name>'")

    query: dict = {}
    if kind == "id":
        query["patient_id"] = value
    elif kind == "name":
        # Match any scan whose normalized name == value (case-insensitive).
        # Escape regex metacharacters so names like "Smith (Jr.)" don't break.
        import re as _re
        pattern = f"^{_re.escape(value.strip())}$"
        query["patient_name"] = {"$regex": pattern, "$options": "i"}
    else:
        raise HTTPException(status_code=400, detail="Unknown identifier kind. Use 'id:' or 'name:'.")

    if auth.get("role") != "admin" or not all_users:
        query["user_id"] = auth["sub"]

    cursor = scans_col.find(query, {"_id": 0}).sort("created_at", -1)
    docs = await cursor.to_list(length=500)
    return [Scan(**d) for d in docs]


# ============ Admin ============

@api.get("/admin/users", response_model=List[UserPublic])
async def admin_list_users(_: dict = Depends(require_admin)):
    docs = await users_col.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(length=1000)
    return [_user_to_public(d) for d in docs]


@api.put("/admin/users/{user_id}", response_model=UserPublic)
async def admin_update_user(
    user_id: str, payload: UserUpdate, _: dict = Depends(require_admin)
):
    doc = await users_col.find_one({"id": user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if updates:
        await users_col.update_one({"id": user_id}, {"$set": updates})
    new_doc = await users_col.find_one({"id": user_id}, {"_id": 0})
    return _user_to_public(new_doc)


@api.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, payload: dict = Depends(require_admin)):
    if payload["sub"] == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own admin account")
    res = await users_col.delete_one({"id": user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"deleted": True, "id": user_id}


@api.get("/admin/stats", response_model=AdminStats)
async def admin_stats(_: dict = Depends(require_admin)):
    total_users = await users_col.count_documents({})
    total_doctors = await users_col.count_documents({"role": "doctor"})
    total_admins = await users_col.count_documents({"role": "admin"})
    total_scans = await scans_col.count_documents({})
    completed_scans = await scans_col.count_documents({"status": "completed"})
    processing_scans = await scans_col.count_documents({"status": "processing"})
    error_scans = await scans_col.count_documents({"status": "error"})

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    scans_today = await scans_col.count_documents({"created_at": {"$gte": today_start}})

    return AdminStats(
        total_users=total_users,
        total_doctors=total_doctors,
        total_admins=total_admins,
        total_scans=total_scans,
        completed_scans=completed_scans,
        processing_scans=processing_scans,
        error_scans=error_scans,
        scans_today=scans_today,
    )


# Mount router and CORS
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
