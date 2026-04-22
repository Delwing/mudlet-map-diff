import { MudletMap } from "mudlet-map-binary-reader/dist/types.js";
import { renderRoom, renderLabel } from "./rendering.js";
import { singleSvg, doubleSvg } from "./svgs.js";
import * as fs from "fs";
import * as path from "path";
import { MapDiff } from "./diff.js";
import { generateHtmlReport } from "./html-exporter.js";

export interface ExportOptions {
    outDir: string;
    svg?: boolean;
    html?: boolean;
}

export async function exportDiff(v1: MudletMap, v2: MudletMap, diff: MapDiff, options: ExportOptions): Promise<void> {
    const { outDir, svg = true, html = false } = options;

    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    if (svg) {
        for (const room of diff.rooms.added) {
            const img = renderRoom(v2, room.id);
            if (img) {
                fs.writeFileSync(path.join(outDir, `room_${room.id}_added.svg`), singleSvg(img));
            }
        }

        for (const room of diff.rooms.deleted) {
            const img = renderRoom(v1, room.id);
            if (img) {
                fs.writeFileSync(path.join(outDir, `room_${room.id}_deleted.svg`), singleSvg(img));
            }
        }

        for (const roomId in diff.rooms.updated) {
            const id = parseInt(roomId);
            const img1 = renderRoom(v1, id);
            const img2 = renderRoom(v2, id);
            if (img1 && img2) {
                fs.writeFileSync(path.join(outDir, `room_${roomId}_updated.svg`), doubleSvg(img1, img2));
            }
        }

        for (const label of diff.labels.added) {
            const img = renderLabel(v2, label, true);
            if (img) {
                fs.writeFileSync(path.join(outDir, `label_${label.areaId}_${label.id}_added.svg`), singleSvg(img));
            }
        }

        for (const label of diff.labels.deleted) {
            const img = renderLabel(v1, label, true);
            if (img) {
                fs.writeFileSync(path.join(outDir, `label_${label.areaId}_${label.id}_deleted.svg`), singleSvg(img));
            }
        }

        for (const compositeId in diff.labels.updated) {
            const [areaIdStr, labelIdStr] = compositeId.split("-");
            const areaId = parseInt(areaIdStr);
            const labelId = parseInt(labelIdStr);
            
            const label1 = (v1.labels[areaId] || []).find(l => (l.labelId ?? l.id) === labelId);
            const label2 = (v2.labels[areaId] || []).find(l => (l.labelId ?? l.id) === labelId);
            
            if (label1 && label2) {
                const img1 = renderLabel(v1, { ...label1, areaId }, true);
                const img2 = renderLabel(v2, { ...label2, areaId }, true);
                if (img1 && img2) {
                    fs.writeFileSync(path.join(outDir, `label_${areaId}_${labelId}_updated.svg`), doubleSvg(img1, img2));
                }
            }
        }
    }

    if (html) {
        const htmlContent = generateHtmlReport(v1, v2, diff);
        fs.writeFileSync(path.join(outDir, "report.html"), htmlContent);
    }
}
