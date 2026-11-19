import { icon } from './icons.js';

const presets = {
  clear: { rain: 0, fog: 0, storm: false },
  rainy: { rain: .68, fog: .20, storm: false },
  foggy: { rain: 0, fog: .94, storm: false },
  storm: { rain: .94, fog: .46, storm: true },
};

const directions = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];

function bearingText(degrees) {
  const cardinal = directions[Math.round(degrees / 45) % 8];
  return cardinal + ' ' + String(degrees).padStart(3, '0') + '°';
}

export function createWeatherPanel(initial, onChange) {
  const panel = document.getElementById('weather-panel');
  const trigger = document.getElementById('weather-toggle');
  const closeButton = document.getElementById('weather-close');
  const reset = document.getElementById('weather-reset');
  const custom = document.getElementById('weather-custom');
  const presetButtons = [...panel.querySelectorAll('[data-weather-preset]')];
  const fields = [...panel.querySelectorAll('[data-weather-key]')].map(input => ({
    input,
    key: input.dataset.weatherKey,
    output: input.closest('label').querySelector('output'),
  }));
  const windDial = document.getElementById('wind-dial');
  const defaults = { ...initial };
  let state = { ...initial };

  function refresh() {
    windDial.style.setProperty('--wind-bearing', state.windFrom + 'deg');
    windDial.setAttribute('aria-valuenow', String(state.windFrom));
    windDial.setAttribute('aria-valuetext', bearingText(state.windFrom));
    if (state.followWind) state.waveTo = (state.windFrom + 180) % 360;
    const activePreset = presetButtons.find(button => button.dataset.weatherPreset === state.preset);
    for (const button of presetButtons) button.setAttribute('aria-pressed', String(button === activePreset));
    custom.hidden = Boolean(activePreset);
    const triggerIcon = activePreset?.dataset.weatherPreset ??
      (state.storm ? 'storm' : state.rain > 0 ? 'rainy' : state.fog > 0 ? 'foggy' : 'clear');
    const weatherIcon = trigger.querySelector('i');
    if (weatherIcon.dataset.icon !== triggerIcon) {
      weatherIcon.dataset.icon = triggerIcon;
      weatherIcon.innerHTML = icon(triggerIcon);
    }
    reset.disabled = Object.keys(defaults).every(key => state[key] === defaults[key]);
    for (const { input, key, output } of fields) {
      if (input.type === 'checkbox') {
        input.checked = state[key];
        continue;
      }
      const isPercent = key === 'fog' || key === 'rain';
      const value = isPercent ? Math.round(state[key] * 100) : state[key];
      input.value = String(value);
      input.disabled = key === 'waveTo' && state.followWind;
      input.style.setProperty('--wx-fill', (value / Number(input.max)) * 100 + '%');
      let reading;
      if (key === 'windFrom' || key === 'waveTo') reading = bearingText(value);
      else if (key === 'windSpeed') reading = value.toFixed(1) + ' m/s';
      else if (key === 'waveHeight') reading = value.toFixed(2) + ' m';
      else reading = value + '%';
      output.value = reading;
      output.setAttribute('aria-hidden', 'true');
      input.setAttribute('aria-valuetext', reading);
    }
  }

  function change(patch) {
    Object.assign(state, patch);
    refresh();
    onChange({ ...state });
  }

  for (const button of presetButtons) {
    button.addEventListener('click', () => {
      const preset = button.dataset.weatherPreset;
      change({ preset, ...presets[preset] });
    });
  }
  for (const { input, key } of fields) {
    input.addEventListener('input', () => {
      let value = input.type === 'checkbox' ? input.checked : input.valueAsNumber;
      if (key === 'rain' || key === 'fog') value /= 100;
      const patch = { [key]: value };
      if (key === 'rain' || key === 'fog' || key === 'storm') patch.preset = 'custom';
      change(patch);
    });
    // Pointer users can drive again immediately. Keyboard users keep the focused slider.
    input.addEventListener('pointerup', () => input.blur());
  }
  function aimWind(event) {
    const rect = windDial.getBoundingClientRect();
    const dx = event.clientX - rect.left - rect.width / 2;
    const dy = event.clientY - rect.top - rect.height / 2;
    if (Math.hypot(dx, dy) < 3) return;
    change({ windFrom: (Math.round(Math.atan2(dx, -dy) * 180 / Math.PI) + 360) % 360 });
  }
  windDial.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    windDial.setPointerCapture(event.pointerId);
    aimWind(event);
  });
  windDial.addEventListener('pointermove', event => {
    if (windDial.hasPointerCapture(event.pointerId)) aimWind(event);
  });
  windDial.addEventListener('keydown', event => {
    const step = event.shiftKey ? 45 : 1;
    const bearings = { ArrowLeft: state.windFrom - step, ArrowDown: state.windFrom - step,
      ArrowRight: state.windFrom + step, ArrowUp: state.windFrom + step, Home: 0, End: 359 };
    if (!(event.key in bearings)) return;
    event.preventDefault(); event.stopPropagation();
    change({ windFrom: (bearings[event.key] + 360) % 360 });
  });
  reset.addEventListener('click', () => change(defaults));

  function setOpen(open, keyboardFocus = false) {
    panel.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    if (keyboardFocus) {
      const focus = open ? presetButtons.find(button => button.getAttribute('aria-pressed') === 'true') ?? presetButtons[0] : trigger;
      focus.focus({ preventScroll: true });
    }
  }
  trigger.addEventListener('click', () => setOpen(panel.hidden, trigger.matches(':focus-visible')));
  closeButton.addEventListener('click', () => setOpen(false, true));
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden && !document.querySelector('dialog[open]')) {
      event.preventDefault();
      setOpen(false, true);
    }
  });
  refresh();
  return { get isOpen() { return !panel.hidden; } };
}
