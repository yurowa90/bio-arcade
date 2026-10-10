/* 생명 탐사대 — 교사가 확인한 시안의 픽셀 지도·교복 도트·생태 지도 */
(function (root) {
  'use strict';

  const TILE = 16,
    WIDTH = 176,
    HEIGHT = 144;
  const vectors = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0]
  };
  const blocked = new Set(['T', '~', 'R', 'H', 'X', 'S', 'D', 'L', 'J', 'G']);
  let ctx, currentMap;
  function tileAt(x, y, id) {
    const m = id ? root.QuestMaps.MAPS[id] : currentMap;
    return m?.rows[y]?.[x];
  }
  const PIX = Object.freeze({
    outline: '#35504a',
    ground: '#f4eed9',
    paving: '#e4ddc7',
    soil: '#c29a67',
    soilDark: '#987148',
    yard: '#e7e9d2',
    court: '#e4ded1',
    canopyLight: '#79ad68',
    grass: '#b0d383',
    grassDark: '#8bbd61',
    hillGrass: '#619b56',
    leaf: '#619b56',
    leafDark: '#39714e',
    shine: '#fffdf0',
    water: '#6caeb5',
    waterDark: '#4c8b99',
    road: '#a6b3b0',
    roadDark: '#829591',
    schoolRoof: '#397f79',
    roofEdge: '#c0e4d9',
    navy: '#263d59',
    asphalt: '#717b7b',
    brick: '#cdb09d',
    brickLight: '#dabcaa',
    brickJoint: '#b79785',
    stone: '#9ba5a3',
    stoneDark: '#75817f',
    roof: '#8caab0',
    roofDark: '#67888f',
    roofLight: '#98b3b7',
    homeRoof: '#dc9164',
    homeDark: '#bb754e',
    homeLight: '#e19b73',
    wall: '#fffdf5',
    wallDark: '#d9d6bf',
    window: '#6caeb5',
    wood: '#b89358',
    woodDark: '#755331',
    hedge: '#39714e',
    fence: '#b0a899',
    flower: '#dc9164',
    yellow: '#f0c653',
    blue: '#6caeb5',
    orange: '#dc9164',
    green: '#8bbd61',
    reed: '#397f79',
    reedTip: '#987148',
    skin: '#f4d8af',
    cap: '#f0c653',
    npcCap: '#dc9164',
    shirt: '#6caeb5',
    pants: '#47645a',
    hair: '#20272b',
    sky: '#a8d6e7',
    jacket: '#929da4',
    track: '#a75e50',
    trackLight: '#ca8b71',
    turf: '#5eab70',
    turfDark: '#4c9866',
    courtGreen: '#a6cc84',
    courtTeal: '#639e98',
    pink: '#f2b9c8',
    pinkDark: '#da97b0',
    towerStone: '#d0bf9f',
    stoneJoint: '#b8a889',
    dormGlass: '#344e5c',
    night: '#182844'
  });
  // 이웃한 지붕과 벽을 한 채로 묶어 색과 용마루를 공유한다.
  const buildingIndex = {};
  function indexBuildings(m) {
    if (buildingIndex[m.id]) return;
    const index = new Map();
    buildingIndex[m.id] = index;
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
      const key = x + ',' + y;
      if (index.has(key) || !'RHDLJG'.includes(m.rows[y][x])) continue;
      const b = {
          x0: x,
          x1: x,
          y0: y,
          y1: y,
          school: false
        },
        queue = [[x, y]];
      index.set(key, b);
      for (let i = 0; i < queue.length; i++) {
        const [xx, yy] = queue[i];
        b.x0 = Math.min(b.x0, xx);
        b.x1 = Math.max(b.x1, xx);
        b.y0 = Math.min(b.y0, yy);
        b.y1 = Math.max(b.y1, yy);
        if ('DLJ'.includes(tileAt(xx, yy, m.id))) b.school = true;
        for (const [dx, dy] of Object.values(vectors)) {
          const nx = xx + dx,
            ny = yy + dy,
            t = tileAt(nx, ny, m.id),
            k = nx + ',' + ny;
          if (t === 'Y') b.school = true;
          if (t && 'RHDLJG'.includes(t) && !index.has(k)) {
            index.set(k, b);
            queue.push([nx, ny]);
          }
        }
      }
    }
  }
  function rect(x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  }
  function noise(x, y) {
    return ((Math.imul(x + 11, 73856093) ^ Math.imul(y + 37, 19349663)) >>> 0) % 7;
  }
  function positionNoise(x, y, salt = 0) {
    let h = Math.imul(x + 11, 73856093) ^ Math.imul(y + 37, 19349663) ^ Math.imul(salt + 1, 83492791);
    h = Math.imul(h ^ h >>> 16, 0x7feb352d);
    h = Math.imul(h ^ h >>> 15, 0x846ca68b);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  }
  function smallTree(px, py) {
    rect(px - 2, py + 5, 7, 1, PIX.grassDark);
    rect(px + 1, py + 1, 1, 5, PIX.wood);
    rect(px - 1, py - 2, 5, 4, PIX.leaf);
    rect(px, py - 3, 3, 1, PIX.leaf);
    rect(px - 2, py - 1, 1, 2, PIX.leaf);
    rect(px + 4, py - 1, 1, 2, PIX.leafDark);
    rect(px, py - 2, 2, 1, PIX.grass);
    rect(px, py + 1, 4, 1, PIX.leafDark);
  }
  function baseColor(t) {
    return {
      '.': PIX.ground,
      '=': PIX.road,
      Y: PIX.yard,
      F: PIX.soil,
      P: PIX.road,
      g: PIX.grass,
      f: PIX.grass,
      ':': PIX.grass,
      ',': PIX.hillGrass,
      ';': PIX.grass,
      T: PIX.leafDark,
      '~': PIX.water,
      R: PIX.homeRoof,
      H: PIX.wall,
      X: PIX.court,
      S: PIX.grass,
      D: PIX.yellow,
      L: PIX.blue,
      J: PIX.orange,
      G: PIX.green,
      B: PIX.wood
    }[t] || PIX.court;
  }
  // 시안의 스캔라인 래스터화를 카메라가 닿은 조각에만 실행한다.
  // 16px 여백은 13px 트랙 띠가 카메라 가장자리에 가짜 선을 만들지 않게 한다. 마스크 3개는 약 107.3KiB다.
  // 남향 벽은 북쪽으로 옮긴 띠와 건물 윤곽의 교집합이다. 충돌·조우·미니맵은 rows를 쓴다.
  // 새 메타가 없으면 벽 높이는 학교 1.25칸, 다른 건물 0.75칸이며 정원 소품은 생략한다.
  const SHAPE_PAD = 16,
    SHAPE_W = 176 + SHAPE_PAD * 2,
    SHAPE_H = 144 + SHAPE_PAD * 2;
  const shapeMask = new Uint8Array(SHAPE_W * SHAPE_H),
    shapeDistance = new Uint8Array(SHAPE_W * SHAPE_H);
  const wallClipMask = new Uint8Array(SHAPE_W * SHAPE_H);
  const shapeScenes = new WeakMap();
  function rasterizePolygon(rings, clip, span) {
    // 픽셀 중심 y+0.5에서 even-odd 규칙으로 교점을 짝짓는다. 구멍과 고리 방향을 모두 지원한다.
    const edges = [];
    let minY = Infinity,
      maxY = -Infinity;
    for (const ring of rings) for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      if (a[1] === b[1]) continue;
      edges.push([a, b]);
      minY = Math.min(minY, a[1], b[1]);
      maxY = Math.max(maxY, a[1], b[1]);
    }
    const y0 = Math.max(clip.y, Math.ceil(minY - .5)),
      y1 = Math.min(clip.y + clip.height, Math.ceil(maxY - .5));
    for (let y = y0; y < y1; y++) {
      const sy = y + .5,
        xs = [];
      for (const [a, b] of edges) if (a[1] <= sy && b[1] > sy || b[1] <= sy && a[1] > sy) xs.push(a[0] + (sy - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const x0 = Math.max(clip.x, Math.ceil(xs[i] - .5)),
          x1 = Math.min(clip.x + clip.width, Math.ceil(xs[i + 1] - .5));
        if (x1 > x0) span(x0, y, x1 - x0);
      }
    }
  }
  function polygonBounds(rings) {
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const ring of rings) for (const [x, y] of ring) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    return {
      x0,
      y0,
      x1,
      y1
    };
  }
  function inView(bounds, view) {
    return bounds.x1 >= view.x && bounds.x0 < view.x + view.width && bounds.y1 >= view.y && bounds.y0 < view.y + view.height;
  }
  function southWalls(rings, height = 20) {
    const walls = [];
    for (let r = 0; r < rings.length; r++) {
      const ring = rings[r];
      let area = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          b = ring[(i + 1) % ring.length];
        area += a[0] * b[1] - b[0] * a[1];
      }
      const sign = Math.sign(area) * (r === 0 ? 1 : -1);
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          b = ring[(i + 1) % ring.length],
          dx = b[0] - a[0],
          dy = b[1] - a[1],
          length = Math.hypot(dx, dy);
        if (!length || -dx * sign / length <= .3) continue;
        const band = [a, b, [b[0], b[1] - height], [a[0], a[1] - height]];
        walls.push({
          a,
          b,
          length,
          height,
          rings: [band],
          bounds: polygonBounds([band])
        });
      }
    }
    return walls;
  }
  function pointInShape(rings, x, y) {
    let inside = false;
    for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i],
        b = ring[j];
      if (a[1] > y !== b[1] > y && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  function nearestWall(scene, x, y, schoolOnly = false) {
    let best = null,
      dist = Infinity;
    for (const wall of scene.walls) {
      if (schoolOnly && wall.kind !== 'school') continue;
      const [ax, ay] = wall.a,
        dx = wall.b[0] - ax,
        dy = wall.b[1] - ay,
        t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / wall.length ** 2)),
        px = ax + t * dx,
        py = ay + t * dy,
        d = (x - px) ** 2 + (y - py) ** 2;
      if (d < dist) {
        dist = d;
        best = {
          wall,
          x: px,
          y: py
        };
      }
    }
    return best;
  }
  function getShapeScene(m) {
    if (shapeScenes.has(m)) return shapeScenes.get(m);
    const scene = {
      buildings: [],
      fields: [],
      water: [],
      gardens: [],
      walls: [],
      doors: [],
      decor: m.decor || [],
      main: null
    };
    for (const layer of ['fields', 'water', 'gardens', 'buildings']) for (const s of m.shapes?.[layer] || []) {
      const rings = [s.pts, ...(s.holes || [])].map(r => r.map(([x, y]) => [x * 16, y * 16]));
      const shape = {
        kind: s.kind,
        role: s.role,
        surface: s.surface,
        track: s.track,
        simplified: s.simplified,
        rings,
        bounds: polygonBounds(rings)
      };
      scene[layer].push(shape);
      if (layer === 'buildings') {
        const meta = m.wallHeight,
          height = s.role === 'dorm' ? 28 : Math.min((meta?.[s.kind === 'school' ? 'school' : 'other'] ?? (s.kind === 'school' ? 1.25 : .75)) * 16, (shape.bounds.y1 - shape.bounds.y0) * (meta?.maxDepthRatio ?? .6));
        for (const wall of southWalls(rings, height)) scene.walls.push({
          ...wall,
          kind: s.kind,
          shape
        });
      }
    }
    scene.walls.sort((a, b) => a.bounds.y1 - b.bounds.y1);
    for (const [key, symbol] of Object.entries(m.doors)) {
      const [x, y] = key.split(',').map(Number),
        best = nearestWall(scene, x * 16 + 8, y * 16 + 8, 'DLJ'.includes(symbol));
      if (best) {
        scene.doors.push({
          ...best,
          symbol
        });
        if (symbol === 'D') scene.main = best.wall.shape;
      }
    }
    const top = scene.decor.find(d => d.kind === 'penthouse'),
      porch = scene.decor.find(d => d.kind === 'porch');
    if (top) scene.main = scene.buildings.find(s => s.kind === 'school' && pointInShape(s.rings, top.x * 16, top.y * 16)) || scene.main;
    if (!scene.main && porch) scene.main = nearestWall(scene, porch.x * 16, porch.y * 16, true)?.wall.shape;
    if (scene.main) {
      const front = scene.walls.filter(w => w.shape === scene.main).filter(w => Math.abs(w.b[1] - w.a[1]) <= Math.abs(w.b[0] - w.a[0])).sort((a, b) => b.length - a.length)[0];
      if (front) scene.main.stripeX = Math.min(front.a[0], front.b[0]) + Math.abs(front.b[0] - front.a[0]) * .25;
    }
    shapeScenes.set(m, scene);
    return scene;
  }
  function makeShapeMask(rings, view) {
    shapeMask.fill(0);
    const clip = {
      x: view.x - SHAPE_PAD,
      y: view.y - SHAPE_PAD,
      width: SHAPE_W,
      height: SHAPE_H
    };
    rasterizePolygon(rings, clip, (x, y, n) => {
      const start = (y - clip.y) * SHAPE_W + x - clip.x;
      shapeMask.fill(1, start, start + n);
    });
  }
  function trackDistance() {
    for (let i = 0; i < shapeMask.length; i++) shapeDistance[i] = shapeMask[i] ? 255 : 0;
    for (let y = 0; y < SHAPE_H; y++) for (let x = 0; x < SHAPE_W; x++) {
      const i = y * SHAPE_W + x;
      if (shapeDistance[i]) shapeDistance[i] = Math.min(shapeDistance[i], x ? shapeDistance[i - 1] + 1 : 1, y ? shapeDistance[i - SHAPE_W] + 1 : 1);
    }
    for (let y = SHAPE_H - 1; y >= 0; y--) for (let x = SHAPE_W - 1; x >= 0; x--) {
      const i = y * SHAPE_W + x;
      if (shapeDistance[i]) shapeDistance[i] = Math.min(shapeDistance[i], x + 1 < SHAPE_W ? shapeDistance[i + 1] + 1 : 1, y + 1 < SHAPE_H ? shapeDistance[i + SHAPE_W] + 1 : 1);
    }
  }
  function paintShape(view, colorAt) {
    for (let y = 0; y < view.height; y++) {
      let start = 0,
        last = null;
      for (let x = 0; x <= view.width; x++) {
        const i = (y + SHAPE_PAD) * SHAPE_W + x + SHAPE_PAD,
          color = x < view.width && shapeMask[i] ? colorAt(i, view.x + x, view.y + y) : null;
        if (color === last) continue;
        if (last) rect(start, y, x - start, 1, last);
        start = x;
        last = color;
      }
    }
  }
  function maskBoundary(i) {
    return !shapeMask[i - 1] || !shapeMask[i + 1] || !shapeMask[i - SHAPE_W] || !shapeMask[i + SHAPE_W];
  }
  function makeWallMask(wall, view) {
    makeShapeMask(wall.shape.rings, view);
    wallClipMask.set(shapeMask);
    makeShapeMask(wall.rings, view);
    for (let i = 0; i < shapeMask.length; i++) shapeMask[i] &= wallClipMask[i];
  }
  function wallDepth(wall, x, y) {
    const t = (x - wall.a[0]) / (wall.b[0] - wall.a[0]);
    return wall.a[1] + t * (wall.b[1] - wall.a[1]) - y;
  }
  function spriteRect(view, x, y, w, h, color, clipped = false) {
    x = Math.round(x) - view.x;
    y = Math.round(y) - view.y;
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    for (let yy = Math.max(0, y); yy < Math.min(view.height, y + h); yy++) {
      let start = -1;
      for (let xx = Math.max(0, x); xx <= Math.min(view.width, x + w); xx++) {
        const on = xx < Math.min(view.width, x + w) && (!clipped || shapeMask[(yy + SHAPE_PAD) * SHAPE_W + xx + SHAPE_PAD]);
        if (on && start < 0) start = xx;
        if (!on && start >= 0) {
          rect(start, yy, xx - start, 1, color);
          start = -1;
        }
      }
    }
  }
  // 관목 글자는 캔버스 글꼴 대신 직접 만든 도트 표로 그린다.
  const SHRUB_LETTERS = Object.freeze({
    '신': ['00100000100', '00100000100', '01010000100', '01010000100', '10001000100', '00000000100', '00000000100', '00000000000', '01000000000', '01000000000', '01111111110'],
    '한': ['00100000100', '01111100100', '00000000100', '00111000111', '01000100100', '01000100100', '00111000100', '00000000000', '01000000000', '01000000000', '01111111110']
  });
  const SHRUB_PATTERN = ['100010001', '110111011', '011101110', '001000100', '011101110', '110111011', '100010001'];
  function parterre(box, x, y, w, h, letter) {
    const left = Math.round(x - w / 2),
      top = Math.round(y - h / 2),
      width = Math.max(8, Math.round(w)),
      height = Math.max(8, Math.round(h));
    box(left, top, width, height, PIX.outline);
    box(left + 1, top + 1, width - 2, height - 2, PIX.grassDark);
    // 세계 좌표 해시로 꽃 위치를 고정한다. 카메라가 움직여도 배치는 같다.
    for (let yy = 2; yy < height - 3; yy += 3) for (let xx = 2; xx < width - 3; xx += 3) {
      const jitter = positionNoise(left + xx, top + yy, 11),
        a = left + xx + (jitter > .5 ? 1 : 0),
        b = top + yy + (jitter > .75 ? 1 : 0),
        c = [PIX.shine, PIX.yellow, PIX.pink][Math.floor(positionNoise(a, b, 12) * 3)];
      box(a, b, 2, 2, c);
      if (jitter < .18) box(a + 2, b + 1, 1, 1, PIX.leaf);
    }
    const dots = Object.hasOwn(SHRUB_LETTERS, letter) ? SHRUB_LETTERS[letter] : SHRUB_PATTERN;
    const unit = Math.max(1, Math.min(3, Math.floor(Math.min((width - 6) / dots[0].length, (height - 6) / dots.length)))),
      ox = left + Math.floor((width - dots[0].length * unit) / 2),
      oy = top + Math.floor((height - dots.length * unit) / 2);
    const on = (a, b) => dots[b]?.[a] === '1';
    // 외곽선, 초록 면, 위쪽 잎 순으로 겹쳐 접하는 획의 내부 선을 지운다.
    for (let yy = 0; yy < dots.length; yy++) for (let xx = 0; xx < dots[yy].length; xx++) if (on(xx, yy)) box(ox + xx * unit - 1, oy + yy * unit - 1, unit + 2, unit + 2, PIX.outline);
    for (let yy = 0; yy < dots.length; yy++) for (let xx = 0; xx < dots[yy].length; xx++) if (on(xx, yy)) {
      box(ox + xx * unit, oy + yy * unit, unit, unit, PIX.hedge);
      if (!on(xx, yy - 1)) box(ox + xx * unit, oy + yy * unit, unit, 1, PIX.leaf);
    }
  }
  function decorPine(box, x, y) {
    box(x - 2, y - 1, 4, 7, PIX.outline);
    box(x - 1, y, 2, 5, PIX.woodDark);
    for (const [dx, dy, r] of [[-3, -3, 3], [3, -5, 3], [0, -8, 4]]) {
      for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) if (xx * xx + yy * yy <= r * r) {
        const edge = (Math.abs(xx) + 1) ** 2 + yy * yy > r * r || xx * xx + (Math.abs(yy) + 1) ** 2 > r * r;
        box(x + dx + xx, y + dy + yy, 1, 1, edge ? PIX.outline : yy < 0 ? PIX.leaf : PIX.leafDark);
      }
    }
  }
  function drawFencePoints(d, view) {
    const box = (x, y, w, h, c) => spriteRect(view, x, y, w, h, c);
    for (let i = 1; i < d.pts.length; i++) {
      const a = d.pts[i - 1].map(v => v * 16),
        b = d.pts[i].map(v => v * 16),
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)))),
        length = Math.hypot(dx, dy);
      if (!inView({
        x0: Math.min(a[0], b[0]) - 1,
        y0: Math.min(a[1], b[1]) - 5,
        x1: Math.max(a[0], b[0]) + 1,
        y1: Math.max(a[1], b[1]) + 1
      }, view)) continue;
      for (let n = 0; n <= steps; n++) {
        const x = Math.round(a[0] + dx * n / steps),
          y = Math.round(a[1] + dy * n / steps);
        box(x, y, 1, 1, PIX.leafDark);
        box(x, y - 3, 1, 1, PIX.leaf);
      }
      for (let distance = 0; distance <= length; distance += 3) {
        const t = length ? distance / length : 0;
        box(a[0] + dx * t, a[1] + dy * t - 4, 1, 5, PIX.leafDark);
      }
    }
  }
  function drawDecor(m, scene, view) {
    for (const d of scene.decor) {
      if (d.kind === 'fence' && d.pts?.length) {
        drawFencePoints(d, view);
        continue;
      }
      // 나무 장식은 길·차도·데크·주차장 칸 위에 그리지 않는다(걸어 다니는 칸에 나무가 서 있는 것처럼 보이지 않게)
      if ((d.kind === 'pine' || d.kind === 'cherry') && '.=BP'.includes(m.rows?.[Math.floor(d.y)]?.[Math.floor(d.x)] ?? '')) continue;
      const x = d.x * 16,
        y = d.y * 16,
        w = (d.w ?? (d.kind === 'stairs' ? 2 : d.kind === 'penthouse' ? 1.2 : 1)) * 16,
        h = (d.h ?? (d.kind === 'stairs' ? 1 : .7)) * 16;
      if (!inView({
        x0: x - Math.max(w / 2, 14),
        y0: y - h - 40,
        x1: x + Math.max(w / 2, 14),
        y1: y + h + 8
      }, view)) continue;
      const plainBox = (xx, yy, ww, hh, c, clip = false) => spriteRect(view, xx, yy, ww, hh, c, clip);
      const box = d.kind === 'goal' || d.kind === 'hoop' ? (xx, yy, ww, hh, c) => {
        const dx = xx - x,
          dy = yy - y;
        if (d.dir === 'left') plainBox(x + dy, y - dx - ww, hh, ww, c);else if (d.dir === 'right') plainBox(x - dy - hh, y + dx, hh, ww, c);else if (d.dir === 'down') plainBox(x - dx - ww, y - dy - hh, ww, hh, c);else plainBox(xx, yy, ww, hh, c);
      } : plainBox;
      if (d.kind === 'parterre') parterre(box, x, y, w, h, d.letter);else if (d.kind === 'pine') decorPine(box, x, y);else if (d.kind === 'cherry') {
        box(x - 2, y - 2, 4, 9, PIX.outline);
        box(x - 1, y - 2, 2, 8, PIX.woodDark);
        box(x - 4, y - 3, 3, 2, PIX.wood);
        box(x + 1, y - 5, 3, 2, PIX.wood);
        for (let yy = -9; yy <= 9; yy++) for (let xx = -10; xx <= 10; xx++) if (xx * xx / 100 + yy * yy / 81 <= 1) {
          const edge = (Math.abs(xx) + 1) ** 2 / 100 + yy * yy / 81 > 1 || xx * xx / 100 + (Math.abs(yy) + 1) ** 2 / 81 > 1,
            n = positionNoise(Math.round(x) + xx, Math.round(y) + yy, 17);
          box(x + xx, y - 9 + yy, 1, 1, edge ? PIX.outline : n < .22 ? PIX.shine : n < .36 ? PIX.pinkDark : PIX.pink);
        }
      } else if (d.kind === 'picnic') {
        for (const yy of [y - h / 2, y + h / 2 - 3]) {
          box(x - w / 2, yy, w, 4, PIX.outline);
          box(x - w / 2 + 1, yy + 1, w - 2, 2, PIX.wood);
        }
        box(x - w / 2 + 3, y - h / 2 + 3, 2, h - 3, PIX.woodDark);
        box(x + w / 2 - 5, y - h / 2 + 3, 2, h - 3, PIX.woodDark);
        box(x - w / 2 + 1, y - 3, w - 2, 6, PIX.outline);
        box(x - w / 2 + 2, y - 2, w - 4, 4, PIX.wood);
        box(x - w / 2 + 2, y, w - 4, 1, PIX.woodDark);
      } else if (d.kind === 'goal') {
        box(x - w / 2, y - h / 2, w, h, PIX.outline);
        box(x - w / 2 + 1, y - h / 2 + 1, w - 2, h - 2, PIX.courtTeal);
        for (let yy = 2; yy < h - 1; yy += 3) box(x - w / 2 + 1, y - h / 2 + yy, w - 2, 1, PIX.shine);
        for (let xx = 2; xx < w - 1; xx += 3) box(x - w / 2 + xx, y - h / 2 + 1, 1, h - 2, PIX.shine);
        box(x - w / 2, y - h / 2, w, 1, PIX.shine);
        box(x - w / 2, y - h / 2, 1, h, PIX.shine);
        box(x + w / 2 - 1, y - h / 2, 1, h, PIX.shine);
      } else if (d.kind === 'hoop') {
        box(x - 2, y - 3, 4, 10, PIX.outline);
        box(x - 1, y - 3, 2, 9, PIX.stone);
        box(x - 5, y - 9, 10, 7, PIX.outline);
        box(x - 4, y - 8, 8, 5, PIX.shine);
        box(x - 2, y - 6, 4, 3, PIX.track);
        box(x - 1, y - 5, 2, 1, PIX.shine);
        box(x - 2, y - 2, 5, 1, PIX.track);
        box(x - 1, y - 1, 3, 2, PIX.shine);
      } else if (d.kind === 'fence') {
        const vertical = h > w,
          left = x - w / 2,
          top = y - h / 2;
        if (vertical) {
          box(x, top, 1, h, PIX.leafDark);
          box(x + 3, top, 1, h, PIX.leafDark);
          for (let yy = 0; yy < h; yy += 3) {
            box(x - 1, top + yy, 1, 2, PIX.leafDark);
            box(x, top + yy, 4, 1, PIX.leaf);
          }
        } else {
          box(left, y - 3, w, 1, PIX.leafDark);
          box(left, y, w, 1, PIX.leafDark);
          for (let xx = 0; xx < w; xx += 3) {
            box(left + xx, y - 4, 1, 6, PIX.leafDark);
            box(left + xx + 1, y - 2, 1, 1, PIX.leaf);
          }
        }
      } else if (d.kind === 'statue') {
        box(x - 4, y + 2, 8, 3, PIX.stoneDark);
        box(x - 3, y + 2, 6, 1, PIX.stone);
        box(x - 1, y - 4, 3, 6, PIX.stone);
        box(x - 2, y - 7, 4, 3, PIX.stone);
        box(x - 3, y - 3, 6, 2, PIX.stoneDark);
        box(x - 2, y, 2, 2, PIX.stone);
        box(x + 1, y, 2, 2, PIX.stone);
      } else if (d.kind === 'stairs') {
        box(x - w / 2, y - h / 2, w, h, PIX.stone);
        for (let yy = 0; yy < h; yy += 3) box(x - w / 2, y - h / 2 + yy, w, 1, PIX.stoneDark);
      } else if (d.kind === 'penthouse') {
        const building = scene.buildings.find(s => s.kind === 'school' && pointInShape(s.rings, x, y));
        if (!building) continue;
        const front = nearestWall({
            ...scene,
            walls: scene.walls.filter(w => w.shape === building)
          }, x, y),
          yy = front ? Math.min(y, front.y - front.wall.height - h / 2 - 1) : y;
        makeShapeMask(building.rings, view);
        box(x - w / 2, yy - h / 2, w, h, PIX.outline, true);
        box(x - w / 2 + 1, yy - h / 2 + 1, w - 2, h - 2, PIX.wall, true);
        box(x - w / 2 + 1, yy - h / 2 + 1, w - 2, Math.max(2, h * .55), PIX.schoolRoof, true);
        box(x - w / 2 + 1, yy + h / 2 - 2, w - 2, 1, PIX.wallDark, true);
      } else if (d.kind === 'porch') {
        const p = nearestWall(scene, x, y, true);
        if (!p || p.wall.shape !== scene.main) continue;
        const xx = p.x,
          yy = p.y,
          doorH = Math.min(9, p.wall.height - 3);
        makeWallMask(p.wall, view);
        box(xx - 3, yy - doorH, 6, doorH, PIX.navy, true);
        box(xx + 1, yy - 4, 1, 1, PIX.yellow, true);
        box(xx - w / 2, yy - doorH - 3, w, 3, PIX.navy, true);
        box(xx - w / 2, yy - doorH, w, 1, PIX.outline, true);
        box(xx - w / 2, yy, w, 2, PIX.stone);
        box(xx - w / 2 - 1, yy + 2, w + 2, 2, PIX.stoneDark);
      }
    }
  }
  function fieldFrame(s) {
    if (s.fieldFrame) return s.fieldFrame;
    let ux = 1,
      uy = 0,
      longest = 0;
    for (const ring of s.rings) for (let i = 1; i < ring.length; i++) {
      const dx = ring[i][0] - ring[i - 1][0],
        dy = ring[i][1] - ring[i - 1][1],
        length = Math.hypot(dx, dy);
      if (length > longest) {
        longest = length;
        ux = dx / length;
        uy = dy / length;
      }
    }
    if (ux < 0 || ux === 0 && uy < 0) {
      ux = -ux;
      uy = -uy;
    }
    const bounds = {
      x0: Infinity,
      y0: Infinity,
      x1: -Infinity,
      y1: -Infinity
    };
    for (const ring of s.rings) for (const [x, y] of ring) {
      const u = x * ux + y * uy,
        v = -x * uy + y * ux;
      bounds.x0 = Math.min(bounds.x0, u);
      bounds.x1 = Math.max(bounds.x1, u);
      bounds.y0 = Math.min(bounds.y0, v);
      bounds.y1 = Math.max(bounds.y1, v);
    }
    return s.fieldFrame = {
      ux,
      uy,
      bounds
    };
  }
  function drawField(s, view) {
    makeShapeMask(s.rings, view);
    const surface = s.surface || 'dirt',
      track = s.track === true || s.kind === 'track' && Boolean(s.surface),
      legacyTrack = s.kind === 'track' && !s.surface && s.track === undefined;
    if (track || legacyTrack) trackDistance();
    const frame = fieldFrame(s),
      b = frame.bounds,
      inset = track ? 14 : 3,
      l = b.x0 + inset,
      r = b.x1 - inset,
      t = b.y0 + inset,
      bottom = b.y1 - inset,
      mx = (l + r) / 2,
      my = (t + bottom) / 2,
      radius = Math.min(r - l, bottom - t) * .12;
    paintShape(view, (i, x, y) => {
      if (track && shapeDistance[i] <= 13) return [5, 9, 13].includes(shapeDistance[i]) ? PIX.shine : PIX.track;
      if (surface === 'dirt') return legacyTrack && [5, 10].includes(shapeDistance[i]) && (x + y) % 10 < 5 ? PIX.shine : x % 23 === 7 && y % 19 === 9 ? PIX.soilDark : PIX.soil;
      const u = x * frame.ux + y * frame.uy,
        v = -x * frame.uy + y * frame.ux;
      if (r > l && bottom > t && u >= l - 1 && u <= r + 1 && v >= t - 1 && v <= bottom + 1) {
        const edge = Math.abs(u - l) < 1 || Math.abs(u - r) < 1 || Math.abs(v - t) < 1 || Math.abs(v - bottom) < 1,
          center = Math.abs(u - mx) < 1,
          circle = Math.abs(Math.hypot(u - mx, v - my) - radius) < .75,
          pw = (r - l) * .16,
          ph = (bottom - t) * .25;
        const penalty = Math.abs(v - my) <= ph && (Math.abs(u - l - pw) < 1 || Math.abs(u - r + pw) < 1) || Math.abs(Math.abs(v - my) - ph) < 1 && (u <= l + pw || u >= r - pw);
        if (edge || center || circle || penalty) return PIX.shine;
      }
      return surface === 'court' ? v < my ? PIX.courtGreen : PIX.courtTeal : Math.floor((u - b.x0) / 12) % 2 ? PIX.turfDark : PIX.turf;
    });
  }
  function roofEquipment(s, scene) {
    if (s.equipment) return s.equipment;
    const candidates = [],
      walls = scene.walls.filter(w => w.shape === s);
    for (let y = Math.ceil(s.bounds.y0) + 6; y < s.bounds.y1 - 6; y += 12) for (let x = Math.ceil(s.bounds.x0) + 6; x < s.bounds.x1 - 8; x += 12) {
      const corners = [[x, y], [x + 7, y], [x, y + 5], [x + 7, y + 5]];
      if (corners.every(([a, b]) => pointInShape(s.rings, a, b) && !walls.some(w => a >= w.bounds.x0 && a <= w.bounds.x1 && wallDepth(w, a, b) >= 0 && wallDepth(w, a, b) <= w.height + 4))) candidates.push([x, y]);
    }
    return s.equipment = [...new Set([0, Math.floor(candidates.length / 2), candidates.length - 1])].map(i => candidates[i]).filter(Boolean);
  }
  function drawSchoolWall(wall, scene, view) {
    const a = wall.a,
      b = wall.b,
      h = wall.height,
      left = Math.min(a[0], b[0]);
    // 높은 부분도 건물 윤곽 안쪽에만 둔다. 긴 정면의 계단실 간격은 약 12칸이다.
    const expanded = {
      ...wall,
      rings: [[a, b, [b[0], b[1] - h - 2], [a[0], a[1] - h - 2]]]
    };
    makeWallMask(expanded, view);
    paintShape(view, (i, x, y) => {
      const depth = wallDepth(wall, x + .5, y + .5),
        local = x - left,
        stair = wall.length >= 96 && local >= 48 && Math.floor(local - 48) % 192 < 6,
        height = h + (stair ? 2 : 0);
      if (depth > height) return null;
      if (depth < 1 || depth > height - 1 || !wallClipMask[i + SHAPE_W]) return PIX.outline;
      if (stair) return Math.floor(local - 48) % 192 >= 2 && Math.floor(local - 48) % 192 < 4 && depth > 3 && depth < height - 3 ? PIX.navy : PIX.track;
      if (wall.shape === scene.main && Math.abs(x + .5 - scene.main.stripeX) < 2) return PIX.navy;
      const fromTop = h - depth,
        row = Math.floor((fromTop - 2) / 6),
        within = fromTop - 2 - row * 6,
        column = Math.floor(local) % 8;
      if (row >= 0 && row < 3 && within >= 0 && within < 4) return within < 1 || within >= 3 || column === 0 || column === 1 ? PIX.shine : PIX.window;
      return PIX.wall;
    });
  }
  function drawDormWall(wall, view) {
    const a = wall.a,
      b = wall.b,
      h = wall.height,
      left = Math.min(a[0], b[0]),
      width = Math.abs(b[0] - a[0]),
      glassLeft = Math.round(left + width * .75 - 2);
    const expanded = {
      ...wall,
      rings: [[a, b, [b[0], b[1] - h - 2], [a[0], a[1] - h - 2]]]
    };
    makeWallMask(expanded, view);
    paintShape(view, (i, x, y) => {
      const depth = wallDepth(wall, x + .5, y + .5),
        glass = x >= glassLeft && x < glassLeft + 4;
      if (depth > h + (glass ? 2 : 0)) return null;
      if (glass && depth >= 1) return PIX.dormGlass;
      if (depth < 1 || depth > h - 1 || !wallClipMask[i + SHAPE_W]) return PIX.outline;
      const fromTop = h - depth,
        row = Math.floor((fromTop - 2) / 5),
        within = fromTop - 2 - row * 5,
        column = Math.floor(x - left) % 8;
      if (row >= 0 && row < 5 && within >= 0 && within < 3 && column >= 2 && column < 7) return within < 1 || column === 2 ? PIX.shine : PIX.window;
      const brick = x + .5 >= wall.shape.bounds.x0 + (wall.shape.bounds.x1 - wall.shape.bounds.x0) * .8;
      return Math.floor(fromTop) % 5 === 0 ? brick ? PIX.brickJoint : PIX.stoneJoint : brick ? PIX.track : PIX.towerStone;
    });
  }
  function drawShapes(m, cx, cy) {
    const view = {
        x: cx * 16,
        y: cy * 16,
        width: 176,
        height: 144
      },
      scene = getShapeScene(m);
    if (!m.shapes) {
      drawDecor(m, scene, view);
      return;
    }
    for (const s of scene.fields) {
      if (inView(s.bounds, view)) drawField(s, view);
    }
    for (const s of scene.water) {
      if (!inView(s.bounds, view)) continue;
      makeShapeMask(s.rings, view);
      paintShape(view, (i, x, y) => maskBoundary(i) ? PIX.shine : y % 17 === 7 && x % 31 >= 3 && x % 31 < 9 ? PIX.shine : y % 17 === 8 && x % 31 >= 4 && x % 31 < 10 ? PIX.waterDark : PIX.water);
    }
    for (const s of scene.buildings) {
      if (!inView(s.bounds, view)) continue;
      makeShapeMask(s.rings, view);
      const dorm = s.role === 'dorm',
        school = s.kind === 'school',
        flat = school || dorm;
      paintShape(view, i => maskBoundary(i) ? flat ? PIX.roofEdge : PIX.outline : !shapeMask[i - SHAPE_W * 2] ? flat ? PIX.schoolRoof : PIX.homeLight : flat ? PIX.schoolRoof : PIX.homeRoof);
      if (school && !dorm) for (const [x, y] of roofEquipment(s, scene)) {
        spriteRect(view, x, y, 7, 5, PIX.outline, true);
        spriteRect(view, x + 1, y + 1, 5, 3, PIX.stone, true);
        spriteRect(view, x + 1, y + 1, 5, 1, PIX.shine, true);
      }
    }
    for (const wall of scene.walls) {
      if (!inView({
        ...wall.bounds,
        y0: wall.bounds.y0 - 4
      }, view)) continue;
      if (wall.shape.role === 'dorm') {
        drawDormWall(wall, view);
        continue;
      }
      if (wall.kind === 'school') {
        drawSchoolWall(wall, scene, view);
        continue;
      }
      makeWallMask(wall, view);
      paintShape(view, (i, x, y) => {
        const depth = wallDepth(wall, x + .5, y + .5);
        if (depth < 1 || !wallClipMask[i + SHAPE_W]) return PIX.outline;
        const level = depth / wall.height;
        return level >= .3 && level < .6 ? PIX.window : PIX.ground;
      });
    }
    // 데크·표지판은 물과 운동장 위에 놓인 소품이다. 문은 안쪽 벽에 겹쳐 그린다.
    for (let y = -1; y <= 9; y++) for (let x = -1; x <= 11; x++) if ('BS'.includes(tileAt(cx + x, cy + y))) drawTile(cx + x, cy + y, x * 16, y * 16);
    for (const d of scene.doors) {
      if (!inView(d.wall.bounds, view)) continue;
      if (d.symbol === 'D' && d.wall.shape === scene.main && scene.decor.some(p => p.kind === 'porch')) continue;
      makeWallMask(d.wall, view);
      const x0 = Math.round(d.x) - 2,
        y0 = Math.round(d.y) - 7;
      for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) {
        const color = x === 0 || x === 4 || y === 0 || y === 6 ? PIX.outline : y <= 2 ? {
          D: PIX.yellow,
          L: PIX.blue,
          J: PIX.orange,
          G: PIX.green
        }[d.symbol] : x === 3 && y === 4 ? PIX.yellow : PIX.wood;
        spriteRect(view, x0 + x, y0 + y, 1, 1, color, true);
      }
    }
    drawGardenTrees(m, scene, view);
    drawDecor(m, scene, view);
  }
  function shapeFloor(t, x, y) {
    if ('RHDLJG'.includes(t)) return buildingIndex[currentMap.id].get(x + ',' + y)?.school ? PIX.yard : PIX.court;
    if (t === 'F') return currentMap.id === 'school' ? PIX.yard : PIX.grass;
    return PIX.grass;
  }
  function gardenAt(m, x, y) {
    return getShapeScene(m).gardens.find(g => pointInShape(g.rings, x * 16 + 8, y * 16 + 8));
  }
  function roundPine(px, py) {
    rect(px - 1, py + 3, 2, 3, PIX.woodDark);
    rect(px - 3, py - 2, 7, 5, PIX.leafDark);
    rect(px - 2, py - 3, 5, 1, PIX.leafDark);
    rect(px - 2, py + 3, 5, 1, PIX.leafDark);
    rect(px - 2, py - 2, 4, 2, PIX.leaf);
    rect(px - 1, py - 3, 2, 1, PIX.leaf);
  }
  function tallGardenTree(px, py, small = false) {
    const w = small ? 5 : 9;
    rect(px, py + 1, 2, 6, PIX.woodDark);
    rect(px - Math.floor(w / 2), py - 8, w, 10, PIX.leafDark);
    rect(px - Math.floor(w / 2) + 1, py - 10, w - 2, 2, PIX.leaf);
    rect(px - Math.floor(w / 2), py - 7, w - 2, 4, PIX.leaf);
    rect(px - 1, py - 9, 2, 1, PIX.canopyLight);
  }
  function drawGardenTile(m, g, x, y, px, py) {
    const t = tileAt(x, y),
      view = {
        x: x * 16 - px,
        y: y * 16 - py,
        width: 176,
        height: 144
      };
    makeShapeMask(g.rings, view);
    const box = (a, b, w, h, c) => spriteRect(view, x * 16 + a, y * 16 + b, w, h, c, true);
    if (t === '.') {
      for (let b = 0; b < 16; b += 8) for (let a = 0; a < 16; a += 8) {
        box(a, b, 8, 8, (x * 2 + a / 8 + y * 2 + b / 8) % 2 ? PIX.brick : PIX.brickLight);
        box(a, b, 8, 1, PIX.brickJoint);
        box(a, b, 1, 8, PIX.brickJoint);
      }
      return;
    }
    box(0, 0, 16, 16, PIX.grass);
    const rock = y * 16 + 8 >= g.bounds.y0 + (g.bounds.y1 - g.bounds.y0) * 2 / 3;
    if (rock) {
      box(3, 7, 4, 2, PIX.stoneDark);
      box(4, 6, 3, 2, PIX.stone);
      box(11, 12, 3, 2, PIX.stone);
      box(12, 11, 2, 1, PIX.stoneDark);
      box(8, 3, 5, 3, PIX.leafDark);
      box(9, 2, 3, 1, PIX.leaf);
      box(9, 3, 2, 1, PIX.leaf);
      if (positionNoise(x, y, 7) < .08) tallGardenTree(px + 5, py + 10);
    }
    for (const [dx, dy, a, b] of [[0, -1, 8, 4], [0, 1, 8, 10], [-1, 0, 4, 7], [1, 0, 11, 7]]) if (tileAt(x + dx, y + dy) === '.' && gardenAt(m, x + dx, y + dy) === g) {
      if (dy) box(0, dy < 0 ? 0 : 15, 16, 1, PIX.grassDark);else box(dx < 0 ? 0 : 15, 0, 1, 16, PIX.grassDark);
      if (!rock && (dy ? x : y) % 2 === 0) roundPine(px + a, py + b);
    }
  }
  function drawGardenTrees(m, scene, view) {
    for (const g of scene.gardens) {
      if (!inView({
        x0: g.bounds.x0 - 16,
        y0: g.bounds.y0,
        x1: g.bounds.x1,
        y1: g.bounds.y1
      }, view)) continue;
      for (let y = Math.max(0, Math.floor(view.y / 16) - 1); y < Math.min(m.height, Math.ceil((view.y + view.height) / 16) + 1); y++) {
        if (y % 2) continue;
        const yy = y * 16 + 8,
          xs = [];
        for (const ring of g.rings) for (let i = 0; i < ring.length; i++) {
          const a = ring[i],
            b = ring[(i + 1) % ring.length];
          if (a[1] > yy !== b[1] > yy) xs.push(a[0] + (yy - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
        }
        if (!xs.length) continue;
        const x = Math.floor(Math.min(...xs) / 16) - 1,
          t = m.rows[y]?.[x];
        if (!t || 'RHDLJG~BS'.includes(t) || gardenAt(m, x, y)) continue;
        const px = x * 16 - view.x,
          py = y * 16 - view.y;
        if (px < -16 || px >= view.width) continue;
        const small = !blocked.has(t);
        tallGardenTree(px + (small ? 12 : 8), py + 10, small);
      }
    }
  }

  // 학교 안 차도만 한 번 가늘게 줄여 중심 경로를 만든다. 좌표별 픽셀 목록을 캐시한다.
  // 칸마다 가로/세로 방향을 따로 고르면 굽은 길에서 선이 끊기므로 이웃 중심을 잇는다.
  const campusRoadLines = new WeakMap();
  function getCampusRoadPixels(m) {
    if (campusRoadLines.has(m)) return campusRoadLines.get(m);
    const width = m.width,
      height = m.height,
      cells = new Uint8Array(width * height),
      active = [],
      lines = new Map();
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (m.rows[y][x] === '=' && m.roadClass?.[y]?.[x] === '3') {
      cells[y * width + x] = 1;
      active.push(y * width + x);
    }
    const at = (x, y) => x >= 0 && x < width && y >= 0 && y < height ? cells[y * width + x] : 0;
    let changed = true;
    while (changed) {
      changed = false;
      for (let phase = 0; phase < 2; phase++) {
        const remove = [];
        for (const i of active) {
          if (!cells[i]) continue;
          const x = i % width,
            y = Math.floor(i / width),
            p = [at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1)],
            n = p.reduce((a, b) => a + b, 0);
          if (n < 2 || n > 6) continue;
          let transitions = 0;
          for (let j = 0; j < 8; j++) if (!p[j] && p[(j + 1) % 8]) transitions++;
          if (transitions !== 1) continue;
          if (phase === 0 ? p[0] * p[2] * p[4] || p[2] * p[4] * p[6] : p[0] * p[2] * p[6] || p[0] * p[4] * p[6]) continue;
          remove.push(i);
        }
        for (const i of remove) cells[i] = 0;
        if (remove.length) changed = true;
      }
    }
    const road = (x, y) => m.rows[y]?.[x] === '=' && m.roadClass?.[y]?.[x] === '3',
      centers = new Map();
    for (const i of active) {
      if (!cells[i]) continue;
      const x = i % width,
        y = Math.floor(i / width);
      let l = x,
        r = x,
        u = y,
        d = y;
      while (road(l - 1, y)) l--;
      while (road(r + 1, y)) r++;
      while (road(x, u - 1)) u--;
      while (road(x, d + 1)) d++;
      let px = x * 16 + 7,
        py = y * 16 + 7;
      if (r - l >= (d - u) * 1.5) py = Math.max(py - 8, Math.min(py + 8, (u + d + 1) * 8 - 1));else if (d - u >= (r - l) * 1.5) px = Math.max(px - 8, Math.min(px + 8, (l + r + 1) * 8 - 1));
      centers.set(i, [px, py]);
    }
    const pixel = (x, y) => {
      const tx = Math.floor(x / 16),
        ty = Math.floor(y / 16);
      if (!road(tx, ty)) return;
      const key = tx + ',' + ty;
      if (!lines.has(key)) lines.set(key, new Set());
      lines.get(key).add((y - ty * 16) * 16 + x - tx * 16);
    };
    const join = (a, b) => {
      let [x, y] = a;
      const [endX, endY] = b,
        dx = Math.abs(endX - x),
        dy = -Math.abs(endY - y),
        sx = x < endX ? 1 : -1,
        sy = y < endY ? 1 : -1;
      let error = dx + dy;
      for (;;) {
        pixel(x, y);
        if (x === endX && y === endY) break;
        const twice = error * 2;
        if (twice >= dy) {
          error += dy;
          x += sx;
        }
        if (twice <= dx) {
          error += dx;
          y += sy;
        }
      }
    };
    for (const [i, p] of centers) {
      pixel(...p);
      const x = i % width,
        y = Math.floor(i / width),
        neighbors = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && at(x + dx, y + dy)) neighbors.push(centers.get((y + dy) * width + x + dx));
      if (neighbors.length === 1) {
        const q = neighbors[0];
        join(p, [p[0] + Math.sign(p[0] - q[0]) * 16, p[1] + Math.sign(p[1] - q[1]) * 16]);
      }
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
        const nx = x + dx,
          ny = y + dy;
        if (!at(nx, ny)) continue;
        if (dx && dy && (at(nx, y) || at(x, ny))) continue;
        join(p, centers.get(ny * width + nx));
      }
    }
    campusRoadLines.set(m, lines);
    return lines;
  }
  function drawTile(x, y, px, py) {
    const t = tileAt(x, y),
      n = tileAt(x, y - 1),
      s = tileAt(x, y + 1),
      w = tileAt(x - 1, y),
      e = tileAt(x + 1, y),
      k = noise(x, y);
    if (currentMap.shapes && 'RHDLJGF~'.includes(t)) {
      rect(px, py, 16, 16, shapeFloor(t, x, y));
      return;
    }
    rect(px, py, 16, 16, baseColor(t));
    if (t === '.' || t === ':') {
      const m = currentMap,
        garden = m.shapes?.gardens?.length && gardenAt(m, x, y);
      if (garden) {
        drawGardenTile(m, garden, x, y, px, py);
        return;
      }
    }
    if (t === '~') {
      if (n !== '~') rect(px, py, 16, 1, PIX.outline);
      if (s !== '~') rect(px, py + 15, 16, 1, PIX.outline);
      if (w !== '~') rect(px, py, 1, 16, PIX.outline);
      if (e !== '~') rect(px + 15, py, 1, 16, PIX.outline);
      for (const [edge, a, b, c, d] of [[n, 3, 2, 6, 1], [s, 7, 13, 6, 1], [w, 2, 5, 1, 5], [e, 13, 7, 1, 5]]) if (edge !== '~') rect(px + a, py + b, c, d, PIX.shine);
      if (k < 3) {
        rect(px + 3 + k, py + 7, 5, 1, PIX.waterDark);
        rect(px + 4 + k, py + 6, 3, 1, PIX.shine);
      }
      return;
    }
    if (t === 'T') {
      // 칸 밖으로 이어지는 수관끼리 겹쳐 내부에는 잔디 틈과 개별 외곽선을 남기지 않는다.
      rect(px, py, 16, 16, PIX.leaf);
      const a = 2 + Math.floor(positionNoise(x, y, 1) * 5),
        b = 5 + Math.floor(positionNoise(x, y, 2) * 5);
      rect(px, py + b, 10, 5, PIX.leafDark);
      rect(px + a, py + b - 2, 10, 5, PIX.leafDark);
      rect(px + a, py + 2, 8, 2, PIX.canopyLight);
      rect(px + 1, py + 3, 5, 2, PIX.canopyLight);
      rect(px + 11, py + 13, 5, 3, PIX.leafDark);
      if (n !== 'T') {
        rect(px, py, 16, 1, PIX.grass);
        rect(px, py + 1, 3, 1, PIX.grass);
        rect(px + 13, py + 1, 3, 1, PIX.grass);
        rect(px + 3, py + 1, 10, 1, PIX.outline);
        rect(px + 1, py + 2, 2, 1, PIX.outline);
        rect(px + 13, py + 2, 2, 1, PIX.outline);
      }
      if (s !== 'T') {
        rect(px, py + 15, 16, 1, PIX.grass);
        rect(px, py + 14, 3, 1, PIX.grass);
        rect(px + 13, py + 14, 3, 1, PIX.grass);
        rect(px + 3, py + 14, 10, 1, PIX.outline);
        rect(px + 1, py + 13, 2, 1, PIX.outline);
        rect(px + 13, py + 13, 2, 1, PIX.outline);
      }
      if (w !== 'T') {
        rect(px, py, 1, 16, PIX.grass);
        rect(px + 1, py, 1, 3, PIX.grass);
        rect(px + 1, py + 13, 1, 3, PIX.grass);
        rect(px + 1, py + 3, 1, 10, PIX.outline);
        rect(px + 2, py + 1, 1, 2, PIX.outline);
        rect(px + 2, py + 13, 1, 2, PIX.outline);
      }
      if (e !== 'T') {
        rect(px + 15, py, 1, 16, PIX.grass);
        rect(px + 14, py, 1, 3, PIX.grass);
        rect(px + 14, py + 13, 1, 3, PIX.grass);
        rect(px + 14, py + 3, 1, 10, PIX.outline);
        rect(px + 13, py + 1, 1, 2, PIX.outline);
        rect(px + 13, py + 13, 1, 2, PIX.outline);
      }
      return;
    }
    if (t === 'X') {
      const roll = positionNoise(x, y),
        a = 5 + Math.floor(positionNoise(x, y, 3) * 5),
        b = 6 + Math.floor(positionNoise(x, y, 4) * 4);
      if (roll < .012) {
        rect(px + a - 1, py + b + 1, 4, 3, PIX.homeDark);
        rect(px + a - 2, py + b, 6, 1, PIX.wood);
        rect(px + a, py + b - 3, 2, 3, PIX.leaf);
        rect(px + a - 1, py + b - 2, 4, 1, PIX.leaf);
      } else if (roll < .02) smallTree(px + a, py + b - 2);
      // 건물 쪽과 마당 안쪽에는 선을 두지 않고, 보행 지면에 닿은 변에만 낮은 담장을 그린다.
      for (const [other, dx, dy] of [[n, 0, -1], [s, 0, 1], [w, -1, 0], [e, 1, 0]]) if (other && !blocked.has(other)) {
        if (dy) {
          const yy = dy < 0 ? py : py + 15;
          rect(px, yy, 16, 1, PIX.fence);
          rect(px + 2, dy < 0 ? py : py + 14, 2, 2, PIX.fence);
          rect(px + 12, dy < 0 ? py : py + 14, 2, 2, PIX.fence);
        } else {
          const xx = dx < 0 ? px : px + 15;
          rect(xx, py, 1, 16, PIX.fence);
          rect(dx < 0 ? px : px + 14, py + 2, 2, 2, PIX.fence);
          rect(dx < 0 ? px : px + 14, py + 12, 2, 2, PIX.fence);
        }
      }
      return;
    }
    if ('RHDLJG'.includes(t)) {
      const b = buildingIndex[currentMap.id].get(x + ',' + y),
        roof = b.school ? PIX.roof : PIX.homeRoof,
        dark = b.school ? PIX.roofDark : PIX.homeDark;
      const same = (xx, yy) => buildingIndex[currentMap.id].get(xx + ',' + yy) === b;
      if (t === 'R') {
        rect(px, py, 16, 16, roof);
        if (n !== 'R' && n !== 'H') rect(px, py, 16, 1, PIX.outline);
        if (!same(x - 1, y)) rect(px, py, 1, 16, PIX.outline);
        if (!same(x + 1, y)) rect(px + 15, py, 1, 16, PIX.outline);
        if (s !== 'R') {
          rect(px, py + 13, 16, 2, dark);
          rect(px, py + 15, 16, 1, PIX.outline);
        }
        if (y === Math.floor((b.y0 + b.y1 - 1) / 2)) {
          rect(px, py + 5, 16, 1, PIX.outline);
          rect(px, py + 4, 16, 1, PIX.shine);
        }
        if ((y - b.y0) % 2 === 0) rect(px + 2, py + 10, 12, 1, dark);
      } else {
        rect(px, py, 16, 16, b.school ? PIX.wall : PIX.ground);
        rect(px, py, 16, 2, dark);
        rect(px, py + 14, 16, 2, PIX.wallDark);
        if (!same(x - 1, y)) rect(px, py, 1, 16, PIX.outline);
        if (!same(x + 1, y)) rect(px + 15, py, 1, 16, PIX.outline);
        if (!same(x, y + 1)) rect(px, py + 15, 16, 1, PIX.outline);
        if (t === 'H') {
          for (let a = 3; a < 16; a += 7) {
            rect(px + a, py + 5, 5, 6, PIX.outline);
            rect(px + a + 1, py + 6, 3, 4, PIX.window);
            rect(px + a + 2, py + 6, 1, 4, PIX.shine);
          }
        } else {
          rect(px + 4, py + 3, 9, 13, PIX.outline);
          rect(px + 5, py + 4, 7, 11, PIX.wood);
          rect(px + 5, py + 4, 7, 3, {
            D: PIX.yellow,
            L: PIX.blue,
            J: PIX.orange,
            G: PIX.green
          }[t]);
          rect(px + 10, py + 11, 1, 1, PIX.yellow);
          rect(px + 11, py + 7, 1, 8, PIX.woodDark);
          if (t === 'G') {
            rect(px + 7, py + 8, 3, 2, PIX.leafDark);
            rect(px + 8, py + 7, 2, 1, PIX.leafDark);
            rect(px + 7, py + 10, 1, 2, PIX.leafDark);
          }
        }
      }
      return;
    }
    if (t === '=') {
      const m = currentMap,
        classes = m.roadClass,
        kind = classes?.[y]?.[x],
        campus = kind === '3';
      if (campus) rect(px, py, 16, 16, PIX.asphalt);
      if (n !== '=') rect(px, py, 16, 1, PIX.roadDark);
      if (s !== '=') rect(px, py + 15, 16, 1, PIX.roadDark);
      if (w !== '=') rect(px, py, 1, 16, PIX.roadDark);
      if (e !== '=') rect(px + 15, py, 1, 16, PIX.roadDark);
      if (campus) {
        for (const i of getCampusRoadPixels(m).get(x + ',' + y) || []) rect(px + i % 16, py + Math.floor(i / 16), 1, 1, PIX.yellow);
        return;
      }
      if (classes && kind !== '2') return;
      const road = (xx, yy) => tileAt(xx, yy) === '=' && (!classes || classes[yy]?.[xx] === '2');
      let l = x,
        r = x,
        u = y,
        d = y;
      while (road(l - 1, y)) l--;
      while (road(r + 1, y)) r++;
      while (road(x, u - 1)) u--;
      while (road(x, d + 1)) d++;
      if (r - l >= d - u) {
        if ((classes || d - u + 1 >= 3) && y === Math.floor((u + d) / 2)) rect(px + 3, py + 7, 9, 1, PIX.shine);
      } else if ((classes || r - l + 1 >= 3) && x === Math.floor((l + r) / 2)) rect(px + 7, py + 3, 1, 9, PIX.shine);
      return;
    }
    if (t === 'P') {
      if (x % 2 === 0) {
        rect(px + 1, py + 1, 1, 14, PIX.shine);
        rect(px + 1, py + 14, 12, 1, PIX.shine);
      }
      rect(px + 14, py + 1, 1, 14, PIX.roadDark);
      return;
    }
    if (t === 'F') {
      // 운동장 덩어리 경계의 한 칸 안쪽에 트랙선을 놓는다.
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) if (tileAt(x + dx, y + dy) === 'F' && tileAt(x + dx * 2, y + dy * 2) !== 'F') {
        if (dx) for (let a = 1; a < 16; a += 6) rect(px + (dx > 0 ? 10 : 5), py + a, 1, 3, PIX.shine);else for (let a = 1; a < 16; a += 6) rect(px + a, py + (dy > 0 ? 10 : 5), 3, 1, PIX.shine);
      }
      if (k === 0) rect(px + 4, py + 8, 2, 1, PIX.soilDark);
      return;
    }
    if (t === 'B') {
      rect(px, py, 1, 16, PIX.woodDark);
      rect(px + 8, py, 1, 16, PIX.woodDark);
      rect(px, py + 1, 16, 1, PIX.shine);
      if (n !== 'B') rect(px, py, 16, 1, PIX.outline);
      if (s !== 'B') rect(px, py + 15, 16, 1, PIX.outline);
      return;
    }
    if (t === 'S') {
      rect(px + 7, py + 8, 3, 7, PIX.outline);
      rect(px + 8, py + 8, 1, 6, PIX.wood);
      rect(px + 2, py + 2, 12, 8, PIX.outline);
      rect(px + 3, py + 3, 10, 6, PIX.ground);
      rect(px + 4, py + 4, 7, 1, PIX.woodDark);
      rect(px + 4, py + 6, 5, 1, PIX.woodDark);
      rect(px + 3, py + 8, 10, 1, PIX.soil);
      return;
    }
    if (t === '.') {
      rect(px, py + 15, 16, 1, PIX.paving);
      rect(px + y % 2 * 8, py, 1, 16, PIX.paving);
      if (k === 1) rect(px + 8, py + 7, 2, 1, PIX.soil);
    } else if (t === 'Y') {
      if (k < 2) rect(px + 7, py + 7, 2, 1, PIX.paving);
    } else {
      if (t === 'g') {
        const roll = positionNoise(x, y),
          a = 4 + Math.floor(positionNoise(x, y, 3) * 7),
          b = 5 + Math.floor(positionNoise(x, y, 4) * 5);
        if (roll < .02) smallTree(px + a, py + b - 1);else if (roll < .20) {
          const motif = Math.floor(positionNoise(x, y, 5) * 3);
          if (motif === 0) {
            rect(px + a, py + b - 2, 1, 3, PIX.leaf);
            rect(px + a - 1, py + b - 1, 1, 2, PIX.grassDark);
            rect(px + a + 1, py + b - 3, 1, 3, PIX.grassDark);
          } else if (motif === 1) {
            rect(px + a, py + b, 1, 2, PIX.leaf);
            rect(px + a - 1, py + b - 1, 3, 1, positionNoise(x, y, 6) < .5 ? PIX.flower : PIX.yellow);
            rect(px + a, py + b - 2, 1, 1, PIX.shine);
          } else {
            rect(px + a, py + b, 2, 1, PIX.grassDark);
            rect(px + a + 3, py + b + 2, 1, 1, PIX.grassDark);
          }
        }
      } else if (k < 4) rect(px + 2 + k, py + 10, 2, 1, PIX.grassDark);
      for (const [other, a, b, c, d] of [[n, 0, 0, 16, 1], [s, 0, 15, 16, 1], [w, 0, 0, 1, 16], [e, 15, 0, 1, 16]]) if (other && '.=YP'.includes(other)) rect(px + a, py + b, c, d, PIX.grassDark);
    }
    if (':,;f'.includes(t)) {
      for (const [a, b] of [[3, 10], [9, 5], [12, 13]]) {
        if (t === ';') {
          rect(px + a, py + b - 4, 1, 6, PIX.reed);
          rect(px + a + 1, py + b - 2, 1, 3, PIX.reed);
          rect(px + a, py + b - 6, 2, 3, PIX.reedTip);
        } else {
          rect(px + a, py + b - 2, 1, 4, t === ',' ? PIX.leafDark : PIX.leaf);
          rect(px + a - 1, py + b - 1, 1, 2, PIX.leaf);
          rect(px + a + 1, py + b - 3, 1, 3, PIX.leafDark);
          if (t !== ',') {
            rect(px + a - 1, py + b - 4, 3, 2, a % 2 ? PIX.yellow : PIX.flower);
            rect(px + a, py + b - 4, 1, 1, PIX.shine);
          }
        }
      }
    }
  }
  // 가로·세로 16px 안에서 머리·깃·아가일·양말을 구분하는 직접 만든 교복 도트다.
  const UNIFORM_DOTS = Object.freeze({
    down: ['................', '.....HHHHHH.....', '....HHHHHHHH....', '....HHHHHHHH....', '.....KOKKOK.....', '.....KKKKKK.....', '....SWWKKWWS....', '....SSVWWVSS....', '....SSVAVVSS....', '....KKVVAVKK....', '.....LLLLLL.....', '.....LLLLLL.....', '.....WW..WW.....', '.....BB..BB.....', '................', '................'],
    up: ['................', '.....HHHHHH.....', '....HHHHHHHH....', '....HHHHHHHH....', '....HHHHHHHH....', '.....HHHHHH.....', '....SWWHHWWS....', '....SSVVVVSS....', '....SSVAVVSS....', '....KKVVAVKK....', '.....LLLLLL.....', '.....LLLLLL.....', '.....WW..WW.....', '.....BB..BB.....', '................', '................'],
    left: ['................', '.....HHHHH......', '....HHHHHHH.....', '....HHHHHHH.....', '....KOKHHHH.....', '....KKKHHH......', '.....WKWWS......', '.....VVVSS......', '.....VAVSS......', '.....VVVKK......', '.....LLLL.......', '.....LLLL.......', '.....W.WW.......', '....BB.BB.......', '................', '................']
  });
  function person(px, py, dir = 'down', player = false, npc = null, index = 0, avatar = 'm', stepFrame = 0) {
    const kind = npc?.kind || (npc?.id === 'senior' ? 'student' : 'adult');
    const student = player || kind === 'student',
      guide = npc?.id === 'guide';
    const gender = (player ? avatar : npc?.look || 'm') === 'f' ? 'girl' : 'boy';
    const jacket = student && npc?.id === 'senior',
      side = dir === 'left' || dir === 'right';
    const rows = (UNIFORM_DOTS[dir === 'right' ? 'left' : dir] || UNIFORM_DOTS.down).map(row => [...row]);
    if (student && gender === 'girl') {
      if (side) {
        rows[10][4] = 'L';
        rows[11][4] = 'L';
        rows[11][9] = 'L';
        rows[11][6] = 'V';
      } else {
        rows[10][4] = 'L';
        rows[10][11] = 'L';
        rows[11][4] = 'L';
        rows[11][11] = 'L';
        rows[11][6] = 'V';
        rows[11][9] = 'V';
      }
    }
    const frame = player ? stepFrame : (npc?.stepFrame ?? 0) % 2;
    if (frame) {
      // 몸통은 고정하고 두 발을 번갈아 내딛는다. 멈춘 NPC는 기본 프레임이다.
      if (side) {
        rows[12][5] = 'B';
        rows[13][4] = '.';
        rows[13][5] = '.';
        rows[13][9] = 'B';
      } else {
        rows[12][5] = 'B';
        rows[12][6] = 'B';
        rows[13][5] = '.';
        rows[13][6] = '.';
        rows[14][9] = 'B';
        rows[14][10] = 'B';
      }
    }
    if (!student) {
      for (let y = 10; y <= 11; y++) for (let x = 0; x < 16; x++) if (rows[y][x] === 'L') rows[y][x] = 'V';
    }
    if (guide) {
      for (let x = 5; x <= 10; x++) rows[1][x] = 'C';
      for (let x = 4; x <= 11; x++) rows[2][x] = 'C';
      for (let x = 3; x <= 12; x++) rows[3][x] = 'C';
    }
    if (jacket) for (let y = 6; y <= 9; y++) for (let x = 0; x < 16; x++) {
      if (rows[y][x] === 'S') rows[y][x] = 'J';else if (rows[y][x] === 'V' && (side && x === 5 || !side && (x === 6 || x === 9))) rows[y][x] = 'J';
    }
    if (dir === 'right') for (const row of rows) row.reverse();
    const colors = {
      J: PIX.jacket,
      H: PIX.hair,
      K: PIX.skin,
      O: PIX.outline,
      W: PIX.shine,
      S: student ? PIX.sky : PIX.shirt,
      V: student ? PIX.navy : guide ? PIX.woodDark : PIX.leaf,
      A: student ? PIX.sky : guide ? PIX.woodDark : PIX.leaf,
      L: PIX.navy,
      B: PIX.hair,
      C: PIX.cap
    };
    const on = (x, y) => rows[y]?.[x] && rows[y][x] !== '.';
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (!on(x, y) && [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dx, dy]) => on(x + dx, y + dy))) rect(px + x, py + y, 1, 1, PIX.outline);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (on(x, y)) rect(px + x, py + y, 1, 1, colors[rows[y][x]]);
  }

  // 11×9칸 조각은 최근 사용한 30개만 보관하고, 지도 전환 때 모두 놓아준다.
  const MAX_BACKGROUND_CHUNKS = 30;
  const miniBackgrounds = new WeakMap();
  let cachedMap = null;
  const backgrounds = new Map();
  function canvas(width, height) {
    const c = root.document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  }
  function useMap(m) {
    if (cachedMap === m) return;
    for (const floor of backgrounds.values()) {
      floor.width = 0;
      floor.height = 0;
    }
    backgrounds.clear();
    if (cachedMap) {
      delete buildingIndex[cachedMap.id];
      shapeScenes.delete(cachedMap);
      campusRoadLines.delete(cachedMap);
      const mini = miniBackgrounds.get(cachedMap);
      if (mini) {
        mini.width = 0;
        mini.height = 0;
      }
      miniBackgrounds.delete(cachedMap);
    }
    cachedMap = m;
    currentMap = m;
    indexBuildings(m);
  }
  function backgroundChunk(m, cx, cy) {
    const key = `${cx},${cy}`;
    if (backgrounds.has(key)) {
      const floor = backgrounds.get(key);
      backgrounds.delete(key);
      backgrounds.set(key, floor);
      return floor;
    }
    const floor = canvas(WIDTH, HEIGHT);
    ctx = floor.getContext('2d');
    currentMap = m;
    ctx.imageSmoothingEnabled = false;
    for (let y = -1; y <= 9; y++) for (let x = -1; x <= 11; x++) {
      if (tileAt(cx + x, cy + y)) drawTile(cx + x, cy + y, x * TILE, y * TILE);
    }
    drawShapes(m, cx, cy);
    drawExitArrows(m, cx * TILE, cy * TILE);
    backgrounds.set(key, floor);
    if (backgrounds.size > MAX_BACKGROUND_CHUNKS) {
      const oldestKey = backgrounds.keys().next().value;
      const oldest = backgrounds.get(oldestKey);
      oldest.width = 0;
      oldest.height = 0;
      backgrounds.delete(oldestKey);
    }
    return floor;
  }
  function drawExitArrows(m, ox, oy) {
    const markedGroups = new Set((m.exits || []).filter(exit => exit.arrow).map(exit => exit.group));
    for (const exit of m.exits || []) {
      // 그룹에 arrow 표지가 있으면 대표 칸만 그린다. 표지 데이터가 없으면 위치로 방향을 정한다.
      if (exit.group != null && !exit.arrow && markedGroups.has(exit.group)) continue;
      const arrow = { east: 'right', west: 'left', north: 'up', south: 'down' }[exit.arrow] || exit.arrow;
      const direction = vectors[arrow] ? arrow : [['left', exit.x], ['right', m.width - 1 - exit.x], ['up', exit.y], ['down', m.height - 1 - exit.y]].sort((a, b) => a[1] - b[1])[0][0];
      const px = exit.x * TILE - ox,
        py = exit.y * TILE - oy;
      if (px < -TILE || px >= WIDTH || py < -TILE || py >= HEIGHT) continue;
      const dots = ['....#....', '...###...', '..#####..', '.#######.', '....#....', '....#....', '....#....', '....#....', '....#....'];
      const pixels = [];
      for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (dots[y][x] === '#') {
        const [xx, yy] = direction === 'down' ? [x, 8 - y] : direction === 'left' ? [y, x] : direction === 'right' ? [8 - y, x] : [x, y];
        pixels.push([px + 3 + xx, py + 3 + yy]);
      }
      for (const [x, y] of pixels) rect(x - 1, y - 1, 3, 3, PIX.outline);
      for (const [x, y] of pixels) rect(x, y, 1, 1, PIX.shine);
    }
  }
  function drawWorld(context, m, p, options = {}) {
    useMap(m);
    const k = p.moving ? p.t : 1;
    const px = ((p.fromX ?? p.x) + (p.x - (p.fromX ?? p.x)) * k) * TILE;
    const py = ((p.fromY ?? p.y) + (p.y - (p.fromY ?? p.y)) * k) * TILE;
    const camX = Math.round(Math.max(0, Math.min(px - 80, m.width * TILE - WIDTH)));
    const camY = Math.round(Math.max(0, Math.min(py - 64, m.height * TILE - HEIGHT)));
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, WIDTH, HEIGHT);
    for (let cy = Math.floor(camY / HEIGHT) * 9; cy * TILE < camY + HEIGHT; cy += 9) {
      for (let cx = Math.floor(camX / WIDTH) * 11; cx * TILE < camX + WIDTH; cx += 11) {
        context.drawImage(backgroundChunk(m, cx, cy), cx * TILE - camX, cy * TILE - camY);
      }
    }
    ctx = context;
    currentMap = m;
    for (const [i, n] of (m.npcs || []).entries()) {
      const x = n.x * TILE - camX,
        y = n.y * TILE - camY;
      if (x > -TILE && x < WIDTH && y > -TILE && y < HEIGHT) person(x, y, n.direction || 'down', false, n, i);
    }
    person(Math.round(px - camX), Math.round(py - camY), p.dir, true, null, 0, options.avatar, p.moving && p.t < .5 ? 1 : 0);
    if (options.night) {
      ctx.fillStyle = 'rgba(18, 26, 70, 0.45)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
    return {
      x: px - camX,
      y: py - camY
    };
  }
  function drawMini(context, m, x, y) {
    const c = context.canvas;
    if (c.width !== m.width || c.height !== m.height) {
      c.width = m.width;
      c.height = m.height;
    }
    context.imageSmoothingEnabled = false;
    if (!miniBackgrounds.has(m)) {
      const floor = canvas(m.width, m.height),
        mc = floor.getContext('2d');
      for (let yy = 0; yy < m.height; yy++) for (let xx = 0; xx < m.width; xx++) {
        mc.fillStyle = baseColor(m.rows[yy][xx]);
        mc.fillRect(xx, yy, 1, 1);
      }
      miniBackgrounds.set(m, floor);
    }
    context.drawImage(miniBackgrounds.get(m), 0, 0);
    const scale = (c.getBoundingClientRect?.().width || c.width) / c.width;
    const size = Math.max(2, Math.ceil(5 / scale));
    const left = Math.max(0, Math.min(m.width - size, x - Math.floor(size / 2)));
    const top = Math.max(0, Math.min(m.height - size, y - Math.floor(size / 2)));
    context.fillStyle = PIX.outline;
    context.fillRect(left - 1, top - 1, size + 2, size + 2);
    context.fillStyle = PIX.shine;
    context.fillRect(left, top, size, size);
  }
  function icon(name) {
    return `<svg class="q-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#q-${name}"/></svg>`;
  }
  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[ch]);
  }
  function ecoMap(overview, species, habitats, dex) {
    const list = id => species.filter(s => s.habitat === id);
    const count = (id, role) => list(id).filter(s => dex[s.id]?.done && (!role || s.role === role)).length;
    // mapdata의 학교 기준 '칸' 좌표에 맞춘다. 시안의 미터 좌표 배율을 그대로 쓰지 않는다.
    const scale = 1.5,
      ox = 20,
      oy = 168;
    const point = (p, id) => [(p[0] + (id === 'park' ? -110 : 0)) * scale + ox, (p[1] + (id === 'park' ? 90 : 0)) * scale + oy];
    const path = (points, id) => points.map((p, i) => (i ? 'L' : 'M') + point(p, id).map(n => n.toFixed(1)).join(' ')).join(' ');
    const colors = {
      forest: 'var(--green)',
      water: 'var(--water)',
      park: 'var(--hill)',
      school: 'var(--fence)',
      field: 'var(--grain)',
      building: 'var(--clay)',
      parking: 'var(--table)'
    };
    let art = '<svg class="eco-overview" viewBox="0 0 600 390" role="img" aria-label="학교 단지와 뒷산의 북동쪽에 저수지 생태공원이 있는 실제 지역 배치"><rect width="600" height="390" fill="var(--bg)"/>';
    for (const layer of ['park', 'forest', 'water', 'school', 'field', 'parking', 'roads', 'paths', 'gameTrail', 'building']) for (const m of overview.maps) for (const shape of m.layers[layer] || []) {
      if (shape.type === 'polygon') {
        const d = path(shape.outer, m.id) + 'Z ' + (shape.holes || []).map(h => path(h, m.id) + 'Z').join(' ');
        art += `<path d="${d}" fill="${layer === 'building' && m.id === 'school' ? 'var(--sky)' : colors[layer]}" fill-rule="evenodd" stroke="var(--outline)" stroke-width="${layer === 'building' ? 1 : .8}" stroke-linejoin="round"/>`;
        if (layer === 'field') art += `<path d="${d}" fill="none" stroke="var(--shine)" stroke-width="1.5" stroke-dasharray="4 3"/>`;
      } else {
        const d = path(shape.points, m.id),
          width = Math.max(layer === 'paths' || layer === 'gameTrail' ? 1.8 : 2.5, (shape.widthTiles || (shape.widthMeters || 4) / 4) * scale);
        art += `<path d="${d}" fill="none" stroke="var(--outline)" stroke-width="${width + 1.5}" stroke-linejoin="round" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${layer === 'water' ? 'var(--water)' : layer === 'roads' ? '#a6b3b0' : 'var(--fence)'}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
      }
    }
    art += '<path d="M303 213L343 111" fill="none" stroke="var(--outline)" stroke-width="2" stroke-dasharray="5 6"/></svg>';
    // 이름표는 SVG 축소 배율의 영향을 받지 않는 HTML로 겹친다.
    art = '<div class="eco-map-art">' + art;
    art += '<span class="eco-distance">주택가 약 1 km</span><span class="eco-north">' + icon('up') + '북쪽</span>';
    for (const id of ['campus', 'hill', 'park']) {
      art += `<div class="eco-label eco-label-${id}"><b>${escapeHTML(habitats[id].name)} · ${count(id)}/${list(id).length}</b><span>생산자 ${count(id, '생산자')} · 소비자 ${count(id, '소비자')} · 분해자 ${count(id, '분해자')}</span></div>`;
    }
    art += '</div>';
    // 생물별 지점·좌표는 만들지 않는다. 드문 생물도 서식지 단위로만 묶는다.
    art += Object.entries(habitats).map(([id, h]) => `<section class="eco-group"><div class="eco-group-head"><h3>${escapeHTML(h.name)}</h3><span>관찰 ${count(id)}/${list(id).length}</span></div><p class="muted">생산자 ${count(id, '생산자')} · 소비자 ${count(id, '소비자')} · 분해자 ${count(id, '분해자')}</p><div class="eco-grid">${list(id).map(s => {
      const r = dex[s.id],
        done = r?.done,
        seen = !!r,
        status = done ? '관찰 완료' : seen ? '관찰 전' : '아직 못 만남';
      return `<div class="eco-cell ${done ? 'done' : seen ? 'seen' : ''}">${done ? `<span class="eco-dot" style="background:${s.color}" aria-hidden="true"></span>` : ''}<span>${seen ? escapeHTML(s.name) : '?'}</span><small>${status}</small>${s.time === 'night' ? icon('moon') + '<span class="sr-only">밤</span>' : s.time === 'day' ? icon('sun') + '<span class="sr-only">낮</span>' : ''}</div>`;
    }).join('')}</div></section>`).join('');
    return art + `<section class="eco-regions"><h3>평택 탐사 지역</h3><ul><li>학교 단지·뒷산 <span>열림</span></li><li>저수지 생태공원 <span>열림</span></li>${['평택항 바닷가', '오성면 논', '부락산'].map(name => `<li>${icon('lock')}${name} <span>준비 중</span></li>`).join('')}</ul></section><p class="muted eco-credit">ⓒ OpenStreetMap 기여자 · 지도 배치는 OpenStreetMap 데이터(ODbL)를 옮겨 그렸다.</p>`;
  }
  const api = {
    drawWorld,
    drawMini,
    ecoMap,
    icon
  };
  root.QuestRender = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
