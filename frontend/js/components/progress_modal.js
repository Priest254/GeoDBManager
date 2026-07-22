/**
 * progress_modal.js — World-class real-time progress reporting modal.
 * Connects to job SSE stream / polling endpoint with animated progress bars,
 * live activity logs, ETA estimation, stat counters, and cancellation support.
 */
import { API } from '../api.js';

let activeEventSource = null;
let activePollTimer = null;

export function showProgressModal(jobId, options = {}) {
  const { title = 'Task Progress', onComplete = null } = options;

  // Render modal layout
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal modal-lg progress-modal-box" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div class="modal-title flex-center gap-2">
          <span>⚡</span>
          <span>${title}</span>
          <span class="status-pill status-running" id="pm-status-pill">Running</span>
        </div>
        <button class="modal-close" id="pm-close-x" style="display:none">✕</button>
      </div>

      <div class="modal-body progress-modal-body">
        <!-- Progress Bar Section -->
        <div class="pm-progress-container">
          <div class="pm-progress-header">
            <span class="pm-step-text" id="pm-step-text">Initializing task…</span>
            <span class="pm-percent-badge" id="pm-percent">0%</span>
          </div>
          <div class="pm-progress-track">
            <div class="pm-progress-fill striped-anim" id="pm-fill" style="width: 0%"></div>
          </div>
        </div>

        <!-- Metrics Stats Grid -->
        <div class="pm-stats-grid">
          <div class="pm-stat-card">
            <div class="pm-stat-num" id="pm-stat-total">0</div>
            <div class="pm-stat-lbl">Total Targets</div>
          </div>
          <div class="pm-stat-card ok">
            <div class="pm-stat-num" id="pm-stat-ok">0</div>
            <div class="pm-stat-lbl">Succeeded</div>
          </div>
          <div class="pm-stat-card fail">
            <div class="pm-stat-num" id="pm-stat-fail">0</div>
            <div class="pm-stat-lbl">Failed</div>
          </div>
          <div class="pm-stat-card time">
            <div class="pm-stat-num" id="pm-stat-time">00:00</div>
            <div class="pm-stat-lbl" id="pm-stat-time-lbl">Elapsed</div>
          </div>
        </div>

        <!-- Live Terminal Log -->
        <div class="pm-log-section">
          <div class="pm-log-header">
            <span class="pm-log-title">📋 Activity Log</span>
            <span class="pm-log-auto-scroll"><input type="checkbox" id="pm-auto-scroll" checked> Auto-scroll</span>
          </div>
          <div class="pm-log-console" id="pm-log-console">
            <div class="pm-log-line info"><span class="ts">[${new Date().toLocaleTimeString()}]</span> Connecting to task events…</div>
          </div>
        </div>
      </div>

      <div class="modal-footer progress-modal-footer">
        <button class="btn btn-danger" id="pm-cancel-btn">🛑 Cancel Task</button>
        <button class="btn btn-primary" id="pm-done-btn" style="display:none">Done</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const fillEl = backdrop.querySelector('#pm-fill');
  const percentEl = backdrop.querySelector('#pm-percent');
  const stepTextEl = backdrop.querySelector('#pm-step-text');
  const statusPill = backdrop.querySelector('#pm-status-pill');

  const statTotal = backdrop.querySelector('#pm-stat-total');
  const statOk = backdrop.querySelector('#pm-stat-ok');
  const statFail = backdrop.querySelector('#pm-stat-fail');
  const statTime = backdrop.querySelector('#pm-stat-time');
  const statTimeLbl = backdrop.querySelector('#pm-stat-time-lbl');

  const logConsole = backdrop.querySelector('#pm-log-console');
  const autoScrollCb = backdrop.querySelector('#pm-auto-scroll');

  const cancelBtn = backdrop.querySelector('#pm-cancel-btn');
  const doneBtn = backdrop.querySelector('#pm-done-btn');
  const closeX = backdrop.querySelector('#pm-close-x');

  let isFinished = false;
  let renderLogsCount = 0;

  function closeModal() {
    if (activeEventSource) { activeEventSource.close(); activeEventSource = null; }
    if (activePollTimer) { clearInterval(activePollTimer); activePollTimer = null; }
    backdrop.remove();
  }

  closeX.addEventListener('click', closeModal);
  doneBtn.addEventListener('click', () => {
    closeModal();
    if (onComplete) onComplete();
  });

  cancelBtn.addEventListener('click', async () => {
    cancelBtn.disabled = true;
    cancelBtn.textContent = 'Cancelling…';
    try {
      await API.cancelJob(jobId);
    } catch (e) {
      console.warn('Cancel failed:', e);
    }
  });

  function formatTime(seconds) {
    if (seconds == null || isNaN(seconds)) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function updateUI(data) {
    if (!data) return;

    // Progress bar & percentage
    const pct = Math.min(100, Math.max(0, data.progress_percent || 0));
    fillEl.style.width = `${pct}%`;
    percentEl.textContent = `${pct.toFixed(0)}%`;
    stepTextEl.textContent = data.current_step || 'Processing…';

    // Stats
    statTotal.textContent = data.total_targets || 0;
    statOk.textContent = data.succeeded_count || 0;
    statFail.textContent = data.failed_count || 0;

    if (data.status === 'running' && data.eta_seconds != null) {
      statTime.textContent = formatTime(data.eta_seconds);
      statTimeLbl.textContent = 'ETA';
    } else {
      statTime.textContent = formatTime(data.elapsed_seconds || 0);
      statTimeLbl.textContent = 'Elapsed';
    }

    // Status pill
    statusPill.className = 'status-pill';
    if (data.status === 'running') {
      statusPill.classList.add('status-running');
      statusPill.textContent = 'Running';
    } else if (data.status === 'completed') {
      statusPill.classList.add('status-completed');
      statusPill.textContent = 'Completed';
    } else if (data.status === 'cancelled') {
      statusPill.classList.add('status-cancelled');
      statusPill.textContent = 'Cancelled';
    } else if (data.status === 'failed') {
      statusPill.classList.add('status-failed');
      statusPill.textContent = 'Failed';
    }

    // Append new logs
    if (data.logs && data.logs.length > renderLogsCount) {
      const newLogs = data.logs.slice(renderLogsCount);
      newLogs.forEach(log => {
        const line = document.createElement('div');
        line.className = `pm-log-line ${log.level || 'info'}`;
        line.innerHTML = `<span class="ts">[${log.timestamp}]</span> ${escapeHtml(log.message)}`;
        logConsole.appendChild(line);
      });
      renderLogsCount = data.logs.length;

      if (autoScrollCb.checked) {
        logConsole.scrollTop = logConsole.scrollHeight;
      }
    }

    // Handle completion states
    if (['completed', 'failed', 'cancelled'].includes(data.status) && !isFinished) {
      isFinished = true;
      fillEl.classList.remove('striped-anim');
      if (data.status === 'completed') {
        fillEl.style.background = 'var(--success)';
      } else if (data.status === 'cancelled') {
        fillEl.style.background = 'var(--warning)';
      } else {
        fillEl.style.background = 'var(--danger)';
      }

      cancelBtn.style.display = 'none';
      doneBtn.style.display = 'inline-flex';
      closeX.style.display = 'inline-flex';

      if (activeEventSource) { activeEventSource.close(); activeEventSource = null; }
      if (activePollTimer) { clearInterval(activePollTimer); activePollTimer = null; }
    }
  }

  // Connect via SSE with HTTP Polling fallback
  try {
    const sseUrl = `/api/jobs/${encodeURIComponent(jobId)}/events`;
    activeEventSource = new EventSource(sseUrl);

    activeEventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        updateUI(data);
      } catch (e) {
        console.error('Failed parsing SSE event:', e);
      }
    };

    activeEventSource.onerror = () => {
      // Fallback to polling if SSE connection drops
      if (activeEventSource) {
        activeEventSource.close();
        activeEventSource = null;
      }
      startPolling();
    };
  } catch (err) {
    startPolling();
  }

  function startPolling() {
    if (activePollTimer) return;
    activePollTimer = setInterval(async () => {
      try {
        const data = await API.getJobStatus(jobId);
        updateUI(data);
      } catch (e) {
        console.warn('Polling error:', e);
      }
    }, 350);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
