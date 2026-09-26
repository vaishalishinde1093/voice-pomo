const status = document.getElementById('status');
document.getElementById('grant').addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    status.className = 'ok';
    status.textContent = 'Microphone allowed. You can close this tab and press the mic button on the clock.';
  } catch (err) {
    status.className = 'err';
    status.textContent = 'Permission was denied. Click the camera/mic icon in the address bar to allow it, then try again.';
  }
});
