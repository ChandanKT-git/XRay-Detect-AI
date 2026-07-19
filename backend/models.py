from datetime import datetime, timezone
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, ConfigDict, EmailStr
import uuid


# ============ User Models ============

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str
    role: Literal["doctor", "admin"] = "doctor"
    specialty: Optional[str] = None
    license_number: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserPublic(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: EmailStr
    full_name: str
    role: str
    specialty: Optional[str] = None
    license_number: Optional[str] = None
    active: bool = True
    created_at: datetime


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    specialty: Optional[str] = None
    license_number: Optional[str] = None
    role: Optional[Literal["doctor", "admin"]] = None
    active: Optional[bool] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


# ============ Scan Models ============

class BoundingBox(BaseModel):
    x: float = Field(ge=0, le=1, description="x as fraction 0-1")
    y: float = Field(ge=0, le=1)
    width: float = Field(ge=0, le=1)
    height: float = Field(ge=0, le=1)
    label: str
    confidence: float = Field(ge=0, le=100)


class ScanResult(BaseModel):
    primary_finding: str
    confidence: float = Field(ge=0, le=100)
    severity: Literal["normal", "low", "moderate", "high", "critical"] = "normal"
    description: str
    regions: List[BoundingBox] = []
    differential_diagnoses: List[str] = []
    recommendations: List[str] = []
    raw_observations: Optional[str] = None


class ScanCreate(BaseModel):
    patient_name: str
    patient_age: Optional[int] = None
    patient_gender: Optional[Literal["male", "female", "other"]] = None
    patient_id: Optional[str] = None
    scan_type: Literal["xray", "mri", "ct", "other"] = "xray"
    body_part: Optional[str] = None
    notes: Optional[str] = None
    image_base64: str
    image_mime: str = "image/jpeg"


# ============ Review / Sign-off / Audit ============

class AuditEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    action: Literal["created", "ai_completed", "ai_failed", "edited", "signed_off"]
    user_id: str
    user_name: str
    at: datetime
    detail: Optional[str] = None


class Review(BaseModel):
    model_config = ConfigDict(extra="ignore")
    status: Literal["pending", "signed"] = "pending"
    edited: bool = False
    signed_by_id: Optional[str] = None
    signed_by_name: Optional[str] = None
    signed_by_license: Optional[str] = None
    signed_at: Optional[datetime] = None
    notes: Optional[str] = None


class ReviewEditRequest(BaseModel):
    """Clinician's edits to the AI-produced findings. Any omitted field keeps AI value."""
    primary_finding: Optional[str] = None
    confidence: Optional[float] = Field(default=None, ge=0, le=100)
    severity: Optional[Literal["normal", "low", "moderate", "high", "critical"]] = None
    description: Optional[str] = None
    regions: Optional[List[BoundingBox]] = None
    differential_diagnoses: Optional[List[str]] = None
    recommendations: Optional[List[str]] = None
    notes: Optional[str] = None


class SignOffRequest(BaseModel):
    notes: Optional[str] = None


class Scan(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_email: str
    user_name: str
    patient_name: str
    patient_age: Optional[int] = None
    patient_gender: Optional[str] = None
    patient_id: Optional[str] = None
    scan_type: str
    body_part: Optional[str] = None
    notes: Optional[str] = None
    image_base64: str
    image_mime: str
    status: Literal["processing", "completed", "error"] = "processing"
    error_message: Optional[str] = None
    result: Optional[ScanResult] = None
    final_result: Optional[ScanResult] = None
    review: Review = Field(default_factory=Review)
    audit: List[AuditEntry] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = None


class ScanSummary(BaseModel):
    """Lightweight scan info without image base64 for list views."""
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    user_name: str
    patient_name: str
    patient_age: Optional[int] = None
    patient_gender: Optional[str] = None
    scan_type: str
    body_part: Optional[str] = None
    status: str
    primary_finding: Optional[str] = None
    confidence: Optional[float] = None
    severity: Optional[str] = None
    review_status: str = "pending"
    review_edited: bool = False
    created_at: datetime


class AdminStats(BaseModel):
    total_users: int
    total_doctors: int
    total_admins: int
    total_scans: int
    completed_scans: int
    processing_scans: int
    error_scans: int
    scans_today: int
