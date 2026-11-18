const EMPTY = [];
const rendered = new WeakMap();
const geography = new WeakMap();
const chartFont = '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace';

function grid(context, width, height, frame, large) {
  const { cx, cz, scale } = frame;
  const left = cx - width / (2 * scale);
  const top = cz - height / (2 * scale);
  const spacing = large ? 25 : 20;
  context.lineWidth = 0.55;
  context.strokeStyle = '#74948755';
  context.beginPath();
  for (let x = Math.ceil(left / spacing) * spacing; x < left + width / scale; x += spacing) {
    const px = (x - left) * scale;
    context.moveTo(px, 0);
    context.lineTo(px, height);
  }
  for (let z = Math.ceil(top / spacing) * spacing; z < top + height / scale; z += spacing) {
    const py = (z - top) * scale;
    context.moveTo(0, py);
    context.lineTo(width, py);
  }
  context.stroke();
}

function chartFurniture(context, width, height, scale, large) {
  const edge = large ? 15 : 7;
  const ink = '#435f57';
  const northX = width - edge - (large ? 8 : 4);
  context.save();
  context.translate(northX, edge + (large ? 8 : 5));
  context.font = `600 ${large ? 10 : 7}px ${chartFont}`;
  context.textAlign = 'center';
  context.fillStyle = ink;
  context.fillText('N', 0, 0);
  const arm = large ? 15 : 9;
  context.beginPath();
  context.moveTo(0, 3);
  context.lineTo(-arm * 0.27, 3 + arm);
  context.lineTo(0, 3 + arm * 0.72);
  context.lineTo(arm * 0.27, 3 + arm);
  context.closePath();
  context.fill();
  context.restore();

  const metres = large ? 50 : 20;
  const length = metres * scale;
  const y = height - edge;
  context.fillStyle = '#f2efdbcc';
  context.fillRect(edge - 3, y - 13, length + 6, 16);
  context.fillStyle = ink;
  context.font = `${large ? 9 : 7}px ${chartFont}`;
  context.textAlign = 'left';
  context.fillText(`${metres} m`, edge, y - 5);
  context.lineWidth = 1;
  context.strokeStyle = ink;
  context.beginPath();
  context.moveTo(edge, y - 2);
  context.lineTo(edge, y + 0.5);
  context.lineTo(edge + length, y + 0.5);
  context.lineTo(edge + length, y - 2);
  context.stroke();
  context.fillRect(edge, y - 1, length / 2, 1.5);
}

function boatMarker(context, x, y, heading, large) {
  const size = large ? 11 : 7.6;
  context.save();
  context.translate(x, y);
  context.rotate(heading);
  context.fillStyle = '#e2834b26';
  context.beginPath();
  context.arc(0, 0, size * 1.6, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.moveTo(0, -size);
  context.lineTo(size * 0.64, size * 0.67);
  context.lineTo(0, size * 0.37);
  context.lineTo(-size * 0.64, size * 0.67);
  context.closePath();
  context.lineWidth = large ? 2.6 : 1.8;
  context.lineJoin = 'round';
  context.strokeStyle = '#faf6df';
  context.stroke();
  context.fillStyle = '#c86132';
  context.fill();
  context.restore();
}

function polygon(path, island, fraction = 1) {
  island.points.forEach((point, i) => {
    const x = island.x + (point.x - island.x) * fraction;
    const z = island.z + (point.z - island.z) * fraction;
    if (i === 0) path.moveTo(x, z);
    else path.lineTo(x, z);
  });
  path.closePath();
}

function prepare(features, obstacles) {
  const key = features.length ? features : obstacles;
  if (geography.has(key)) return geography.get(key);
  const shapes = features.length ? features : obstacles.map(o => ({
    ...o, type: o.radius === undefined ? 'dock' : 'buoy',
  }));
  const land = new Path2D();
  const hills = new Path2D();
  const hatches = new Path2D();
  const docks = [];
  const marks = [];
  // Include the berth and marked fairway in the overview even on a sparse chart.
  let xmin = -49, xmax = 49, zmin = -78, zmax = 35;
  for (const item of shapes) {
    if (item.type === 'island') {
      polygon(land, item);
      polygon(hills, item, 0.72);
      polygon(hills, item, 0.52);
      for (const point of item.points) {
        xmin = Math.min(xmin, point.x);
        xmax = Math.max(xmax, point.x);
        zmin = Math.min(zmin, point.z);
        zmax = Math.max(zmax, point.z);
      }
    } else if (item.type === 'dock') {
      docks.push(item);
    } else if (item.type === 'lighthouse' || item.type === 'buoy') {
      marks.push(item);
    }
  }
  for (let x = xmin - (zmax - zmin); x < xmax; x += 5.3) {
    hatches.moveTo(x, zmax);
    hatches.lineTo(x + zmax - zmin, zmin);
  }
  const data = { land, hills, hatches, docks, marks, xmin, xmax, zmin, zmax };
  geography.set(key, data);
  return data;
}

function drawGeography(ctx, data, scale) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // Successively narrower coastal shelves give the drawn isobaths the shape
  // of the same irregular shoreline used by the 3D scene.
  for (const [distance, edge, fill] of [
    [21, '#a0baad', '#d6e5d7'],
    [13.8, '#9eb9ac', '#cee0d1'],
    [8.4, '#a2bcab', '#c7dbca'],
    [3.9, '#a0b3a2', '#d4dfc9'],
  ]) {
    ctx.strokeStyle = edge;
    ctx.lineWidth = distance * 2 + 0.65 / scale;
    ctx.stroke(data.land);
    ctx.strokeStyle = fill;
    ctx.lineWidth = distance * 2;
    ctx.stroke(data.land);
  }
  ctx.fillStyle = '#e1dbb6';
  ctx.fill(data.land);
  ctx.strokeStyle = '#858d6b';
  ctx.lineWidth = 0.95 / scale;
  ctx.stroke(data.land);
  ctx.save();
  ctx.clip(data.land);
  ctx.strokeStyle = '#c4c5a2';
  ctx.lineWidth = 0.45 / scale;
  ctx.stroke(data.hatches);
  ctx.strokeStyle = '#b3b997';
  ctx.lineWidth = 0.65 / scale;
  ctx.stroke(data.hills);
  ctx.restore();

  for (const dock of data.docks) {
    const { x, z, hx, hz } = dock;
    ctx.save();
    ctx.translate(x, z);
    ctx.rotate(-(dock.angle || 0));
    ctx.fillStyle = '#ab9771';
    ctx.strokeStyle = '#726d52';
    ctx.lineWidth = 0.8 / scale;
    ctx.fillRect(-hx, -hz, hx * 2, hz * 2);
    ctx.strokeRect(-hx, -hz, hx * 2, hz * 2);
    ctx.strokeStyle = '#d5c6a0';
    ctx.lineWidth = 0.55 / scale;
    ctx.beginPath();
    if (hz > hx) {
      for (let p = -hz + 2; p < hz; p += 2.3) { ctx.moveTo(-hx, p); ctx.lineTo(hx, p); }
    } else {
      for (let p = -hx + 2; p < hx; p += 2.3) { ctx.moveTo(p, -hz); ctx.lineTo(p, hz); }
    }
    ctx.stroke();
    ctx.restore();
  }
}

