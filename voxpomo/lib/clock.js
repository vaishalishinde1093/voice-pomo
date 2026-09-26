// Shared clock UI. Renders into a shadow root so it looks identical in the
// toolbar popup and as a floating widget on any page.
//
//   const clock = createClock(hostElement, { variant: 'popup' | 'floater' });
//   clock.update(state);   // call whenever state changes
//   clock.destroy();

const SEGMENTS = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc',
  '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g'
};

// 7-segment digit as SVG. Each segment is a slightly beveled polygon.
const SEG_SHAPES = {
  a: '6,2 14,0 46,0 54,2 48,8 12,8',
  b: '56,4 60,12 60,44 56,50 50,45 50,10',
  c: '56,54 60,60 60,92 56,100 50,94 50,59',
  d: '6,102 12,96 48,96 54,102 46,104 14,104',
  e: '4,54 10,59 10,94 4,100 0,92 0,60',
  f: '4,4 10,10 10,45 4,50 0,44 0,12',
  g: '8,52 13,47 47,47 52,52 47,57 13,57'
};

function digitSvg(ch) {
  const on = SEGMENTS[ch] || '';
  const polys = Object.keys(SEG_SHAPES).map(
    (k) => `<polygon class="seg ${on.includes(k) ? 'on' : ''}" points="${SEG_SHAPES[k]}"/>`
  ).join('');
  return `<svg class="digit" viewBox="-2 -2 64 108" aria-hidden="true">${polys}</svg>`;
}

const COLON = `<svg class="colon" viewBox="0 0 14 108" aria-hidden="true"><circle class="seg on" cx="7" cy="34" r="5"/><circle class="seg on" cx="7" cy="72" r="5"/></svg>`;

const ICONS = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
  reset: '<svg viewBox="0 0 24 24"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg>',
  lap: '<svg viewBox="0 0 24 24"><path d="M5 3h2v18H5zm4 1h10l-2 4 2 4H9z"/></svg>',
  mic: '<svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M14 4l1 1-1 5 4 3v2h-5v6l-1 1-1-1v-6H6v-2l4-3-1-5 1-1z"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.9 5.3l-1.8-.4a7 7 0 0 0 0-1.8l1.8-.4.3-1.4-1.7-.8a7.2 7.2 0 0 0-.9-1.6l.8-1.6-1-1-1.6.8a7.2 7.2 0 0 0-1.6-.9l-.8-1.7-1.4.3-.4 1.8a7 7 0 0 0-1.8 0l-.4-1.8-1.4-.3-.8 1.7a7.2 7.2 0 0 0-1.6.9L4.8 4.5l-1 1 .8 1.6a7.2 7.2 0 0 0-.9 1.6l-1.7.8.3 1.4 1.8.4a7 7 0 0 0 0 1.8l-1.8.4-.3 1.4 1.7.8c.2.6.5 1.1.9 1.6l-.8 1.6 1 1 1.6-.8c.5.4 1 .7 1.6.9l.8 1.7 1.4-.3.4-1.8a7 7 0 0 0 1.8 0l.4 1.8 1.4.3.8-1.7c.6-.2 1.1-.5 1.6-.9l1.6.8 1-1-.8-1.6c.4-.5.7-1 .9-1.6l1.7-.8z"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M12 22a2.5 2.5 0 0 0 2.4-2h-4.8A2.5 2.5 0 0 0 12 22zm7-6v-5a7 7 0 0 0-5-6.7V3a2 2 0 0 0-4 0v1.3A7 7 0 0 0 5 11v5l-2 2v1h18v-1z"/></svg>',
  alarmOff: '<svg viewBox="0 0 24 24"><path d="M12 22a2.5 2.5 0 0 0 2.4-2h-4.8A2.5 2.5 0 0 0 12 22zM4 3.5L2.6 4.9 5.2 7.5A7 7 0 0 0 5 11v5l-2 2v1h14.1l2.4 2.4 1.4-1.4zM19 16v-5a7 7 0 0 0-5-6.7V3a2 2 0 0 0-4 0v1.3c-.6.2-1.2.4-1.7.7L19 15.7z"/></svg>',
  expand: '<svg viewBox="0 0 24 24"><path d="M4 14h2v4h4v2H4zm10 6v-2h4v-4h2v6zM4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4z"/></svg>'
};

