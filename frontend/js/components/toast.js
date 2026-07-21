/**
 * Toast notification system
 */

let _container = null;

function _getContainer() {
  if (!_container) {
    _container = document.createElement('div');
    _container.className = 'toast-container';
    document.body.appendChild(_container);
  }
  return _container;
}

const ICONS = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

const TITLES = {
  success: 'Success',
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
};

export function toast(type, message, title, duration = 4000) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <div class="toast-icon">${ICONS[type] || 'ℹ'}</div>
    <div class="toast-content">
      <div class="toast-title">${title || TITLES[type]}</div>
      <div class="toast-msg">${message}</div>
    </div>
  `;
  _getContainer().appendChild(el);

  const remove = () => {
    el.classList.add('hiding');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  };

  if (duration > 0) setTimeout(remove, duration);
  el.addEventListener('click', remove);
  return remove;
}

export const showSuccess = (msg, title) => toast('success', msg, title);
export const showError   = (msg, title) => toast('error', msg, title, 6000);
export const showInfo    = (msg, title) => toast('info', msg, title);
export const showWarning = (msg, title) => toast('warning', msg, title);
