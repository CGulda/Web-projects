(() => {
const directions = [
  { name: 'north', dx: 0, dy: -1, bit: 1, opposite: 4, x: 0.5, y: 0 },
  { name: 'east', dx: 1, dy: 0, bit: 2, opposite: 8, x: 1, y: 0.5 },
  { name: 'south', dx: 0, dy: 1, bit: 4, opposite: 1, x: 0.5, y: 1 },
  { name: 'west', dx: -1, dy: 0, bit: 8, opposite: 2, x: 0, y: 0.5 }
];

const tiles = [
  { name: 'Straight', exits: ['north', 'south'] },
  { name: 'Dead end', exits: ['south'] },
  { name: 'Left turn', exits: ['south', 'west'] },
  { name: 'Right turn', exits: ['south', 'east'] },
  { name: 'Three-way', exits: ['north', 'east', 'west'] },
  { name: 'Crossroads', exits: ['north', 'east', 'south', 'west'] },
  { name: 'Empty', exits: [] }
];

function tileMask(tile) {
  return tile.exits.reduce((mask, exit) => mask | directions.find(direction => direction.name === exit).bit, 0);
}

const variants = [...new Set(tiles.flatMap(tile => {
  let mask = tileMask(tile);
  const rotations = [];
  for (let rotation = 0; rotation < 4; rotation++) {
    rotations.push(mask);
    mask = ((mask << 1) & 15) | (mask >> 3);
  }
  return rotations;
}))];

const triangleTiles = [
  { name: 'Empty', exits: [] },
  { name: 'Single', exits: ['base'] },
  { name: 'Turn', exits: ['base', 'left'] },
  { name: 'Three-way', exits: ['left', 'right', 'base'] }
];

const triangleDirections = [
  { name: 'left', bit: 1 },
  { name: 'right', bit: 2 },
  { name: 'base', bit: 4 }
];

const triangleVariants = [...new Set(triangleTiles.flatMap(tile => {
  let mask = tile.exits.reduce((value, exit) =>
    value | triangleDirections.find(direction => direction.name === exit).bit, 0);
  const rotations = [];
  for (let rotation = 0; rotation < 3; rotation++) {
    rotations.push(mask);
    mask = ((mask << 1) & 7) | (mask >> 2);
  }
  return rotations;
}))];

function roadPath(points, center, roundness) {
  if (points.length === 2 && roundness > 0) {
    const [first, last] = points;
    const ratio = roundness / 100;
    const near = point => [
      center[0] + (point[0] - center[0]) * ratio,
      center[1] + (point[1] - center[1]) * ratio
    ];
    const a = near(first);
    const b = near(last);
    return `M ${first[0]} ${first[1]} L ${a[0]} ${a[1]} Q ${center[0]} ${center[1]} ${b[0]} ${b[1]} L ${last[0]} ${last[1]}`;
  }
  return points.map(point => `M ${point[0]} ${point[1]} L ${center[0]} ${center[1]}`).join(' ');
}

function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hueNoise(seed, position) {
  const index = Math.floor(position);
  const fraction = position - index;
  const weight = fraction * fraction * (3 - 2 * fraction);
  const sample = point => point === 0 ? 0
    : randomGenerator((seed ^ Math.imul(point, 0x9e3779b9)) >>> 0)() * 2 - 1;
  return sample(index) * (1 - weight) + sample(index + 1) * weight;
}

function spatialHueNoise(seed, x, y) {
  const left = Math.floor(x);
  const top = Math.floor(y);
  const smooth = value => value * value * (3 - 2 * value);
  const u = smooth(x - left);
  const v = smooth(y - top);
  const sample = (column, row) => {
    let value = seed ^ Math.imul(column, 0x9e3779b9) ^ Math.imul(row, 0x85ebca6b);
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff * 2 - 1;
  };
  const upper = sample(left, top) * (1 - u) + sample(left + 1, top) * u;
  const lower = sample(left, top + 1) * (1 - u) + sample(left + 1, top + 1) * u;
  return upper * (1 - v) + lower * v;
}

const hexDirections = [
  { name: 'east', dq: 1, dr: 0, bit: 1, opposite: 8 },
  { name: 'south-east', dq: 0, dr: 1, bit: 2, opposite: 16 },
  { name: 'south-west', dq: -1, dr: 1, bit: 4, opposite: 32 },
  { name: 'west', dq: -1, dr: 0, bit: 8, opposite: 1 },
  { name: 'north-west', dq: 0, dr: -1, bit: 16, opposite: 2 },
  { name: 'north-east', dq: 1, dr: -1, bit: 32, opposite: 4 }
];

function rotateHex(mask) {
  return ((mask << 1) & 63) | (mask >> 5);
}

const hexTiles = [];
const hexSeen = new Set();
const hexCounts = new Map();
for (let mask = 0; mask < 64; mask++) {
  if (hexSeen.has(mask)) continue;
  let rotated = mask;
  for (let rotation = 0; rotation < 6; rotation++) {
    hexSeen.add(rotated);
    rotated = rotateHex(rotated);
  }
  const exits = hexDirections.filter(direction => mask & direction.bit).map(direction => direction.name);
  const ordinal = (hexCounts.get(exits.length) || 0) + 1;
  hexCounts.set(exits.length, ordinal);
  const name = exits.length > 1 && exits.length < 5
    ? `${exits.length} connections · ${ordinal}`
    : exits.length ? `${exits.length} connection${exits.length === 1 ? '' : 's'}` : 'Empty';
  hexTiles.push({ name, exits, mask });
}
hexTiles.sort((a, b) => a.exits.length - b.exits.length || a.mask - b.mask);
const hexVariants = [...hexSeen];

function gridSizeForCellSize(cellSize, shape, artworkSize = 800) {
  if (!Number.isInteger(cellSize) || cellSize < 12 || cellSize > 1024) {
    throw new Error('Cell size must be an integer from 12 to 1024 artwork pixels.');
  }
  if (!['square', 'triangle', 'hexagon'].includes(shape)) throw new Error('Choose a supported grid shape.');
  let size = Math.floor(artworkSize / cellSize);
  if (shape === 'triangle' && (size + size % 2) * Math.sqrt(3) / 2 * cellSize > artworkSize) size--;
  return size;
}

function gridDimensions(size, shape = 'square') {
  if (!Number.isInteger(size) || size < 4 || size > 100) {
    throw new Error('Grid size must be an integer from 4 to 100.');
  }
  if (shape === 'square') return { columns: size, rows: size };
  // Odd columns and even rows keep the triangular outline symmetric on both axes.
  if (shape === 'triangle') return { columns: size * 2 - 1, rows: size + size % 2 };
  if (shape === 'hexagon') {
    const radius = Math.floor((size - 1) / 2);
    const positions = [];
    const indexByCoordinate = new Map();
    for (let r = -radius; r <= radius; r++) {
      for (let q = Math.max(-radius, -r - radius); q <= Math.min(radius, -r + radius); q++) {
        indexByCoordinate.set(`${q},${r}`, positions.length);
        positions.push({ q, r });
      }
    }
    return { radius, positions, indexByCoordinate, count: positions.length };
  }
  throw new Error('Choose a supported grid shape.');
}

function viewportDimensions(width, height, cellSize, shape, symmetry = 'random') {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Artwork dimensions must be positive.');
  }
  if (!Number.isInteger(cellSize) || cellSize < 12 || cellSize > 1024) {
    throw new Error('Cell size must be an integer from 12 to 1024 pixels.');
  }
  if (shape === 'square') {
    const columns = Math.ceil(width / cellSize);
    const rows = Math.ceil(height / cellSize);
    return { shape, columns, rows, count: columns * rows };
  }
  if (shape === 'triangle') {
    const triangleHeight = cellSize * Math.sqrt(3) / 2;
    let columns = Math.ceil((width + 2 * cellSize) * 2 / cellSize) - 1;
    if (columns % 2 === 0) columns++;
    let rows = Math.ceil(height / triangleHeight) + 2;
    if (rows % 2 !== 0) rows++;
    return { shape, columns, rows, count: columns * rows };
  }
  if (shape === 'hexagon') {
    const rowHeight = cellSize * Math.sqrt(3) / 2;
    if (symmetry === 'hexagonal') {
      const radius = Math.ceil(Math.max(
        width / (2 * cellSize) + height / (4 * rowHeight),
        height / (2 * rowHeight)
      )) + 2;
      const positions = [];
      const indexByCoordinate = new Map();
      for (let r = -radius; r <= radius; r++) {
        for (let q = Math.max(-radius, -r - radius); q <= Math.min(radius, -r + radius); q++) {
          indexByCoordinate.set(`${q},${r}`, positions.length);
          positions.push({ q, r });
        }
      }
      return { shape, radius, positions, indexByCoordinate, count: positions.length };
    }
    const rowRadius = Math.ceil(height / (2 * rowHeight)) + 2;
    const columnRadius = Math.ceil(width / (2 * cellSize)) + 2;
    const positions = [];
    const indexByCoordinate = new Map();
    for (let r = -rowRadius; r <= rowRadius; r++) {
      for (let q = Math.ceil(-columnRadius - r / 2); q <= Math.floor(columnRadius - r / 2); q++) {
        indexByCoordinate.set(`${q},${r}`, positions.length);
        positions.push({ q, r });
      }
    }
    return { shape, positions, indexByCoordinate, count: positions.length };
  }
  throw new Error('Choose a supported grid shape.');
}

function neighbors(index, dimensions, shape = 'square') {
  if (shape === 'hexagon') {
    const { q, r } = dimensions.positions[index];
    return hexDirections.flatMap(direction => {
      const neighbor = dimensions.indexByCoordinate.get(`${q + direction.dq},${r + direction.dr}`);
      return neighbor === undefined ? [] : [{ index: neighbor, direction }];
    });
  }
  const { columns, rows } = dimensions;
  const x = index % columns;
  const y = Math.floor(index / columns);
  const edges = shape === 'triangle'
    ? [
      { dx: -1, dy: 0, bit: 1, opposite: 2 },
      { dx: 1, dy: 0, bit: 2, opposite: 1 },
      { dx: 0, dy: (x + y) % 2 === 0 ? 1 : -1, bit: 4, opposite: 4 }
    ]
    : directions;
  return edges.flatMap(direction => {
    const nextX = x + direction.dx;
    const nextY = y + direction.dy;
    return nextX >= 0 && nextX < columns && nextY >= 0 && nextY < rows
      ? [{ index: nextY * columns + nextX, direction }]
      : [];
  });
}

function createHueLimiter(dimensions, shape, limit) {
  if (!Number.isFinite(limit) || limit < 0) throw new Error('Hue limit must be non-negative.');
  const cellGroups = new Int32Array(dimensions.count);
  cellGroups.fill(-1);
  const groups = [];
  return {
    addGroup(indices, target) {
      const id = groups.length;
      const adjacent = new Set();
      for (const index of indices) cellGroups[index] = id;
      for (const index of indices) {
        for (const neighbor of neighbors(index, dimensions, shape)) {
          const other = cellGroups[neighbor.index];
          if (other >= 0 && other !== id) adjacent.add(other);
        }
      }
      let lower = -Infinity;
      let upper = Infinity;
      for (const other of adjacent) {
        lower = Math.max(lower, groups[other].value - limit);
        upper = Math.min(upper, groups[other].value + limit);
      }
      const value = lower <= upper
        ? Math.max(lower, Math.min(upper, target))
        : (lower + upper) / 2;
      groups.push({ value, adjacent });
      for (const other of adjacent) groups[other].adjacent.add(id);

      const queue = [id];
      const queued = new Set(queue);
      let changedPrevious = false;
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const current = queue[cursor];
        queued.delete(current);
        const currentValue = groups[current].value;
        for (const other of groups[current].adjacent) {
          const prior = groups[other].value;
          const next = Math.max(currentValue - limit, Math.min(currentValue + limit, prior));
          if (next === prior) continue;
          groups[other].value = next;
          if (other !== id) changedPrevious = true;
          if (!queued.has(other)) {
            queue.push(other);
            queued.add(other);
          }
        }
      }
      return changedPrevious;
    },
    valueForCell(index) {
      return groups[cellGroups[index]].value;
    }
  };
}

