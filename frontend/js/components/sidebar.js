/**
 * sidebar.js — GDB tree navigator with dynamic filter and keyboard accessibility
 */
import { State, navigate } from '../app.js';

export function renderSidebar() {
  const el = document.getElementById('sidebar');
  if (!el) return;
  el.innerHTML = buildSidebar();
  attachSidebarEvents(el);
}

function buildSidebar() {
  const { gdbInfo, selectedFeature } = State;

  if (!gdbInfo) {
    return `
      <div class="sidebar-header" role="presentation">
        <span class="sidebar-title">Explorer</span>
      </div>
      <div class="empty-state" style="padding:40px 16px" role="region" aria-label="Explorer status">
        <div class="empty-icon" aria-hidden="true">🗄️</div>
        <h3>No GDB loaded</h3>
        <p>Load a geodatabase to browse its contents</p>
      </div>
    `;
  }

  let tree = `
    <div class="sidebar-header">
      <span class="sidebar-title">Explorer</span>
    </div>
    <div class="sidebar-search-wrap" style="padding: 0 10px 10px;">
      <div class="search-bar" style="padding: 5px 8px; border-radius: var(--r-sm);">
        <span class="search-icon" aria-hidden="true">🔍</span>
        <input id="sidebar-search" type="text" placeholder="Filter layers..." aria-label="Filter sidebar layers" autocomplete="off">
      </div>
    </div>
    <div class="sidebar-tree" id="sidebar-tree" role="tree" aria-label="Geodatabase layers">
      <div class="tree-node dataset" data-type="gdb" data-name="${gdbInfo.name}" title="${gdbInfo.path}" role="treeitem" tabindex="0" aria-label="Geodatabase: ${gdbInfo.name}">
        <span class="tree-icon" aria-hidden="true">🗄️</span>
        <span class="tree-label">${gdbInfo.name}</span>
        <span class="tree-badge">${gdbInfo.total_features}</span>
      </div>
  `;

  // Feature Datasets
  for (const ds of gdbInfo.datasets) {
    const dsId = `ds-${ds.name}`;
    const isExpanded = State.expandedDatasets.has(ds.name);
    tree += `
      <div class="tree-node dataset tree-expandable" data-type="dataset" data-name="${ds.name}" role="treeitem" tabindex="0" aria-expanded="${isExpanded}" aria-owns="${dsId}">
        <span class="tree-chevron ${isExpanded ? 'open' : ''}" aria-hidden="true">›</span>
        <span class="tree-icon" aria-hidden="true">📁</span>
        <span class="tree-label">${ds.name}</span>
        <span class="tree-badge">${ds.features.length}</span>
      </div>
      <div class="tree-children" id="${dsId}" role="group" aria-label="${ds.name} contents" style="${isExpanded ? '' : 'max-height:0;'}">
    `;
    for (const fc of ds.features) {
      const isActive = selectedFeature && selectedFeature.name === fc && selectedFeature.dataset === ds.name;
      tree += `
        <div class="tree-node feature nested ${isActive ? 'active' : ''}"
             data-type="feature" data-name="${fc}" data-dataset="${ds.name}" role="treeitem" tabindex="0" aria-selected="${isActive}">
          <span class="tree-icon" aria-hidden="true">⬡</span>
          <span class="tree-label">${fc}</span>
        </div>
      `;
    }
    tree += `</div>`;
  }

  // Standalone features
  if (gdbInfo.standalone_features.length > 0) {
    const isExpanded = State.expandedDatasets.has('__standalone__');
    tree += `
      <div class="tree-node dataset tree-expandable" data-type="standalone-group" data-name="__standalone__" role="treeitem" tabindex="0" aria-expanded="${isExpanded}" aria-owns="ds-__standalone__">
        <span class="tree-chevron ${isExpanded ? 'open' : ''}" aria-hidden="true">›</span>
        <span class="tree-icon" aria-hidden="true">📋</span>
        <span class="tree-label">Standalone</span>
        <span class="tree-badge">${gdbInfo.standalone_features.length}</span>
      </div>
      <div class="tree-children" id="ds-__standalone__" role="group" aria-label="Standalone features" style="${isExpanded ? '' : 'max-height:0;'}">
    `;
    for (const fc of gdbInfo.standalone_features) {
      const isActive = selectedFeature && selectedFeature.name === fc && !selectedFeature.dataset;
      tree += `
        <div class="tree-node feature nested ${isActive ? 'active' : ''}"
             data-type="feature" data-name="${fc}" data-dataset="" role="treeitem" tabindex="0" aria-selected="${isActive}">
          <span class="tree-icon" aria-hidden="true">⬡</span>
          <span class="tree-label">${fc}</span>
        </div>
      `;
    }
    tree += `</div>`;
  }

  tree += `</div>`;
  return tree;
}

