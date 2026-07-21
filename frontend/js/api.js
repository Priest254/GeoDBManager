/**
 * api.js — Backend API client
 * All calls to the FastAPI backend go through here.
 */

const BASE = '';  // same origin

async function _req(method, path, body, params) {
  let url = BASE + path;
  if (params) {
    const q = new URLSearchParams(params);
    url += '?' + q.toString();
  }
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export const API = {
  // GDB
  listGDBs: () => _req('GET', '/api/gdb/list'),
  loadGDB: (path) => _req('POST', '/api/gdb/load', { path }),
  uploadGDB: async (formData) => {
    const res = await fetch('/api/gdb/upload', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return res.json();
  },

  // Features
  getFeature: (layerName, gdbPath, dataset) =>
    _req('GET', `/api/features/${encodeURIComponent(layerName)}`, null,
      { gdb_path: gdbPath, ...(dataset ? { dataset } : {}) }),
  getFeatureData: (layerName, gdbPath, limit = 100, offset = 0) =>
    _req('GET', `/api/features/${encodeURIComponent(layerName)}/data`, null,
      { gdb_path: gdbPath, limit, offset }),
  renameFeature: (layerName, newName, gdbPath) =>
    _req('PUT', `/api/features/${encodeURIComponent(layerName)}/rename`,
      { new_name: newName }, { gdb_path: gdbPath }),

  // Datasets
  renameDataset: (datasetName, newName, gdbPath) =>
    _req('PUT', `/api/datasets/${encodeURIComponent(datasetName)}/rename`,
      { new_name: newName }, { gdb_path: gdbPath }),

  // Fields
  addField: (layerName, fieldDef, gdbPath) =>
    _req('POST', `/api/fields/${encodeURIComponent(layerName)}`, fieldDef, { gdb_path: gdbPath }),
  renameField: (layerName, fieldName, newName, gdbPath) =>
    _req('PUT', `/api/fields/${encodeURIComponent(layerName)}/${encodeURIComponent(fieldName)}/rename`,
      { new_name: newName }, { gdb_path: gdbPath }),
  deleteField: (layerName, fieldName, gdbPath) =>
    _req('DELETE', `/api/fields/${encodeURIComponent(layerName)}/${encodeURIComponent(fieldName)}`,
      null, { gdb_path: gdbPath }),
  calculateField: (layerName, fieldName, gdbPath, payload) =>
    _req('POST', `/api/fields/${encodeURIComponent(layerName)}/${encodeURIComponent(fieldName)}/calculate`,
      payload, { gdb_path: gdbPath }),

  // Bulk
  bulkAddFields: (gdbPath, payload) =>
    _req('POST', '/api/bulk/add-fields', payload, { gdb_path: gdbPath }),
  bulkRenameField: (gdbPath, payload) =>
    _req('POST', '/api/bulk/rename-field', payload, { gdb_path: gdbPath }),
  bulkDeleteField: (gdbPath, payload) =>
    _req('POST', '/api/bulk/delete-field', payload, { gdb_path: gdbPath }),

  // Export
  exportFeatures: async (gdbPath, layers, format = 'shapefile') => {
    const url = `/api/export?gdb_path=${encodeURIComponent(gdbPath)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layers, format }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${format}_export.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  },
};
