# VoxPomo – Voice Pomodoro Clock (Chrome extension, Manifest V3)

A digital-desk-clock style Pomodoro timer, stopwatch and alarm you control by talking to it.
It floats over any web page (drag it anywhere, collapse it to a small pill, or pin it to the toolbar),
and the same clock lives in the toolbar popup with a live countdown badge.

## What it does

| Area | Details |
|---|---|
| Timer | One free-length countdown, 1–99 minutes, set by voice, the +/− steppers, or Settings. Default 25 min. |
| Voice control | Continuous listening via the Web Speech API. Optional wake word. Spoken confirmations in a female voice via Chrome TTS (choose another voice in Settings). |
| Halfway reminder | "Notify me halfway" – notification + chime + voice at 50% of the session. |
| Alarms | Own tab with a 12-hour LED display: pick a time with −/+ (minutes) and −h/+h, press Set, or say "alarm at 7 am" / "alarm in 20 minutes". Rings until dismissed (max 1 min), snooze, list with remove. Survives browser restarts. |
| Stopwatch | Start / stop / resume / reset / lap (last 10 laps listed in the popup). |
| Floating clock | Draggable on every page, position remembered, collapse to pill, hide ("pin to toolbar"). |
| Toolbar | Badge shows minutes left (colour = mode), pause indicator, popup with full clock and settings. |
| Shortcuts | Windows/Linux: Alt+Shift+V listen, Alt+Shift+P show/hide floater, Alt+Shift+S start/pause. Mac: Ctrl+Shift+V / P / S. Change them at `chrome://extensions/shortcuts` (also linked from Settings). |
| Reliability | Timer state and alarms live in the service worker with `chrome.alarms`, so they keep running when the popup is closed. |

## Voice commands

```
start · pause · stop · resume · continue · reset
set a 25 minute timer            timer for 45
start a 90 second timer          focus for 30 minutes
add 5 minutes                    take off 2 minutes
notify me halfway                don't notify me halfway
how much time is left            status
set an alarm for 3:30 pm         alarm in 20 minutes         cancel alarms
show alarms                      snooze (10 minutes)         stop the alarm
start stopwatch · stop stopwatch · resume stopwatch · reset stopwatch · lap
pin the clock  (hides the floater)      show the clock
mute · unmute · stop listening
```
Numbers may be spoken as words ("twenty five minutes"). If you set a wake word in Settings
(e.g. "hey pomo"), only phrases that begin with it are treated as commands.

## Install locally (developer mode)

1. Open `chrome://extensions`, enable **Developer mode** (top right).
2. Click **Load unpacked** and select the `voxpomo` folder.
3. A tab opens asking for microphone access – click **Allow microphone**, then **Allow** in Chrome's prompt.
   (You can reopen this page any time from the popup → ⚙ → Microphone → Grant access.)
4. Click the toolbar icon or press the mic button on the floating clock and say "start".

> Voice recognition uses Chrome's built-in speech service, which needs an internet connection.

## Project layout

```
voxpomo/
├── manifest.json        permissions, scripts, keyboard shortcuts
├── background.js        service worker: the only place timer state changes
├── lib/commands.js      speech phrase → structured command (pure, testable)
├── lib/clock.js         shared clock UI (shadow DOM) used by popup and floater
├── popup.html / .js     toolbar popup
├── content.js           mounts the draggable floating clock on pages
├── offscreen.html / .js speech recognizer + WebAudio chimes (offscreen document)
├── permission.html / .js one-time microphone permission page (also the options page)
└── assets/              icons
```

How the pieces talk: every UI sends `{type:'command'}` messages to the service worker; the worker
mutates state, schedules `chrome.alarms`, saves to `chrome.storage.local`; all open UIs listen to
`storage.onChanged` and re-render. The offscreen document sends transcripts the same way.

## Publish to the Chrome Web Store

1. **Prepare the package**
   - Bump `version` in `manifest.json` for every upload.
   - Replace the generated icons in `assets/` with your final artwork if you like (16, 48, 128 px PNG).
   - Zip the *contents* of the folder (manifest.json must be at the zip root). `voxpomo.zip` is included.

2. **Developer account** – go to https://chrome.google.com/webstore/devconsole, sign in with a Google
   account and pay the one-time registration fee (US$5). Verify your email and, if you plan to
   list under an organisation, set up a publisher group.

3. **New item** → upload the zip.

4. **Store listing** – fill in:
   - Name, short summary (132 chars), detailed description (paste the "What it does" section).
   - Category: Productivity. Language.
   - Screenshots: 1280×800 or 640×400 PNG (at least one; capture the floating clock on a page and the popup).
   - Small promo tile 440×280 (required), marquee 1400×560 (optional).
   - Icon 128×128.

5. **Privacy tab** – required because of the permissions used. Suggested answers:
   - Single purpose: "Voice-controlled Pomodoro timer, stopwatch and alarm clock."
   - Permission justifications:
     - `storage` – save timer state and settings.
     - `alarms` – fire timer completion, halfway reminders and alarms while the popup is closed.
     - `notifications` – notify when a session, break or alarm ends.
     - `offscreen` – run speech recognition and play chimes in the background.
     - `tts` – spoken confirmations of voice commands.
     - Host permission `<all_urls>` – render the floating clock on any page the user visits.
   - Data usage: audio is processed by Chrome's speech service only; the extension collects no personal
     data and sends nothing to its own servers. Tick "does not collect user data" and certify the
     disclosures. Link a privacy policy page (a simple hosted page or GitHub Pages file saying the above).

6. **Distribution** – choose Public (or Unlisted for a private link), select regions, then **Submit for review**.
   Review usually takes a few hours to a few days; extensions with `<all_urls>` may get extra scrutiny,
   so the justification above matters. Fix any reviewer notes and resubmit with a new version number.

7. **After publishing** – updates are just a new zip with a higher version. Users get them automatically.

## Ideas for a next version

- Task list: "start a 25 minute timer for writing the report" and log sessions per task.
- Daily focus statistics and streaks in the popup.
- Sync settings across devices with `chrome.storage.sync`.
- Custom chime sounds and colour themes (the palette is a handful of CSS variables in `lib/clock.js`).
