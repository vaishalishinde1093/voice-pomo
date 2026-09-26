// Service worker. Owns all timer state, schedules chrome.alarms, fires
// notifications and voice feedback, and routes voice transcripts to commands.
import { parseCommand, describeCommand } from './lib/commands.js';

const MIN = 60000;

const MIN_TIMER = 1 * MIN;
const MAX_TIMER = 99 * MIN;

const DEFAULT_SETTINGS = {
  timer: 25,             // default timer length in minutes (1–99)
  voiceFeedback: true,
  voiceName: '',         // '' = auto-pick a female voice
  sound: true,
  wakeWord: '',          // empty = every phrase is a command
  floaterVisible: true,
  floaterCollapsed: false,
  floaterPos: null       // {x, y} in px, saved by the content script
};

const DEFAULT_STATE = {
  mode: 'timer',         // timer | stopwatch
  status: 'idle',        // idle | running | paused | done
  durationMs: 25 * MIN,
  remainingMs: 25 * MIN,
  endAt: null,
  startedAt: null,       // stopwatch
  elapsedMs: 0,
  laps: [],
  halfwayNotify: false,
  halfwayFired: false,
  timersCompleted: 0,
  alarms: [],            // [{id, at, label}]
  alarmView: false,      // Alarm tab selected (does not disturb the running timer/stopwatch)
  alarmDraft: null,      // minutes since midnight shown on the alarm display before it's set
  ringing: null,         // {id, label} while an alarm is sounding
  listening: false,
  lastHeard: '',
  lastReply: '',
  settings: DEFAULT_SETTINGS
};

// ---------- state persistence -------------------------------------------------

async function loadState() {
  const { state } = await chrome.storage.local.get('state');
  if (!state) return structuredClone(DEFAULT_STATE);
  return { ...DEFAULT_STATE, ...state, settings: { ...DEFAULT_SETTINGS, ...(state.settings || {}) } };
}

async function saveState(state) {
  await chrome.storage.local.set({ state });
  await updateBadge(state);
}

// Serialize event handlers so concurrent alarms/messages don't clobber state.
let chain = Promise.resolve();
function withState(fn) {
  const run = async () => {
    const state = await loadState();
    const result = await fn(state);
    await saveState(state);
    return result;
  };
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}

// ---------- helpers ------------------------------------------------------------------

function clampDuration(ms) {
  return Math.min(MAX_TIMER, Math.max(MIN_TIMER, ms));
}