function drawMarks(ctx, marks, frame, width, height, large) {
  for (const mark of marks) {
    const x = width / 2 + (mark.x - frame.cx) * frame.scale;
    const y = height / 2 + (mark.z - frame.cz) * frame.scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = large ? 1.2 : 1;
    if (mark.type === 'lighthouse') {
      const r = large ? 6 : 3.8;
      ctx.strokeStyle = '#9e6a44';
      ctx.fillStyle = '#f6ecd2';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 4 - 0.5) * Math.PI;
        const size = i % 2 ? r * 0.36 : r;
        const px = Math.cos(a) * size;
        const py = Math.sin(a) * size;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (large) {
        ctx.font = '600 10px sans-serif';
        ctx.fillStyle = '#5f6756';
        ctx.textAlign = 'right';
        ctx.fillText('灯塔', -8, -3);
      }
    } else {
      const r = large ? 2.6 : 1.9;
      ctx.fillStyle = mark.starboard ? '#467e6f' : '#ae694e';
      ctx.strokeStyle = '#eff0d8';
      ctx.beginPath();
      if (mark.starboard) {
        ctx.moveTo(0, -r * 1.4);
        ctx.lineTo(r, r);
        ctx.lineTo(-r, r);
        ctx.closePath();
      } else {
        ctx.rect(-r, -r, 2 * r, 2 * r);
      }
      ctx.stroke();
      ctx.fill();
    }
    ctx.restore();
  }
}

export function drawChart(canvas, state, obstacles = EMPTY, mapFeatures = EMPTY, large = false) {
  if (!canvas || !state) return;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const { x, z, heading } = state;
  const data = prepare(mapFeatures, obstacles);
  const last = rendered.get(canvas);
  if (last && last.data === data && last.width === width && last.height === height &&
      last.dpr === dpr && last.large === large && Math.abs(x - last.x) < 0.07 &&
      Math.abs(z - last.z) < 0.07 && Math.abs(heading - last.heading) < 0.008) return;
  rendered.set(canvas, { data, width, height, dpr, x, z, heading, large });
  const pxWidth = Math.round(width * dpr);
  const pxHeight = Math.round(height * dpr);
  if (canvas.width !== pxWidth || canvas.height !== pxHeight) {
    canvas.width = pxWidth;
    canvas.height = pxHeight;
  }
  const ctx = canvas.getContext('2d');
  const frame = { cx: x - 5, cz: z - 7, scale: width / 105 };
  if (large) {
    const left = Math.min(data.xmin, x);
    const right = Math.max(data.xmax, x);
    const top = Math.min(data.zmin, z);
    const bottom = Math.max(data.zmax, z);
    frame.cx = (left + right) / 2;
    frame.cz = (top + bottom) / 2;
    frame.scale = Math.min(width / (right - left + 26), height / (bottom - top + 26));
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#e0eadc';
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(frame.scale, frame.scale);
  ctx.translate(-frame.cx, -frame.cz);
  drawGeography(ctx, data, frame.scale);
  ctx.restore();
  grid(ctx, width, height, frame, large);
  drawMarks(ctx, data.marks, frame, width, height, large);
  boatMarker(ctx, width / 2 + (x - frame.cx) * frame.scale, height / 2 + (z - frame.cz) * frame.scale, heading, large);
  chartFurniture(ctx, width, height, frame.scale, large);
}
