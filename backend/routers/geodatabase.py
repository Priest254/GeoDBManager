"""Geodatabase-level endpoints: list available GDBs, load, get info."""
import os
from fastapi import APIRouter, HTTPException, UploadFile, File
from backend.models.schemas import GDBInfo, LoadGDBRequest
from backend.services.gdb_service import get_gdb_info, list_gdb_files, save_uploaded_gdb

router = APIRouter(prefix="/api/gdb", tags=["geodatabase"])

DATA_DIR = os.environ.get("DATA_DIR", "/data")


@router.get("/list")
def list_gdbs():
    """List all .gdb folders available in the data directory."""
    paths = list_gdb_files(DATA_DIR)
    return {"gdbs": [{"path": p, "name": os.path.basename(p)} for p in paths]}


@router.post("/load", response_model=GDBInfo)
def load_gdb(req: LoadGDBRequest):
    """Load and parse a GDB, returning its full tree."""
    gdb_path = req.path
    if not os.path.isabs(gdb_path):
        gdb_path = os.path.join(DATA_DIR, gdb_path)

    if not os.path.exists(gdb_path):
        raise HTTPException(status_code=404, detail=f"GDB not found: {gdb_path}")

    try:
        info = get_gdb_info(gdb_path)
        return info
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload", response_model=GDBInfo)
async def upload_gdb(file: UploadFile = File(...)):
    """Upload a .gdb.zip file, extract it to /data, and load its structure."""
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip archives containing a .gdb folder are supported")

    try:
        contents = await file.read()
        extracted_gdb_path = save_uploaded_gdb(contents, file.filename, DATA_DIR)
        return get_gdb_info(extracted_gdb_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
