import { readFileSync } from "fs";
import { readMapFromBuffer, MudletMap, MudletLabel, MudletRoom, MudletArea } from "mudlet-map-binary-reader";

const SET_DIFF_MARKER = '__setDiff__';

// Internal wrapper used to carry set-diff direction through flatten → getPropertyDiff
class SetDiffValue {
    constructor(public items: any[], public direction: 'removed' | 'added') {}
}

function isPrimitiveArray(arr: unknown[]): boolean {
    return arr.every(item => typeof item !== 'object' || item === null);
}

// Fields holding an id list. Order carries no meaning there, so adding or
// removing one element should report that element rather than cascade into an
// index shift for every element after it.
const SET_VALUED_FIELDS = new Set(['rooms', 'zLevels', 'exitLocks', 'stubs', 'mSpecialExitLocks']);

// Fields holding a fixed-shape tuple: index 0/1/2 are x/y/z (or w/h). These
// compare positionally — treating one as a set, or sorting it first, hides
// real edits, because [1,2,0] -> [2,1,0] is a label that moved, not one that
// stayed put. Every other array keeps the original sort-then-compare-by-index
// behaviour.
const TUPLE_VALUED_FIELDS = new Set(['pos', 'span', 'size']);

function deepCompare(obj1: unknown, obj2: unknown, key?: string): any {
    if (Buffer.isBuffer(obj1) && Buffer.isBuffer(obj2)) {
        return obj1.equals(obj2) ? {} : obj2;
    }
    if (typeof obj2 !== 'object' || obj2 === null) {
        return obj1 === obj2 ? {} : obj2;
    }

    // Id lists are treated as sets to avoid cascading index shifts when a
    // single element is added or removed.
    if (key !== undefined && SET_VALUED_FIELDS.has(key) && Array.isArray(obj2) && isPrimitiveArray(obj2 as unknown[])) {
        const arr1 = Array.isArray(obj1) ? (obj1 as unknown[]) : [];
        const set1 = new Set(arr1);
        const set2 = new Set(obj2 as unknown[]);
        const added = (obj2 as unknown[]).filter(x => !set1.has(x));
        const removed = arr1.filter(x => !set2.has(x));
        if (added.length === 0 && removed.length === 0) return {};
        return { [SET_DIFF_MARKER]: true, added, removed };
    }

    const diffObj: any = Array.isArray(obj2) ? [] : {};
    let o1 = obj1 as Record<string, any>;
    let o2 = obj2 as Record<string, any>;

    const isTuple = key !== undefined && TUPLE_VALUED_FIELDS.has(key);
    if (Array.isArray(o1) && !isTuple) {
        o1 = [...o1].sort();
    }
    if (Array.isArray(o2) && !isTuple) {
        o2 = [...o2].sort();
    }
    Object.getOwnPropertyNames(o2).forEach(function (prop) {
        const val1 = o1?.[prop];
        const val2 = o2[prop];
        if (typeof val2 === "object" && val2 !== null && !Buffer.isBuffer(val2)) {
            const res = deepCompare(val1 || {}, val2, prop);
            if (Object.getOwnPropertyNames(res).length > 0) {
                diffObj[prop] = res;
            }
        } else if (Buffer.isBuffer(val1) && Buffer.isBuffer(val2)) {
            if (!val1.equals(val2)) {
                diffObj[prop] = val2;
            }
        } else if (val1 !== val2) {
            diffObj[prop] = val2;
        }
    });
    return diffObj;
}

function flatten(obj: any, parent?: string, res: Record<string, any> = {}): Record<string, any> {
    if (typeof obj !== 'object' || obj === null) {
        return res;
    }
    for (let key in obj) {
        let propName = parent ? parent + "." + key : key;
        const val = (obj as Record<string, any>)[key];
        if (Buffer.isBuffer(val)) {
            res[propName] = val;
        } else if (val !== null && typeof val === 'object' && SET_DIFF_MARKER in val) {
            if (val.removed.length > 0) res[propName + '.removed'] = new SetDiffValue(val.removed, 'removed');
            if (val.added.length > 0) res[propName + '.added'] = new SetDiffValue(val.added, 'added');
        } else if (typeof val == "object" && val !== null) {
            flatten(val, propName, res);
        } else {
            res[propName] = val;
        }
    }
    return res;
}

export interface PropertyChange {
    from: any;
    to: any;
}

export type PropertyDiff = Record<string, PropertyChange>;

export interface EntityDiff<T> {
    added: T[];
    deleted: T[];
    updated: Record<string, PropertyDiff>;
}

export interface MapDiff {
    rooms: EntityDiff<MudletRoom & { id: number }>;
    labels: EntityDiff<MudletLabel & { areaId: number }>;
    areas: EntityDiff<MudletArea & { id: number }>;
    map: PropertyDiff;
}

