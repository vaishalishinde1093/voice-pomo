import { createClock } from './lib/clock.js';

const clock = createClock(document.getElementById('clock'), { variant: 'popup' });

async function refresh() {
  const state = await chrome.runtime.sendMessage({ type: 'getState' });
  if (state) clock.update(state);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.state?.newValue) clock.update(changes.state.newValue);
});

refresh();
