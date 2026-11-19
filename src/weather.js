// Bearings are clockwise from north (-Z). Wind is entered as its source;
// the wave bearing always describes the direction a crest travels toward.
export const initialWeather = Object.freeze({
  preset: 'clear', windFrom: 305, windSpeed: 3, waveHeight: .27,
  followWind: true, waveTo: 125, rain: 0, fog: 0, storm: false,
});

function advanceBearing(current, target, weight) {
  const difference = ((target - current + 540) % 360) - 180;
  return (current + difference * weight + 360) % 360;
}

export function createConditions(initial) {
  let target = {...initial};
  let windTo = (initial.windFrom + 180) % 360;
  let waveTo = initial.followWind ? windTo : initial.waveTo;
  const state = { windSpeed: initial.windSpeed, waveHeight: initial.waveHeight,
    rain: initial.rain, fog: initial.fog, storm: Number(initial.storm), overcast: 0 };

  function advance(dt) {
    const weight = -Math.expm1(-dt * 1.35);
    const desiredWind = (target.windFrom + 180) % 360;
    windTo = advanceBearing(windTo, desiredWind, weight);
    waveTo = advanceBearing(waveTo, target.followWind ? desiredWind : target.waveTo, weight);
    const rad = Math.PI / 180;
    state.windX = Math.sin(windTo * rad);
    state.windZ = -Math.cos(windTo * rad);
    state.waveX = Math.sin(waveTo * rad);
    state.waveZ = -Math.cos(waveTo * rad);
    for (const key of ['windSpeed', 'waveHeight', 'rain', 'fog', 'storm']) {
      const value = Number(target[key]);
      state[key] += (value - state[key]) * weight;
      if (Math.abs(state[key] - value) < .0005) state[key] = value;
    }
    state.overcast = Math.min(1, Math.max(state.rain * .83, state.fog * .76, state.storm));
    return state;
  }
  advance(0);
  return { state, advance, set(next) { target = {...next}; } };
}