export function getPropertyDiff(obj1: unknown, obj2: unknown): PropertyDiff {
    const diff = deepCompare(obj1, obj2);
    const revDiff = deepCompare(obj2, obj1);
    const flatDiff = flatten(diff);
    const flatRevDiff = flatten(revDiff);

    const result: PropertyDiff = {};
    for (const key in flatDiff) {
        const val = flatDiff[key];
        if (val instanceof SetDiffValue) {
            // The forward diff already carries both directions; construct from/to directly.
            // 'removed' means items were in obj1 (from) but not obj2 (to).
            // 'added'   means items are in obj2 (to) but not obj1 (from).
            result[key] = val.direction === 'removed'
                ? { from: val.items, to: undefined }
                : { from: undefined, to: val.items };
        } else {
            result[key] = {
                from: flatRevDiff[key] instanceof SetDiffValue ? undefined : flatRevDiff[key],
                to: val
            };
        }
    }
    for (const key in flatRevDiff) {
        if (key in result) continue;
        const val = flatRevDiff[key];
        if (val instanceof SetDiffValue) continue; // mirror of a forward set-diff entry, skip
        result[key] = {
            from: val,
            to: undefined
        };
    }
    return result;
}

export function diffEntities<T extends object>(
    v1Map: Record<string | number, T>,
    v2Map: Record<string | number, T>,
    entityDiff: EntityDiff<T & { id?: number; areaId?: number }>,
    updateKeyPrefix?: (id: number) => string
) {
    const allIds = new Set([...Object.keys(v1Map), ...Object.keys(v2Map)].map(Number));
    for (const id of allIds) {
        const e1 = v1Map[id];
        const e2 = v2Map[id];
        if (!e1 && e2) {
            const added = { ...e2 } as T & { id?: number; areaId?: number };
            if (added.id === undefined) {
                added.id = id;
            }
            entityDiff.added.push(added);
        } else if (e1 && !e2) {
            const deleted = { ...e1 } as T & { id?: number; areaId?: number };
            if (deleted.id === undefined) {
                deleted.id = id;
            }
            entityDiff.deleted.push(deleted);
        } else if (e1 && e2) {
            const diff = getPropertyDiff(e1, e2);
            if (Object.keys(diff).length > 0) {
                const key = updateKeyPrefix ? updateKeyPrefix(id) : id.toString();
                entityDiff.updated[key] = diff;
            }
        }
    }
}

export function compareMaps(map1Path: string, map2Path: string): { v1: MudletMap, v2: MudletMap, diff: MapDiff } {
    const v1: MudletMap = readMapFromBuffer(readFileSync(map1Path));
    const v2: MudletMap = readMapFromBuffer(readFileSync(map2Path));

    const rooms: EntityDiff<MudletRoom & { id: number }> = { added: [], deleted: [], updated: {} };
    const labels: EntityDiff<MudletLabel & { areaId: number }> = { added: [], deleted: [], updated: {} };
    const areas: EntityDiff<MudletArea & { id: number }> = { added: [], deleted: [], updated: {} };

    // Diff Rooms
    diffEntities(v1.rooms, v2.rooms, rooms);

    // Diff Areas
    diffEntities(v1.areas, v2.areas, areas);

    const allAreaIds = new Set([...Object.keys(v1.areas), ...Object.keys(v2.areas)].map(Number));
    for (const areaId of allAreaIds) {
        // Diff Labels within the area
        const labels1 = v1.labels[areaId] || [];
        const labels2 = v2.labels[areaId] || [];
        const l1Map: Record<number, MudletLabel & { areaId: number }> = {};
        labels1.forEach(l => l1Map[l.labelId ?? l.id] = { ...l, areaId });
        const l2Map: Record<number, MudletLabel & { areaId: number }> = {};
        labels2.forEach(l => l2Map[l.labelId ?? l.id] = { ...l, areaId });

        diffEntities(l1Map, l2Map, labels as EntityDiff<MudletLabel & { areaId: number }>, (labelId) => `${areaId}-${labelId}`);
    }

    // Diff Map-level properties
    const map1Props = { ...v1 } as Record<string, any>;
    const map2Props = { ...v2 } as Record<string, any>;
    // Remove entities already diffed
    const entities = ["rooms", "areas", "labels"] as const;
    entities.forEach(e => {
        delete map1Props[e];
        delete map2Props[e];
    });

    const mapDiff = getPropertyDiff(map1Props, map2Props);

    return {
        v1,
        v2,
        diff: {
            rooms,
            labels,
            areas,
            map: mapDiff
        }
    };
}
