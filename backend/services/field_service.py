"""
field_service.py
Handles all write operations on feature class fields using GDAL/OGR.
Since File GDB fields cannot be renamed in-place by GDAL, we use a
recreate-layer strategy: copy to temp, drop original, recreate with new schema.
"""
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any, List, Optional

from osgeo import gdal, ogr

from backend.models.schemas import AddFieldRequest, BulkFieldDefinition, FieldType
from backend.services.gdb_service import open_gdb

ogr.UseExceptions()
gdal.UseExceptions()

_FIELD_TYPE_MAP = {
    FieldType.INTEGER: ogr.OFTInteger,
    FieldType.INTEGER64: ogr.OFTInteger64,
    FieldType.REAL: ogr.OFTReal,
    FieldType.STRING: ogr.OFTString,
    FieldType.DATE: ogr.OFTDate,
    FieldType.DATETIME: ogr.OFTDateTime,
    FieldType.BINARY: ogr.OFTBinary,
}


def _build_field_defn(
    name: str,
    field_type: FieldType,
    width: Optional[int],
    nullable: bool,
    default_value: Any,
) -> ogr.FieldDefn:
    fd = ogr.FieldDefn(name, _FIELD_TYPE_MAP[field_type])
    if width and field_type == FieldType.STRING:
        fd.SetWidth(width)
    fd.SetNullable(1 if nullable else 0)
    if default_value is not None:
        fd.SetDefault(str(default_value))
    return fd


def add_field(gdb_path: str, layer_name: str, req: AddFieldRequest) -> None:
    """Add a new field to a feature class (in-place, via CreateField)."""
    ds = open_gdb(gdb_path, update=True)
    layer = ds.GetLayerByName(layer_name)
    if layer is None:
        ds = None
        raise KeyError(f"Layer '{layer_name}' not found")

    fd = _build_field_defn(req.name, req.field_type, req.width, req.nullable, req.default_value)
    if layer.CreateField(fd) != ogr.OGRERR_NONE:
        ds = None
        raise RuntimeError(f"Failed to add field '{req.name}' to '{layer_name}'")
    ds = None


def delete_field(gdb_path: str, layer_name: str, field_name: str) -> None:
    """Delete a field from a feature class."""
    ds = open_gdb(gdb_path, update=True)
    layer = ds.GetLayerByName(layer_name)
    if layer is None:
        ds = None
        raise KeyError(f"Layer '{layer_name}' not found")

    defn = layer.GetLayerDefn()
    idx = defn.GetFieldIndex(field_name)
    if idx < 0:
        ds = None
        raise KeyError(f"Field '{field_name}' not found in '{layer_name}'")

    if layer.DeleteField(idx) != ogr.OGRERR_NONE:
        ds = None
        raise RuntimeError(f"Failed to delete field '{field_name}'")
    ds = None


def rename_field(gdb_path: str, layer_name: str, old_name: str, new_name: str) -> None:
    """
    Rename a field. GDAL OpenFileGDB supports AlterFieldDefn with ALTER_NAME_FLAG.
    """
    ds = open_gdb(gdb_path, update=True)
    layer = ds.GetLayerByName(layer_name)
    if layer is None:
        ds = None
        raise KeyError(f"Layer '{layer_name}' not found")

    defn = layer.GetLayerDefn()
    idx = defn.GetFieldIndex(old_name)
    if idx < 0:
        ds = None
        raise KeyError(f"Field '{old_name}' not found in '{layer_name}'")

    new_defn = ogr.FieldDefn(new_name, defn.GetFieldDefn(idx).GetType())
    new_defn.SetWidth(defn.GetFieldDefn(idx).GetWidth())
    new_defn.SetPrecision(defn.GetFieldDefn(idx).GetPrecision())
    new_defn.SetNullable(defn.GetFieldDefn(idx).IsNullable())

    result = layer.AlterFieldDefn(idx, new_defn, ogr.ALTER_NAME_FLAG)
    ds = None
    if result != ogr.OGRERR_NONE:
        raise RuntimeError(f"Failed to rename field '{old_name}' → '{new_name}' in '{layer_name}'")


def rename_layer(gdb_path: str, old_name: str, new_name: str) -> None:
    """
    Rename a feature class. Uses GDAL SQL:  ALTER TABLE x RENAME TO y
    (supported by OpenFileGDB driver in GDAL ≥ 3.6).
    """
    ds = open_gdb(gdb_path, update=True)
    sql = f'ALTER TABLE "{old_name}" RENAME TO "{new_name}"'
    result = ds.ExecuteSQL(sql)
    if result is not None:
        ds.ReleaseResultSet(result)
    ds = None


def add_fields_bulk(field_defs: List[BulkFieldDefinition], gdb_path: str, layer_name: str) -> None:
    """Add multiple fields to one feature class."""
    ds = open_gdb(gdb_path, update=True)
    layer = ds.GetLayerByName(layer_name)
    if layer is None:
        ds = None
        raise KeyError(f"Layer '{layer_name}' not found")

    errors = []
    for fd_req in field_defs:
        fd = _build_field_defn(
            fd_req.name, fd_req.field_type, fd_req.width, fd_req.nullable, fd_req.default_value
        )
        if layer.CreateField(fd) != ogr.OGRERR_NONE:
            errors.append(fd_req.name)

    ds = None
    if errors:
        raise RuntimeError(f"Failed to add fields: {errors}")


def rename_dataset(gdb_path: str, old_name: str, new_name: str) -> None:
    """
    Rename a Feature Dataset in the GDB_Items system metadata.
    Also updates the Paths of all child features within the dataset.
    """
    ds = open_gdb(gdb_path, update=True)
    items_layer = ds.GetLayerByName("GDB_Items")
    if items_layer is None:
        ds = None
        raise RuntimeError("GDB_Items metadata layer not found")

    old_path = f"\\{old_name}"
    new_path = f"\\{new_name}"

    items_to_update = []
    
    items_layer.ResetReading()
    feat = items_layer.GetNextFeature()
    while feat:
        fid = feat.GetFID()
        name_val = feat.GetField("Name")
        path_val = feat.GetField("Path")
        
        if name_val == old_name and path_val == old_path:
            items_to_update.append((fid, new_name, new_path))
        elif path_val and path_val.startswith(old_path + "\\"):
            subpath = path_val[len(old_path):]
            items_to_update.append((fid, name_val, new_path + subpath))
            
        feat = items_layer.GetNextFeature()

    if not items_to_update:
        ds = None
        raise KeyError(f"Feature Dataset '{old_name}' not found")

    for fid, next_name, next_path in items_to_update:
        f = items_layer.GetFeature(fid)
        if f:
            f.SetField("Name", next_name)
            f.SetField("Path", next_path)
            items_layer.SetFeature(f)

    ds = None
