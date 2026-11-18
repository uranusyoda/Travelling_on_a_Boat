import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const up = V(0, 1, 0);
const mix = THREE.MathUtils.lerp;

function finishGeometry(positions, indices, uvs) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (uvs) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function patch(group, material, rows, columns, point) {
  const positions = [], indices = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= columns; i++) {
      point(i / columns, j / rows).toArray(positions, positions.length);
      if (j === rows || i === columns) continue;
      const k = j * (columns + 1) + i;
      indices.push(k, k + columns + 1, k + 1, k + 1, k + columns + 1, k + columns + 2);
    }
  }
  return addMesh(group, finishGeometry(positions, indices), material);
}

function addMesh(group, geometry, material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function box(group, material, width, height, length, x, y, z) {
  const m = addMesh(group, new THREE.BoxGeometry(width, height, length), material);
  m.position.set(x, y, z);
  return m;
}

function spar(group, material, start, end, radius, topRadius = radius, sides = 8) {
  const direction = end.clone().sub(start);
  const m = addMesh(group, new THREE.CylinderGeometry(topRadius, radius, direction.length(), sides), material);
  m.position.copy(start).lerp(end, 0.5);
  m.quaternion.setFromUnitVectors(up, direction.normalize());
  return m;
}

function tube(group, material, points, radius, segments = points.length * 2, sides = 6) {
  const curve = new THREE.CatmullRomCurve3(points);
  return addMesh(group, new THREE.TubeGeometry(curve, segments, radius, sides, false), material);
}

// Static pieces sharing a finish need only one draw call even with all the small fittings present.
function batchFittings(group) {
  const byMaterial = new Map();
  for (const mesh of [...group.children]) {
    if (!mesh.isMesh || mesh.morphTargetInfluences) continue;
    mesh.updateMatrix();
    const source = mesh.geometry;
    const geometry = source.index ? source.toNonIndexed() : source.clone();
    geometry.applyMatrix4(mesh.matrix);
    geometry.deleteAttribute('uv');
    if (!byMaterial.has(mesh.material)) byMaterial.set(mesh.material, []);
    byMaterial.get(mesh.material).push(geometry);
    group.remove(mesh);
    source.dispose();
  }
  for (const [material, pieces] of byMaterial) {
    const merged = mergeGeometries(pieces);
    addMesh(group, merged, material);
    for (const piece of pieces) piece.dispose();
  }
}

// Each section gives the fore-and-aft distance, beam at the rail, rail height, and keel height.
const sections = [
  [-2.63, .012, .75, .18], [-2.46, .175, .68, -.12], [-2.19, .39, .60, -.32],
  [-1.81, .61, .53, -.43], [-1.36, .80, .47, -.48], [-.83, .95, .43, -.51],
  [-.22, 1.035, .405, -.515], [.36, 1.055, .406, -.485], [.96, 1.01, .42, -.415],
  [1.55, .917, .457, -.32], [2.04, .806, .50, -.22], [2.43, .70, .545, -.125],
];
const bow = sections[0][0], stern = sections[sections.length - 1][0];

function hullAt(z) {
  z = THREE.MathUtils.clamp(z, bow, stern);
  const i = Math.max(0, sections.findIndex(row => row[0] >= z) - 1);
  const a = sections[i], b = sections[i + 1];
  const t = THREE.MathUtils.clamp((z - a[0]) / (b[0] - a[0]), 0, 1);
  return { w: mix(a[1], b[1], t), rail: mix(a[2], b[2], t), keel: mix(a[3], b[3], t) };
}

function cockpitWidth(z) {
  const s = (z + .73) / 2.60;
  if (s <= 0 || s >= 1) return 0;
  return .69 * Math.pow(Math.sin(s * Math.PI), .42);
}

function deckPoint(x, z) {
  const { rail, w } = hullAt(z);
  return V(x, rail + .026 * (1 - (x / w) ** 2), z);
}

function varnishedHull(root, m) {
  // Width fraction, height fraction and material of the strake immediately above each edge.
  const strakes = [[.045, 0, m.keel], [.38, .09, m.keel], [.65, .24, m.green],
    [.82, .41, m.cream], [.84, .445, m.green], [.965, .80, m.green],
    [.977, .845, m.cream], [.985, .90, m.cream], [.994, .965, m.gold], [1, 1]];
  const sidePoint = (z, scale, height, sign) => {
    const { w, rail, keel } = hullAt(z);
    return V(sign * w * scale, mix(keel, rail, height), z);
  };
  for (const sign of [-1, 1]) {
    for (let i = 0; i < strakes.length - 1; i++) {
      const [wa, ha, finish] = strakes[i];
      const [wb, hb] = strakes[i + 1];
      patch(root, finish, 50, 1, (u, t) => sidePoint(mix(bow, stern, t), mix(wa, wb, u), mix(ha, hb, u), sign));
    }
    const rail = sections.map(([z, w]) => deckPoint(sign * w, z).add(V(0, .017, 0)));
    tube(root, m.rail, rail, .035, 50);
  }
  // Paint the transom to match the adjacent planking.
  for (let i = 0; i < strakes.length - 1; i++) {
    const [wa, ha, finish] = strakes[i], [wb, hb] = strakes[i + 1];
    patch(root, finish, 1, 1, (u, t) => {
      const p = sidePoint(stern, mix(wa, wb, t), mix(ha, hb, t), 1);
      p.x *= u * 2 - 1;
      return p;
    });
  }
  const transomWidth = hullAt(stern).w;
  tube(root, m.rail, [deckPoint(-transomWidth, stern), deckPoint(0, stern), deckPoint(transomWidth, stern)], .038, 12);
  tube(root, m.keel, sections.map(([z, , , k]) => V(0, k, z)), .045, 50);
  const skegProfile = new THREE.Shape();
  skegProfile.moveTo(.45, -.44);
  skegProfile.quadraticCurveTo(1.30, -.57, 2.28, -.59);
  skegProfile.lineTo(2.34, -.12);
  skegProfile.quadraticCurveTo(1.52, -.24, .45, -.42);
  skegProfile.closePath();
  const skeg = addMesh(root, new THREE.ExtrudeGeometry(skegProfile, { depth: .065, bevelEnabled: false }), m.keel);
  skeg.rotation.y = -Math.PI / 2;
  skeg.position.x = .0325;

  // Bridge the cockpit opening with narrow tapered planks and their caulked joints.
  const welled = Array.from({ length: 43 }, (_, i) => mix(-.73, 1.87, i / 42));
  for (const side of [-1, 1]) {
    const onDeck = (u, t) => {
      const z = mix(bow, stern, t);
      return deckPoint(side * mix(cockpitWidth(z), hullAt(z).w, u), z);
    };
    for (let plank = 0; plank < 6; plank++) {
      patch(root, m.deck[plank % 3], 82, 2, (u, t) => onDeck((plank + u) / 6, t));
      if (plank) {
        const points = Array.from({ length: 63 }, (_, j) => onDeck(plank / 6, j / 62).add(V(0, .002, 0)));
        tube(root, m.caulk, points, .0055, 64, 4);
      }
    }
    const lip = welled.map(z => deckPoint(side * cockpitWidth(z), z));
    tube(root, m.coaming, lip, .040, 48);
    patch(root, m.inner, 48, 1, (u, t) => {
      const z = mix(-.73, 1.87, t);
      const edge = deckPoint(side * cockpitWidth(z), z);
      return V(edge.x * mix(.79, 1, u), mix(.05, edge.y, u), z);
    });
  }
  patch(root, m.rail, 36, 1, (u, t) => {
    const z = mix(-.725, 1.865, t);
    return V((2 * u - 1) * cockpitWidth(z) * .79, .05, z);
  });
  for (const x of [-.32, -.16, 0, .16, .32]) {
    const zPad = Math.abs(x) * 1.05;
    box(root, m.deck[1], .115, .028, 2.10 - zPad * 2, x, .073, .56);
  }
  for (const z of [.18, 1.22]) {
    const w = cockpitWidth(z);
    box(root, m.coaming, w * 2.07, .074, .265, 0, .325, z);
    box(root, m.deck[0], w * 2.05, .018, .23, 0, .369, z);
    for (const x of [-w * .74, w * .74]) {
      box(root, m.rail, .05, .22, .16, x, .19, z);
      spar(root, m.brass, V(x, .378, z), V(x, .382, z), .015, .015);
    }
  }
  // Foredeck hatch, mooring cleats and a hank of rope.
  box(root, m.coaming, .42, .09, .53, 0, .55, -1.46);
  box(root, m.deck[1], .36, .028, .47, 0, .604, -1.46);
  for (const z of [-1.59, -1.45, -1.31]) box(root, m.rail, .29, .014, .024, 0, .627, z);
  for (const [x, z] of [[0, -2.24], [-.48, 2.13], [.48, 2.13]]) {
    const point = deckPoint(x, z);
    spar(root, m.brass, point, point.clone().add(V(0, .068, 0)), .027);
    spar(root, m.brass, point.clone().add(V(0, .082, -.091)), point.clone().add(V(0, .082, .091)), .024);
  }
  const coil = [];
  for (let i = 0; i <= 110; i++) {
    const a = i * .2, r = .14 - .055 * (i / 110);
    coil.push(deckPoint(-.58 + Math.cos(a) * r, -.86 + Math.sin(a) * r * 1.30).add(V(0, .022, 0)));
  }
  tube(root, m.rope, coil, .010, 96, 4);
  spar(root, m.gold, V(0, .72, -2.58), V(0, .90, -2.55), .029, .022);
}

function sailCloth(main) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const pen = canvas.getContext('2d');
  if (!pen) return null;
  pen.fillStyle = main ? '#f4e9cf' : '#ffefd8';
  pen.fillRect(0, 0, 512, 512);
  if (main) {
    // A single ochre reef band and narrow piping echo classic yacht-club canvas.
    pen.fillStyle = '#ce814d';
    pen.fillRect(0, 337, 512, 64);
    pen.fillStyle = '#e4af78';
    pen.fillRect(0, 327, 512, 5);
    pen.fillStyle = '#e0b282';
    pen.fillRect(0, 405, 512, 4);
    pen.fillStyle = '#306361';
    pen.beginPath();
    pen.moveTo(126, 143); pen.quadraticCurveTo(165, 126, 200, 150);
    pen.quadraticCurveTo(232, 130, 281, 136);
    pen.quadraticCurveTo(227, 145, 197, 176);
    pen.quadraticCurveTo(166, 148, 126, 143); pen.fill();
    pen.fillStyle = '#c98c59';
    pen.beginPath(); pen.arc(224, 113, 12, 0, Math.PI * 2); pen.fill();
  }
  for (let y = 0; y <= 512; y += 64) {
    pen.fillStyle = 'rgba(114,90,65,.25)';
    pen.fillRect(0, y, 512, 1.4);
    pen.fillStyle = 'rgba(255,255,245,.65)';
    pen.fillRect(0, y + 2, 512, 1);
  }
  pen.strokeStyle = 'rgba(128,94,59,.55)';
  pen.lineWidth = 3;
  pen.strokeRect(3, 3, 506, 506);
  for (let x = 0; x < 512; x += 4) {
    pen.fillStyle = 'rgba(121,93,65,.035)';
    pen.fillRect(x, 0, 1, 512);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function makeSail(parent, main) {
  const rows = 24, cols = 18, positions = [], indices = [], uvs = [], gust = [];
  // The boom is eased out to starboard. This gives a distinct sail silhouette from the helm.
  const bottomLuff = main ? V(.05, 1.36, -.66) : V(0, .82, -2.51);
  const topLuff = main ? V(.05, 4.30, -.59) : V(.024, 4.43, -.62);
  const bottomLeech = main ? V(1.31, 1.39, 1.62) : V(-.57, 1.32, -.07);
  const topLeech = main ? V(.65, 4.91, .47) : V(.008, 4.425, -.59);
  const leechOffset = main ? V(.86, 0, -.47) : V(-.95, 0, -.30);
  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    const luff = bottomLuff.clone().lerp(topLuff, v);
    const leech = bottomLeech.clone().lerp(topLeech, v);
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      const p = luff.clone().lerp(leech, u);
      const belly = Math.sin(Math.PI * Math.pow(u, .85)) * Math.sin(Math.PI * v) * (main ? .37 : .27);
      p.addScaledVector(leechOffset, belly);
      positions.push(p.x, p.y, p.z);
      const flutter = Math.sin(v * Math.PI) * Math.pow(u, 1.2) * Math.sin(v * 13 + u * 2.1);
      gust.push(leechOffset.x * flutter * .07, flutter * .009, leechOffset.z * flutter * .07);
      uvs.push(u, v);
      if (j < rows && i < cols) {
        const k = j * (cols + 1) + i;
        indices.push(k, k + 1, k + cols + 1, k + 1, k + cols + 2, k + cols + 1);
      }
    }
  }
  const geometry = finishGeometry(positions, indices, uvs);
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = [new THREE.Float32BufferAttribute(gust, 3)];
  const texture = sailCloth(main);
  const material = new THREE.MeshStandardMaterial({
    color: texture ? 0xffffff : main ? 0xf2e1bd : 0xffedd3,
    map: texture, side: THREE.DoubleSide, roughness: .94, metalness: 0,
  });
  const sail = addMesh(parent, geometry, material);
  sail.name = main ? 'Gaff mainsail' : 'Jib';
  return sail;
}

