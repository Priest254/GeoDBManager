from pydantic import BaseModel, Field
from typing import Optional, List, Any
from enum import Enum


# ── Field Types ─────────────────────────────────────────────────────────────

class FieldType(str, Enum):
    INTEGER = "Integer"
    INTEGER64 = "Integer64"
    REAL = "Real"
    STRING = "String"
    DATE = "Date"
    DATETIME = "DateTime"
    BINARY = "Binary"


# ── Request Models ───────────────────────────────────────────────────────────

class LoadGDBRequest(BaseModel):
    path: str = Field(..., description="Absolute path to .gdb folder inside /data")


class RenameRequest(BaseModel):
    new_name: str


class AddFieldRequest(BaseModel):
    name: str
    field_type: FieldType = FieldType.STRING
    width: Optional[int] = 255
    nullable: bool = True
    default_value: Optional[Any] = None


class RenameFieldRequest(BaseModel):
    new_name: str


class BulkFieldDefinition(BaseModel):
    name: str
    field_type: FieldType = FieldType.STRING
    width: Optional[int] = 255
    nullable: bool = True
    default_value: Optional[Any] = None


class BulkAddFieldsRequest(BaseModel):
    dataset: Optional[str] = None          # if None, target top-level features
    feature_filter: Optional[str] = None   # substring match on feature class name
    features: Optional[List[str]] = None   # explicit list; overrides filter
    fields: List[BulkFieldDefinition]


class BulkRenameFieldRequest(BaseModel):
    dataset: Optional[str] = None
    feature_filter: Optional[str] = None
    features: Optional[List[str]] = None
    old_name: str
    new_name: str


class BulkDeleteFieldRequest(BaseModel):
    dataset: Optional[str] = None
    feature_filter: Optional[str] = None
    features: Optional[List[str]] = None
    field_name: str


class CalculateFieldRequest(BaseModel):
    calc_type: str
    constant_value: Optional[Any] = None


class BulkCalculateFieldRequest(BaseModel):
    dataset: Optional[str] = None
    feature_filter: Optional[str] = None
    features: Optional[List[str]] = None
    field_name: str
    calc_type: str
    constant_value: Optional[Any] = None


# ── Response Models ──────────────────────────────────────────────────────────

class FieldInfo(BaseModel):
    name: str
    field_type: str
    width: Optional[int]
    precision: Optional[int]
    nullable: bool
    is_system: bool = False


class FeatureInfo(BaseModel):
    name: str
    dataset: Optional[str]
    geometry_type: Optional[str]
    feature_count: int
    fields: List[FieldInfo]
    crs: Optional[str]


class DatasetInfo(BaseModel):
    name: str
    features: List[str]


class GDBInfo(BaseModel):
    path: str
    name: str
    datasets: List[DatasetInfo]
    standalone_features: List[str]
    total_features: int
    lock_count: int = 0


class OperationResult(BaseModel):
    success: bool
    message: str
    affected: Optional[List[str]] = None


class BulkOperationResult(BaseModel):
    total: int
    succeeded: int
    failed: int
    results: List[OperationResult]
