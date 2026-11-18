const paths = {
  brand:'<path fill="currentColor" stroke="none" d="M11.4 2.4v13.3H4L11.4 2.4Zm2 .8 6.7 12.5h-6.7V3.2ZM2.5 17.5h19l-3 3.2H5.7z"/>',
  pause:'<path d="M8 5v14m8-14v14"/>', play:'<path fill="currentColor" stroke="none" d="m7 4 14 8-14 8z"/>',
  muted:'<path d="M11 5 6 9H3v6h3l5 4zM16 9l5 6m0-6-5 6"/>',
  sound:'<path d="M11 5 6 9H3v6h3l5 4zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.4 9.5a2.7 2.7 0 0 1 5.3.4c0 2-2.7 2.1-2.7 4m0 2.9h.01"/>',
  pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.4"/>',
  camera:'<path d="m8 7 1.5-2h5L16 7h4a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="12.5" r="3.2"/>',
  change:'<path d="m8 9 4-4 4 4m-8 6 4 4 4-4"/>',
  chart:'<path d="m2.8 5.5 6-2 6.5 2 6-2v15l-6 2-6.5-2-6 2zm6 0v13m6.5-12v12"/>',
  expand:'<path d="M14 4h6v6m0-6-7 7M10 20H4v-6m0 6 7-7"/>',reset:'<path d="M3 10a9 9 0 1 1 1.9 8M3 4v6h6"/>',
  up:'<path d="m5 14 7-7 7 7"/>',down:'<path d="m5 10 7 7 7-7"/>',left:'<path d="m14 5-7 7 7 7"/>',right:'<path d="m10 5 7 7-7 7"/>',x:'<path d="m6 6 12 12M18 6 6 18"/>'
};
export function icon(name){return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'+paths[name]+'</svg>'}
export function loadIcons(){for(const item of document.querySelectorAll('[data-icon]'))item.innerHTML=icon(item.dataset.icon)}
