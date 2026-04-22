import { jest, describe, it, expect, beforeEach } from '@jest/globals';
// Mock the binary reader
jest.unstable_mockModule('mudlet-map-binary-reader', () => ({
    default: {
        readMap: jest.fn(),
    },
}));
const { createDiff } = await import('../src/index.js');
const { default: MudletMapReader } = await import('mudlet-map-binary-reader');
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
        MudletMapReader.readMap.mockReturnValueOnce(map1).mockReturnValueOnce(map2);
        const diff = await createDiff('v1', 'v2');
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
        MudletMapReader.readMap.mockReturnValueOnce(map1).mockReturnValueOnce(map2);
        const diff = await createDiff('v1', 'v2');
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
        MudletMapReader.readMap.mockReturnValueOnce(map1).mockReturnValueOnce(map2);
        const diff = await createDiff('v1', 'v2');
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
        MudletMapReader.readMap.mockReturnValueOnce(map1).mockReturnValueOnce(map2);
        const diff = await createDiff('v1', 'v2');
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
        MudletMapReader.readMap.mockReturnValueOnce(map1).mockReturnValueOnce(map2);
        const diff = await createDiff('v1', 'v2');
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
        MudletMapReader.readMap.mockReturnValueOnce(map1).mockReturnValueOnce(map2);
        const diff = await createDiff('v1', 'v2');
        expect(diff.labels.updated['1-100'].pixMap).toBeDefined();
        expect(diff.labels.updated['1-100'].pixMap.from).toEqual(buf1);
        expect(diff.labels.updated['1-100'].pixMap.to).toEqual(buf2);
    });
    it('should detect map-level property changes', async () => {
        const map1 = { ...emptyMap, version: 1 };
        const map2 = { ...emptyMap, version: 2 };
        MudletMapReader.readMap.mockReturnValueOnce(map1).mockReturnValueOnce(map2);
        const diff = await createDiff('v1', 'v2');
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
        MudletMapReader.readMap.mockReturnValueOnce(map1).mockReturnValueOnce(map2);
        const diff = await createDiff('v1', 'v2');
        expect(diff.labels.updated['1-100']).toBeUndefined();
    });
});
//# sourceMappingURL=index.test.js.map