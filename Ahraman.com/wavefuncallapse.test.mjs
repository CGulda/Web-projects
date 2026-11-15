import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { generateGrid, generateSteps, generateViewportSteps, gridDimensions, gridSizeForCellSize, hexTiles, hexVariants, neighbors, randomGenerator, roadPath, triangleTiles, triangleVariants, variants, viewportDimensions } from './wavefuncallapse.mjs';
import './artwork.js';

function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

test('the algorithm also runs as a standalone browser script', () => {
  const context = {};
  runInNewContext(readFileSync(new URL('./wavefuncallapse.js', import.meta.url), 'utf8'), context);
  const standalone = context.AhramanWFC;
  assert.deepEqual(
    Array.from(standalone.generateGrid(8, standalone.randomGenerator(42), 'symmetric', 'hexagon')),
    generateGrid(8, randomGenerator(42), 'symmetric', 'hexagon')
  );
});

test('rotated tiles cover every combination of open and closed edges', () => {
  assert.deepEqual([...variants].sort((a, b) => a - b), Array.from({ length: 16 }, (_, index) => index));
});

test('a seed reproduces the same grid for each shape and symmetry', () => {
  for (const shape of ['square', 'triangle', 'hexagon']) {
    for (const symmetry of ['random', 'mirror', 'symmetric']) {
      const first = generateGrid(8, randomGenerator(12345), symmetry, shape);
      assert.deepEqual(generateGrid(8, randomGenerator(12345), symmetry, shape), first);
      assert.notDeepEqual(generateGrid(8, randomGenerator(12346), symmetry, shape), first);
    }
  }
});

test('hexagonal kaleidoscope preserves rotation, reflection, and matching edges', () => {
  for (const [width, height] of [[320, 800], [1200, 360]]) {
    const dimensions = viewportDimensions(width, height, 42, 'hexagon', 'hexagonal');
    const cells = Array(dimensions.count).fill(null);
    for (const updates of generateViewportSteps(dimensions, randomGenerator(42), 'hexagonal')) {
      const group = new Map(updates.map(({ index, mask }) => [index, mask]));
      for (const { index, mask } of updates) {
        const { q, r } = dimensions.positions[index];
        const rotated = dimensions.indexByCoordinate.get(`${-r},${q + r}`);
        assert.equal(group.get(rotated), ((mask << 1) & 63) | (mask >> 5));
      }
      for (const { index, mask } of updates) cells[index] = mask;
    }
    assert.ok(cells.every(mask => mask !== null));
    for (const x of [0, width]) {
      for (const y of [0, height]) {
        assert.ok(dimensions.positions.some(({ q, r }) => {
          const dx = Math.abs(x - width / 2 - 42 * (q + r / 2));
          const dy = Math.abs(y - height / 2 - 42 * Math.sqrt(3) / 2 * r);
          return dx <= 21 + 1e-8 && dy <= (42 - dx) / Math.sqrt(3) + 1e-8;
        }));
      }
    }
    for (let index = 0; index < cells.length; index++) {
      const { q, r } = dimensions.positions[index];
      const mask = cells[index];
      const rotated = dimensions.indexByCoordinate.get(`${-r},${q + r}`);
      const mirrored = dimensions.indexByCoordinate.get(`${-q - r},${r}`);
      assert.equal(cells[rotated], ((mask << 1) & 63) | (mask >> 5));
      let reflected = 0;
      for (let edge = 0; edge < 6; edge++) {
        if (mask & (1 << edge)) reflected |= 1 << ((3 - edge + 6) % 6);
      }
      assert.equal(cells[mirrored], reflected);
      for (const neighbor of neighbors(index, dimensions, 'hexagon')) {
        assert.equal(Boolean(mask & neighbor.direction.bit),
          Boolean(cells[neighbor.index] & neighbor.direction.opposite));
      }
    }
  }
  assert.throws(() => [...generateViewportSteps(
    viewportDimensions(100, 100, 42, 'square'), randomGenerator(1), 'hexagonal'
  )], /symmetry/);
});

