"""
field_service.py
Handles all write operations on feature class fields using GDAL/OGR.
Since File GDB fields cannot be renamed in-place by GDAL, we use a
recreate-layer strategy: copy to temp, drop original, recreate with new schema.
"""
from typing import Any, List, Optional

from osgeo import gdal, ogr, osr

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


def add_field(gdb_path: str, layer_name: str, req: AddFieldRequest) -> bool:
    """Add a new field to a feature class (in-place, via CreateField)."""
    ds = open_gdb(gdb_path, update=True)
    layer = ds.GetLayerByName(layer_name)
    if layer is None:
        ds = None
        raise KeyError(f"Layer '{layer_name}' not found")

    defn = layer.GetLayerDefn()
    if defn.GetFieldIndex(req.name) >= 0:
        ds = None
        return False

    fd = _build_field_defn(req.name, req.field_type, req.width, req.nullable, req.default_value)
    if layer.CreateField(fd) != ogr.OGRERR_NONE:
        ds = None
        raise RuntimeError(f"Failed to add field '{req.name}' to '{layer_name}'")
    ds = None
    return True


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


def add_fields_bulk(field_defs: List[BulkFieldDefinition], gdb_path: str, layer_name: str) -> tuple[List[str], List[str]]:
    """Add multiple fields to one feature class."""
    ds = open_gdb(gdb_path, update=True)
    layer = ds.GetLayerByName(layer_name)
    if layer is None:
        ds = None
        raise KeyError(f"Layer '{layer_name}' not found")

    errors = []
    added = []
    skipped = []
    
    defn = layer.GetLayerDefn()
    
    for fd_req in field_defs:
        idx = defn.GetFieldIndex(fd_req.name)
        if idx >= 0:
            skipped.append(fd_req.name)
            continue

        fd = _build_field_defn(
            fd_req.name, fd_req.field_type, fd_req.width, fd_req.nullable, fd_req.default_value
        )
        if layer.CreateField(fd) != ogr.OGRERR_NONE:
            errors.append(fd_req.name)
        else:
            added.append(fd_req.name)

    ds = None
    if errors:
        raise RuntimeError(f"Failed to add fields: {errors}")

    return added, skipped


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



def _calc_polygon_perimeter(geom) -> float:
    """Fast calculation of polygon/multipolygon perimeter without Boundary() geometry allocation."""
    gtype = geom.GetGeometryType()
    if gtype in (ogr.wkbPolygon, ogr.wkbPolygon25D):
        cnt = geom.GetGeometryCount()
        if cnt == 1:
            r = geom.GetGeometryRef(0)
            return r.Length() if r else 0.0
        return sum((geom.GetGeometryRef(i).Length() for i in range(cnt) if geom.GetGeometryRef(i)), 0.0)
    elif gtype in (ogr.wkbMultiPolygon, ogr.wkbMultiPolygon25D):
        tot = 0.0
        mcnt = geom.GetGeometryCount()
        for i in range(mcnt):
            poly = geom.GetGeometryRef(i)
            if poly:
                pcnt = poly.GetGeometryCount()
                tot += sum((poly.GetGeometryRef(j).Length() for j in range(pcnt) if poly.GetGeometryRef(j)), 0.0)
        return tot
    return geom.Length()


def calculate_field(gdb_path: str, layer_name: str, field_name: str, calc_type: str, constant_value: Any = None) -> int:
    """Calculate field values based on geometry or a constant."""
    ds = open_gdb(gdb_path, update=True)
    layer = ds.GetLayerByName(layer_name)
    if layer is None:
        ds = None
        raise KeyError(f"Layer '{layer_name}' not found")
        
    defn = layer.GetLayerDefn()
    idx = defn.GetFieldIndex(field_name)
    if idx < 0:
        ds = None
        raise KeyError(f"Field '{field_name}' not found")
        
    layer.ResetReading()
    
    # 1. Fast-path for Constants using pure OGR SQL
    if calc_type == "constant":
        if isinstance(constant_value, str):
            val_str = f"'{constant_value.replace(chr(39), chr(39)+chr(39))}'"
        elif constant_value is None:
            val_str = "NULL"
        else:
            val_str = str(constant_value)
            
        sql = f"UPDATE \"{layer_name}\" SET \"{field_name}\" = {val_str}"
        try:
            ds.ExecuteSQL(sql, dialect="OGRSQL")
            count = layer.GetFeatureCount()
            ds = None
            return count
        except Exception:
            pass

    # 2. Optimized Geometry Calculations
    AREA_FACTORS = {
        "area_sqm": 1.0,
        "area_ha": 0.0001,
        "area_acres": 0.000247105,
        "area_sqft": 10.76391041670972,
        "area_sqkm": 0.000001,
    }
    LENGTH_FACTORS = {
        "length_m": 1.0,
        "length_km": 0.001,
        "length_ft": 3.28084,
        "length_mi": 0.000621371,
    }

    is_area = calc_type in AREA_FACTORS
    area_factor = AREA_FACTORS.get(calc_type, 1.0)
    
    is_length = calc_type in LENGTH_FACTORS
    length_factor = LENGTH_FACTORS.get(calc_type, 1.0)
    
    is_centroid_x = (calc_type == "centroid_x")
    is_centroid_y = (calc_type == "centroid_y")
    is_centroid = is_centroid_x or is_centroid_y

    count = 0
    has_txn = (layer.StartTransaction() == 0)
    batch_size = 50000
    
    coord_trans = None
    if is_centroid:
        source_srs = layer.GetSpatialRef()
        if source_srs:
            try:
                target_srs = osr.SpatialReference()
                target_srs.ImportFromEPSG(4326)
                source_srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
                target_srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
                if not source_srs.IsSame(target_srs):
                    coord_trans = osr.CoordinateTransformation(source_srs, target_srs)
            except Exception:
                coord_trans = None

    try:
        try:
            feat = layer.GetNextFeature()
        except Exception:
            feat = None

        while feat:
            geom = None
            try:
                geom = feat.GetGeometryRef()
            except Exception:
                pass

            if not geom:
                try:
                    feat = layer.GetNextFeature()
                except Exception:
                    feat = None
                continue
                
            val = None
            try:
                if is_area:
                    val = geom.GetArea() * area_factor
                elif is_length:
                    val = _calc_polygon_perimeter(geom) * length_factor
                elif is_centroid:
                    cnt = geom.Centroid()
                    if cnt:
                        if coord_trans:
                            cnt.Transform(coord_trans)
                        val = cnt.GetX() if is_centroid_x else cnt.GetY()
                        cnt = None
            except Exception:
                val = None
                
            if val is not None:
                try:
                    feat.SetField(idx, val)
                    layer.SetFeature(feat)
                    count += 1
                    
                    if count % batch_size == 0:
                        if has_txn:
                            layer.CommitTransaction()
                            layer.StartTransaction()
                except Exception:
                    pass
            
            try:
                feat = layer.GetNextFeature()
            except Exception:
                feat = None
            
        if has_txn:
            try:
                layer.CommitTransaction()
            except Exception:
                pass
            
    except Exception as e:
        if has_txn:
            try:
                layer.RollbackTransaction()
            except Exception:
                pass
        raise e
    finally:
        ds = None
        
    return count
