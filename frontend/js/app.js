/**
 * app.js — SPA state management and router
 */
import { renderSidebar } from './components/sidebar.js';
import { renderHome } from './pages/home.js';
import { renderDatasetPage } from './pages/dataset.js';
import { renderFeaturePage } from './pages/feature.js';

// ── Application State ─────────────────────────────────────────────

export const State = {
  gdbInfo: null,
  selectedFeature: null,
  expandedDatasets: new Set(),
  currentPage: 'home',
};

export function setGDB(info) {
  State.gdbInfo = info;
  // Auto-expand first dataset
  if (info.datasets.length > 0) {
    State.expandedDatasets.add(info.datasets[0].name);
  }
  if (info.standalone_features.length > 0) {
    State.expandedDatasets.add('__standalone__');
  }
  // Update header badge
  updateHeaderBadge();
  renderSidebar();
}

export function navigate(page, params = {}) {
  State.currentPage = page;

  // Auto-dismiss overlays on mobile viewports upon navigation
  const app = document.getElementById('app');
  if (app) {
    app.classList.remove('show-sidebar');
    app.classList.remove('show-inspector');
  }

  if (page === 'home') {
    State.selectedFeature = null;
    renderSidebar();
    renderHome();
  } else if (page === 'dataset') {
    State.selectedFeature = null;
    renderSidebar();
    renderDatasetPage(params.name);
  } else if (page === 'feature') {
    renderSidebar();
    renderFeaturePage(params.name, params.dataset);
  }
}

export function refreshCurrentFeature() {
  if (State.selectedFeature) {
    renderFeaturePage(State.selectedFeature.name, State.selectedFeature.dataset);
  }
}

function updateHeaderBadge() {
  const badge = document.getElementById('header-gdb-badge');
  if (!badge || !State.gdbInfo) return;
  badge.innerHTML = `
    <div class="dot"></div>
    <span class="gdb-name">${State.gdbInfo.name}</span>
    <span style="color:var(--text-muted)">·</span>
    <span>${State.gdbInfo.total_features} features</span>
  `;
  badge.style.display = 'flex';
}

// ── Bootstrap ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Initial render
  renderSidebar();
  renderHome();

  // Close GDB button
  document.getElementById('btn-close-gdb')?.addEventListener('click', () => {
    State.gdbInfo = null;
    State.selectedFeature = null;
    State.expandedDatasets.clear();
    const badge = document.getElementById('header-gdb-badge');
    if (badge) badge.style.display = 'none';
    navigate('home');
  });

  // Panel toggles
  document.getElementById('btn-toggle-sidebar')?.addEventListener('click', () => {
    const app = document.getElementById('app');
    if (window.innerWidth <= 1024) {
      app.classList.toggle('show-sidebar');
      app.classList.remove('show-inspector');
    } else {
      app.classList.toggle('hide-sidebar');
    }
  });

  document.getElementById('btn-toggle-inspector')?.addEventListener('click', () => {
    const app = document.getElementById('app');
    if (window.innerWidth <= 1024) {
      app.classList.toggle('show-inspector');
      app.classList.remove('show-sidebar');
    } else {
      app.classList.toggle('hide-inspector');
    }
  });
});
export function formatFieldType(type) {
  const map = {
    'String': 'Text (String)',
    'Integer': 'Short (Integer)',
    'Integer64': 'Long (Integer64)',
    'Real': 'Double (Real)',
    'Date': 'Date',
    'DateTime': 'Date/Time',
    'Binary': 'Blob (Binary)'
  };
  return map[type] || type;
}
