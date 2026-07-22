/**
 * modals.js — All modal dialogs
 */
import { API } from '../api.js';
import { State, refreshCurrentFeature } from '../app.js';
import { showSuccess, showError } from './toast.js';
import { showProgressModal } from './progress_modal.js';

let _activeElementBeforeModal = null;

function openModal(html) {
  _activeElementBeforeModal = document.activeElement;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = html;
  document.body.appendChild(backdrop);

  // Set ARIA attributes on the modal content
  const modalBox = backdrop.querySelector('.modal');
  if (modalBox) {
    modalBox.setAttribute('role', 'dialog');
    modalBox.setAttribute('aria-modal', 'true');
    const titleEl = modalBox.querySelector('.modal-title');
    if (titleEl) {
      const id = 'modal-title-' + Math.random().toString(36).substring(2, 9);
      titleEl.id = id;
      modalBox.setAttribute('aria-labelledby', id);
    }
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal(backdrop);
  });

  backdrop.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => closeModal(backdrop));
  });

  // Focus trap / initial focus setup
  const focusable = backdrop.querySelectorAll('input, select, textarea, button');
  if (focusable.length > 0) {
    const firstInput = Array.from(focusable).find(el => el.tagName === 'INPUT' || el.tagName === 'SELECT');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 50);
    } else {
      setTimeout(() => focusable[0].focus(), 50);
    }
  }

  // Escape key support
  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      closeModal(backdrop);
    }
  };
  document.addEventListener('keydown', handleEsc);
  backdrop._escHandler = handleEsc;

  return backdrop;
}

function closeModal(el) {
  if (el._escHandler) {
    document.removeEventListener('keydown', el._escHandler);
  }
  el.style.opacity = '0';
  el.style.transition = 'opacity 0.15s';
  setTimeout(() => {
    el.remove();
    if (_activeElementBeforeModal && typeof _activeElementBeforeModal.focus === 'function') {
      _activeElementBeforeModal.focus();
    }
  }, 150);
}

// ── Rename Feature Class ──────────────────────────────────────────