test('viewport grids cover wide and tall artwork while preserving connections and symmetry', () => {
  const reflectHex = (mask, vertical) => {
    let result = 0;
    for (let edge = 0; edge < 6; edge++) {
      if (mask & (1 << edge)) result |= 1 << (vertical ? (3 - edge + 6) % 6 : (6 - edge) % 6);
    }
    return result;
  };
  for (const [width, height] of [[320, 750], [1232, 800], [720, 720]]) {
    for (const shape of ['square', 'triangle', 'hexagon']) {
      const step = 72;
      const dimensions = viewportDimensions(width, height, step, shape);
      if (shape === 'square') {
        assert.ok(dimensions.columns * step >= width);
        assert.ok(dimensions.rows * step >= height);
      } else if (shape === 'triangle') {
        assert.ok((dimensions.columns + 1) * step / 2 >= width + step);
        assert.ok(dimensions.rows * step * Math.sqrt(3) / 2 >= height + step);
        assert.equal(dimensions.columns % 2, 1);
        assert.equal(dimensions.rows % 2, 0);
        const triangleHeight = step * Math.sqrt(3) / 2;
        const offsetX = (width - step * (dimensions.columns + 1) / 2) / 2;
        const offsetY = (height - dimensions.rows * triangleHeight) / 2;
        for (let x = 0; x <= width; x += width / 10) {
          for (let y = 0; y <= height; y += height / 10) {
            let covered = false;
            for (let row = 0; row < dimensions.rows && !covered; row++) {
              for (let column = 0; column < dimensions.columns && !covered; column++) {
                const left = offsetX + column * step / 2;
                const top = offsetY + row * triangleHeight;
                const up = (column + row) % 2 === 0;
                const vertices = [
                  [left, top + (up ? triangleHeight : 0)],
                  [left + step / 2, top + (up ? 0 : triangleHeight)],
                  [left + step, top + (up ? triangleHeight : 0)]
                ];
                const crosses = vertices.map((point, index) => {
                  const next = vertices[(index + 1) % 3];
                  return (next[0] - point[0]) * (y - point[1]) - (next[1] - point[1]) * (x - point[0]);
                });
                covered = crosses.every(value => value >= -1e-8) || crosses.every(value => value <= 1e-8);
              }
            }
            assert.ok(covered, `Triangle grid does not cover ${x}, ${y}`);
          }
        }
      } else {
        for (let x = 0; x <= width; x += width / 10) {
          for (let y = 0; y <= height; y += height / 10) {
            assert.ok(dimensions.positions.some(({ q, r }) => {
              const dx = Math.abs(x - width / 2 - step * (q + r / 2));
              const dy = Math.abs(y - height / 2 - step * Math.sqrt(3) / 2 * r);
              return dx <= step / 2 + 1e-8 && dy <= (step - dx) / Math.sqrt(3) + 1e-8;
            }));
          }
        }
      }
      for (const symmetry of ['random', 'mirror', 'symmetric']) {
        const cells = [];
        for (const updates of generateViewportSteps(dimensions, randomGenerator(42), symmetry)) {
          for (const { index, mask } of updates) cells[index] = mask;
        }
        assert.equal(cells.length, dimensions.count);
        for (let index = 0; index < cells.length; index++) {
          for (const neighbor of neighbors(index, dimensions, shape)) {
            assert.equal(Boolean(cells[index] & neighbor.direction.bit),
              Boolean(cells[neighbor.index] & neighbor.direction.opposite));
          }
          if (symmetry !== 'random' && shape === 'hexagon') {
            const { q, r } = dimensions.positions[index];
            const mirrored = dimensions.indexByCoordinate.get(`${-q - r},${r}`);
            assert.notEqual(mirrored, undefined);
            assert.equal(cells[mirrored], reflectHex(cells[index], true));
            if (symmetry === 'symmetric') {
              const horizontal = dimensions.indexByCoordinate.get(`${q + r},${-r}`);
              assert.notEqual(horizontal, undefined);
              assert.equal(cells[horizontal], reflectHex(cells[index], false));
            }
          } else if (symmetry !== 'random') {
            const x = index % dimensions.columns;
            const y = Math.floor(index / dimensions.columns);
            const flipX = shape === 'triangle'
              ? (cells[index] & 4) | ((cells[index] & 1) << 1) | ((cells[index] & 2) >> 1)
              : (cells[index] & 5) | ((cells[index] & 2) << 2) | ((cells[index] & 8) >> 2);
            assert.equal(cells[y * dimensions.columns + dimensions.columns - 1 - x], flipX);
            if (symmetry === 'symmetric') {
              const flipY = shape === 'triangle' ? cells[index]
                : (cells[index] & 10) | ((cells[index] & 1) << 2) | ((cells[index] & 4) >> 2);
              assert.equal(cells[(dimensions.rows - 1 - y) * dimensions.columns + x], flipY);
            }
          }
        }
      }
    }
  }
});