function fmt(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}h ${m}m` : m ? `${m} min ${s ? s + ' sec' : ''}`.trim() : `${s} sec`;
}

function remaining(state) {
  if (state.mode === 'stopwatch') return 0;
  return state.status === 'running' ? state.endAt - Date.now() : state.remainingMs;
}

function modeLabel(mode) {
  return mode === 'stopwatch' ? 'stopwatch' : 'timer';
}

// ---------- voice ----------------------------------------------------------------------

// Ranked by how natural they sound. Google's network voices (Chrome built-in)
// come first, then the premium/neural OS voices, then anything female.
const PREFERRED_VOICES = [
  /^google uk english female$/i, /^google us english$/i,
  /aria.*natural/i, /jenny.*natural/i, /sonia.*natural/i, /libby.*natural/i, /michelle.*natural/i,
  /^ava/i, /^zoe/i, /^allison/i, /^samantha/i, /^susan/i, /^karen/i, /^moira/i, /^serena/i, /^kate/i, /^fiona/i, /^tessa/i,
  /aria/i, /jenny/i, /zira/i, /female/i
];

let cachedVoice = null;

function pickFemaleVoice() {
  return new Promise((resolve) => {
    chrome.tts.getVoices((voices = []) => {
      const english = voices.filter((v) => !v.lang || /^en/i.test(v.lang));
      const pool = english.length ? english : voices;
      for (const rx of PREFERRED_VOICES) {
        const hit = pool.find((v) => rx.test(v.voiceName));
        if (hit) return resolve(hit.voiceName);
      }
      const byGender = pool.find((v) => v.gender === 'female');
      resolve((byGender || pool[0] || {}).voiceName || null);
    });
  });
}

async function speak(text, state) {
  if (!state.settings.voiceFeedback || !text) return;
  try {
    const voiceName = state.settings.voiceName || cachedVoice || (cachedVoice = await pickFemaleVoice());
    const opts = { rate: 1.0, pitch: 1.0, volume: 1.0, enqueue: false };
    if (voiceName) opts.voiceName = voiceName;
    chrome.tts.speak(text, opts);
  } catch { /* tts unavailable */ }
}

async function chime(kind, state) {
  if (!state.settings.sound) return;
  await ensureOffscreen();
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'chime', kind }).catch(() => {});
}

function notify(id, title, message) {
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: 'assets/icon128.png',
    title,
    message,
    priority: 2
  });
}

async function updateBadge(state) {
  let text = '';
  let color = '#ff6a3d';
  if (state.status === 'running') {
    if (state.mode === 'stopwatch') {
      text = `${Math.floor((Date.now() - state.startedAt) / MIN)}m`;
      color = '#ffc857';
    } else {
      text = `${Math.max(0, Math.ceil(remaining(state) / MIN))}m`;
    }
  } else if (state.status === 'paused') {
    text = '❚❚';
    color = '#8a8f99';
  }
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
  try { await chrome.action.setBadgeTextColor({ color: '#101114' }); } catch { /* older Chrome */ }
}

// ---------- chrome.alarms scheduling --------------------------------------------------

async function scheduleTimerAlarms(state) {
  await chrome.alarms.clear('timer-end');
  await chrome.alarms.clear('timer-half');
  await chrome.alarms.clear('badge-tick');

  if (state.status !== 'running') return;
  await chrome.alarms.create('badge-tick', { periodInMinutes: 0.5 });
  if (state.mode === 'stopwatch') return;

  await chrome.alarms.create('timer-end', { when: state.endAt });
  if (state.halfwayNotify && !state.halfwayFired) {
    const halfAt = state.endAt - state.durationMs / 2;
    if (halfAt > Date.now()) await chrome.alarms.create('timer-half', { when: halfAt });
  }
}

function labelFor(at) {
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Next occurrence of h:m. For an ambiguous "3:30" (no am/pm) choose whichever
// of 3:30 am / 3:30 pm comes first from now.
function nextOccurrence(h, m, ambiguous) {
  const candidates = ambiguous ? [h % 12, (h % 12) + 12] : [h];
  const now = Date.now();
  let best = Infinity;
  for (const hh of candidates) {
    const d = new Date(); d.setHours(hh, m, 0, 0);
    if (d.getTime() <= now) d.setDate(d.getDate() + 1);
    best = Math.min(best, d.getTime());
  }
  return best;
}

function defaultDraft() {
  const d = new Date();
  return (Math.floor((d.getHours() * 60 + d.getMinutes()) / 5) + 1) * 5 % 1440; // next 5-min mark
}

function addAlarm(state, at) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  state.alarms.push({ id, at, label: labelFor(at) });
  state.alarms.sort((a, b) => a.at - b.at);
  return state.alarms.find((a) => a.id === id);
}

async function dismiss(state) {
  state.ringing = null;
  await chrome.alarms.clear('ring-timeout');
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'stopChime' }).catch(() => {});
}

async function scheduleClockAlarms(state) {
  const existing = await chrome.alarms.getAll();
  for (const a of existing) if (a.name.startsWith('clock-')) await chrome.alarms.clear(a.name);
  for (const a of state.alarms) await chrome.alarms.create(`clock-${a.id}`, { when: a.at });
}

// ---------- timer operations ------------------------------------------------------------

function setMode(state, mode, durationMs) {
  state.mode = mode;
  state.status = 'idle';
  state.halfwayFired = false;
  state.laps = [];
  state.elapsedMs = 0;
  state.startedAt = null;
  state.endAt = null;
  if (mode !== 'stopwatch') {
    state.durationMs = clampDuration(durationMs || state.settings.timer * MIN);
    state.remainingMs = state.durationMs;
  }
}

function start(state) {
  if (state.status === 'running') return 'Already running.';
  if (state.mode === 'stopwatch') {
    state.startedAt = Date.now() - state.elapsedMs;
  } else {
    if (state.status === 'done' || state.remainingMs <= 0) state.remainingMs = state.durationMs;
    state.endAt = Date.now() + state.remainingMs;
  }
  const resumed = state.status === 'paused';
  state.status = 'running';
  return resumed ? 'Resumed.' : `${capitalize(modeLabel(state.mode))} started${state.mode === 'stopwatch' ? '' : ', ' + fmt(state.remainingMs)}.`;
}

function pause(state) {
  if (state.status !== 'running') return 'Nothing is running.';
  if (state.mode === 'stopwatch') {
    state.elapsedMs = Date.now() - state.startedAt;
  } else {
    state.remainingMs = Math.max(0, state.endAt - Date.now());
  }
  state.status = 'paused';
  return 'Paused.';
}

function reset(state) {
  setMode(state, state.mode);
  return 'Reset.';
}

// Adjust the current timer by deltaMs (running, paused or idle), keeping it within 1–99 min.
function adjust(state, deltaMs) {
  if (state.mode === 'stopwatch') return 'The stopwatch has no length to change.';
  const rem = remaining(state);
  const newRem = Math.max(1000, rem + deltaMs);
  state.durationMs = clampDuration(state.durationMs + deltaMs);
  if (state.status === 'running') state.endAt = Date.now() + newRem;
  else state.remainingMs = Math.min(newRem, state.durationMs);
  if (state.status === 'done') state.status = 'idle';
  return `${deltaMs > 0 ? 'Added' : 'Removed'} ${fmt(Math.abs(deltaMs))}. ${fmt(remaining(state))} left.`;
}

async function complete(state) {
  state.status = 'done';
  state.remainingMs = 0;
  state.endAt = null;
  state.timersCompleted += 1;

  const title = 'Time is up';
  const msg = `Your ${fmt(state.durationMs)} timer has finished.`;
  notify('timer-done', title, msg);
  await chime('done', state);
  await speak(`${title}. ${msg}`, state);

  // Leave the finished timer blinking; the next Start re-arms the same length.
  state.remainingMs = state.durationMs;
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function statusText(state) {
  if (state.mode === 'stopwatch') {
    const e = state.status === 'running' ? Date.now() - state.startedAt : state.elapsedMs;
    return `Stopwatch ${state.status === 'running' ? 'running' : state.status} at ${fmt(e)}.`;
  }
  if (state.status === 'idle') return `${capitalize(modeLabel(state.mode))} ready, ${fmt(state.durationMs)}.`;
  if (state.status === 'done') return `${capitalize(modeLabel(state.mode))} ready.`;
  return `${fmt(remaining(state))} left in your ${modeLabel(state.mode)}${state.status === 'paused' ? ', paused' : ''}.`;
}

// ---------- command execution --------------------------------------------------------------

async function applyCommand(state, cmd) {
  let reply = '';
  switch (cmd.action) {
    case 'start':
      if (cmd.mode && cmd.mode !== state.mode) setMode(state, cmd.mode);
      reply = start(state); break;
    case 'resume':
      if (cmd.mode && cmd.mode !== state.mode) setMode(state, cmd.mode);
      reply = state.status === 'paused' ? start(state) : 'Nothing to resume.'; break;
    case 'pause':
      reply = pause(state); break;
    case 'reset':
      if (cmd.mode && cmd.mode !== state.mode) setMode(state, cmd.mode);
      reply = reset(state); break;
    case 'adjust':
      reply = adjust(state, cmd.deltaMs); break;
    case 'lap':
      if (state.mode === 'stopwatch' && state.status === 'running') {
        const e = Date.now() - state.startedAt;
        state.laps.unshift(e);
        state.laps = state.laps.slice(0, 10);
        reply = `Lap ${state.laps.length}, ${fmt(e)}.`;
      } else reply = 'Start the stopwatch first.';
      break;
    case 'mode':
      if (cmd.mode === 'alarm') {
        state.alarmView = true;
        if (state.alarmDraft === null) state.alarmDraft = defaultDraft();
        reply = state.alarms.length
          ? `${state.alarms.length} alarm${state.alarms.length > 1 ? 's' : ''} set, next at ${state.alarms[0].label}.`
          : 'No alarms set.';
        break;
      }
      state.alarmView = false;
      if (cmd.mode !== state.mode) { setMode(state, cmd.mode); reply = `${capitalize(modeLabel(cmd.mode))} ready.`; }
      else reply = '';
      break;
    case 'alarmDraft': {
      if (state.alarmDraft === null) state.alarmDraft = defaultDraft();
      state.alarmDraft = cmd.minutes !== undefined ? cmd.minutes : (state.alarmDraft + cmd.deltaMin + 1440) % 1440;
      reply = ''; break;
    }
    case 'deleteAlarm':
      state.alarms = state.alarms.filter((a) => a.id !== cmd.id);
      await scheduleClockAlarms(state);
      reply = 'Alarm removed.'; break;
    case 'dismiss':
      reply = state.ringing ? 'Alarm off.' : 'No alarm is ringing.';
      await dismiss(state); break;
    case 'snooze': {
      if (!state.ringing) { reply = 'No alarm is ringing.'; break; }
      await dismiss(state);
      const a = addAlarm(state, Date.now() + cmd.ms);
      await scheduleClockAlarms(state);
      reply = `Snoozed until ${a.label}.`; break;
    }
    case 'setTimer': {
      const requested = cmd.durationMs;
      setMode(state, 'timer', requested);
      const clamped = state.durationMs !== requested ? ` Timers run from 1 to 99 minutes, so I set ${fmt(state.durationMs)}.` : '';
      reply = (cmd.autoStart ? start(state) : `Timer set to ${fmt(state.durationMs)}.`) + clamped;
      break;
    }
    case 'halfway':
      state.halfwayNotify = cmd.on;
      reply = cmd.on ? 'I will let you know halfway.' : 'Halfway reminder off.'; break;
    case 'setAlarm': {
      let at;
      if (cmd.inMs) at = Date.now() + cmd.inMs;
      else if (cmd.at) at = nextOccurrence(cmd.at.h, cmd.at.m, cmd.at.ambiguous);
      else { // from the draft on the alarm display
        const draft = state.alarmDraft ?? defaultDraft();
        at = nextOccurrence(Math.floor(draft / 60), draft % 60, false);
      }
      if (state.alarms.some((a) => Math.abs(a.at - at) < 60000)) { reply = `An alarm is already set for ${labelFor(at)}.`; break; }
      const a = addAlarm(state, at);
      state.alarmDraft = new Date(at).getHours() * 60 + new Date(at).getMinutes();
      state.alarmView = true;
      await scheduleClockAlarms(state);
      const hours = Math.round((at - Date.now()) / 3600000 * 10) / 10;
      reply = `Alarm set for ${a.label}, in ${hours >= 1 ? hours + ' hours' : fmt(at - Date.now())}.`;
      break;
    }
    case 'clearAlarms':
      state.alarms = [];
      await scheduleClockAlarms(state);
      reply = 'Alarms cleared.'; break;
    case 'status':
      reply = statusText(state); break;
    case 'floater':
      state.settings.floaterVisible = cmd.visible;
      reply = cmd.visible ? 'Clock shown.' : 'Clock pinned to the toolbar.'; break;
    case 'sound':
      state.settings.sound = cmd.on;
      reply = cmd.on ? 'Sound on.' : 'Sound off.'; break;
    case 'listen':
      await setListening(state, cmd.on);
      reply = cmd.on ? 'Listening.' : 'Okay, not listening.'; break;
    case 'unknown':
      reply = cmd.hint || 'Sorry, I did not catch that.'; break;
    default:
      reply = 'Unknown command.';
  }
  await scheduleTimerAlarms(state);
  state.lastReply = reply;
  return reply;
}

// ---------- speech (offscreen document) ------------------------------------------------------

let creatingOffscreen = null;
async function ensureOffscreen() {
  const has = await chrome.offscreen.hasDocument();
  if (has) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
      justification: 'Continuous speech recognition for voice commands and playing timer chimes.'
    }).finally(() => { creatingOffscreen = null; });
  }
  await creatingOffscreen;
}

async function setListening(state, on) {
  state.listening = on;
  await ensureOffscreen();
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'listen', on }).catch(() => {});
}

async function handleTranscript(text) {
  return withState(async (state) => {
    state.lastHeard = text;
    const cmd = parseCommand(text, state.settings.wakeWord);
    if (!cmd) return; // wake word required but missing: ignore silently
    const reply = await applyCommand(state, cmd);
    if (cmd.action !== 'unknown') await chime('tick', state);
    await speak(reply, state);
    return { cmd: describeCommand(cmd), reply };
  });
}

// ---------- events ------------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await withState(async () => {});
  cachedVoice = await pickFemaleVoice();
  if (reason === 'install') chrome.tabs.create({ url: 'permission.html' });
});

chrome.runtime.onStartup.addListener(() => withState(async (state) => {
  // Recover after a browser restart: a paused/idle state needs no alarms,
  // a running timer that expired while closed completes now.
  if (state.status === 'running' && state.mode !== 'stopwatch' && state.endAt <= Date.now()) await complete(state);
  await scheduleTimerAlarms(state);
  state.alarms = state.alarms.filter((a) => a.at > Date.now()); // drop alarms missed while closed
  state.ringing = null;
  await scheduleClockAlarms(state);
  if (state.listening) await setListening(state, true);
}));

chrome.alarms.onAlarm.addListener((alarm) => withState(async (state) => {
  if (alarm.name === 'timer-end') {
    if (state.status === 'running' && state.mode !== 'stopwatch') await complete(state);
    await scheduleTimerAlarms(state);
  } else if (alarm.name === 'timer-half') {
    if (state.status === 'running' && state.halfwayNotify && !state.halfwayFired) {
      state.halfwayFired = true;
      const msg = `${fmt(remaining(state))} to go in your ${modeLabel(state.mode)}.`;
      notify('timer-half', 'Halfway there', msg);
      await chime('half', state);
      await speak(`Halfway. ${msg}`, state);
    }
  } else if (alarm.name.startsWith('clock-')) {
    const id = alarm.name.slice(6);
    const a = state.alarms.find((x) => x.id === id);
    state.alarms = state.alarms.filter((x) => x.id !== id);
    state.ringing = { id, label: a ? a.label : labelFor(Date.now()) };
    state.alarmView = true;
    state.settings.floaterVisible = true; // make sure the ringing clock can be seen and dismissed
    notify(`alarm-${id}`, 'Alarm', `It's ${state.ringing.label}. Click to dismiss.`);
    await chime('alarm', state);  // loops in the offscreen document until stopped
    await chrome.alarms.create('ring-timeout', { delayInMinutes: 1 });
    await speak(`Alarm. It's ${state.ringing.label}.`, state);
  } else if (alarm.name === 'ring-timeout') {
    if (state.ringing) await dismiss(state);
  }
  // badge-tick just triggers saveState -> updateBadge
}));

