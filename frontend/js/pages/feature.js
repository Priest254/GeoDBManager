/**
 * feature.js — Feature class schema view with field management
 */
import { API } from '../api.js';
import { State, navigate, formatFieldType } from '../app.js';
import { showError, showSuccess } from '../components/toast.js';
import {
  showAddFieldModal,
  showRenameFieldModal,
  showDeleteFieldModal,
  showRenameFeatureModal,
  showBulkAddFieldsModal,
  showBulkRenameFieldModal,
  showBulkDeleteFieldModal,
  showCalculateFieldModal,
  showExportModal,
} from '../components/modals.js';

let _currentFeature = null;
let _searchTerm = '';
let _activeTab = 'schema';
let _dataOffset = 0;
let _dataLimit = 50;

export async function renderFeaturePage(layerName, dataset) {
  State.selectedFeature = { name: layerName, dataset: dataset || null };
  renderFeatureSkeleton(layerName, dataset);

  try {
    const info = await API.getFeature(layerName, State.gdbInfo.path, dataset);
    _currentFeature = info;
    renderFeatureContent(info);
  } catch (e) {
    showError(e.message, 'Failed to load feature class');
    document.getElementById('main-content-area').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3>Failed to load feature class</h3>
        <p>${e.message}</p>
      </div>
    `;
  }
}

function buildBreadcrumbsHTML(dataset, featureName = null) {
  const gdbName = State.gdbInfo ? State.gdbInfo.name : 'Home';
  return `
    <nav class="breadcrumb-nav" aria-label="Breadcrumb">
      <ol class="breadcrumb">
        <li>
          <a class="breadcrumb-item breadcrumb-home" role="button" tabindex="0">🗄️ ${gdbName}</a>
        </li>
        ${dataset ? `
          <li>
            <a class="breadcrumb-item breadcrumb-dataset" data-dataset="${dataset}" role="button" tabindex="0">${dataset}</a>
          </li>
        ` : ''}
        ${featureName ? `
          <li>
            <span class="breadcrumb-item active" aria-current="page">${featureName}</span>
          </li>
        ` : ''}
      </ol>
    </nav>
  `;
}

function attachBreadcrumbListeners(el) {
  el.querySelector('.breadcrumb-home')?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('home');
  });
  el.querySelector('.breadcrumb-home')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigate('home');
    }
  });

  el.querySelector('.breadcrumb-dataset')?.addEventListener('click', (e) => {
    e.preventDefault();
    const ds = e.currentTarget.dataset.dataset;
    navigate('dataset', { name: ds });
  });
  el.querySelector('.breadcrumb-dataset')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const ds = e.currentTarget.dataset.dataset;
      navigate('dataset', { name: ds });
    }
  });
}

function renderFeatureSkeleton(name, dataset) {
  document.getElementById('toolbar').innerHTML = `
    <div class="toolbar-title">
      ${buildBreadcrumbsHTML(dataset, name)}
    </div>
    <div class="toolbar-sep"></div>
    <div style="display:flex;align-items:center;gap:6px;opacity:0.4">
      <div class="spinner" style="width:16px;height:16px;border-width:2px"></div>
      <span style="font-size:12px;color:var(--text-muted)">Loading…</span>
    </div>
  `;
  document.getElementById('main-content-area').innerHTML = `
    <div class="empty-state"><div class="spinner"></div></div>
  `;
  
  const toolbarEl = document.getElementById('toolbar');
  if (toolbarEl) attachBreadcrumbListeners(toolbarEl);
}

function renderFeatureContent(info) {
  const { name, dataset, geometry_type, feature_count, fields, crs } = info;
  const gdbPath = State.gdbInfo.path;

  // Toolbar
  document.getElementById('toolbar').innerHTML = `
    <div class="toolbar-title">
      ${buildBreadcrumbsHTML(dataset, name)}
    </div>
    <div class="toolbar-sep"></div>
    <div class="search-bar" style="width:180px">
      <span class="search-icon" aria-hidden="true">🔍</span>
      <input id="field-search" type="text" placeholder="Filter fields…" aria-label="Filter feature fields" value="${_searchTerm}">
    </div>
    <div class="toolbar-divider"></div>
    <button class="btn btn-secondary" id="btn-export-fc" style="font-size:11px">📦 Export</button>
    <button class="btn btn-secondary" id="btn-rename-fc" title="Rename this feature class">✏️ Rename</button>
    <button class="btn btn-primary" id="btn-add-field">➕ Add Field</button>
    <div class="toolbar-divider"></div>
    <button class="btn btn-ghost" id="btn-bulk-add" title="Bulk add fields to dataset" style="font-size:11px">⚡ Bulk Add</button>
    <button class="btn btn-ghost" id="btn-bulk-rename" title="Bulk rename field" style="font-size:11px">✏️ Bulk Rename</button>
    <button class="btn btn-ghost" id="btn-bulk-delete" title="Bulk delete field" style="font-size:11px">🗑 Bulk Delete</button>
    <button class="btn btn-ghost" id="btn-bulk-calculate" title="Bulk calculate field" style="font-size:11px">🧮 Bulk Calculate</button>
  `;

  attachBreadcrumbListeners(document.getElementById('toolbar'));

  // Inspector
  document.getElementById('inspector-body').innerHTML = `
    <div class="prop-row">
      <div class="prop-label">Name</div>
      <div class="prop-value">${name}</div>
    </div>
    ${dataset ? `<div class="prop-row"><div class="prop-label">Dataset</div><div class="prop-value accent">${dataset}</div></div>` : ''}
    <div class="prop-row">
      <div class="prop-label">Geometry Type</div>
      <div class="prop-value">${geometry_type || 'Table (no geometry)'}</div>
    </div>
    <div class="prop-row">
      <div class="prop-label">Feature Count</div>
      <div class="prop-value success">${feature_count.toLocaleString()}</div>
    </div>
    <div class="prop-row">
      <div class="prop-label">Field Count</div>
      <div class="prop-value">${fields.length}</div>
    </div>
    ${crs ? `<div class="prop-row"><div class="prop-label">CRS</div><div class="prop-value mono" style="font-size:11px">${crs}</div></div>` : ''}
    ${State.gdbInfo.lock_count > 0 ? `
      <div class="prop-row" style="border: 1px solid rgba(251,191,36,0.3); background: var(--warning-dim);">
        <div class="prop-label" style="color: var(--warning);">⚠️ Active Locks</div>
        <div class="prop-value" style="color: var(--warning); font-size:12px;">
          ${State.gdbInfo.lock_count} lock files active in this GDB. Renaming or editing might fail.
        </div>
      </div>
    ` : ''}
  `;

  // Render Page Skeleton with Tabs
  document.getElementById('main-content-area').innerHTML = `
    <div class="page-heading">
      <div>
        <h2>${name}</h2>
        <div class="subtitle">${dataset ? 'Dataset: ' + dataset : 'Standalone Feature Class'}</div>
      </div>
    </div>
    <div class="tabs">
      <div class="tab ${_activeTab === 'schema' ? 'active' : ''}" id="tab-schema">📋 Schema & Fields (${fields.length})</div>
      <div class="tab ${_activeTab === 'data' ? 'active' : ''}" id="tab-data">📊 Attribute Table (${feature_count.toLocaleString()})</div>
    </div>
    <div id="tab-content"></div>
  `;

  renderTabContent(info);

  // Events
  document.getElementById('tab-schema')?.addEventListener('click', () => {
    _activeTab = 'schema';
    document.getElementById('tab-schema').classList.add('active');
    document.getElementById('tab-data').classList.remove('active');
    renderTabContent(info);
  });

  document.getElementById('tab-data')?.addEventListener('click', () => {
    _activeTab = 'data';
    document.getElementById('tab-data').classList.add('active');
    document.getElementById('tab-schema').classList.remove('active');
    renderTabContent(info);
  });

  document.getElementById('field-search')?.addEventListener('input', (e) => {
    _searchTerm = e.target.value;
    if (_activeTab === 'schema') renderFieldsTable(info);
  });

  document.getElementById('btn-export-fc')?.addEventListener('click', () => {
    const allLayers = State.gdbInfo.datasets.flatMap(d => d.features).concat(State.gdbInfo.standalone_features);
    showExportModal(gdbPath, allLayers, [name]);
  });

  document.getElementById('btn-rename-fc')?.addEventListener('click', () => {
    showRenameFeatureModal(name, gdbPath, (newName) => {
      if (dataset) {
        const ds = State.gdbInfo.datasets.find(d => d.name === dataset);
        if (ds) {
          const idx = ds.features.indexOf(name);
          if (idx >= 0) ds.features[idx] = newName;
        }
      } else {
        const idx = State.gdbInfo.standalone_features.indexOf(name);
        if (idx >= 0) State.gdbInfo.standalone_features[idx] = newName;
      }
      navigate('feature', { name: newName, dataset });
    });
  });

  document.getElementById('btn-add-field')?.addEventListener('click', () => {
    showAddFieldModal(name, gdbPath, () => renderFeaturePage(name, dataset));
  });

  document.getElementById('btn-bulk-add')?.addEventListener('click', () => {
    showBulkAddFieldsModal(gdbPath, State.gdbInfo, dataset);
  });

  document.getElementById('btn-bulk-rename')?.addEventListener('click', () => {
    showBulkRenameFieldModal(gdbPath, State.gdbInfo, dataset);
  });

  document.getElementById('btn-bulk-delete')?.addEventListener('click', () => {
    showBulkDeleteFieldModal(gdbPath, State.gdbInfo, dataset);
  });

  document.getElementById('btn-bulk-calculate')?.addEventListener('click', () => {
    showCalculateFieldModal(_currentFeature.name, null, gdbPath, true, State.gdbInfo, dataset);
  });
}

function renderTabContent(info) {
  if (_activeTab === 'schema') {
    renderFieldsTable(info);
  } else {
    renderDataTable(info, _dataOffset, _dataLimit);
  }
}

function renderFieldsTable(info) {
  const { name, dataset, fields } = info;
  const gdbPath = State.gdbInfo.path;

  const filtered = _searchTerm
    ? fields.filter(f => f.name.toLowerCase().includes(_searchTerm.toLowerCase()) ||
        f.field_type.toLowerCase().includes(_searchTerm.toLowerCase()))
    : fields;

  const tableHTML = `
    <div class="fields-table-wrap">
      <table class="fields-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Field Name</th>
            <th>Type</th>
            <th>Width</th>
            <th>Nullable</th>
            <th>Default</th>
            <th>System</th>
            <th style="text-align:right">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.length === 0 ? `<tr><td colspan="8"><div class="empty-state" style="padding:20px"><p>No fields match your filter.</p></div></td></tr>` :
            filtered.map((f, i) => `
            <tr data-field="${f.name}" data-system="${f.is_system}">
              <td style="color:var(--text-muted)">${i + 1}</td>
              <td class="field-name-cell">${f.name}</td>
              <td><span class="tag tag-type">${formatFieldType(f.field_type)}</span></td>
              <td>${f.width ?? '—'}</td>
              <td>${f.nullable ? '<span class="tag tag-nullable">Yes</span>' : '<span class="tag tag-not-null">No</span>'}</td>
              <td style="color:var(--text-muted)">${'—'}</td>
              <td>${f.is_system ? '<span class="tag tag-system">System</span>' : ''}</td>
              <td>
                <div class="row-actions" style="justify-content:flex-end">
                  ${!f.is_system ? `
                    <button class="icon-btn calculate-field-btn" data-field="${f.name}" title="Calculate field">🧮</button>
                    <button class="icon-btn rename-field-btn" data-field="${f.name}" title="Rename field">✏️</button>
                    <button class="icon-btn danger delete-field-btn" data-field="${f.name}" title="Delete field">🗑</button>
                  ` : '<span style="color:var(--text-muted);font-size:11px;padding-right:8px">locked</span>'}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  const container = document.getElementById('tab-content');
  if (container) container.innerHTML = tableHTML;

  document.querySelectorAll('.rename-field-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showRenameFieldModal(name, btn.dataset.field, gdbPath, () => renderFeaturePage(name, dataset));
    });
  });

  document.querySelectorAll('.calculate-field-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showCalculateFieldModal(name, btn.dataset.field, gdbPath, false);
    });
  });

  document.querySelectorAll('.delete-field-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showDeleteFieldModal(name, btn.dataset.field, gdbPath, () => renderFeaturePage(name, dataset));
    });
  });
}

async function renderDataTable(info, offset = 0, limit = 50) {
  _dataOffset = offset;
  _dataLimit = limit;
  const name = info.name;
  const gdbPath = State.gdbInfo.path;

  const container = document.getElementById('tab-content');
  if (!container) return;

  container.innerHTML = `
    <div style="display:flex; justify-content:center; padding: 40px;">
      <div class="spinner"></div>
    </div>
  `;

  try {
    const data = await API.getFeatureData(name, gdbPath, limit, offset);
    const { total_count, columns, rows } = data;

    const totalPages = Math.ceil(total_count / limit) || 1;
    const currentPage = Math.floor(offset / limit) + 1;
    const startRow = total_count === 0 ? 0 : offset + 1;
    const endRow = Math.min(offset + limit, total_count);

    const limitOptions = [25, 50, 100, 250, 500].map(opt =>
      `<option value="${opt}" ${opt === limit ? 'selected' : ''}>${opt} rows / page</option>`
    ).join('');

    const paginationBarHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:10px; background:var(--bg-elevated); padding:8px 12px; border:1px solid var(--border); border-radius:var(--r-md);">
        <div style="display:flex; align-items:center; gap:12px;">
          <span style="font-size:12px; color:var(--text-muted);">
            Showing <strong>${startRow.toLocaleString()}</strong> – <strong>${endRow.toLocaleString()}</strong> of <strong>${total_count.toLocaleString()}</strong> features
          </span>
          <select class="data-limit-select" class="form-control" style="width:auto; padding:2px 8px; font-size:11px; height:28px;">
            ${limitOptions}
          </select>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <button class="btn btn-secondary data-first-btn" ${currentPage <= 1 ? 'disabled' : ''} style="padding:3px 8px; font-size:11px;" title="First Page">⏮</button>
          <button class="btn btn-secondary data-prev-btn" ${currentPage <= 1 ? 'disabled' : ''} style="padding:3px 8px; font-size:11px;" title="Previous Page">◄ Prev</button>
          
          <div style="display:flex; align-items:center; gap:4px; font-size:12px; color:var(--text-muted);">
            <span>Page</span>
            <input type="number" class="data-page-input" value="${currentPage}" min="1" max="${totalPages}" style="width:52px; text-align:center; padding:2px 4px; font-size:12px; height:26px; border:1px solid var(--border); border-radius:4px; background:var(--bg-surface); color:var(--text-primary);" />
            <span>of ${totalPages.toLocaleString()}</span>
          </div>

          <button class="btn btn-secondary data-next-btn" ${currentPage >= totalPages ? 'disabled' : ''} style="padding:3px 8px; font-size:11px;" title="Next Page">Next ►</button>
          <button class="btn btn-secondary data-last-btn" ${currentPage >= totalPages ? 'disabled' : ''} style="padding:3px 8px; font-size:11px;" title="Last Page">⏭</button>
        </div>
      </div>
    `;

    const tableHTML = `
      ${paginationBarHTML}
      <div class="fields-table-wrap">
        <table class="fields-table">
          <thead>
            <tr>
              <th style="width:50px; text-align:center;">#</th>
              ${columns.map(c => `<th>${c}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows.length === 0 ? `<tr><td colspan="${columns.length + 1}"><div class="empty-state" style="padding:20px"><p>No features found in this table.</p></div></td></tr>` :
              rows.map((r, idx) => `
                <tr>
                  <td style="color:var(--text-muted); font-size:11px; text-align:center; font-family:var(--font-mono);">${offset + idx + 1}</td>
                  ${columns.map(c => `<td class="mono" style="white-space:nowrap; max-width:280px; overflow:hidden; text-overflow:ellipsis;" title="${r[c] !== null && r[c] !== undefined ? String(r[c]).replace(/"/g, '&quot;') : 'NULL'}">${r[c] !== null && r[c] !== undefined ? String(r[c]) : '<span style="color:var(--text-muted)">NULL</span>'}</td>`).join('')}
                </tr>
              `).join('')}
          </tbody>
        </table>
      </div>
      <div style="margin-top:8px;">
        ${paginationBarHTML}
      </div>
    `;

    container.innerHTML = tableHTML;

    // Attach listeners for top & bottom controls
    const goToPage = (page) => {
      let targetPage = parseInt(page, 10);
      if (isNaN(targetPage)) return;
      targetPage = Math.max(1, Math.min(targetPage, totalPages));
      const newOffset = (targetPage - 1) * limit;
      renderDataTable(info, newOffset, limit);
    };

    const changeLimit = (newLimit) => {
      const parsedLimit = parseInt(newLimit, 10);
      if (isNaN(parsedLimit) || parsedLimit <= 0) return;
      renderDataTable(info, 0, parsedLimit);
    };

    container.querySelectorAll('.data-first-btn').forEach(btn => {
      btn.addEventListener('click', () => goToPage(1));
    });

    container.querySelectorAll('.data-prev-btn').forEach(btn => {
      btn.addEventListener('click', () => goToPage(currentPage - 1));
    });

    container.querySelectorAll('.data-next-btn').forEach(btn => {
      btn.addEventListener('click', () => goToPage(currentPage + 1));
    });

    container.querySelectorAll('.data-last-btn').forEach(btn => {
      btn.addEventListener('click', () => goToPage(totalPages));
    });

    container.querySelectorAll('.data-page-input').forEach(input => {
      input.addEventListener('change', (e) => goToPage(e.target.value));
      input.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') goToPage(e.target.value);
      });
    });

    container.querySelectorAll('.data-limit-select').forEach(select => {
      select.addEventListener('change', (e) => changeLimit(e.target.value));
    });

  } catch (e) {
    showError(e.message, 'Failed to fetch attribute data');
    container.innerHTML = `<div class="empty-state" style="padding:30px;"><p>Failed to load data: ${e.message}</p></div>`;
  }
}

export function refreshCurrentFeature() {
  if (State.selectedFeature) {
    renderFeaturePage(State.selectedFeature.name, State.selectedFeature.dataset);
  }
}
