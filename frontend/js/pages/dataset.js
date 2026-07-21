/**
 * dataset.js — Feature dataset overview page (grid of feature cards)
 */
import { State, navigate } from '../app.js';
import {
  showBulkAddFieldsModal,
  showBulkRenameFieldModal,
  showBulkDeleteFieldModal,
  showRenameDatasetModal,
  showExportModal,
} from '../components/modals.js';

const GEOM_ICONS = {
  'Point': '📍',
  'Multi Point': '📍',
  'Line String': '📏',
  'Multi Line String': '📏',
  'Polygon': '⬡',
  'Multi Polygon': '⬡',
  'Geometry Collection': '🗺️',
};

function buildBreadcrumbsHTML(dataset) {
  const gdbName = State.gdbInfo ? State.gdbInfo.name : 'Home';
  return `
    <nav class="breadcrumb-nav" aria-label="Breadcrumb">
      <ol class="breadcrumb">
        <li>
          <a class="breadcrumb-item breadcrumb-home" role="button" tabindex="0">🗄️ ${gdbName}</a>
        </li>
        <li>
          <span class="breadcrumb-item active" aria-current="page">${dataset}</span>
        </li>
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
}

export function renderDatasetPage(datasetName) {
  const gdbInfo = State.gdbInfo;
  if (!gdbInfo) return;

  const dataset = datasetName
    ? gdbInfo.datasets.find(d => d.name === datasetName)
    : null;

  const features = dataset ? dataset.features : gdbInfo.standalone_features;
  const title = datasetName || 'Standalone Features';
  const gdbPath = gdbInfo.path;

  document.getElementById('toolbar').innerHTML = `
    <div class="toolbar-title">
      ${buildBreadcrumbsHTML(title)}
    </div>
    <div class="toolbar-sep"></div>
    ${datasetName ? `<button class="btn btn-secondary" id="btn-rename-ds" style="font-size:11px">✏️ Rename Dataset</button>` : ''}
    <button class="btn btn-secondary" id="btn-export-ds" style="font-size:11px">📦 Export Dataset</button>
    <div class="toolbar-divider"></div>
    <button class="btn btn-ghost" id="ds-bulk-add" style="font-size:11px">⚡ Bulk Add Fields</button>
    <button class="btn btn-ghost" id="ds-bulk-rename" style="font-size:11px">✏️ Bulk Rename Field</button>
    <button class="btn btn-ghost" id="ds-bulk-delete" style="font-size:11px">🗑 Bulk Delete Field</button>
  `;

  attachBreadcrumbListeners(document.getElementById('toolbar'));

  document.getElementById('inspector-body').innerHTML = `
    <div class="prop-row">
      <div class="prop-label">Dataset</div>
      <div class="prop-value">${title}</div>
    </div>
    <div class="prop-row">
      <div class="prop-label">Feature Classes</div>
      <div class="prop-value success">${features.length}</div>
    </div>
    <div class="prop-row">
      <div class="prop-label">GDB</div>
      <div class="prop-value mono" style="font-size:11px;word-break:break-all">${gdbInfo.name}</div>
    </div>
    ${gdbInfo.lock_count > 0 ? `
      <div class="prop-row" style="border: 1px solid rgba(251,191,36,0.3); background: var(--warning-dim);">
        <div class="prop-label" style="color: var(--warning);">⚠️ Active Locks</div>
        <div class="prop-value" style="color: var(--warning); font-size:12px;">
          ${gdbInfo.lock_count} lock files active in this GDB. Renaming or editing might fail.
        </div>
      </div>
    ` : ''}
  `;

  if (features.length === 0) {
    document.getElementById('main-content-area').innerHTML = `
      <div class="empty-state" style="padding-top:80px">
        <div class="empty-icon">📂</div>
        <h3>Empty dataset</h3>
        <p>This dataset contains no feature classes.</p>
      </div>
    `;
    return;
  }

  document.getElementById('main-content-area').innerHTML = `
    <div class="page-heading">
      <div>
        <h2>${title}</h2>
        <div class="subtitle">${features.length} feature class${features.length !== 1 ? 'es' : ''}</div>
      </div>
    </div>
    <div class="feature-grid">
      ${features.map(fc => {
        const icon = '⬡'; // Will be overridden once we have geometry type info
        return `
          <div class="feature-card" data-name="${fc}" data-dataset="${datasetName || ''}" role="button" tabindex="0" aria-label="Feature class ${fc}">
            <div class="fc-icon">${icon}</div>
            <div class="fc-name">${fc}</div>
            <div class="fc-meta">
              <span>📂 ${datasetName || 'Standalone'}</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  document.querySelectorAll('.feature-card').forEach(card => {
    const runNavigation = () => {
      navigate('feature', {
        name: card.dataset.name,
        dataset: card.dataset.dataset || null,
      });
    };

    card.addEventListener('click', runNavigation);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        runNavigation();
      }
    });
  });

  document.getElementById('ds-bulk-add').addEventListener('click', () => {
    showBulkAddFieldsModal(gdbPath, gdbInfo, datasetName);
  });
  document.getElementById('ds-bulk-rename').addEventListener('click', () => {
    showBulkRenameFieldModal(gdbPath, gdbInfo, datasetName);
  });
  document.getElementById('ds-bulk-delete').addEventListener('click', () => {
    showBulkDeleteFieldModal(gdbPath, gdbInfo, datasetName);
  });

  document.getElementById('btn-export-ds')?.addEventListener('click', () => {
    const allLayers = gdbInfo.datasets.flatMap(d => d.features).concat(gdbInfo.standalone_features);
    showExportModal(gdbPath, allLayers, features);
  });

  if (datasetName) {
    document.getElementById('btn-rename-ds')?.addEventListener('click', () => {
      showRenameDatasetModal(datasetName, gdbPath, (newName) => {
        // Update dataset name in state
        const ds = State.gdbInfo.datasets.find(d => d.name === datasetName);
        if (ds) ds.name = newName;

        // Update expanded datasets mapping
        if (State.expandedDatasets.has(datasetName)) {
          State.expandedDatasets.delete(datasetName);
          State.expandedDatasets.add(newName);
        }

        navigate('dataset', { name: newName });
      });
    });
  }
}