function choose(items, random) {
  return items[Math.floor(random() * items.length)];
}

function reflectMask(mask, flipX, flipY, shape, rotation = 0) {
  if (shape === 'hexagon') {
    let result = 0;
    for (let edge = 0; edge < 6; edge++) {
      if (!(mask & (1 << edge))) continue;
      let reflected = edge;
      if (flipX) reflected = (3 - reflected + 6) % 6;
      if (flipY) reflected = (6 - reflected) % 6;
      result |= 1 << reflected;
    }
    for (let turn = 0; turn < rotation; turn++) result = rotateHex(result);
    return result;
  }
  if (shape === 'triangle') {
    return flipX ? (mask & 4) | ((mask & 1) << 1) | ((mask & 2) >> 1) : mask;
  }
  if (flipX) mask = (mask & 5) | ((mask & 2) << 2) | ((mask & 8) >> 2);
  if (flipY) mask = (mask & 10) | ((mask & 1) << 2) | ((mask & 4) >> 2);
  return mask;
}

function reflections(index, dimensions, symmetry, shape) {
  if (shape === 'hexagon') {
    const { q, r } = dimensions.positions[index];
    const find = (nextQ, nextR) => dimensions.indexByCoordinate.get(`${nextQ},${nextR}`);
    if (symmetry === 'hexagonal') {
      const result = [];
      for (const flipX of [false, true]) {
        let nextQ = flipX ? -q - r : q;
        let nextR = r;
        for (let rotation = 0; rotation < 6; rotation++) {
          const member = find(nextQ, nextR);
          if (member === undefined) throw new Error('Hexagonal symmetry requires a rotation-complete grid.');
          result.push({ index: member, flipX, flipY: false, rotation });
          [nextQ, nextR] = [-nextR, nextQ + nextR];
        }
      }
      return result;
    }
    const result = [{ index, flipX: false, flipY: false }];
    if (symmetry !== 'random') result.push({ index: find(-q - r, r), flipX: true, flipY: false });
    if (symmetry === 'symmetric') {
      result.push({ index: find(q + r, -r), flipX: false, flipY: true });
      result.push({ index: find(-q, -r), flipX: true, flipY: true });
    }
    return result;
  }
  const { columns, rows } = dimensions;
  const x = index % columns;
  const y = Math.floor(index / columns);
  const result = [{ index, flipX: false, flipY: false }];
  if (symmetry !== 'random') {
    result.push({ index: y * columns + columns - 1 - x, flipX: true, flipY: false });
  }
  if (symmetry === 'symmetric') {
    result.push({ index: (rows - 1 - y) * columns + x, flipX: false, flipY: true });
    result.push({ index: (rows - 1 - y) * columns + columns - 1 - x, flipX: true, flipY: true });
  }
  return result;
}

