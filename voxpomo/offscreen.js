// Offscreen document: runs the Web Speech API recognizer continuously and
// plays chimes with WebAudio. It only talks to the service worker.

let recognition = null;
let wantListening = false;
let restartTimer = null;

function report(on) {
  chrome.runtime.sendMessage({ type: 'listeningState', on }).catch(() => {});
}

function createRecognizer() {
  const SR = self.SpeechRecognition || self.webkitSpeechRecognition;
  if (!SR) {
    chrome.runtime.sendMessage({ type: 'speechError', error: 'Speech recognition is not supported in this browser.' });
    return null;
  }
  const r = new SR();
  r.continuous = true;
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.lang = navigator.language || 'en-US';

  r.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) {
        const text = res[0].transcript.trim();
        if (text) chrome.runtime.sendMessage({ type: 'transcript', text }).catch(() => {});
      }
    }
  };

  r.onerror = (e) => {
    // 'no-speech' and 'aborted' are routine; keep going.
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
      wantListening = false;
      chrome.runtime.sendMessage({ type: 'speechError', error: e.error }).catch(() => {});
    }
  };

  // Chrome stops continuous recognition after a while; restart if we still want it.
  r.onend = () => {
    if (wantListening) {
      clearTimeout(restartTimer);
      restartTimer = setTimeout(() => { try { r.start(); } catch { /* already started */ } }, 300);
    } else {
      report(false);
    }
  };

  r.onstart = () => report(true);
  return r;
}

function setListening(on) {
  wantListening = on;
  if (on) {
    if (!recognition) recognition = createRecognizer();
    if (!recognition) return;
    try { recognition.start(); } catch { /* already running */ }
  } else if (recognition) {
    clearTimeout(restartTimer);
    recognition.stop();
  }
}

// ---- Chimes (no audio files needed) -------------------------------------------

let ctx = null;
function tone(freq, start, dur, type = 'sine', gain = 0.25) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, ctx.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.05);
}

let alarmLoop = null;
function stopChime() { clearInterval(alarmLoop); alarmLoop = null; }

function chime(kind) {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  if (kind === 'alarm') {
    // Classic beep pattern, repeated until the alarm is dismissed (background caps it at 1 min).
    const burst = () => { for (let i = 0; i < 4; i++) { tone(880, i * 0.25, 0.1, 'square', 0.22); tone(1109, i * 0.25 + 0.12, 0.1, 'square', 0.22); } };
    stopChime(); burst(); alarmLoop = setInterval(burst, 1500);
    return;
  }
  switch (kind) {
    case 'tick':  tone(1200, 0, 0.08, 'square', 0.08); break;
    case 'half':  tone(660, 0, 0.25); tone(880, 0.25, 0.35); break;
    case 'done':  [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.18, 0.5)); break;
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== 'offscreen') return;
  if (msg.type === 'listen') setListening(msg.on);
  if (msg.type === 'chime') chime(msg.kind);
  if (msg.type === 'stopChime') stopChime();
});