test('generated grids are complete and all neighboring edges match', () => {
  for (const size of [4, 16, 32, 100]) {
    for (const seed of [1, 2, 42, 1000]) {
      const cells = generateGrid(size, seededRandom(seed));
      assert.equal(cells.length, size * size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const index = y * size + x;
          assert.ok(variants.includes(cells[index]));
          if (x + 1 < size) {
            assert.equal(Boolean(cells[index] & 2), Boolean(cells[index + 1] & 8));
          }
          if (y + 1 < size) {
            assert.equal(Boolean(cells[index] & 4), Boolean(cells[index + size] & 1));
          }
        }
      }
    }
  }
});

test('rejects invalid grid sizes', () => {
  for (const size of [3, 101, 4.5]) {
    assert.throws(() => generateGrid(size), /Grid size/);
  }
  assert.throws(() => generateGrid(4, Math.random, 'unknown'), /symmetry/);
  assert.throws(() => generateGrid(4, Math.random, 'random', 'unknown'), /grid shape/);
});

test('each animated step preserves symmetry across the filled cells', () => {
  const flipX = mask => (mask & 5) | ((mask & 2) << 2) | ((mask & 8) >> 2);
  const flipY = mask => (mask & 10) | ((mask & 1) << 2) | ((mask & 4) >> 2);
  for (const mode of ['mirror', 'symmetric']) {
    for (const size of [8, 9]) {
      const cells = Array(size * size).fill(null);
      for (const updates of generateSteps(size, seededRandom(42), mode)) {
        for (const { index, mask } of updates) {
          assert.equal(cells[index], null);
          cells[index] = mask;
        }
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const mask = cells[y * size + x];
            if (mask === null) continue;
            assert.equal(cells[y * size + size - 1 - x], flipX(mask));
            if (mode === 'symmetric') assert.equal(cells[(size - 1 - y) * size + x], flipY(mask));
          }
        }
      }
      assert.ok(cells.every(mask => mask !== null));
    }
  }
});

test('mirror modes start at the center and preserve reflected connections', () => {
  const flipX = mask => (mask & 5) | ((mask & 2) << 2) | ((mask & 8) >> 2);
  const flipY = mask => (mask & 10) | ((mask & 1) << 2) | ((mask & 4) >> 2);
  for (const mode of ['mirror', 'symmetric']) {
    for (const size of [4, 5, 16, 17, 100]) {
      for (const seed of [1, 42, 1000]) {
        const iterator = generateSteps(size, seededRandom(seed), mode);
        const first = iterator.next().value;
        const center = Math.floor(size / 2) * size + Math.floor(size / 2);
        assert.ok(first.some(update => update.index === center));
        const cells = [];
        for (const { index, mask } of first) cells[index] = mask;
        for (const updates of iterator) for (const { index, mask } of updates) cells[index] = mask;
        assert.equal(cells.length, size * size);
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const i = y * size + x;
            assert.ok(variants.includes(cells[i]));
            assert.equal(cells[y * size + size - 1 - x], flipX(cells[i]));
            if (mode === 'symmetric') assert.equal(cells[(size - 1 - y) * size + x], flipY(cells[i]));
            if (x + 1 < size) assert.equal(Boolean(cells[i] & 2), Boolean(cells[i + 1] & 8));
            if (y + 1 < size) assert.equal(Boolean(cells[i] & 4), Boolean(cells[i + size] & 1));
          }
        }
      }
    }
  }
});

