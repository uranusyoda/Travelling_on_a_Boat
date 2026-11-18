// All three layers share a noise buffer. Different starting positions keep them uncorrelated.
function soundscape(ctx) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 4), ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  function noise(type, hz, volume, pan, offset) {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = hz;
    filter.Q.value = .65;
    const level = ctx.createGain();
    level.gain.value = volume;
    const position = ctx.createStereoPanner();
    position.pan.value = pan;
    source.connect(filter).connect(level).connect(position).connect(master);
    source.start(0, offset);
    return { filter, level };
  }

  function breathe(parameter, rate, depth) {
    const oscillator = ctx.createOscillator();
    const amount = ctx.createGain();
    oscillator.frequency.value = rate;
    amount.gain.value = depth;
    oscillator.connect(amount).connect(parameter);
    oscillator.start();
  }

  const surf = noise('lowpass', 990, .52, -.22, 0);
  breathe(surf.level.gain, .137, .27);
  breathe(surf.filter.frequency, .137, 610);
  breathe(surf.level.gain, .087, .10);
  const wind = noise('bandpass', 580, .16, .36, 1.4);
  breathe(wind.filter.frequency, .065, 270);
  breathe(wind.level.gain, .097, .065);
  const wash = noise('bandpass', 1600, 0, .04, 2.7);
  breathe(wash.filter.frequency, .77, 160);
  return { master, wash };
}

export function createHarborAudio() {
  let ctx, voices, suspendTimer;
  let enabled = false, paused = false, speed = 0, lastWash = -1;
  let toggleVersion = 0;

  function setVolume() {
    voices.master.gain.setTargetAtTime(enabled && !paused ? .59 : 0, ctx.currentTime, .075);
  }

  function setWash() {
    const amount = Math.min(Math.abs(speed) / 8.85, 1);
    // The game calls update each frame. Schedule changes only when the flow is audibly different.
    if (Math.abs(amount - lastWash) < .012 && amount !== 0) return;
    if (amount === lastWash) return;
    lastWash = amount;
    voices.wash.level.gain.setTargetAtTime(.43 * amount, ctx.currentTime, .30);
    voices.wash.filter.frequency.setTargetAtTime(1250 + 1450 * amount, ctx.currentTime, .35);
  }

  return {
    get enabled() { return enabled; },
    async toggle() {
      const version = ++toggleVersion;
      clearTimeout(suspendTimer);
      if (enabled) {
        enabled = false;
        setVolume();
        suspendTimer = setTimeout(() => {
          if (!enabled && ctx.state === 'running') ctx.suspend().catch(() => {});
        }, 550);
        return false;
      }
      try {
        if (!ctx) {
          const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
          if (!Audio) return false;
          ctx = new Audio();
        }
        voices ??= soundscape(ctx);
        enabled = true;
        await ctx.resume();
        if (version === toggleVersion) { setVolume(); setWash(); }
      } catch {
        if (version === toggleVersion) enabled = false;
      }
      return enabled;
    },
    update(nextSpeed = 0, isPaused = false) {
      speed = Number.isFinite(nextSpeed) ? nextSpeed : 0;
      const changed = paused !== Boolean(isPaused);
      paused = Boolean(isPaused);
      if (!enabled || !voices) return;
      if (changed) setVolume();
      setWash();
    },
  };
}