function propagate(cells, dimensions, symmetry, shape, queue) {
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const sourceIndex = queue[cursor];
    const source = cells[sourceIndex];
    for (const neighbor of neighbors(sourceIndex, dimensions, shape)) {
      const target = cells[neighbor.index];
      const allowsOpen = source.options.some(option => option & neighbor.direction.bit);
      const allowsClosed = source.options.some(option => !(option & neighbor.direction.bit));
      const compatible = target.options.filter(option =>
        option & neighbor.direction.opposite ? allowsOpen : allowsClosed
      );
      if (!compatible.length) throw new Error('No compatible road tile remains.');
      if (compatible.length !== target.options.length) {
        target.options = compatible;
        queue.push(neighbor.index);
      }
    }
    for (const reflection of reflections(sourceIndex, dimensions, symmetry, shape)) {
      if (reflection.index === sourceIndex) continue;
      const target = cells[reflection.index];
      const allowed = new Set(source.options.map(mask => reflectMask(mask, reflection.flipX, reflection.flipY, shape, reflection.rotation)));
      const compatible = target.options.filter(mask => allowed.has(mask));
      if (!compatible.length) throw new Error('No symmetric road tile remains.');
      if (compatible.length !== target.options.length) {
        target.options = compatible;
        queue.push(reflection.index);
      }
    }
  }
}

