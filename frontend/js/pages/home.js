/**
 * home.js — Landing page / GDB loader
 */
import { API } from '../api.js';
import { State, setGDB, navigate } from '../app.js';
import { showError, showInfo } from '../components/toast.js';

export async function renderHome() {
  renderHomeSkeleton();
  try {
    const data = await API.listGDBs();
    renderHomeWithData(data.gdbs || []);
  } catch (e) {
    renderHomeWithData([]);
    showError(e.message, 'Failed to list GDBs');
  }
}

function renderHomeSkeleton() {
  document.getElementById('toolbar').innerHTML = `
    <div class="toolbar-title">GeoDBManager</div>
  `;
  document.getElementById('inspector-body').innerHTML = `
    <div class="empty-state" style="padding:30px 12px">
      <div class="empty-icon" style="font-size:28px">🗺️</div>
      <h3>No GDB loaded</h3>
    </div>
  `;
  document.getElementById('main-content-area').innerHTML = `
    <div class="home-page">
      <div class="home-hero">
        <h1>GeoDBManager</h1>
        <p>A professional tool for managing Esri File Geodatabases — browse, rename, and bulk-edit fields with ease.</p>
      </div>
      <div class="gdb-picker-card">
        <h2>Loading available geodatabases…</h2>
        <div style="display:flex;justify-content:center;padding:20px">
          <div class="spinner"></div>
        </div>
      </div>
    </div>
  `;
}

function renderHomeWithData(gdbs) {
  const gdbListHTML = gdbs.length === 0
    ? `<div class="empty-state" style="padding:15px">
         <div class="empty-icon" style="font-size:24px">📁</div>
         <p style="margin:0;">No .gdb folders found in <code style="font-family:var(--font-mono)">/data</code></p>
       </div>`
    : gdbs.map(g => `
        <div class="gdb-list-item" data-path="${g.path}" id="gdb-item-${encodeURIComponent(g.name)}" role="option" tabindex="0" aria-label="Geodatabase ${g.name}">
          <div class="gdb-item-icon" aria-hidden="true">🗄️</div>
          <div class="gdb-item-info">
            <div class="gdb-item-name">${g.name}</div>
            <div class="gdb-item-path">${g.path}</div>
          </div>
        </div>
      `).join('');

  document.getElementById('main-content-area').innerHTML = `
    <div class="home-page">
      <div class="home-hero">
        <h1>GeoDBManager</h1>
        <p>A professional tool for managing Esri File Geodatabases — browse, rename, preview data, and bulk-edit fields with ease.</p>
      </div>

      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:20px; width:100%; max-width:900px; margin:0 auto;">
        
        <!-- Local / Discovered GDB Picker -->
        <div class="gdb-picker-card">
          <h2>📁 Discovered Geodatabases</h2>
          <div class="gdb-list" role="listbox" aria-label="Available geodatabases">${gdbListHTML}</div>
          ${gdbs.length > 0 ? `<button class="btn btn-primary" id="load-gdb-btn" style="width:100%">Open Selected GDB</button>` : ''}
        </div>

        <!-- Custom Path / Upload Card -->
        <div class="gdb-picker-card" style="display:flex; flex-direction:column; justify-content:space-between;">
          <div>
            <h2>📂 Open External Geodatabase</h2>
            <div class="form-group" style="margin-top:15px;">
              <label class="form-label" for="custom-gdb-path">Enter Absolute GDB Path</label>
              <div style="display:flex; gap:8px;">
                <input class="form-control mono" id="custom-gdb-path" type="text" placeholder="/data/my_database.gdb" value="${gdbs.length > 0 ? gdbs[0].path : '/data/sample.gdb'}">
                <button class="btn btn-secondary" id="load-custom-btn">Open</button>
              </div>
            </div>

            <div class="section-sep" style="margin:20px 0;"></div>

            <h2>📤 Upload .gdb.zip Archive</h2>
            <p style="font-size:12px; color:var(--text-muted); margin-bottom:10px;">Upload a compressed .zip archive containing a .gdb folder.</p>
            <input type="file" id="upload-gdb-input" accept=".zip" style="display:none;">
            <button class="btn btn-secondary" id="trigger-upload-btn" style="width:100%">Choose .zip file to upload</button>
          </div>
        </div>

      </div>
    </div>
  `;

  let selectedPath = gdbs.length > 0 ? gdbs[0].path : null;
  if (selectedPath) {
    const activeItem = document.querySelector(`[data-path="${selectedPath}"]`);
    if (activeItem) {
      activeItem.classList.add('selected');
      activeItem.setAttribute('aria-selected', 'true');
    }
  }

  document.querySelectorAll('.gdb-list-item').forEach(item => {
    const selectItem = () => {
      document.querySelectorAll('.gdb-list-item').forEach(i => {
        i.classList.remove('selected');
        i.setAttribute('aria-selected', 'false');
      });
      item.classList.add('selected');
      item.setAttribute('aria-selected', 'true');
      selectedPath = item.dataset.path;
      const customInput = document.getElementById('custom-gdb-path');
      if (customInput) customInput.value = selectedPath;
    };

    item.addEventListener('click', selectItem);
    
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectItem();
        loadSelectedGDB(selectedPath);
      }
    });

    item.addEventListener('dblclick', () => {
      selectItem();
      loadSelectedGDB(selectedPath);
    });
  });

  document.getElementById('load-gdb-btn')?.addEventListener('click', () => {
    if (selectedPath) loadSelectedGDB(selectedPath);
  });

  document.getElementById('load-custom-btn')?.addEventListener('click', () => {
    const customPath = document.getElementById('custom-gdb-path')?.value.trim();
    if (customPath) loadSelectedGDB(customPath);
  });

  // Upload handler
  const fileInput = document.getElementById('upload-gdb-input');
  const uploadBtn = document.getElementById('trigger-upload-btn');

  uploadBtn?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading & Extracting…';
    showInfo('Uploading geodatabase archive…', 'Please wait');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const info = await API.uploadGDB(formData);
      setGDB(info);
      navigate('dataset', { name: info.datasets[0]?.name || null });
    } catch (err) {
      showError(err.message, 'Upload Failed');
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Choose .zip file to upload';
    }
  });
}

async function loadSelectedGDB(path) {
  const btn = document.getElementById('load-gdb-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }

  showInfo('Loading geodatabase…', 'Please wait');

  try {
    const info = await API.loadGDB(path);
    setGDB(info);
    navigate('dataset', { name: info.datasets[0]?.name || null });
  } catch (e) {
    showError(e.message, 'Failed to load GDB');
    if (btn) { btn.disabled = false; btn.textContent = 'Open Selected GDB'; }
  }
}
