import { MapDiff, compareMaps } from "./diff.js";
import { exportDiff, ExportOptions } from "./exporter.js";

export * from "./diff.js";

/**
 *
 * @param {string} map1 path to old map
 * @param {string} map2 path to new map
 * @param {string | ExportOptions} options output directory for diff images or export options
 *
 * @returns {Promise<MapDiff>} map diff
 */
export const createDiff = async function (map1: string, map2: string, options?: string | Partial<ExportOptions>): Promise<MapDiff> {
    const { v1, v2, diff } = compareMaps(map1, map2);

    if (options) {
        const exportOptions: ExportOptions = typeof options === "string" 
            ? { outDir: options } 
            : { outDir: options.outDir || "diff", ...options };
        await exportDiff(v1, v2, diff, exportOptions);
    }

    return diff;
};
