// Content script: mounts the floating clock on the page, makes it draggable,
// and keeps it in sync with the service worker through chrome.storage.
(async () => {
  if (window.top !== window) return;               // main frame only
  if (document.getElementById('voxpomo-host')) return;

  const { createClock } = await import(chrome.runtime.getURL('lib/clock.js'));

  const host = document.createElement('div');
  host.id = 'voxpomo-host';
  Object.assign(host.style, {
    position: 'fixed', zIndex: '2147483647', top: '24px', right: '24px',
    display: 'none', touchAction: 'none'
  });
  document.documentElement.appendChild(host);

  const clock = createClock(host, { variant: 'floater' });
  let state = null;

  // ----- position -----------------------------------------------------------------
  function applyPosition(pos) {
    if (!pos) return;
    const w = host.offsetWidth || 300, h = host.offsetHeight || 260;
    const x = Math.min(Math.max(0, pos.x), window.innerWidth - w);
    const y = Math.min(Math.max(0, pos.y), window.innerHeight - h);
    host.style.left = `${x}px`; host.style.top = `${y}px`; host.style.right = 'auto';
  }

  let drag = null;
  host.addEventListener('pointerdown', (e) => {
    const path = e.composedPath();
    const onHandle = path.some((el) => el.classList && (el.classList.contains('grip') || el.classList.contains('pill')));
    if (!onHandle || path.some((el) => el.tagName === 'BUTTON')) return;
    const r = host.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    host.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  host.addEventListener('pointermove', (e) => {
    if (!drag) return;
    applyPosition({ x: e.clientX - drag.dx, y: e.clientY - drag.dy });
  });
  host.addEventListener('pointerup', (e) => {
    if (!drag) return;
    drag = null;
    host.releasePointerCapture(e.pointerId);
    const r = host.getBoundingClientRect();
    chrome.runtime.sendMessage({ type: 'updateSettings', settings: { floaterPos: { x: r.left, y: r.top } } }).catch(() => {});
  });
  window.addEventListener('resize', () => state && applyPosition(state.settings.floaterPos));

  // ----- state sync ----------------------------------------------------------------
  function render(next) {
    state = next;
    host.style.display = state.settings.floaterVisible ? 'block' : 'none';
    clock.update(state);
    applyPosition(state.settings.floaterPos);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.state?.newValue) render(changes.state.newValue);
  });

  const initial = await chrome.runtime.sendMessage({ type: 'getState' }).catch(() => null);
  if (initial) render(initial);
})();
