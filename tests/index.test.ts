import { jest, describe, it, expect, beforeEach } from '@jest/globals';

import { createCanvas } from 'canvas';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Mock the binary reader
jest.unstable_mockModule('mudlet-map-binary-reader', () => ({
  readMapFromBuffer: jest.fn(),
  // rendering.ts imports this at module load; these tests never render.
  readerExport: jest.fn(),
}));

const { createDiff } = await import('../src/index.js');
const MudletMapReader = (await import('mudlet-map-binary-reader')) as unknown as {
  readMapFromBuffer: jest.Mock;
};

// compareMaps reads the files itself and hands the bytes to readMapFromBuffer,
// which is mocked to ignore them — so these only have to exist.
const fixtureDir = mkdtempSync(join(tmpdir(), 'mudlet-map-diff-'));
const MAP_1 = join(fixtureDir, 'v1.dat');
const MAP_2 = join(fixtureDir, 'v2.dat');
writeFileSync(MAP_1, '');
writeFileSync(MAP_2, '');

describe('createDiff', () => {
  const emptyMap = {
    version: 1,
    envColors: {},
    areaNames: {},
    mCustomEnvColors: {},
    mpRoomDbHashToRoomId: {},
    mUserData: {},
    mapSymbolFont: {},
    mapFontFudgeFactor: 1,
    useOnlyMapFont: false,
    areas: {},
    mRoomIdHash: {},
    labels: {},
    rooms: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should detect added rooms', async () => {
    const map1 = { ...emptyMap };
    const map2 = {
      ...emptyMap,
      rooms: {
        1: { name: 'Room 1', x: 0, y: 0, z: 0 },
      },
    };

    MudletMapReader.readMapFromBuffer.mockReturnValueOnce(map1).mockReturnValueOnce(map2);

    const diff = await createDiff(MAP_1, MAP_2);

    expect(diff.rooms.added).toHaveLength(1);
    expect(diff.rooms.added[0]).toMatchObject({ id: 1, name: 'Room 1' });
    expect(diff.rooms.deleted).toHaveLength(0);
    expect(Object.keys(diff.rooms.updated)).toHaveLength(0);
  });

  it('should detect deleted rooms', async () => {
    const map1 = {
      ...emptyMap,
      rooms: {
        1: { name: 'Room 1', x: 0, y: 0, z: 0 },
      },
    };
    const map2 = { ...emptyMap };

    MudletMapReader.readMapFromBuffer.mockReturnValueOnce(map1).mockReturnValueOnce(map2);

    const diff = await createDiff(MAP_1, MAP_2);

    expect(diff.rooms.deleted).toHaveLength(1);
    expect(diff.rooms.deleted[0]).toMatchObject({ id: 1, name: 'Room 1' });
    expect(diff.rooms.added).toHaveLength(0);
  });

  it('should detect updated rooms', async () => {
    const map1 = {
      ...emptyMap,
      rooms: {
        1: { name: 'Old Name', x: 0, y: 0, z: 0 },
      },
    };
    const map2 = {
      ...emptyMap,
      rooms: {
        1: { name: 'New Name', x: 0, y: 0, z: 0 },
      },
    };

    MudletMapReader.readMapFromBuffer.mockReturnValueOnce(map1).mockReturnValueOnce(map2);

    const diff = await createDiff(MAP_1, MAP_2);

    expect(diff.rooms.updated['1']).toBeDefined();
    expect(diff.rooms.updated['1'].name).toEqual({ from: 'Old Name', to: 'New Name' });
  });

  it('should detect added areas', async () => {
    const map1 = { ...emptyMap };
    const map2 = {
      ...emptyMap,
      areas: {
        1: { rooms: [1], zLevels: [0] },
      },
    };

    MudletMapReader.readMapFromBuffer.mockReturnValueOnce(map1).mockReturnValueOnce(map2);

    const diff = await createDiff(MAP_1, MAP_2);

    expect(diff.areas.added).toHaveLength(1);
    expect(diff.areas.added[0].id).toBe(1);
  });

  it('should detect label changes by labelId', async () => {
    const map1 = {
      ...emptyMap,
      areas: { 1: {} },
      labels: {
        1: [
          { id: 10, labelId: 100, text: 'Label 1', pos: [0, 0, 0] },
        ],
      },
    };
    const map2 = {
      ...emptyMap,
      areas: { 1: {} },
      labels: {
        1: [
          { id: 11, labelId: 100, text: 'Label 1 Updated', pos: [1, 1, 1] },
        ],
      },
    };

    MudletMapReader.readMapFromBuffer.mockReturnValueOnce(map1).mockReturnValueOnce(map2);

    const diff = await createDiff(MAP_1, MAP_2);

    expect(diff.labels.added).toHaveLength(0);
    expect(diff.labels.deleted).toHaveLength(0);
    expect(diff.labels.updated['1-100']).toBeDefined();
    expect(diff.labels.updated['1-100'].text).toEqual({ from: 'Label 1', to: 'Label 1 Updated' });
    expect(diff.labels.updated['1-100']['pos.0']).toEqual({ from: 0, to: 1 });
  });

  it('should detect pixMap changes', async () => {
    const buf1 = Buffer.from([1, 2, 3]);
    const buf2 = Buffer.from([4, 5, 6]);
    const map1 = {
      ...emptyMap,
      areas: { 1: {} },
      labels: {
        1: [
          { id: 10, labelId: 100, pixMap: buf1 },
        ],
      },
    };
    const map2 = {
      ...emptyMap,
      areas: { 1: {} },
      labels: {
        1: [
          { id: 10, labelId: 100, pixMap: buf2 },
        ],
      },
    };

    MudletMapReader.readMapFromBuffer.mockReturnValueOnce(map1).mockReturnValueOnce(map2);

    const diff = await createDiff(MAP_1, MAP_2);

    expect(diff.labels.updated['1-100'].pixMap).toBeDefined();
    expect(diff.labels.updated['1-100'].pixMap.from).toEqual(buf1);
    expect(diff.labels.updated['1-100'].pixMap.to).toEqual(buf2);
  });

  it('should not report rawSpecialExits, the on-disk form of mSpecialExits', async () => {
    // The file stores special exits as {targetId: ["<lock><command>"]}; the
    // reader hydrates that into mSpecialExits + mSpecialExitLocks and rebuilds
    // it on write. Reporting both restates every special-exit edit twice, the
    // second time keyed by target id with the lock flag glued to the command.
    const withExitTo = (target: number) => ({
      ...emptyMap,
      areas: { 1: {} },
      rooms: {
        1: {
          name: 'Room 1',
          mSpecialExits: { 'pchnij plyte': target },
          mSpecialExitLocks: [],
          rawSpecialExits: { [target]: ['0pchnij plyte'] },
        },
      },
    });

    MudletMapReader.readMapFromBuffer
      .mockReturnValueOnce(withExitTo(22561))
      .mockReturnValueOnce(withExitTo(22557));

    const diff = await createDiff(MAP_1, MAP_2);

    const roomDiff = diff.rooms.updated['1'];
    expect(roomDiff).toBeDefined();
    expect(roomDiff['mSpecialExits.pchnij plyte']).toEqual({ from: 22561, to: 22557 });
    expect(Object.keys(roomDiff).filter((k) => k.startsWith('rawSpecialExits'))).toHaveLength(0);
  });

  it('should compare label coordinates positionally, not as a set', async () => {
    // A label whose x and y swap has moved. Set semantics (or sorting the
    // components first) would compare the two triples equal and report nothing.
    const label = (pos: number[]) => ({
      ...emptyMap,
      areas: { 1: {} },
      labels: { 1: [{ id: 10, labelId: 100, pos }] },
    });

    MudletMapReader.readMapFromBuffer
      .mockReturnValueOnce(label([1, 2, 0]))
      .mockReturnValueOnce(label([2, 1, 0]));

    const diff = await createDiff(MAP_1, MAP_2);

    const labelDiff = diff.labels.updated['1-100'];
    expect(labelDiff).toBeDefined();
    expect(labelDiff['pos.0']).toEqual({ from: 1, to: 2 });
    expect(labelDiff['pos.1']).toEqual({ from: 2, to: 1 });
    expect(labelDiff['pos.added']).toBeUndefined();
    expect(labelDiff['pos.removed']).toBeUndefined();
  });

  // Two encodings of the same drawing: byte-different, pixel-identical — what a
  // Mudlet upgrade produces for every label it never touched.
  const encodePng = (compressionLevel: number, accent: string) => {
    const canvas = createCanvas(8, 8);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#3366ff';
    ctx.fillRect(0, 0, 8, 8);
    ctx.fillStyle = accent;
    ctx.fillRect(2, 2, 3, 3);
    return canvas.toBuffer('image/png', { compressionLevel });
  };

  const mapWithLabelPixMap = (pixMap: Buffer) => ({
    ...emptyMap,
    areas: { 1: {} },
    labels: { 1: [{ id: 10, labelId: 100, pixMap }] },
  });

  it('should not report a pixMap that was only re-encoded', async () => {
    const before = encodePng(0, '#ffffff');
    const after = encodePng(9, '#ffffff');
    expect(before.equals(after)).toBe(false); // guard: the bytes really do differ

    MudletMapReader.readMapFromBuffer
      .mockReturnValueOnce(mapWithLabelPixMap(before))
      .mockReturnValueOnce(mapWithLabelPixMap(after));

    const diff = await createDiff(MAP_1, MAP_2);

    // Same image, so the label is not a change at all.
    expect(diff.labels.updated).toEqual({});
  });

  it('should still report a pixMap whose image actually changed', async () => {
    MudletMapReader.readMapFromBuffer
      .mockReturnValueOnce(mapWithLabelPixMap(encodePng(9, '#ffffff')))
      .mockReturnValueOnce(mapWithLabelPixMap(encodePng(9, '#ff0000')));

    const diff = await createDiff(MAP_1, MAP_2);

    expect(diff.labels.updated['1-100']).toBeDefined();
    expect(diff.labels.updated['1-100'].pixMap).toBeDefined();
  });

  it('should keep a re-encoded pixMap label when something else changed too', async () => {
    const map1 = mapWithLabelPixMap(encodePng(0, '#ffffff'));
    const map2 = mapWithLabelPixMap(encodePng(9, '#ffffff'));
    map2.labels[1][0] = { ...map2.labels[1][0], text: 'Moved' } as never;

    MudletMapReader.readMapFromBuffer.mockReturnValueOnce(map1).mockReturnValueOnce(map2);

    const diff = await createDiff(MAP_1, MAP_2);

    const labelDiff = diff.labels.updated['1-100'];
    expect(labelDiff).toBeDefined();
    expect(labelDiff.pixMap).toBeUndefined(); // the re-encode alone is dropped
    expect(labelDiff.text).toEqual({ from: undefined, to: 'Moved' });
  });

  it('should show set diff (not index shifts) when a room is removed from an area', async () => {
    const map1 = {
      ...emptyMap,
      areas: {
        1: { rooms: [100, 200, 300, 400, 500], zLevels: [0] },
      },
    };
    const map2 = {
      ...emptyMap,
      areas: {
        1: { rooms: [100, 200, 400, 500], zLevels: [0] },
      },
    };

    MudletMapReader.readMapFromBuffer.mockReturnValueOnce(map1).mockReturnValueOnce(map2);

    const diff = await createDiff(MAP_1, MAP_2);

    const areaDiff = diff.areas.updated['1'];
    expect(areaDiff).toBeDefined();
    // Should report the removed room, not cascading index shifts
    expect(areaDiff['rooms.removed']).toEqual({ from: [300], to: undefined });
    expect(areaDiff['rooms.added']).toBeUndefined();
    // Must NOT produce index-shift noise like rooms.2, rooms.3, rooms.length, etc.
    const indexKeys = Object.keys(areaDiff).filter(k => /^rooms.d+$/.test(k));
    expect(indexKeys).toHaveLength(0);
  });

  it('should show set diff when a room is added to an area', async () => {
    const map1 = {
      ...emptyMap,
      areas: {
        1: { rooms: [100, 200], zLevels: [0] },
      },
    };
    const map2 = {
      ...emptyMap,
      areas: {
        1: { rooms: [100, 200, 300], zLevels: [0] },
      },
    };

    MudletMapReader.readMapFromBuffer.mockReturnValueOnce(map1).mockReturnValueOnce(map2);

    const diff = await createDiff(MAP_1, MAP_2);

    const areaDiff = diff.areas.updated['1'];
    expect(areaDiff).toBeDefined();
    expect(areaDiff['rooms.added']).toEqual({ from: undefined, to: [300] });
    expect(areaDiff['rooms.removed']).toBeUndefined();
    const indexKeys = Object.keys(areaDiff).filter(k => /^rooms.d+$/.test(k));
    expect(indexKeys).toHaveLength(0);
  });

  it('should detect map-level property changes', async () => {
    const map1 = { ...emptyMap, version: 1 };
    const map2 = { ...emptyMap, version: 2 };

    MudletMapReader.readMapFromBuffer.mockReturnValueOnce(map1).mockReturnValueOnce(map2);

    const diff = await createDiff(MAP_1, MAP_2);

    expect(diff.map.version).toEqual({ from: 1, to: 2 });
  });

  it('should NOT detect changes if pixMap is identical', async () => {
    const buf1 = Buffer.from([1, 2, 3]);
    const buf2 = Buffer.from([1, 2, 3]);
    const map1 = {
      ...emptyMap,
      areas: { 1: {} },
      labels: {
        1: [
          { id: 10, labelId: 100, pixMap: buf1 },
        ],
      },
    };
    const map2 = {
      ...emptyMap,
      areas: { 1: {} },
      labels: {
        1: [
          { id: 10, labelId: 100, pixMap: buf2 },
        ],
      },
    };

    MudletMapReader.readMapFromBuffer.mockReturnValueOnce(map1).mockReturnValueOnce(map2);

    const diff = await createDiff(MAP_1, MAP_2);

    expect(diff.labels.updated['1-100']).toBeUndefined();
  });
});