const MODES = [
  ['timer', 'Timer'],
  ['stopwatch', 'Stopwatch'],
  ['alarm', 'Alarm']
];

const CSS = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }
.case {
  --led: #ff6a3d; --led-dim: rgba(255,106,61,.12);
  --case: #23252b; --case-dark: #1a1b20; --bezel: #101114; --text: #d8d6d0; --muted: #82858e;
  width: 300px; color: var(--text);
  font-family: "Avenir Next Condensed", "Bahnschrift", "Segoe UI Semibold", "Segoe UI", system-ui, sans-serif;
  font-size: 13px; line-height: 1.3;
  background: linear-gradient(170deg, #2a2c33, var(--case) 40%, var(--case-dark));
  border-radius: 26px;
  box-shadow: 0 24px 50px rgba(0,0,0,.45), 0 2px 4px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.07), inset 0 -2px 0 rgba(0,0,0,.35);
  padding: 12px 14px 16px; user-select: none; -webkit-user-select: none;
}
.case.mode-stopwatch { --led: #ffc857; --led-dim: rgba(255,200,87,.12); }

.top { display: flex; align-items: center; gap: 8px; height: 26px; margin-bottom: 8px; }
.grip { width: 42px; height: 6px; border-radius: 3px; background: repeating-linear-gradient(90deg, #35373f 0 3px, transparent 3px 6px); cursor: grab; flex: none; }
.grip:active { cursor: grabbing; }
.brand { font-size: 12px; letter-spacing: .12em; color: var(--muted); font-weight: 600; }
.spacer { flex: 1; }
.icon-btn { width: 26px; height: 26px; border: 0; border-radius: 8px; background: transparent; color: var(--muted); cursor: pointer; display: grid; place-items: center; padding: 0; }
.icon-btn svg { width: 16px; height: 16px; fill: currentColor; }
.icon-btn:hover { background: rgba(255,255,255,.06); color: var(--text); }
.icon-btn:focus-visible, .btn:focus-visible, .mode:focus-visible { outline: 2px solid var(--led); outline-offset: 2px; }

.modes { display: grid; grid-template-columns: repeat(3, 1fr); background: var(--bezel); border-radius: 12px; padding: 3px; margin-bottom: 10px; box-shadow: inset 0 2px 4px rgba(0,0,0,.6); }
.mode { border: 0; background: transparent; color: var(--muted); font: inherit; font-size: 12px; font-weight: 600; padding: 6px 2px; border-radius: 9px; cursor: pointer; white-space: nowrap; }
.mode.active { background: linear-gradient(180deg, #33363e, #2a2c33); color: var(--led); box-shadow: 0 1px 2px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.08); }

.window { background: radial-gradient(120% 100% at 50% 0%, #17181d, var(--bezel) 70%); border-radius: 16px; padding: 14px 12px 10px; box-shadow: inset 0 3px 8px rgba(0,0,0,.8), inset 0 -1px 0 rgba(255,255,255,.04); position: relative; overflow: hidden; }
.window::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(255,255,255,.05), transparent 45%); pointer-events: none; }
.display { display: flex; justify-content: center; align-items: center; gap: 5px; height: 78px; }
.digit { height: 72px; width: auto; }
.colon { height: 72px; width: 10px; }
.display.small .digit { height: 54px; } .display.small .colon { height: 54px; width: 8px; }
.seg { fill: #1c1d22; transition: fill .12s; }
.seg.on { fill: var(--led); filter: drop-shadow(0 0 4px var(--led)); }
.paused .seg.on { animation: blink 1.1s steps(1) infinite; }
.done .seg.on { animation: blink .5s steps(1) infinite; }
.colon .seg.on { animation: none; }
.running .colon .seg.on { animation: blink 1s steps(1) infinite; }
@keyframes blink { 50% { opacity: .18; } }
@media (prefers-reduced-motion: reduce) { .seg.on, .rec.on { animation: none !important; } }

.bar { height: 6px; margin: 8px 6px 0; background: #1c1d22; border-radius: 3px; overflow: hidden; }
.bar i { display: block; height: 100%; width: 0%; background: var(--led); box-shadow: 0 0 6px var(--led); transition: width .5s linear; }

.lights { display: flex; align-items: center; gap: 10px; margin: 10px 6px 0; font-size: 11px; color: var(--muted); letter-spacing: .04em; }
.step { display: flex; gap: 2px; }
.step button { border: 0; background: #1c1d22; color: var(--muted); font: inherit; font-size: 12px; font-weight: 700; min-width: 22px; padding: 0 5px; height: 18px; border-radius: 5px; cursor: pointer; }
.step button:hover { color: var(--led); }
.case.mode-stopwatch .step, .case.mode-stopwatch .half { visibility: hidden; }
.case.mode-alarm { --led: #c78bff; --led-dim: rgba(199,139,255,.12); }
.case.mode-alarm .half, .case.mode-alarm .bar { visibility: hidden; }
.case.mode-alarm .display { height: 78px; }
.ampm { display: none; flex-direction: column; justify-content: center; gap: 6px; margin-left: 6px; font-size: 11px; font-weight: 700; color: #1c1d22; }
.case.mode-alarm .ampm { display: flex; }
.ampm span.on { color: var(--led); text-shadow: 0 0 6px var(--led); }
.ringing .seg.on { animation: blink .4s steps(1) infinite; }
.alarm-list { display: none; margin-top: 10px; }
.case.mode-alarm .alarm-list { display: block; }
.alarm-list .row { padding: 5px 6px; font-size: 13px; }
.alarm-list .row .when { color: var(--muted); font-size: 11px; margin-left: 8px; }
.alarm-list .row .x { border: 0; background: transparent; color: var(--muted); cursor: pointer; font: inherit; font-size: 15px; line-height: 1; }
.alarm-list .row .x:hover { color: #ff8a70; }
.alarm-list .empty { padding: 6px; font-size: 12px; color: var(--muted); text-align: center; }
.lamp { display: flex; align-items: center; gap: 5px; }
.lamp i { width: 7px; height: 7px; border-radius: 50%; background: #1c1d22; }
.lamp i.on { background: var(--led); box-shadow: 0 0 5px var(--led); }
.rec { display: flex; align-items: center; gap: 5px; margin-left: auto; }
.rec i { width: 8px; height: 8px; border-radius: 50%; background: #1c1d22; }
.rec.on { color: #ff4d4d; }
.rec.on i { background: #ff4d4d; box-shadow: 0 0 6px #ff4d4d; animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .35; } }

.controls { display: grid; grid-template-columns: 44px 1fr 44px 44px; gap: 10px; align-items: center; margin-top: 14px; margin-bottom: 4px; }
.btn { border: 0; cursor: pointer; font: inherit; color: var(--text); background: linear-gradient(180deg, #33363e, #25272d); border-radius: 50%; width: 44px; height: 44px; display: grid; place-items: center; box-shadow: 0 4px 0 #121317, 0 6px 10px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.1); transition: transform .06s, box-shadow .06s; }
.btn svg { width: 20px; height: 20px; fill: currentColor; }
.btn .plus5 { font-size: 13px; font-weight: 700; letter-spacing: .02em; }
.btn:active, .btn.pressed { transform: translateY(3px); box-shadow: 0 1px 0 #121317, 0 2px 4px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.1); }
.btn.primary { width: 100%; border-radius: 22px; background: linear-gradient(180deg, var(--led), color-mix(in srgb, var(--led) 70%, #000)); color: #17110c; font-weight: 700; font-size: 15px; letter-spacing: .06em; box-shadow: 0 4px 0 color-mix(in srgb, var(--led) 45%, #000), 0 6px 12px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.3); display: flex; gap: 8px; }
.btn.primary:active { box-shadow: 0 1px 0 color-mix(in srgb, var(--led) 45%, #000), 0 2px 4px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.3); }
.btn.mic.on { color: #fff; background: linear-gradient(180deg, #ff5a5a, #c92f2f); box-shadow: 0 4px 0 #6e1717, 0 0 0 4px rgba(255,77,77,.25), inset 0 1px 0 rgba(255,255,255,.25); }


.extras { margin-top: 10px; display: none; }
.extras.visible { display: block; }
.row { display: flex; justify-content: space-between; align-items: center; padding: 6px 4px; border-top: 1px solid rgba(255,255,255,.05); font-size: 12px; }
.row .x { border: 0; background: transparent; color: var(--muted); cursor: pointer; font: inherit; }
.row .x:hover { color: #ff8a70; }
.section-title { font-size: 11px; color: var(--muted); letter-spacing: .08em; margin: 8px 4px 2px; }

/* Collapsed pill (floater only) */
.pill { display: none; align-items: center; gap: 10px; padding: 6px 8px 6px 12px; background: linear-gradient(170deg, #2a2c33, #1a1b20); border-radius: 999px; box-shadow: 0 10px 24px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.07); color: var(--text); font-family: inherit; }
.pill .time { display: flex; gap: 2px; }
.pill .digit { height: 22px; } .pill .colon { height: 22px; width: 5px; }
.pill .btn { width: 30px; height: 30px; box-shadow: 0 2px 0 #121317, inset 0 1px 0 rgba(255,255,255,.1); }
.pill .btn svg { width: 15px; height: 15px; }
.case.collapsed > :not(.pill) { display: none; }
.case.collapsed { width: auto; padding: 0; background: transparent; box-shadow: none; border-radius: 999px; }
.case.collapsed .pill { display: flex; }
`;

function html(variant) {
  const isFloater = variant === 'floater';
  return `
  <div class="case" part="case">
    <div class="top">
      ${isFloater ? '<div class="grip" title="Drag to move" aria-label="Drag handle"></div>' : '<span class="brand">VOICE POMO</span>'}
      <span class="spacer"></span>
      ${isFloater
        ? `<button class="icon-btn collapse" title="Collapse to a small pill">${ICONS.pin}</button>
           <button class="icon-btn hide" title="Pin to toolbar (hide from page)">${ICONS.close}</button>`
        : `<button class="icon-btn show-floater" title="Show floating clock on the page">${ICONS.expand}</button>
           <button class="icon-btn settings" title="Settings">${ICONS.gear}</button>`}
    </div>
    <div class="modes" role="tablist">
      ${MODES.map(([k, l]) => `<button class="mode" role="tab" data-mode="${k}">${l}</button>`).join('')}
    </div>
    <div class="window">
      <div class="display" aria-live="off"></div>
      <div class="ampm" style="position:absolute;right:16px;top:22px"><span class="am">AM</span><span class="pm">PM</span></div>
      <div class="bar"><i></i></div>
      <div class="lights">
        <div class="step"><button class="minus" title="1 minute less">−</button><button class="plus" title="1 minute more">+</button></div>
        <div class="step hours"><button class="hminus" title="1 hour earlier">−h</button><button class="hplus" title="1 hour later">+h</button></div>
        <div class="lamp half" title="Halfway reminder"><i></i><span>½</span></div>
        <div class="lamp alarm" title="Alarms set"><i></i><span>⏰</span></div>
        <div class="rec"><i></i><span>MIC</span></div>
      </div>
    </div>
    <div class="controls">
      <button class="btn reset" title="Reset">${ICONS.reset}</button>
      <button class="btn primary start">${ICONS.play}<span>Start</span></button>
      <button class="btn skip" title="Add 5 minutes"><span class="plus5">+5</span></button>
      <button class="btn mic" title="Voice commands (Alt+Shift+V, Ctrl+Shift+V on Mac)">${ICONS.mic}</button>
    </div>
    <div class="alarm-list"></div>
    <div class="extras"></div>
    <div class="pill">
      <div class="time"></div>
      <button class="btn pill-start" title="Start / pause">${ICONS.play}</button>
      <button class="btn pill-mic" title="Voice">${ICONS.mic}</button>
      <button class="icon-btn expand" title="Expand">${ICONS.expand}</button>
    </div>
  </div>`;
}

function fmtTime(ms, forceHours = false) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h || forceHours ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function renderTime(el, str, prev) {
  if (el.dataset.str === str) return;
  el.dataset.str = str;
  el.innerHTML = [...str].map((ch) => (ch === ':' ? COLON : digitSvg(ch))).join('');
}

export function createClock(host, { variant = 'popup', send } = {}) {
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${CSS}</style>${html(variant)}`;
  const $ = (sel) => shadow.querySelector(sel);
  const caseEl = $('.case');
  const display = $('.display');
  const pillTime = $('.pill .time');
  const bar = $('.bar i');
  const startBtn = $('.start');
  const extras = $('.extras');

  let state = null;
  let tick = null;

  const post = (msg) => (send ? send(msg) : chrome.runtime.sendMessage(msg)).catch?.(() => {});
  const cmd = (c) => post({ type: 'command', cmd: c, speak: false });

  // ----- button wiring ---------------------------------------------------------
  shadow.querySelectorAll('.mode').forEach((b) =>
    b.addEventListener('click', () => cmd({ action: 'mode', mode: b.dataset.mode })));
  const toggleStart = () => {
    if (state?.ringing) return cmd({ action: 'dismiss' });
    if (state?.alarmView) return cmd({ action: 'setAlarm' });
    cmd({ action: state?.status === 'running' ? 'pause' : 'start' });
  };
  startBtn.addEventListener('click', toggleStart);
  $('.pill-start').addEventListener('click', toggleStart);
  const inAlarm = () => state?.alarmView;
  $('.reset').addEventListener('click', () => cmd(inAlarm() ? { action: 'clearAlarms' } : { action: 'reset' }));
  $('.skip').addEventListener('click', () => cmd(state?.ringing ? { action: 'snooze', ms: 5 * 60000 }
    : inAlarm() ? { action: 'alarmDraft', deltaMin: 5 }
    : state?.mode === 'stopwatch' ? { action: 'lap' } : { action: 'adjust', deltaMs: 5 * 60000 }));
  $('.plus').addEventListener('click', () => cmd(inAlarm() ? { action: 'alarmDraft', deltaMin: 1 } : { action: 'adjust', deltaMs: 60000 }));
  $('.minus').addEventListener('click', () => cmd(inAlarm() ? { action: 'alarmDraft', deltaMin: -1 } : { action: 'adjust', deltaMs: -60000 }));
  $('.hplus').addEventListener('click', () => cmd({ action: 'alarmDraft', deltaMin: 60 }));
  $('.hminus').addEventListener('click', () => cmd({ action: 'alarmDraft', deltaMin: -60 }));
  $('.hours').style.display = 'none';
  const alarmList = $('.alarm-list');
  alarmList.addEventListener('click', (e) => {
    const b = e.target.closest('.x');
    if (b) cmd({ action: 'deleteAlarm', id: b.dataset.id });
  });
  const toggleMic = () => post({ type: 'toggleListening' });
  $('.mic').addEventListener('click', toggleMic);
  $('.pill-mic').addEventListener('click', toggleMic);
  $('.half').addEventListener('click', () => cmd({ action: 'halfway', on: !state?.halfwayNotify }));
  $('.half').style.cursor = 'pointer';

  if (variant === 'floater') {
    $('.collapse').addEventListener('click', () => post({ type: 'updateSettings', settings: { floaterCollapsed: true } }));
    $('.expand').addEventListener('click', () => post({ type: 'updateSettings', settings: { floaterCollapsed: false } }));
    $('.hide').addEventListener('click', () => post({ type: 'updateSettings', settings: { floaterVisible: false } }));
  } else {
    $('.show-floater').addEventListener('click', () => post({ type: 'updateSettings', settings: { floaterVisible: true, floaterCollapsed: false } }));
    $('.settings').addEventListener('click', () => extras.classList.toggle('visible'));
  }

  // ----- rendering ---------------------------------------------------------------
  function relative(at) {
    const d = at - Date.now();
    if (d < 60000) return 'now';
    const total = Math.round(d / 60000), h = Math.floor(total / 60), m = total % 60;
    return `in ${h ? h + 'h ' : ''}${m}m`;
  }

  function renderAlarmList() {
    alarmList.innerHTML = state.alarms.length
      ? state.alarms.map((a) => `<div class="row"><span>${a.label}<span class="when">${relative(a.at)}</span></span><button class="x" data-id="${a.id}" title="Remove">×</button></div>`).join('')
      : '<div class="empty">No alarms. Pick a time above and press Set, or say "alarm at 7 am".</div>';
  }

  function frame() {
    if (!state) return;
    const now = Date.now();
    let ms, progress;
    if (state.alarmView) {
      // Alarm display: the ringing alarm's time, else the draft time, in 12-hour form.
      let mins = state.alarmDraft;
      if (state.ringing) { const d = new Date(); mins = d.getHours() * 60 + d.getMinutes(); }
      if (mins === null || mins === undefined) { const d = new Date(); mins = d.getHours() * 60 + d.getMinutes(); }
      const h24 = Math.floor(mins / 60), m = mins % 60;
      const h12 = h24 % 12 || 12;
      const str = `${h12}:${String(m).padStart(2, '0')}`;
      display.classList.remove('small');
      renderTime(display, str);
      renderTime(pillTime, str);
      $('.am').classList.toggle('on', h24 < 12);
      $('.pm').classList.toggle('on', h24 >= 12);
      return;
    }
    if (state.mode === 'stopwatch') {
      ms = state.status === 'running' ? now - state.startedAt : state.elapsedMs;
      progress = (ms % 60000) / 60000;
    } else {
      ms = state.status === 'running' ? state.endAt - now : state.remainingMs;
      progress = state.durationMs ? 1 - Math.max(0, ms) / state.durationMs : 0;
      // Round up so the display doesn't show 24:59 immediately after starting 25:00.
      ms = Math.max(0, ms);
    }
    const str = fmtTime(state.mode === 'stopwatch' ? ms : Math.ceil(ms / 1000) * 1000);
    display.classList.toggle('small', str.length > 5);
    renderTime(display, str);
    renderTime(pillTime, str);
    bar.style.width = `${Math.min(100, progress * 100)}%`;
  }

  function renderExtras() {
    if (variant !== 'popup') return;
    const s = state.settings;
    extras.innerHTML = `
      <div class="section-title">Timer</div>
      <div class="row"><span>Default length (1–99 min)</span><input type="number" min="1" max="99" data-key="timer" value="${s.timer}"></div>
      <div class="section-title">Voice</div>
      <div class="row"><span>Spoken feedback</span><input type="checkbox" data-key="voiceFeedback" ${s.voiceFeedback ? 'checked' : ''}></div>
      <div class="row"><span>Voice</span><select data-key="voiceName" class="voice-select"><option value="">Auto (female)</option></select></div>
      <div class="row"><span>Chimes</span><input type="checkbox" data-key="sound" ${s.sound ? 'checked' : ''}></div>
      <div class="row"><span>Wake word (optional)</span><input type="text" placeholder="e.g. hey pomo" data-key="wakeWord" value="${s.wakeWord || ''}" style="width:110px"></div>
      <div class="row"><span>Microphone</span><button class="x perm">Grant access</button></div>
      <div class="row"><span>Keyboard shortcuts</span><button class="x shortcuts">Change</button></div>
      ${state.laps.length ? `<div class="section-title">Laps</div>` + state.laps.map((l, i) => `<div class="row"><span>Lap ${state.laps.length - i}</span><span>${fmtTime(l)}</span></div>`).join('') : ''}
    `;
    extras.querySelectorAll('input, select').forEach((inp) => {
      inp.style.cssText = 'font:inherit;background:#101114;color:inherit;border:1px solid #35373f;border-radius:8px;padding:4px 8px;width:64px;' + inp.style.cssText;
      inp.addEventListener('change', () => {
        let v = inp.type === 'checkbox' ? inp.checked : inp.type === 'number' ? Number(inp.value) : inp.value.trim();
        if (inp.dataset.key === 'timer') v = Math.min(99, Math.max(1, v || 1));
        post({ type: 'updateSettings', settings: { [inp.dataset.key]: v } });
      });
    });
    const sel = extras.querySelector('.voice-select');
    sel.style.width = '150px';
    (send ? Promise.resolve([]) : chrome.runtime.sendMessage({ type: 'getVoices' })).then((voices = []) => {
      voices.filter((v) => !v.lang || v.lang.toLowerCase().startsWith('en')).forEach((v) => {
        const o = document.createElement('option');
        o.value = v.name; o.textContent = v.name + (v.gender ? ` (${v.gender})` : '');
        o.selected = v.name === s.voiceName;
        sel.appendChild(o);
      });
    }).catch(() => {});
    extras.querySelector('.perm').addEventListener('click', () => post({ type: 'openPermission' }));
    extras.querySelector('.shortcuts').addEventListener('click', () => post({ type: 'openShortcuts' }));
  }

  function update(next) {
    const prevExtrasKey = state && JSON.stringify([state.settings, state.alarms, state.laps]);
    state = next;
    const view = state.alarmView ? 'alarm' : state.mode;
    caseEl.className = `case mode-${view} ${state.alarmView ? '' : state.status} ${state.ringing ? 'ringing' : ''} ${variant === 'floater' && state.settings.floaterCollapsed ? 'collapsed' : ''}`;
    shadow.querySelectorAll('.mode').forEach((b) => b.classList.toggle('active', b.dataset.mode === view));
    $('.hours').style.display = state.alarmView ? '' : 'none';

    const running = state.status === 'running';
    if (state.ringing) startBtn.innerHTML = `${ICONS.alarmOff}<span>Dismiss</span>`;
    else if (state.alarmView) startBtn.innerHTML = `${ICONS.bell}<span>Set</span>`;
    else startBtn.innerHTML = `${running ? ICONS.pause : ICONS.play}<span>${running ? 'Pause' : state.status === 'paused' ? 'Resume' : 'Start'}</span>`;
    $('.pill-start').innerHTML = state.ringing ? ICONS.alarmOff : running ? ICONS.pause : ICONS.play;
    $('.reset').title = state.alarmView ? 'Clear all alarms' : 'Reset';
    $('.skip').innerHTML = state.ringing ? '<span class="plus5">zz</span>' : state.alarmView || state.mode !== 'stopwatch' ? '<span class="plus5">+5</span>' : ICONS.lap;
    $('.skip').title = state.ringing ? 'Snooze 5 minutes' : state.alarmView ? '5 minutes later' : state.mode === 'stopwatch' ? 'Lap' : 'Add 5 minutes';
    renderAlarmList();
    $('.mic').classList.toggle('on', state.listening);
    $('.pill-mic').classList.toggle('on', state.listening);
    $('.rec').classList.toggle('on', state.listening);
    $('.half i').classList.toggle('on', state.halfwayNotify);
    $('.alarm i').classList.toggle('on', state.alarms.length > 0);

    if (JSON.stringify([state.settings, state.alarms, state.laps]) !== prevExtrasKey) renderExtras();

    frame();
    clearInterval(tick);
    if (running && !state.alarmView) tick = setInterval(frame, 200);
    else if (state.alarmView) tick = setInterval(renderAlarmList, 30000);
  }

  return {
    update,
    element: caseEl,
    destroy() { clearInterval(tick); host.remove(); }
  };
}