export function showRenameFeatureModal(featureName, gdbPath, onSuccess) {
  const backdrop = openModal(`
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">✏️ Rename Feature Class</div>
        <button class="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Current Name</label>
          <div class="form-control" style="color:var(--text-muted);cursor:default">${featureName}</div>
        </div>
        <div class="form-group">
          <label class="form-label" for="new-fc-name">New Name</label>
          <input class="form-control" id="new-fc-name" type="text" value="${featureName}" autocomplete="off" spellcheck="false">
          <div class="form-hint">Use only letters, numbers and underscores. No spaces.</div>
        </div>
        <div class="alert alert-warning">
          ⚠ This renames the feature class in-place inside the GDB. Ensure no other application has the GDB open.
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary modal-close">Cancel</button>
        <button class="btn btn-primary" id="confirm-rename-fc">Rename</button>
      </div>
    </div>
  `);

  const input = backdrop.querySelector('#new-fc-name');
  input.select();

  backdrop.querySelector('#confirm-rename-fc').addEventListener('click', async () => {
    const newName = input.value.trim();
    if (!newName || newName === featureName) { closeModal(backdrop); return; }

    const btn = backdrop.querySelector('#confirm-rename-fc');
    btn.disabled = true;
    btn.textContent = 'Renaming…';

    try {
      await API.renameFeature(featureName, newName, gdbPath);
      showSuccess(`'${featureName}' renamed to '${newName}'`);
      closeModal(backdrop);
      onSuccess && onSuccess(newName);
    } catch (e) {
      showError(e.message, 'Rename Failed');
      btn.disabled = false;
      btn.textContent = 'Rename';
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') backdrop.querySelector('#confirm-rename-fc').click();
  });
}

// ── Rename Feature Dataset ────────────────────────────────────────

export function showRenameDatasetModal(datasetName, gdbPath, onSuccess) {
  const backdrop = openModal(`
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">✏️ Rename Feature Dataset</div>
        <button class="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Current Name</label>
          <div class="form-control" style="color:var(--text-muted);cursor:default">${datasetName}</div>
        </div>
        <div class="form-group">
          <label class="form-label" for="new-ds-name">New Name</label>
          <input class="form-control" id="new-ds-name" type="text" value="${datasetName}" autocomplete="off" spellcheck="false">
          <div class="form-hint">Use only letters, numbers and underscores. No spaces.</div>
        </div>
        <div class="alert alert-warning">
          ⚠ This renames the feature dataset and updates all internal paths of its feature classes. Ensure no locks are present.
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary modal-close">Cancel</button>
        <button class="btn btn-primary" id="confirm-rename-ds">Rename Dataset</button>
      </div>
    </div>
  `);

  const input = backdrop.querySelector('#new-ds-name');
  input.select();

  backdrop.querySelector('#confirm-rename-ds').addEventListener('click', async () => {
    const newName = input.value.trim();
    if (!newName || newName === datasetName) { closeModal(backdrop); return; }

    const btn = backdrop.querySelector('#confirm-rename-ds');
    btn.disabled = true;
    btn.textContent = 'Renaming…';

    try {
      await API.renameDataset(datasetName, newName, gdbPath);
      showSuccess(`Dataset '${datasetName}' renamed to '${newName}'`);
      closeModal(backdrop);
      onSuccess && onSuccess(newName);
    } catch (e) {
      showError(e.message, 'Dataset Rename Failed');
      btn.disabled = false;
      btn.textContent = 'Rename Dataset';
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') backdrop.querySelector('#confirm-rename-ds').click();
  });
}

// ── Add Field (single) ────────────────────────────────────────────

export function showAddFieldModal(layerName, gdbPath, onSuccess) {
  const TYPES = ['String','Integer','Integer64','Real','Date','DateTime','Binary'];
  const typeOptions = TYPES.map(t => `<option value="${t}">${t}</option>`).join('');

  const backdrop = openModal(`
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">➕ Add Field</div>
        <button class="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Target Feature Class</label>
          <div class="form-control" style="color:var(--text-muted);cursor:default">${layerName}</div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="af-name">Field Name *</label>
            <input class="form-control" id="af-name" type="text" placeholder="my_field" autocomplete="off">
          </div>
          <div class="form-group">
            <label class="form-label" for="af-type">Field Type</label>
            <select class="form-control" id="af-type">${typeOptions}</select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="af-width">Width (String)</label>
            <input class="form-control" id="af-width" type="number" value="255" min="1">
          </div>
          <div class="form-group">
            <label class="form-label" for="af-default">Default Value</label>
            <input class="form-control" id="af-default" type="text" placeholder="(optional)">
          </div>
        </div>
        <div class="form-group">
          <label class="checkbox-group">
            <input type="checkbox" id="af-nullable" checked>
            <label for="af-nullable">Allow nulls</label>
          </label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary modal-close">Cancel</button>
        <button class="btn btn-primary" id="confirm-add-field">Add Field</button>
      </div>
    </div>
  `);

  // Show/hide width based on type
  const typeEl = backdrop.querySelector('#af-type');
  const widthEl = backdrop.querySelector('#af-width');
  typeEl.addEventListener('change', () => {
    widthEl.closest('.form-group').style.opacity = typeEl.value === 'String' ? '1' : '0.3';
  });

  backdrop.querySelector('#confirm-add-field').addEventListener('click', async () => {
    const name = backdrop.querySelector('#af-name').value.trim();
    if (!name) { backdrop.querySelector('#af-name').focus(); return; }

    const payload = {
      name,
      field_type: typeEl.value,
      width: parseInt(widthEl.value) || 255,
      nullable: backdrop.querySelector('#af-nullable').checked,
      default_value: backdrop.querySelector('#af-default').value || null,
    };

    const btn = backdrop.querySelector('#confirm-add-field');
    btn.disabled = true; btn.textContent = 'Adding…';

    try {
      await API.addField(layerName, payload, gdbPath);
      showSuccess(`Field '${name}' added to '${layerName}'`);
      closeModal(backdrop);
      onSuccess && onSuccess();
    } catch (e) {
      showError(e.message, 'Add Field Failed');
      btn.disabled = false; btn.textContent = 'Add Field';
    }
  });
}

// ── Rename Field ──────────────────────────────────────────────────

export function showRenameFieldModal(layerName, fieldName, gdbPath, onSuccess) {
  const backdrop = openModal(`
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">✏️ Rename Field</div>
        <button class="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Feature Class</label>
          <div class="form-control" style="color:var(--text-muted);cursor:default">${layerName}</div>
        </div>
        <div class="form-group">
          <label class="form-label">Current Field Name</label>
          <div class="form-control mono" style="color:var(--text-muted);cursor:default">${fieldName}</div>
        </div>
        <div class="form-group">
          <label class="form-label" for="rf-new-name">New Name *</label>
          <input class="form-control mono" id="rf-new-name" type="text" value="${fieldName}" autocomplete="off">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary modal-close">Cancel</button>
        <button class="btn btn-primary" id="confirm-rename-field">Rename</button>
      </div>
    </div>
  `);

  const input = backdrop.querySelector('#rf-new-name');
  input.select();

  backdrop.querySelector('#confirm-rename-field').addEventListener('click', async () => {
    const newName = input.value.trim();
    if (!newName || newName === fieldName) { closeModal(backdrop); return; }

    const btn = backdrop.querySelector('#confirm-rename-field');
    btn.disabled = true; btn.textContent = 'Renaming…';

    try {
      await API.renameField(layerName, fieldName, newName, gdbPath);
      showSuccess(`'${fieldName}' renamed to '${newName}'`);
      closeModal(backdrop);
      onSuccess && onSuccess();
    } catch (e) {
      showError(e.message, 'Rename Failed');
      btn.disabled = false; btn.textContent = 'Rename';
    }
  });
}

// ── Delete Field Confirm ──────────────────────────────────────────

export function showDeleteFieldModal(layerName, fieldName, gdbPath, onSuccess) {
  const backdrop = openModal(`
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">🗑 Delete Field</div>
        <button class="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="alert alert-danger">
          ⚠ This will permanently delete the field and all its data. This cannot be undone.
        </div>
        <p style="color:var(--text-secondary);font-size:13px;margin-top:8px">
          Delete field <strong style="color:var(--danger);font-family:var(--font-mono)">${fieldName}</strong>
          from <strong style="color:var(--text-primary)">${layerName}</strong>?
        </p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary modal-close">Cancel</button>
        <button class="btn btn-danger" id="confirm-delete-field">Delete Field</button>
      </div>
    </div>
  `);

  backdrop.querySelector('#confirm-delete-field').addEventListener('click', async () => {
    const btn = backdrop.querySelector('#confirm-delete-field');
    btn.disabled = true; btn.textContent = 'Deleting…';

    try {
      await API.deleteField(layerName, fieldName, gdbPath);
      showSuccess(`Field '${fieldName}' deleted`);
      closeModal(backdrop);
      onSuccess && onSuccess();
    } catch (e) {
      showError(e.message, 'Delete Failed');
      btn.disabled = false; btn.textContent = 'Delete Field';
    }
  });
}

// ── Bulk Add Fields ───────────────────────────────────────────────

export function showBulkAddFieldsModal(gdbPath, gdbInfo, preselectedDataset) {
  const TYPES = ['String','Integer','Integer64','Real','Date','DateTime','Binary'];
  const typeOptions = TYPES.map(t => `<option value="${t}">${t}</option>`).join('');

  const datasetOptions = ['(All features)', ...gdbInfo.datasets.map(d => d.name)]
    .map(d => `<option value="${d === '(All features)' ? '' : d}" ${d !== '(All features)' && d === preselectedDataset ? 'selected' : ''}>${d}</option>`)
    .join('');

  const backdrop = openModal(`
    <div class="modal modal-lg">
      <div class="modal-header">
        <div class="modal-title">⚡ Bulk Add Fields</div>
        <button class="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="bulk-dataset">Target Dataset</label>
            <select class="form-control" id="bulk-dataset">${datasetOptions}</select>
            <div class="form-hint">Apply to all feature classes in this dataset</div>
          </div>
          <div class="form-group">
            <label class="form-label" for="bulk-filter">Feature Name Filter</label>
            <input class="form-control" id="bulk-filter" type="text" placeholder="e.g. Road (optional substring match)">
          </div>
        </div>

        <div class="section-sep"></div>

        <div class="section-header">
          <span class="section-label">Fields to Add</span>
          <button class="btn btn-secondary" id="add-field-row" style="padding:4px 10px;font-size:11px">+ Add Row</button>
        </div>

        <div style="overflow-x:auto">
          <table class="bulk-fields-table">
            <thead>
              <tr>
                <th style="width:35%">Field Name *</th>
                <th style="width:20%">Type</th>
                <th style="width:12%">Width</th>
                <th style="width:18%">Default Value</th>
                <th style="width:10%">Nullable</th>
                <th style="width:5%"></th>
              </tr>
            </thead>
            <tbody id="bulk-fields-body">
              ${buildFieldRow(typeOptions)}
            </tbody>
          </table>
        </div>

        <div id="bulk-preview" style="margin-top:12px;font-size:11px;color:var(--text-muted)">
          Will apply to all matching feature classes.
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary modal-close">Cancel</button>
        <button class="btn btn-primary" id="run-bulk-add">⚡ Apply Bulk Add</button>
      </div>
    </div>
  `);

  backdrop.querySelector('#add-field-row').addEventListener('click', () => {
    const tbody = backdrop.querySelector('#bulk-fields-body');
    tbody.insertAdjacentHTML('beforeend', buildFieldRow(typeOptions));
    attachDeleteRowListeners(backdrop);
  });

  attachDeleteRowListeners(backdrop);

  backdrop.querySelector('#run-bulk-add').addEventListener('click', async () => {
    const rows = backdrop.querySelectorAll('#bulk-fields-body tr');
    const fields = [];
    let valid = true;

    rows.forEach(row => {
      const name = row.querySelector('.bf-name').value.trim();
      if (!name) { valid = false; row.querySelector('.bf-name').style.borderColor = 'var(--danger)'; return; }
      fields.push({
        name,
        field_type: row.querySelector('.bf-type').value,
        width: parseInt(row.querySelector('.bf-width').value) || 255,
        default_value: row.querySelector('.bf-default').value || null,
        nullable: row.querySelector('.bf-nullable').checked,
      });
    });

    if (!valid || fields.length === 0) return;

    const dataset = backdrop.querySelector('#bulk-dataset').value || null;
    const feature_filter = backdrop.querySelector('#bulk-filter').value.trim() || null;

    const allFeatures = [];
    if (dataset) {
      const ds = gdbInfo.datasets.find(d => d.name === dataset);
      if (ds) allFeatures.push(...ds.features);
    } else {
      allFeatures.push(...gdbInfo.standalone_features);
      gdbInfo.datasets.forEach(d => allFeatures.push(...d.features));
    }
    const targets = feature_filter ? allFeatures.filter(f => f.toLowerCase().includes(feature_filter.toLowerCase())) : allFeatures;

    if (targets.length === 0) {
      showError('No feature classes match the selected filter.', 'Bulk Add Fields');
      return;
    }

    const btn = backdrop.querySelector('#run-bulk-add');
    btn.disabled = true;
    btn.textContent = 'Submitting task…';

    try {
      const res = await API.bulkAddFieldsAsync(gdbPath, { dataset, feature_filter, fields });
      closeModal(backdrop);
      showProgressModal(res.job_id, {
        title: 'Bulk Add Fields',
        onComplete: () => refreshCurrentFeature && refreshCurrentFeature(),
      });
    } catch (e) {
      showError(e.message, 'Bulk Operation Failed');
      btn.disabled = false; btn.textContent = '⚡ Apply Bulk Add';
    }
  });
}

function buildFieldRow(typeOptions) {
  return `
    <tr>
      <td><input type="text" class="bf-name" placeholder="field_name"></td>
      <td><select class="bf-type">${typeOptions}</select></td>
      <td><input type="number" class="bf-width" value="255" min="1" style="width:70px"></td>
      <td><input type="text" class="bf-default" placeholder="—"></td>
      <td style="text-align:center"><input type="checkbox" class="bf-nullable" checked></td>
      <td><button class="icon-btn danger delete-row" title="Remove">✕</button></td>
    </tr>
  `;
}

function attachDeleteRowListeners(backdrop) {
  backdrop.querySelectorAll('.delete-row').forEach(btn => {
    btn.onclick = () => {
      const tbody = backdrop.querySelector('#bulk-fields-body');
      if (tbody.rows.length > 1) btn.closest('tr').remove();
    };
  });
}

// ── Bulk Rename Field ─────────────────────────────────────────────

export function showBulkRenameFieldModal(gdbPath, gdbInfo, preselectedDataset) {
  const datasetOptions = ['(All features)', ...gdbInfo.datasets.map(d => d.name)]
    .map(d => `<option value="${d === '(All features)' ? '' : d}" ${d !== '(All features)' && d === preselectedDataset ? 'selected' : ''}>${d}</option>`)
    .join('');

  const backdrop = openModal(`
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">✏️ Bulk Rename Field</div>
        <button class="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label" for="brn-dataset">Target Dataset</label>
          <select class="form-control" id="brn-dataset">${datasetOptions}</select>
        </div>
        <div class="form-group">
          <label class="form-label" for="brn-filter">Feature Name Filter (optional)</label>
          <input class="form-control" id="brn-filter" type="text" placeholder="substring match">
        </div>
        <div class="section-sep"></div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="brn-old">Current Field Name *</label>
            <input class="form-control mono" id="brn-old" type="text" placeholder="old_field_name">
          </div>
          <div class="form-group">
            <label class="form-label" for="brn-new">New Field Name *</label>
            <input class="form-control mono" id="brn-new" type="text" placeholder="new_field_name">
          </div>
        </div>
        <div class="form-hint">Feature classes where the field doesn't exist will be skipped silently.</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary modal-close">Cancel</button>
        <button class="btn btn-primary" id="run-bulk-rename">✏️ Apply Bulk Rename</button>
      </div>
    </div>
  `);

  backdrop.querySelector('#run-bulk-rename').addEventListener('click', async () => {
    const old_name = backdrop.querySelector('#brn-old').value.trim();
    const new_name = backdrop.querySelector('#brn-new').value.trim();
    if (!old_name || !new_name) return;

    const dataset = backdrop.querySelector('#brn-dataset').value || null;
    const feature_filter = backdrop.querySelector('#brn-filter').value.trim() || null;

    const allFeatures = [];
    if (dataset) {
      const ds = gdbInfo.datasets.find(d => d.name === dataset);
      if (ds) allFeatures.push(...ds.features);
    } else {
      allFeatures.push(...gdbInfo.standalone_features);
      gdbInfo.datasets.forEach(d => allFeatures.push(...d.features));
    }
    const targets = feature_filter ? allFeatures.filter(f => f.toLowerCase().includes(feature_filter.toLowerCase())) : allFeatures;

    if (targets.length === 0) {
      showError('No feature classes match the selected filter.', 'Bulk Rename Field');
      return;
    }

    const btn = backdrop.querySelector('#run-bulk-rename');
    btn.disabled = true;
    btn.textContent = 'Submitting task…';

    try {
      const res = await API.bulkRenameFieldAsync(gdbPath, { dataset, feature_filter, old_name, new_name });
      closeModal(backdrop);
      showProgressModal(res.job_id, {
        title: 'Bulk Rename Field',
        onComplete: () => refreshCurrentFeature && refreshCurrentFeature(),
      });
    } catch (e) {
      showError(e.message, 'Bulk Rename Failed');
      btn.disabled = false; btn.textContent = '✏️ Apply Bulk Rename';
    }
  });
}

// ── Bulk Delete Field ─────────────────────────────────────────────

export function showBulkDeleteFieldModal(gdbPath, gdbInfo, preselectedDataset) {
  const datasetOptions = ['(All features)', ...gdbInfo.datasets.map(d => d.name)]
    .map(d => `<option value="${d === '(All features)' ? '' : d}" ${d !== '(All features)' && d === preselectedDataset ? 'selected' : ''}>${d}</option>`)
    .join('');

  const backdrop = openModal(`
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">🗑 Bulk Delete Field</div>
        <button class="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="alert alert-danger">
          ⚠ This will permanently delete the field and all its data from every matched feature class.
        </div>
        <div class="form-group">
          <label class="form-label" for="bdf-dataset">Target Dataset</label>
          <select class="form-control" id="bdf-dataset">${datasetOptions}</select>
        </div>
        <div class="form-group">
          <label class="form-label" for="bdf-filter">Feature Name Filter (optional)</label>
          <input class="form-control" id="bdf-filter" type="text" placeholder="substring match">
        </div>
        <div class="form-group">
          <label class="form-label" for="bdf-field">Field Name to Delete *</label>
          <input class="form-control mono" id="bdf-field" type="text" placeholder="field_name">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary modal-close">Cancel</button>
        <button class="btn btn-danger" id="run-bulk-delete">🗑 Apply Bulk Delete</button>
      </div>
    </div>
  `);

  backdrop.querySelector('#run-bulk-delete').addEventListener('click', async () => {
    const field_name = backdrop.querySelector('#bdf-field').value.trim();
    if (!field_name) return;

    const dataset = backdrop.querySelector('#bdf-dataset').value || null;
    const feature_filter = backdrop.querySelector('#bdf-filter').value.trim() || null;

    const allFeatures = [];
    if (dataset) {
      const ds = gdbInfo.datasets.find(d => d.name === dataset);
      if (ds) allFeatures.push(...ds.features);
    } else {
      allFeatures.push(...gdbInfo.standalone_features);
      gdbInfo.datasets.forEach(d => allFeatures.push(...d.features));
    }
    const targets = feature_filter ? allFeatures.filter(f => f.toLowerCase().includes(feature_filter.toLowerCase())) : allFeatures;

    if (targets.length === 0) {
      showError('No feature classes match the selected filter.', 'Bulk Delete Field');
      return;
    }

    const btn = backdrop.querySelector('#run-bulk-delete');
    btn.disabled = true;
    btn.textContent = 'Submitting task…';

    try {
      const res = await API.bulkDeleteFieldAsync(gdbPath, { dataset, feature_filter, field_name });
      closeModal(backdrop);
      showProgressModal(res.job_id, {
        title: 'Bulk Delete Field',
        onComplete: () => refreshCurrentFeature && refreshCurrentFeature(),
      });
    } catch (e) {
      showError(e.message, 'Bulk Delete Failed');
      btn.disabled = false; btn.textContent = '🗑 Apply Bulk Delete';
    }
  });
}

// ── Bulk Results ──────────────────────────────────────────────────

function showBulkResultsModal(result, title) {
  const backdrop = openModal(`
    <div class="modal modal-lg">
      <div class="modal-header">
        <div class="modal-title">📊 ${title}</div>
        <button class="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="results-summary">
          <div class="result-stat total">
            <span class="num">${result.total}</span>
            <span class="lbl">Total</span>
          </div>
          <div class="result-stat ok">
            <span class="num">${result.succeeded}</span>
            <span class="lbl">Succeeded</span>
          </div>
          <div class="result-stat fail">
            <span class="num">${result.failed}</span>
            <span class="lbl">Failed</span>
          </div>
        </div>
        <div class="results-list">
          ${result.results.map(r => `
            <div class="result-row ${r.success ? 'ok' : 'fail'}">
              <div class="result-icon">${r.success ? '✓' : '✕'}</div>
              <div class="result-text">${r.message}</div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary modal-close">Done</button>
      </div>
    </div>
  `);

  if (result.failed === 0) {
    showSuccess(`All ${result.succeeded} operations succeeded`);
  } else if (result.succeeded === 0) {
    showError(`All ${result.failed} operations failed`);
  } else {
    showSuccess(`${result.succeeded} succeeded, ${result.failed} failed`);
  }
  
  // Refresh the underlying UI so the user can see the newly added/modified fields
  refreshCurrentFeature();
}

// ── Export Modal ──────────────────────────────────────────────────

export function showExportModal(gdbPath, availableLayers = [], defaultSelectedLayers = []) {
  const layerCheckboxesHTML = availableLayers.map(layer => `
    <label class="checkbox-group" style="padding: 4px 0; display:flex; align-items:center; gap:8px;">
      <input type="checkbox" class="export-layer-checkbox" value="${layer}" ${defaultSelectedLayers.length === 0 || defaultSelectedLayers.includes(layer) ? 'checked' : ''}>
      <span>${layer}</span>
    </label>
  `).join('');

  const backdrop = openModal(`
    <div class="modal" style="max-width: 520px;">
      <div class="modal-header">
        <div class="modal-title">📦 Export Layers (Shapefile / GeoJSON)</div>
        <button class="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label" for="export-format">Export Format</label>
          <select class="form-control" id="export-format">
            <option value="shapefile">ESRI Shapefile (.shp inside .zip archive)</option>
            <option value="geojson">GeoJSON (.json inside .zip archive)</option>
          </select>
        </div>
        <div class="form-group">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
            <label class="form-label" style="margin:0;">Select Layers to Export</label>
            <div style="display:flex; gap:10px; font-size:12px;">
              <a href="#" id="export-select-all" style="color:var(--accent); text-decoration:none;">Select All</a>
              <a href="#" id="export-deselect-all" style="color:var(--text-muted); text-decoration:none;">Deselect All</a>
            </div>
          </div>
          <div style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border-strong); border-radius: var(--r-md); padding: 8px 12px; background: var(--bg-surface);">
            ${layerCheckboxesHTML}
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary modal-close">Cancel</button>
        <button class="btn btn-primary" id="confirm-export">📥 Export Selected</button>
      </div>
    </div>
  `);

  backdrop.querySelector('#export-select-all').addEventListener('click', (e) => {
    e.preventDefault();
    backdrop.querySelectorAll('.export-layer-checkbox').forEach(cb => cb.checked = true);
  });

  backdrop.querySelector('#export-deselect-all').addEventListener('click', (e) => {
    e.preventDefault();
    backdrop.querySelectorAll('.export-layer-checkbox').forEach(cb => cb.checked = false);
  });

  backdrop.querySelector('#confirm-export').addEventListener('click', async () => {
    const selectedLayers = Array.from(backdrop.querySelectorAll('.export-layer-checkbox:checked')).map(cb => cb.value);
    const format = backdrop.querySelector('#export-format').value;

    if (selectedLayers.length === 0) {
      showError('Please select at least one layer to export.');
      return;
    }

    const btn = backdrop.querySelector('#confirm-export');
    btn.disabled = true;
    btn.textContent = 'Packaging Export…';

    try {
      await API.exportFeatures(gdbPath, selectedLayers, format);
      showSuccess(`Export package downloaded for ${selectedLayers.length} layer(s)`);
      closeModal(backdrop);
    } catch (e) {
      showError(e.message, 'Export Failed');
      btn.disabled = false;
      btn.textContent = '📥 Export Selected';
    }
  });
}

// ── Calculate Field ───────────────────────────────────────────────

export function showCalculateFieldModal(layerName, fieldName, gdbPath, isBulk = false, gdbInfo = null, preselectedDataset = null) {
  const calcOptions = [
    { value: 'constant', label: 'Constant Value' },
    { value: 'area_sqm', label: 'Area (Square Meters)' },
    { value: 'area_ha', label: 'Area (Hectares)' },
    { value: 'area_acres', label: 'Area (Acres)' },
    { value: 'area_sqft', label: 'Area (Square Feet)' },
    { value: 'area_sqkm', label: 'Area (Square Kilometers)' },
    { value: 'length_m', label: 'Perimeter/Length (Meters)' },
    { value: 'length_km', label: 'Perimeter/Length (Kilometers)' },
    { value: 'length_ft', label: 'Perimeter/Length (Feet)' },
    { value: 'centroid_x', label: 'Centroid Longitude / X (WGS 84 - EPSG:4326)' },
    { value: 'centroid_y', label: 'Centroid Latitude / Y (WGS 84 - EPSG:4326)' }
  ].map(o => `<option value="${o.value}">${o.label}</option>`).join('');

  let targetControls = '';
  if (isBulk) {
    const datasetOptions = ['(All features)', ...gdbInfo.datasets.map(d => d.name)]
      .map(d => `<option value="${d === '(All features)' ? '' : d}" ${d !== '(All features)' && d === preselectedDataset ? 'selected' : ''}>${d}</option>`)
      .join('');
      
    targetControls = `
      <div class="form-group">
        <label class="form-label" for="calc-dataset">Target Dataset</label>
        <select class="form-control" id="calc-dataset">${datasetOptions}</select>
      </div>
      <div class="form-group">
        <label class="form-label" for="calc-filter">Feature Name Filter (optional)</label>
        <input class="form-control" id="calc-filter" type="text" placeholder="substring match">
      </div>
      <div class="form-group">
        <label class="form-label" for="calc-field">Field Name *</label>
        <input class="form-control mono" id="calc-field" type="text" placeholder="field_name" value="${fieldName || ''}">
      </div>
      <div class="section-sep"></div>
    `;
  } else {
    targetControls = `
      <div class="form-group">
        <label class="form-label">Target</label>
        <div style="padding:8px 12px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:4px;font-family:monospace">
          ${layerName} > ${fieldName}
        </div>
      </div>
    `;
  }

  const backdrop = openModal(`
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">🧮 ${isBulk ? 'Bulk Calculate Field' : 'Calculate Field'}</div>
        <button class="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="alert alert-info">
          Geometry calculations use the map units of the layer's coordinate system. Geographic CRS will result in square degrees.
        </div>
        ${targetControls}
        <div class="form-group">
          <label class="form-label" for="calc-type">Calculation Type</label>
          <select class="form-control" id="calc-type">
            ${calcOptions}
          </select>
        </div>
        <div class="form-group" id="calc-const-group">
          <label class="form-label" for="calc-const">Constant Value</label>
          <input class="form-control mono" id="calc-const" type="text" placeholder="e.g. 100 or 'Pending'">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary modal-close">Cancel</button>
        <button class="btn btn-primary" id="run-calc">🧮 ${isBulk ? 'Apply Bulk Calculate' : 'Calculate'}</button>
      </div>
    </div>
  `);

  const typeSel = backdrop.querySelector('#calc-type');
  const constGroup = backdrop.querySelector('#calc-const-group');
  
  typeSel.addEventListener('change', () => {
    if (typeSel.value === 'constant') {
      constGroup.style.display = 'block';
    } else {
      constGroup.style.display = 'none';
    }
  });

  backdrop.querySelector('#run-calc').addEventListener('click', async () => {
    const calcType = typeSel.value;
    let constVal = backdrop.querySelector('#calc-const').value.trim();
    if (calcType === 'constant') {
      if (!constVal) return;
      if (!isNaN(Number(constVal))) constVal = Number(constVal);
    } else {
      constVal = null;
    }

    const btn = backdrop.querySelector('#run-calc');
    btn.disabled = true;

    if (!isBulk) {
      btn.textContent = 'Calculating…';
      try {
        const res = await API.calculateField(layerName, fieldName, gdbPath, {
          calc_type: calcType,
          constant_value: constVal
        });
        showSuccess(res.message);
        closeModal(backdrop);
        if (window.refreshCurrentFeature) window.refreshCurrentFeature();
      } catch (e) {
        showError(e.message, 'Calculation Failed');
        btn.disabled = false; btn.textContent = '🧮 Calculate';
      }
    } else {
      const field_name = backdrop.querySelector('#calc-field').value.trim();
      if (!field_name) {
        btn.disabled = false;
        return;
      }
      
      const dataset = backdrop.querySelector('#calc-dataset').value || null;
      const feature_filter = backdrop.querySelector('#calc-filter').value.trim() || null;

      btn.textContent = 'Submitting task…';
      try {
        const res = await API.bulkCalculateFieldAsync(gdbPath, {
          dataset,
          feature_filter,
          field_name,
          calc_type: calcType,
          constant_value: constVal
        });
        closeModal(backdrop);
        showProgressModal(res.job_id, {
          title: `Bulk Calculate (${calcType})`,
          onComplete: () => refreshCurrentFeature && refreshCurrentFeature(),
        });
      } catch (err) {
        showError(err.message, 'Bulk Calculate Failed');
        btn.disabled = false;
        btn.textContent = '🧮 Apply Bulk Calculate';
      }
    }
  });
}
