// Turns a spoken phrase into a structured command.
// Pure function, no browser APIs, so it's easy to unit test.

const WORD_NUMBERS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100
};

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s:.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// "twenty five" -> "25", "a half" -> "0.5"
function wordsToDigits(text) {
  const tokens = text.split(' ');
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t in WORD_NUMBERS) {
      let value = WORD_NUMBERS[t];
      // Compound numbers: "twenty five"
      const next = tokens[i + 1];
      if (value >= 20 && value < 100 && next in WORD_NUMBERS && WORD_NUMBERS[next] < 10) {
        value += WORD_NUMBERS[next];
        i++;
      }
      out.push(String(value));
    } else {
      out.push(t);
    }
  }
  return out.join(' ');
}

// Finds a duration like "1 hour 30 minutes", "25 minutes", "90 seconds", "half an hour".
function parseDuration(text) {
  let ms = 0;
  let found = false;

  // Phrases without digits first.
  if (/\bhour and a half\b/.test(text)) return 90 * 60000;
  if (/\bhalf (?:an |a )?hour\b/.test(text)) return 30 * 60000;
  if (/\bquarter (?:of )?(?:an |a )?hour\b/.test(text)) return 15 * 60000;
  text = text.replace(/\b(?:a|an) hour\b/, '1 hour').replace(/\b(?:a|an) minute\b/, '1 minute');
  text = text.replace(/\b(\d+) and a half (minutes?|hours?|mins?|hrs?)\b/, '$1.5 $2');
  const andHalf = /\band a half\b/.test(text) ? 0.5 : 0;

  const hours = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/);
  const mins = text.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)\b/);
  const secs = text.match(/(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)\b/);

  if (hours) { ms += parseFloat(hours[1]) * 3600000; found = true; }
  if (mins) { ms += (parseFloat(mins[1]) + andHalf) * 60000; found = true; }
  else if (hours && andHalf) ms += 30 * 60000;
  if (secs) { ms += parseFloat(secs[1]) * 1000; found = true; }

  return found && ms > 0 ? Math.round(ms) : null;
}

