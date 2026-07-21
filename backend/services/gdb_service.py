"""
gdb_service.py
Core service for reading and inspecting Esri File Geodatabases using GDAL/OGR.
All write operations (rename, add field, etc.) are handled in field_service.py.
"""
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from osgeo import gdal, ogr, osr

from backend.models.schemas import (
    DatasetInfo,
    FeatureInfo,
    FieldInfo,
    GDBInfo,
)

# GDAL/OGR setup
ogr.UseExceptions()

# System fields that should be flagged (not user-editable)
_SYSTEM_FIELDS = {"objectid", "shape", "shape_length", "shape_area", "globalid"}

# GDB driver
_GDB_DRIVER_NAME = "OpenFileGDB"


def _get_driver() -> ogr.Driver:
    drv = ogr.GetDriverByName(_GDB_DRIVER_NAME)
    if drv is None:
        raise RuntimeError("OpenFileGDB GDAL driver not available")
    return drv


def open_gdb(gdb_path: str, update: bool = False) -> ogr.DataSource:
    """Open a File GDB datasource. update=True opens in read-write mode."""
    drv = _get_driver()
    mode = 1 if update else 0
    ds = drv.Open(gdb_path, mode)
    if ds is None:
        raise FileNotFoundError(f"Cannot open GDB at: {gdb_path}")
    return ds


def _field_info(field_defn: ogr.FieldDefn) -> FieldInfo:
    name = field_defn.GetName()
    return FieldInfo(
        name=name,
        field_type=field_defn.GetFieldTypeName(field_defn.GetType()),
        width=field_defn.GetWidth() or None,
        precision=field_defn.GetPrecision() or None,
        nullable=bool(field_defn.IsNullable()),
        is_system=name.lower() in _SYSTEM_FIELDS,
    )


def _layer_info(layer: ogr.Layer, dataset_name: Optional[str]) -> FeatureInfo:
    defn = layer.GetLayerDefn()
    fields = [_field_info(defn.GetFieldDefn(i)) for i in range(defn.GetFieldCount())]

    geom_type = None
    gt = layer.GetGeomType()
    if gt != ogr.wkbNone:
        geom_type = ogr.GeometryTypeToName(gt)

    crs = None
    srs = layer.GetSpatialRef()
    if srs:
        srs.AutoIdentifyEPSG()
        code = srs.GetAuthorityCode(None)
        name_str = srs.GetName() or ""
        crs = f"EPSG:{code}" if code else name_str

    return FeatureInfo(
        name=layer.GetName(),
        dataset=dataset_name,
        geometry_type=geom_type,
        feature_count=layer.GetFeatureCount(),
        fields=fields,
        crs=crs,
    )


def get_gdb_info(gdb_path: str) -> GDBInfo:
    """
    Return the complete tree of a File GDB:
    datasets → [feature classes], standalone feature classes.
    """
    ds = open_gdb(gdb_path)
    gdb_name = Path(gdb_path).stem

    # Collect all layer names that exist in GDB
    all_layers = {ds.GetLayerByIndex(i).GetName(): i for i in range(ds.GetLayerCount())}
    # User-visible features are those not starting with GDB_
    user_layers = {name for name in all_layers if not name.startswith("GDB_")}

    dataset_map: Dict[str, List[str]] = {}   # dataset_name → [feature_class_names]
    standalone: List[str] = []

    # Use the GDB_Items system table to parse dataset and feature paths
    items_layer = ds.GetLayerByName("GDB_Items")
    if items_layer:
        items_layer.ResetReading()
        feat = items_layer.GetNextFeature()
        while feat:
            name_val = feat.GetField("Name") if feat.GetFieldIndex("Name") >= 0 else None
            path_val = feat.GetField("Path") if feat.GetFieldIndex("Path") >= 0 else None
            
            if name_val and path_val and name_val in user_layers:
                # Path format is typically \DatasetName\FeatureClassName or \FeatureClassName
                parts = [p for p in path_val.split("\\") if p]
                if len(parts) >= 2:
                    parent = parts[-2]
                    if parent not in dataset_map:
                        dataset_map[parent] = []
                    dataset_map[parent].append(name_val)
                else:
                    standalone.append(name_val)
            feat = items_layer.GetNextFeature()

    # Fallback: if system table is missing or returned nothing, treat all as standalone
    if not dataset_map and not standalone:
        standalone = list(user_layers)

    # Ensure every user layer is accounted for
    accounted = set(standalone)
    for fc_list in dataset_map.values():
        accounted.update(fc_list)
        
    for lname in user_layers:
        if lname not in accounted:
            standalone.append(lname)

    # Clean duplicates while keeping order
    standalone = list(dict.fromkeys(standalone))

    datasets = [
        DatasetInfo(name=ds_name, features=sorted(list(set(fc_list))))
        for ds_name, fc_list in dataset_map.items()
        if fc_list
    ]

    total = sum(len(d.features) for d in datasets) + len(standalone)

    # Count active lock files in GDB directory
    lock_count = 0
    gdb_dir = Path(gdb_path)
    if gdb_dir.exists() and gdb_dir.is_dir():
        lock_count = len([f for f in gdb_dir.iterdir() if f.is_file() and f.suffix.lower() == ".lock"])

    ds = None  # close
    return GDBInfo(
        path=gdb_path,
        name=gdb_name,
        datasets=datasets,
        standalone_features=standalone,
        total_features=total,
        lock_count=lock_count,
    )