function attachSidebarEvents(el) {
  // Toggle expansion
  const toggleExpand = (node) => {
    const name = node.dataset.name;
    const chevron = node.querySelector('.tree-chevron');
    const children = el.querySelector(`#ds-${name}`);
    if (!children) return;

    const isOpen = State.expandedDatasets.has(name);
    if (isOpen) {
      State.expandedDatasets.delete(name);
      chevron?.classList.remove('open');
      node.setAttribute('aria-expanded', 'false');
      children.style.maxHeight = '0';
    } else {
      State.expandedDatasets.add(name);
      chevron?.classList.add('open');
      node.setAttribute('aria-expanded', 'true');
      children.style.maxHeight = children.scrollHeight + 'px';
    }

    setTimeout(() => {
      if (State.expandedDatasets.has(name)) {
        children.style.maxHeight = children.scrollHeight + 'px';
      }
    }, 10);
  };

  el.querySelectorAll('.tree-expandable').forEach(node => {
    node.addEventListener('click', () => toggleExpand(node));
  });

  // Navigate to dataset
  el.querySelectorAll('[data-type="dataset"]').forEach(node => {
    node.addEventListener('click', (e) => {
      if (e.target.closest('.tree-chevron') || e.target.classList.contains('tree-chevron')) return;
      if (node.classList.contains('tree-expandable')) return; // ignore expandable titles if clicking expander
      navigate('dataset', { name: node.dataset.name });
    });
  });

  // Navigate to feature
  el.querySelectorAll('[data-type="feature"]').forEach(node => {
    node.addEventListener('click', () => {
      navigate('feature', {
        name: node.dataset.name,
        dataset: node.dataset.dataset || null,
      });
    });
  });

  // Keyboard accessibility
  el.querySelectorAll('.tree-node').forEach(node => {
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (node.classList.contains('tree-expandable')) {
          toggleExpand(node);
        } else if (node.dataset.type === 'feature') {
          navigate('feature', {
            name: node.dataset.name,
            dataset: node.dataset.dataset || null,
          });
        }
      }
    });
  });

  // Sidebar Filter Search logic
  const searchInput = el.querySelector('#sidebar-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase().trim();
      const features = el.querySelectorAll('.tree-node.feature');
      const datasets = el.querySelectorAll('.tree-node.dataset.tree-expandable');
      const childrenContainers = el.querySelectorAll('.tree-children');

      if (!term) {
        // Reset view
        features.forEach(n => n.style.display = '');
        datasets.forEach(d => d.style.display = '');
        childrenContainers.forEach(c => {
          const name = c.id.replace('ds-', '');
          const isExpanded = State.expandedDatasets.has(name);
          c.style.maxHeight = isExpanded ? '' : '0';
        });
        return;
      }

      const matchedDatasets = new Set();
      features.forEach(n => {
        const fcName = n.dataset.name.toLowerCase();
        const dsName = n.dataset.dataset;
        if (fcName.includes(term)) {
          n.style.display = '';
          if (dsName) matchedDatasets.add(dsName);
          else matchedDatasets.add('__standalone__');
        } else {
          n.style.display = 'none';
        }
      });

      datasets.forEach(d => {
        const name = d.dataset.name;
        if (matchedDatasets.has(name)) {
          d.style.display = '';
          const children = el.querySelector(`#ds-${name}`);
          if (children) children.style.maxHeight = 'none';
        } else {
          d.style.display = 'none';
          const children = el.querySelector(`#ds-${name}`);
          if (children) children.style.maxHeight = '0';
        }
      });
    });
  }
}