function reflectedGroup(index, mask, cells, dimensions, symmetry, shape) {
  const group = new Map();
  for (const reflection of reflections(index, dimensions, symmetry, shape)) {
    const reflected = reflectMask(mask, reflection.flipX, reflection.flipY, shape, reflection.rotation);
    if ((group.has(reflection.index) && group.get(reflection.index) !== reflected) ||
        !cells[reflection.index].options.includes(reflected)) return null;
    group.set(reflection.index, reflected);
  }
  for (const [member, memberMask] of group) {
    for (const neighbor of neighbors(member, dimensions, shape)) {
      const possible = group.has(neighbor.index)
        ? [group.get(neighbor.index)]
        : cells[neighbor.index].options;
      if (!possible.some(option =>
        Boolean(memberMask & neighbor.direction.bit) === Boolean(option & neighbor.direction.opposite)
      )) return null;
    }
  }
  return group;
}

function* generateSteps(size, random = Math.random, symmetry = 'random', shape = 'square') {
  yield* generateDimensionSteps(gridDimensions(size, shape), random, symmetry, shape);
}

function* generateViewportSteps(dimensions, random = Math.random, symmetry = 'random') {
  yield* generateDimensionSteps(dimensions, random, symmetry, dimensions.shape);
}

function* generateDimensionSteps(dimensions, random, symmetry, shape) {
  const { columns, rows } = dimensions;
  const tileVariants = shape === 'triangle' ? triangleVariants : shape === 'hexagon' ? hexVariants : variants;
  if (!['random', 'mirror', 'symmetric', 'hexagonal'].includes(symmetry) ||
      (symmetry === 'hexagonal' && shape !== 'hexagon')) {
    throw new Error('Choose a supported symmetry mode.');
  }

  const cellCount = shape === 'hexagon' ? dimensions.count : columns * rows;
  const cells = Array.from({ length: cellCount }, (_, index) => {
    const fixed = reflections(index, dimensions, symmetry, shape).filter(reflection => reflection.index === index);
    return {
      options: tileVariants.filter(mask => fixed.every(reflection =>
        reflectMask(mask, reflection.flipX, reflection.flipY, shape, reflection.rotation) === mask
      )),
      collapsed: false
    };
  });
  const constrained = cells.flatMap((cell, index) => cell.options.length < tileVariants.length ? [index] : []);
  propagate(cells, dimensions, symmetry, shape, constrained);
  const frontier = new Set();
  let current = symmetry === 'random'
    ? Math.floor(random() * cells.length)
    : shape === 'hexagon'
      ? dimensions.indexByCoordinate.get('0,0')
      : Math.floor(rows / 2) * columns + Math.floor(columns / 2);
  let count = 0;

  while (count < cells.length) {
    const cell = cells[current];
    const groups = cell.options.map(mask => reflectedGroup(current, mask, cells, dimensions, symmetry, shape)).filter(Boolean);
    if (!groups.length) throw new Error('No compatible symmetric tile remains.');
    const group = choose(groups, random);
    const updates = [];
    for (const [index, mask] of group) {
      cells[index].options = [mask];
      cells[index].collapsed = true;
      frontier.delete(index);
      updates.push({ index, mask });
    }
    count += updates.length;
    propagate(cells, dimensions, symmetry, shape, updates.map(update => update.index));
    yield updates;

    const adjacent = updates.flatMap(update => neighbors(update.index, dimensions, shape))
      .map(neighbor => neighbor.index)
      .filter(index => !cells[index].collapsed);
    adjacent.forEach(index => frontier.add(index));
    if (count < cells.length) {
      const choices = adjacent.length ? adjacent : [...frontier];
      if (!choices.length) throw new Error('Could not reach the remaining grid cells.');
      current = choose(choices, random);
    }
  }
}

function generateGrid(size, random = Math.random, symmetry = 'random', shape = 'square') {
  const result = [];
  for (const updates of generateSteps(size, random, symmetry, shape)) {
    for (const { index, mask } of updates) result[index] = mask;
  }
  return result;
}

globalThis.AhramanWFC = {
  directions, tiles, tileMask, variants, triangleTiles, triangleDirections, triangleVariants,
  roadPath, randomGenerator, hueNoise, spatialHueNoise, hexDirections, hexTiles, hexVariants, gridSizeForCellSize,
  gridDimensions, viewportDimensions, neighbors, createHueLimiter, generateSteps, generateViewportSteps, generateGrid
};
})();