// Parses a clock time like "3:30 pm", "15:45", "7 am", "noon".
function parseClockTime(text) {
  if (/\bnoon\b/.test(text)) return { h: 12, m: 0 };
  if (/\bmidnight\b/.test(text)) return { h: 0, m: 0 };
  const m = text.match(/\b(\d{1,2})(?:[:\s](\d{2}))?\s*(am|pm|a m|p m)?\b/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const mer = m[3] ? m[3].replace(' ', '') : null;
  if (h > 23 || min > 59) return null;
  if (mer === 'pm' && h < 12) h += 12;
  if (mer === 'am' && h === 12) h = 0;
  // "3:30" with no am/pm and an hour <= 12 could mean either half of the day.
  return { h, m: min, ambiguous: !mer && h >= 1 && h <= 12 };
}

/**
 * @param {string} rawText spoken phrase
 * @param {string} [wakeWord] optional wake word that must prefix the phrase
 * @returns {object|null} structured command or null if not understood
 */
export function parseCommand(rawText, wakeWord = '') {
  let text = normalize(rawText);
  if (wakeWord) {
    const ww = normalize(wakeWord);
    if (!text.startsWith(ww)) return null;
    text = text.slice(ww.length).trim();
  }
  text = wordsToDigits(text);
  if (!text) return null;

  const negative = /\b(don t|dont|do not|no|stop|cancel|turn off|disable|never)\b/.test(text);
  const isStopwatch = /\bstop ?watch\b/.test(text);
  const duration = parseDuration(text);

  // --- Listening control ---------------------------------------------------
  if (/\b(stop listening|go to sleep|sleep now|mute mic|microphone off)\b/.test(text)) {
    return { action: 'listen', on: false };
  }

  // --- Ringing alarm ------------------------------------------------------------
  if (/\bsnooze\b/.test(text)) return { action: 'snooze', ms: duration || 5 * 60000 };
  if (/\b(dismiss|turn off|stop|silence|shut up|okay i m up|i m awake)\b/.test(text) && /\balarms?\b/.test(text)) {
    return { action: 'dismiss' };
  }

  // --- Alarms ----------------------------------------------------------------
  if (/\balarms?\b|\bwake me\b|\bremind me at\b/.test(text)) {
    if (/\b(cancel|clear|delete|remove)\b/.test(text)) return { action: 'clearAlarms' };
    if (/\bin\b/.test(text) && duration) return { action: 'setAlarm', inMs: duration };
    const t = parseClockTime(text.replace(/\balarms?\b/, ''));
    if (t) return { action: 'setAlarm', at: t };
    if (/\b(show|open|list|what|which|any)\b/.test(text)) return { action: 'mode', mode: 'alarm' };
    return { action: 'mode', mode: 'alarm' };
  }

  // --- Halfway reminder ---------------------------------------------------------
  if (/\b(half ?way|mid ?way|half time|at half)\b/.test(text)) {
    return { action: 'halfway', on: !negative };
  }

  // --- Status -------------------------------------------------------------------
  if (/\b(how (much|long)|time left|remaining|status|what s the time|where are we)\b/.test(text)) {
    return { action: 'status' };
  }

  // --- Floater / display ----------------------------------------------------------
  if (/\b(hide|close|dismiss)\b.*\b(clock|timer|widget|float|window)\b/.test(text) ||
      /\b(pin|dock|minimi[sz]e|collapse)\b.*\b(clock|timer|widget|it|to (the )?(task ?bar|toolbar))\b/.test(text) ||
      /\b(pin|dock) it\b/.test(text)) {
    return { action: 'floater', visible: false };
  }
  if (/\b(show|open|bring back|unpin|expand)\b.*\b(clock|timer|widget|float|window|it)\b/.test(text)) {
    return { action: 'floater', visible: true };
  }

  // --- Sound -----------------------------------------------------------------------
  if (/\b(unmute|sound on|turn on sound)\b/.test(text)) return { action: 'sound', on: true };
  if (/\b(mute|quiet|silence|sound off)\b/.test(text)) return { action: 'sound', on: false };

  // --- Stopwatch --------------------------------------------------------------------
  if (isStopwatch || /\b(lap|split)\b/.test(text)) {
    if (/\b(lap|split)\b/.test(text)) return { action: 'lap' };
    if (/\b(reset|clear|restart)\b/.test(text)) return { action: 'reset', mode: 'stopwatch' };
    if (/\b(resume|continue|unpause)\b/.test(text)) return { action: 'resume', mode: 'stopwatch' };
    if (/\b(stop|pause|hold|freeze)\b/.test(text)) return { action: 'pause', mode: 'stopwatch' };
    if (/\b(start|begin|go|run)\b/.test(text)) return { action: 'start', mode: 'stopwatch' };
    return { action: 'mode', mode: 'stopwatch' };
  }

  // --- Add / remove time ("add 5 minutes", "give me 10 more minutes") ---------------------
  if (duration && /\b(add|more|extend|extra|another)\b/.test(text)) return { action: 'adjust', deltaMs: duration };
  if (duration && /\b(remove|less|take off|subtract|shorten)\b/.test(text)) return { action: 'adjust', deltaMs: -duration };

  // --- Timer with a duration ("set a 25 minute timer", "timer for 45", "focus for 30 minutes") ---
  const bareMinutes = !duration && /\b(timer|countdown|set|focus|work)\b/.test(text) && text.match(/\b(\d{1,2})\b/);
  const timerMs = duration || (bareMinutes ? parseInt(bareMinutes[1], 10) * 60000 : null);
  if (timerMs && /\b(timer|pomodoro|focus|work|session|set|for|countdown|minutes?|mins?|hours?)\b/.test(text)) {
    const autoStart = /\b(start|begin|go|run|focus|work)\b/.test(text) || !/\bset\b/.test(text);
    return { action: 'setTimer', mode: 'timer', durationMs: timerMs, autoStart };
  }

  // --- Mode switches ---------------------------------------------------------------------
  if (/\b(timer|countdown) (mode)?\b/.test(text) || /\bswitch to (the )?timer\b/.test(text)) {
    return { action: 'mode', mode: 'timer' };
  }

  // --- Transport controls ---------------------------------------------------------------
  if (/\b(reset|restart|start over|clear)\b/.test(text)) return { action: 'reset' };
  if (/\b(resume|continue|unpause|keep going|carry on)\b/.test(text)) return { action: 'resume' };
  if (/\b(pause|stop|hold|wait|freeze)\b/.test(text)) return { action: 'pause' };
  if (/\b(start|begin|go|play|run|let s go)\b/.test(text)) return { action: 'start' };

  return { action: 'unknown', hint: 'Try "start", "pause", "reset", "set a 25 minute timer" or "notify me halfway".' };
}

// Human-readable summary, useful for the "Heard:" line and spoken feedback.
export function describeCommand(cmd) {
  if (!cmd) return 'Not understood';
  switch (cmd.action) {
    case 'start': return cmd.mode === 'stopwatch' ? 'Start stopwatch' : 'Start';
    case 'pause': return 'Pause';
    case 'resume': return 'Resume';
    case 'reset': return 'Reset';
    case 'lap': return 'Lap';
    case 'setTimer': return `Timer ${Math.round(cmd.durationMs / 60000)} min`;
    case 'adjust': return `${cmd.deltaMs > 0 ? 'Add' : 'Remove'} ${Math.round(Math.abs(cmd.deltaMs) / 60000)} min`;
    case 'halfway': return cmd.on ? 'Halfway reminder on' : 'Halfway reminder off';
    case 'setAlarm': return 'Alarm set';
    case 'dismiss': return 'Alarm dismissed';
    case 'snooze': return 'Snooze';
    case 'clearAlarms': return 'Alarms cleared';
    case 'status': return 'Status';
    case 'floater': return cmd.visible ? 'Show clock' : 'Pin to toolbar';
    case 'sound': return cmd.on ? 'Sound on' : 'Sound off';
    case 'mode': return `Switch to ${cmd.mode}`;
    case 'listen': return cmd.on ? 'Listening' : 'Stopped listening';
    default: return 'Not understood';
  }
}