export function createBoat() {
  const boat = new THREE.Group();
  boat.name = 'Sea-green gaff dinghy';
  const matte = (color, metallic = 0) => new THREE.MeshStandardMaterial({
    color, roughness: metallic ? .39 : .70, metalness: metallic, side: THREE.DoubleSide,
  });
  const m = {
    green: matte(0x397d75), keel: matte(0x274e4b), cream: matte(0xe9e0be),
    gold: matte(0xc2a16b), rail: matte(0x654332), coaming: matte(0x815335),
    deck: [matte(0xc49764), matte(0xb88a57), matte(0xcda373)], caulk: matte(0x795a40),
    inner: matte(0xd0c6a4), brass: matte(0xb79559, .47), rope: matte(0xb7a681),
    shroud: matte(0x645e51), spar: matte(0xae7850), binding: matte(0x68523c),
  };
  varnishedHull(boat, m);
  const foot = V(0, .36, -.72), head = V(0, 5.22, -.54);
  spar(boat, m.spar, foot, head, .066, .037, 13);
  spar(boat, m.brass, V(0, .46, -.714), V(0, .60, -.71), .074);
  spar(boat, m.rail, V(.01, 1.31, -.70), V(1.38, 1.34, 1.75), .045, .033, 10);
  spar(boat, m.spar, V(.01, 4.25, -.65), V(.70, 4.96, .55), .037, .024);
  for (const h of [1.37, 1.60, 2.14, 2.74, 3.34, 3.96, 4.29]) {
    const z = mix(foot.z, head.z, (h - foot.y) / (head.y - foot.y));
    spar(boat, m.binding, V(0, h, z), V(0, h + .025, z + .001), .062 - h * .004);
  }
  const upper = V(0, 4.56, -.56);
  spar(boat, m.shroud, upper, V(0, .82, -2.53), .011, .009, 5);
  for (const side of [-1, 1]) {
    spar(boat, m.shroud, V(0, 4.47, -.57), V(side * .98, .46, -.30), .010, .013, 5);
    spar(boat, m.brass, V(side * .98, .43, -.30), V(side * .955, .56, -.31), .026);
  }
  const rigLines = [
    [V(.64, 4.91, .46), V(.23, 5.02, -.22), V(0, 5.14, -.54)],
    [V(1.31, 1.36, 1.62), V(.84, .88, 1.78), V(.32, .49, 1.88)],
    [V(-.57, 1.32, -.07), V(-.73, .77, .42), V(-.85, .45, .91)],
    [V(.05, 4.28, -.65), V(.10, 2.21, -.61), V(.09, .62, -.67)],
  ];
  for (const line of rigLines) tube(boat, m.rope, line, .012, 10, 5);
  const main = makeSail(boat, true);
  const jib = makeSail(boat, false);

  const tiller = new THREE.Group();
  tiller.position.set(0, .31, 2.43);
  boat.add(tiller);
  tube(tiller, m.rail, [V(0, .03, .075), V(0, .18, -.09), V(0, .23, -.42), V(.025, .22, -.94)], .044, 16);
  spar(tiller, m.brass, V(0, -.34, .068), V(0, .11, .068), .034);
  const fin = new THREE.Shape();
  fin.moveTo(.03, .12); fin.lineTo(.20, .07); fin.lineTo(.31, -.66);
  fin.quadraticCurveTo(.3, -.80, .03, -.74); fin.lineTo(-.045, -.18); fin.closePath();
  const rudder = addMesh(tiller, new THREE.ExtrudeGeometry(fin, {depth:.052, bevelEnabled:false}), m.green);
  rudder.rotation.y = -Math.PI / 2;
  rudder.position.set(.026, 0, .02);
  batchFittings(tiller);

  // Flag coordinates are local to the masthead, so rotation and flutter never detach the luff.
  const flag = new THREE.Group();
  flag.position.copy(head);
  boat.add(flag);
  const flagGeometry = finishGeometry(
    [0, 0, 0, .18, -.018, .12, .36, .012, .24, .59, -.02, .37,
      0, -.23, 0, .18, -.19, .12, .36, -.11, .24],
    [0, 1, 4, 1, 5, 4, 1, 2, 5, 2, 6, 5, 2, 3, 6]);
  flagGeometry.morphTargetsRelative = true;
  flagGeometry.morphAttributes.position = [new THREE.Float32BufferAttribute(
    [0,0,0, -.035,.01,.035, .055,.02,-.05, -.09,.065,.095,
      0,0,0, -.035,.01,.035, .055,.02,-.05], 3)];
  const pennant = addMesh(flag, flagGeometry, matte(0xc6613e));
  batchFittings(boat);

  boat.userData.update = (elapsed = 0, speed = 0, steer = 0) => {
    const wind = Math.min(Math.abs(speed) * .065, .6) + .33;
    main.morphTargetInfluences[0] = Math.sin(elapsed * 2.4) * wind;
    jib.morphTargetInfluences[0] = Math.sin(elapsed * 3.3 + .8) * wind;
    pennant.morphTargetInfluences[0] = Math.sin(elapsed * 6.9);
    flag.rotation.y = .10 * Math.sin(elapsed * 3.3);
    tiller.rotation.y = THREE.MathUtils.clamp(steer, -1, 1) * -.48;
  };
  return boat;
}