def get_feature_info(gdb_path: str, layer_name: str, dataset: Optional[str] = None) -> FeatureInfo:
    """Return schema + metadata for a single feature class."""
    ds = open_gdb(gdb_path)
    layer = ds.GetLayerByName(layer_name)
    if layer is None:
        raise KeyError(f"Feature class '{layer_name}' not found in GDB")
    info = _layer_info(layer, dataset)
    ds = None
    return info


def list_gdb_files(data_dir: str) -> List[str]:
    """List all .gdb folders in the data directory."""
    result = []
    base = Path(data_dir)
    if not base.exists():
        return result
    for item in base.iterdir():
        if item.is_dir() and item.suffix.lower() == ".gdb":
            result.append(str(item))
    return result


def get_feature_data(gdb_path: str, layer_name: str, limit: int = 100, offset: int = 0) -> dict:
    """Fetch attribute rows from a feature class with pagination."""
    ds = open_gdb(gdb_path)
    layer = ds.GetLayerByName(layer_name)
    if layer is None:
        ds = None
        raise KeyError(f"Layer '{layer_name}' not found")

    defn = layer.GetLayerDefn()
    columns = [defn.GetFieldDefn(i).GetName() for i in range(defn.GetFieldCount())]

    # Include geometry summary column if present
    geom_type = layer.GetGeomType()
    has_geom = (geom_type != ogr.wkbNone)
    if has_geom:
        columns.insert(0, "_geometry")

    total_count = layer.GetFeatureCount()
    rows = []

    layer.ResetReading()
    # Advance to offset
    curr = 0
    feat = layer.GetNextFeature()
    while feat and curr < offset:
        curr += 1
        feat = layer.GetNextFeature()

    count = 0
    while feat and count < limit:
        row = {}
        if has_geom:
            geom = feat.GetGeometryRef()
            row["_geometry"] = geom.GetGeometryName() if geom else "NULL"

        for i in range(defn.GetFieldCount()):
            col_name = defn.GetFieldDefn(i).GetName()
            val = feat.GetField(i)
            # Serialize non-standard types
            if isinstance(val, (bytes, bytearray)):
                val = "<Binary Data>"
            row[col_name] = val

        rows.append(row)
        count += 1
        feat = layer.GetNextFeature()

    ds = None
    return {
        "layer_name": layer_name,
        "total_count": total_count,
        "limit": limit,
        "offset": offset,
        "columns": columns,
        "rows": rows,
    }


def save_uploaded_gdb(file_bytes: bytes, filename: str, data_dir: str = "/data") -> str:
    """Extract a uploaded .zip containing a .gdb directory into data_dir."""
    import zipfile
    import io

    zip_file = zipfile.ZipFile(io.BytesIO(file_bytes))
    target_dir = Path(data_dir)
    target_dir.mkdir(parents=True, exist_ok=True)

    zip_file.extractall(path=target_dir)

    # Find the extracted .gdb directory
    gdb_dirs = list(target_dir.glob("*.gdb")) + list(target_dir.glob("**/*.gdb"))
    if not gdb_dirs:
        raise ValueError("No .gdb folder found inside the uploaded ZIP archive")

    # Pick the most recently modified or matched .gdb folder
    return str(gdb_dirs[-1])


def export_features(gdb_path: str, layer_names: List[str], format_type: str = "shapefile") -> str:
    """
    Export layers to GeoJSON or Shapefile and return path to created ZIP file.
    format_type: 'shapefile' or 'geojson'
    """
    import zipfile
    import tempfile

    tmp_dir = Path(tempfile.mkdtemp(prefix="geodb_export_"))
    out_files = []

    drv_name = "ESRI Shapefile" if format_type == "shapefile" else "GeoJSON"
    ext = ".shp" if format_type == "shapefile" else ".json"

    ds_src = open_gdb(gdb_path)

    for layer_name in layer_names:
        layer = ds_src.GetLayerByName(layer_name)
        if not layer:
            continue

        out_path = str(tmp_dir / f"{layer_name}{ext}")
        gdal.VectorTranslate(
            out_path,
            gdb_path,
            options=gdal.VectorTranslateOptions(
                format=drv_name,
                layers=[layer_name],
                accessMode="overwrite"
            )
        )

        # Collect exported files (.shp, .shx, .dbf, .prj, .json etc.)
        for f in tmp_dir.iterdir():
            if f.is_file() and f not in out_files and f.name != "export.zip":
                out_files.append(f)

    ds_src = None

    if not out_files:
        raise RuntimeError("No layers were exported successfully")

    # Create ZIP
    zip_path = tmp_dir / f"{Path(gdb_path).stem}_export.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in tmp_dir.iterdir():
            if f.is_file() and f != zip_path:
                zf.write(f, arcname=f.name)

    return str(zip_path)
