import MudletMapReader from "mudlet-map-binary-reader";
import { MudletMap, MudletLabel, MudletRoom, MudletArea } from "mudlet-map-binary-reader/dist/types.js";

function deepCompare(obj1: unknown, obj2: unknown): any {
    if (Buffer.isBuffer(obj1) && Buffer.isBuffer(obj2)) {
        return obj1.equals(obj2) ? {} : obj2;
    }
    if (typeof obj2 !== 'object' || obj2 === null) {
        return obj1 === obj2 ? {} : obj2;
    }
    const diffObj: any = Array.isArray(obj2) ? [] : {};
    let o1 = obj1 as Record<string, any>;
    let o2 = obj2 as Record<string, any>;

    if (Array.isArray(o1)) {
        o1 = [...o1].sort();
    }
    if (Array.isArray(o2)) {
        o2 = [...o2].sort();
    }
    Object.getOwnPropertyNames(o2).forEach(function (prop) {
        const val1 = o1?.[prop];
        const val2 = o2[prop];
        if (typeof val2 === "object" && val2 !== null && !Buffer.isBuffer(val2)) {
            const res = deepCompare(val1 || {}, val2);
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
        result[key] = {
            from: flatRevDiff[key],
            to: flatDiff[key]
        };
    }
    for (const key in flatRevDiff) {
        if (!(key in result)) {
            result[key] = {
                from: flatRevDiff[key],
                to: undefined
            };
        }
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
    const v1: MudletMap = MudletMapReader.readMap(map1Path);
    const v2: MudletMap = MudletMapReader.readMap(map2Path);

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