test('triangle tiles rotate to all three-edge combinations', () => {
  assert.equal(triangleTiles.filter(tile => tile.exits.length === 2).length, 1);
  assert.deepEqual([...triangleVariants].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('road roundness curves two-exit turns without moving their endpoints', () => {
  const points = [[0, 5], [5, 0]];
  const center = [5, 5];
  assert.equal(roadPath(points, center, 0), 'M 0 5 L 5 5 M 5 0 L 5 5');
  assert.equal(roadPath(points, center, 50), 'M 0 5 L 2.5 5 Q 5 5 5 2.5 L 5 0');
  assert.equal(roadPath(points, center, 100), 'M 0 5 L 0 5 Q 5 5 5 0 L 5 0');
  assert.ok(!roadPath([...points, [10, 5]], center, 100).includes(' Q '));
});

test('triangle neighbors share the same geometric edge midpoint', () => {
  const dimensions = gridDimensions(5, 'triangle');
  const midpoint = (index, bit) => {
    const x = index % dimensions.columns;
    const y = Math.floor(index / dimensions.columns);
    if (bit === 1) return [x / 2 + 0.25, y + 0.5];
    if (bit === 2) return [x / 2 + 0.75, y + 0.5];
    return [x / 2 + 0.5, y + ((x + y) % 2 === 0 ? 1 : 0)];
  };
  for (let index = 0; index < dimensions.columns * dimensions.rows; index++) {
    for (const neighbor of neighbors(index, dimensions, 'triangle')) {
      assert.deepEqual(midpoint(index, neighbor.direction.bit), midpoint(neighbor.index, neighbor.direction.opposite));
      assert.ok(neighbors(neighbor.index, dimensions, 'triangle').some(back => back.index === index));
    }
  }
});

test('triangle grids fill completely with matching edges and requested symmetry', () => {
  const flipX = mask => (mask & 4) | ((mask & 1) << 1) | ((mask & 2) >> 1);
  for (const size of [4, 5, 16, 17, 100]) {
    const dimensions = gridDimensions(size, 'triangle');
    const { columns, rows } = dimensions;
    for (const symmetry of ['random', 'mirror', 'symmetric']) {
      for (const seed of [1, 42]) {
        const cells = generateGrid(size, seededRandom(seed), symmetry, 'triangle');
        assert.equal(cells.length, columns * rows);
        for (let i = 0; i < cells.length; i++) {
          assert.ok(triangleVariants.includes(cells[i]));
          for (const neighbor of neighbors(i, dimensions, 'triangle')) {
            assert.equal(Boolean(cells[i] & neighbor.direction.bit), Boolean(cells[neighbor.index] & neighbor.direction.opposite));
          }
          const x = i % columns;
          const y = Math.floor(i / columns);
          if (symmetry !== 'random') assert.equal(cells[y * columns + columns - 1 - x], flipX(cells[i]));
          if (symmetry === 'symmetric') assert.equal(cells[(rows - 1 - y) * columns + x], cells[i]);
        }
      }
    }
  }
});

test('animated triangle steps keep reflected tiles and filled edges consistent', () => {
  const flipX = mask => (mask & 4) | ((mask & 1) << 1) | ((mask & 2) >> 1);
  for (const size of [4, 5]) {
    const dimensions = gridDimensions(size, 'triangle');
    const { columns, rows } = dimensions;
    for (const symmetry of ['mirror', 'symmetric']) {
      const cells = Array(columns * rows).fill(null);
      let first = true;
      for (const updates of generateSteps(size, seededRandom(42), symmetry, 'triangle')) {
        if (first) {
          assert.ok(updates.some(update =>
            update.index === Math.floor(rows / 2) * columns + Math.floor(columns / 2)
          ));
          first = false;
        }
        for (const { index, mask } of updates) {
          assert.equal(cells[index], null);
          cells[index] = mask;
        }
        for (let index = 0; index < cells.length; index++) {
          if (cells[index] === null) continue;
          const x = index % columns;
          const y = Math.floor(index / columns);
          assert.equal(cells[y * columns + columns - 1 - x], flipX(cells[index]));
          if (symmetry === 'symmetric') assert.equal(cells[(rows - 1 - y) * columns + x], cells[index]);
          for (const neighbor of neighbors(index, dimensions, 'triangle')) {
            if (cells[neighbor.index] !== null) {
              assert.equal(Boolean(cells[index] & neighbor.direction.bit),
                Boolean(cells[neighbor.index] & neighbor.direction.opposite));
            }
          }
        }
      }
      assert.ok(cells.every(mask => mask !== null));
    }
  }
});

test('cell size selects the number of cells that fit the artwork', () => {
  for (const shape of ['square', 'triangle', 'hexagon']) {
    assert.equal(gridSizeForCellSize(50, shape), 16);
    assert.equal(gridSizeForCellSize(12, shape), 66);
    assert.equal(gridSizeForCellSize(72, shape), 11);
    assert.throws(() => gridSizeForCellSize(11, shape), /Cell size/);
    assert.throws(() => gridSizeForCellSize(73, shape), /Cell size/);
    assert.throws(() => viewportDimensions(800, 600, 11, shape), /Cell size/);
    assert.throws(() => viewportDimensions(800, 600, 73, shape), /Cell size/);
  }
});

test('print presets and current page use their intended pixel dimensions', () => {
  const { pageDimensions } = globalThis.AhramanArtwork;
  assert.deepEqual(pageDimensions('A4'), { width: 2480, height: 3508, dpi: 300 });
  assert.deepEqual(pageDimensions('A5'), { width: 1748, height: 2480, dpi: 300 });
  assert.deepEqual(pageDimensions('FHD'), { width: 1920, height: 1080 });
  assert.deepEqual(pageDimensions('4K'), { width: 3840, height: 2160 });
  assert.deepEqual(pageDimensions('current', {
    getBoundingClientRect: () => ({ width: 375.2, height: 700.8 })
  }), { width: 375, height: 701 });
  assert.throws(() => pageDimensions('unknown'), /page size/);
});

test('PNG print metadata is inserted and replaced at 300 DPI', async () => {
  const { pngWithDpi } = globalThis.AhramanArtwork;
  const input = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lX4AAAAASUVORK5CYII=', 'base64');
  const first = new Uint8Array(await pngWithDpi(input, 300).arrayBuffer());
  const second = new Uint8Array(await pngWithDpi(first, 300).arrayBuffer());
  assert.deepEqual(second, first);
  const view = new DataView(first.buffer);
  assert.equal(Buffer.from(first.subarray(37, 41)).toString(), 'pHYs');
  assert.equal(view.getUint32(41), 11811);
  assert.equal(view.getUint32(45), 11811);
  assert.equal(first[49], 1);
  assert.throws(() => pngWithDpi(new Uint8Array([0]), 300), /PNG/);
  assert.throws(() => pngWithDpi(first.subarray(0, first.length - 12), 300), /PNG/);
});

test('all supported cell sizes fit their shapes within the artwork', () => {
  for (let cellSize = 12; cellSize <= 72; cellSize++) {
    const squareSize = gridSizeForCellSize(cellSize, 'square');
    assert.ok(squareSize * cellSize <= 800);
    assert.ok((squareSize + 1) * cellSize > 800);
    const triangleSize = gridSizeForCellSize(cellSize, 'triangle');
    const triangle = gridDimensions(triangleSize, 'triangle');
    assert.ok(triangleSize * cellSize <= 800);
    assert.ok(triangle.rows * Math.sqrt(3) / 2 * cellSize <= 800);
    const hex = gridDimensions(gridSizeForCellSize(cellSize, 'hexagon'), 'hexagon');
    assert.ok((2 * hex.radius + 1) * cellSize <= 800);
    assert.ok((3 * hex.radius + 2) * cellSize / Math.sqrt(3) <= 800);
  }
});

test('hex tiles cover every possible six-edge connection', () => {
  assert.equal(hexTiles.length, 14);
  assert.deepEqual([...hexVariants].sort((a, b) => a - b), Array.from({ length: 64 }, (_, i) => i));
});

test('hex neighbor connectors meet at the same edge midpoint', () => {
  const dimensions = gridDimensions(8, 'hexagon');
  for (let index = 0; index < dimensions.count; index++) {
    const { q, r } = dimensions.positions[index];
    const x = q + r / 2;
    const y = r * Math.sqrt(3) / 2;
    for (const neighbor of neighbors(index, dimensions, 'hexagon')) {
      const next = dimensions.positions[neighbor.index];
      const angle = Math.log2(neighbor.direction.bit) * Math.PI / 3;
      const opposite = Math.log2(neighbor.direction.opposite) * Math.PI / 3;
      assert.ok(Math.abs(x + Math.cos(angle) / 2 - (next.q + next.r / 2 + Math.cos(opposite) / 2)) < 1e-10);
      assert.ok(Math.abs(y + Math.sin(angle) / 2 - (next.r * Math.sqrt(3) / 2 + Math.sin(opposite) / 2)) < 1e-10);
    }
  }
});

test('hex grids have matching edges and preserve both reflection axes', () => {
  const reflect = (mask, vertical) => {
    let result = 0;
    for (let edge = 0; edge < 6; edge++) {
      if (mask & (1 << edge)) result |= 1 << (vertical ? (3 - edge + 6) % 6 : (6 - edge) % 6);
    }
    return result;
  };
  for (const size of [4, 5, 16, 25, 100]) {
    const dimensions = gridDimensions(size, 'hexagon');
    for (const mode of ['random', 'mirror', 'symmetric']) {
      for (const seed of [1, 42]) {
        const cells = generateGrid(size, seededRandom(seed), mode, 'hexagon');
        assert.equal(cells.length, dimensions.count);
        for (let index = 0; index < cells.length; index++) {
          assert.ok(hexVariants.includes(cells[index]));
          const { q, r } = dimensions.positions[index];
          for (const neighbor of neighbors(index, dimensions, 'hexagon')) {
            assert.equal(Boolean(cells[index] & neighbor.direction.bit),
              Boolean(cells[neighbor.index] & neighbor.direction.opposite));
            assert.ok(neighbors(neighbor.index, dimensions, 'hexagon').some(back => back.index === index));
          }
          if (mode !== 'random') {
            assert.equal(cells[dimensions.indexByCoordinate.get(`${-q - r},${r}`)], reflect(cells[index], true));
          }
          if (mode === 'symmetric') {
            assert.equal(cells[dimensions.indexByCoordinate.get(`${q + r},${-r}`)], reflect(cells[index], false));
          }
        }
      }
    }
  }
});

test('animated hex grids start centrally and keep reflected cells together', () => {
  const dimensions = gridDimensions(8, 'hexagon');
  const center = dimensions.indexByCoordinate.get('0,0');
  const reflect = (mask, vertical) => {
    let result = 0;
    for (let edge = 0; edge < 6; edge++) {
      if (mask & (1 << edge)) result |= 1 << (vertical ? (3 - edge + 6) % 6 : (6 - edge) % 6);
    }
    return result;
  };
  for (const mode of ['mirror', 'symmetric']) {
    const cells = Array(dimensions.count).fill(null);
    let first = true;
    for (const updates of generateSteps(8, seededRandom(42), mode, 'hexagon')) {
      if (first) {
        assert.ok(updates.some(update => update.index === center));
        first = false;
      }
      for (const { index, mask } of updates) {
        assert.equal(cells[index], null);
        cells[index] = mask;
      }
      for (let index = 0; index < cells.length; index++) {
        if (cells[index] === null) continue;
        const { q, r } = dimensions.positions[index];
        assert.equal(cells[dimensions.indexByCoordinate.get(`${-q - r},${r}`)], reflect(cells[index], true));
        if (mode === 'symmetric') {
          assert.equal(cells[dimensions.indexByCoordinate.get(`${q + r},${-r}`)], reflect(cells[index], false));
        }
      }
    }
    assert.ok(cells.every(mask => mask !== null));
  }
});
