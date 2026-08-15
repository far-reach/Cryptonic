/**
 * Small DOM helpers shared by every view. Deliberately not a framework — the
 * arcade is a handful of screens and `el()` plus innerHTML covers it.
 */

export function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function toast(title, body, kind = '') {
  const host = document.getElementById('toasts');
  const node = el(
    'div',
    { class: `toast ${kind}` },
    el('div', { class: 't-title', text: title }),
    body ? el('div', { class: 't-body', text: body }) : null,
  );
  host.append(node);
  setTimeout(() => {
    node.style.transition = 'opacity .3s ease, transform .3s ease';
    node.style.opacity = '0';
    node.style.transform = 'translateX(20px)';
    setTimeout(() => node.remove(), 320);
  }, 3400);
}

export function showModal(...content) {
  const dialog = document.getElementById('modal');
  const body = document.getElementById('modal-body');
  clear(body).append(...content);
  dialog.showModal();
  return dialog;
}

export function closeModal() {
  document.getElementById('modal').close();
}

export function stars(count) {
  return '★★★'.slice(0, count).padEnd(3, '☆');
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many ?? `${one}s`}`;
}

export function formatDuration(ms) {
  if (ms <= 0) return 'ready';
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  if (minutes) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

export function formatTime(ts) {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Reward popup shared by all three games. */
export function rewardModal({ title, subtitle, coins, gems, stars: starCount, actions = [] }) {
  const content = [
    el('h2', { text: title }),
    subtitle ? el('p', { class: 'sub', text: subtitle }) : null,
    typeof starCount === 'number'
      ? el('div', { class: 'star-line', text: stars(starCount) })
      : null,
    el(
      'div',
      { class: 'reward-line' },
      coins ? el('span', { class: 'coins', text: `🪙 +${coins}` }) : null,
      gems ? el('span', { class: 'gems', text: `💎 +${gems}` }) : null,
      !coins && !gems ? el('span', { class: 'muted', text: 'No payout this time' }) : null,
    ),
  ];

  const dialog = showModal(...content.filter(Boolean));
  const bar = dialog.querySelector('.modal-actions');
  for (const node of bar.querySelectorAll('.injected')) node.remove();
  for (const action of actions) {
    const button = el('button', {
      class: `btn ${action.primary ? 'btn-primary' : ''} injected`,
      text: action.label,
      onclick: (event) => {
        event.preventDefault();
        dialog.close();
        action.onClick?.();
      },
    });
    bar.prepend(button);
  }
  return dialog;
}