chrome.notifications.onClicked.addListener((id) => {
  chrome.notifications.clear(id);
  if (id.startsWith('alarm-')) withState((state) => dismiss(state));
  chrome.action.openPopup?.().catch?.(() => {});
});

chrome.commands.onCommand.addListener((name) => withState(async (state) => {
  if (name === 'toggle-listening') await setListening(state, !state.listening);
  if (name === 'toggle-floater') state.settings.floaterVisible = !state.settings.floaterVisible;
  if (name === 'start-pause') await applyCommand(state, { action: state.status === 'running' ? 'pause' : 'start' });
}));

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target === 'offscreen') return false; // not for us

  (async () => {
    switch (msg.type) {
      case 'getState':
        sendResponse(await loadState()); break;

      case 'command': // structured command from a UI button
        sendResponse(await withState(async (state) => {
          const reply = await applyCommand(state, msg.cmd);
          if (msg.speak !== false) await speak(reply, state);
          return reply;
        }));
        break;

      case 'transcript': // from offscreen speech recognizer
        sendResponse(await handleTranscript(msg.text)); break;

      case 'listeningState': // offscreen reports actual recognizer status
        await withState(async (state) => { state.listening = msg.on; });
        sendResponse(true); break;

      case 'speechError':
        await withState(async (state) => {
          state.listening = false;
          state.lastReply = msg.error === 'not-allowed'
            ? 'Microphone access is needed. Open the permission page from the popup.'
            : `Voice error: ${msg.error}`;
        });
        if (msg.error === 'not-allowed') chrome.tabs.create({ url: 'permission.html' });
        sendResponse(true); break;

      case 'toggleListening':
        sendResponse(await withState(async (state) => { await setListening(state, !state.listening); return state.listening; }));
        break;

      case 'updateSettings':
        sendResponse(await withState(async (state) => {
          state.settings = { ...state.settings, ...msg.settings };
          if (msg.settings.voiceName !== undefined) cachedVoice = null;
          // If the default length changed while idle, refresh the display.
          if (msg.settings.timer !== undefined && state.status === 'idle' && state.mode !== 'stopwatch') setMode(state, state.mode);
          await scheduleTimerAlarms(state);
        }));
        break;

      case 'getVoices':
        chrome.tts.getVoices((voices = []) => sendResponse(voices.map((v) => ({ name: v.voiceName, lang: v.lang, gender: v.gender }))));
        return;

      case 'openShortcuts':
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); sendResponse(true); break;

      case 'openPermission':
        chrome.tabs.create({ url: 'permission.html' }); sendResponse(true); break;

      default:
        sendResponse(null);
    }
  })();
  return true; // keep the channel open for async sendResponse
});
