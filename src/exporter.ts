import { MudletMap, MudletLabel } from "mudlet-map-binary-reader";
import * as fs from "fs";
import * as path from "path";
import { MapDiff } from "./diff.js";
import { generateHtmlReport, RenderedImages } from "./html-exporter.js";
import { MapRenderSession } from "./rendering.js";
import { singleSvg, doubleSvg } from "./svgs.js";

export interface ExportOptions {
    outDir: string;
    svg?: boolean;
    html?: boolean;
    debugRaw?: boolean;
    onProgress?: (completed: number, total: number) => void;
    images?: RenderedImages;
}

export async function exportDiff(v1: MudletMap, v2: MudletMap, diff: MapDiff, options: ExportOptions): Promise<RenderedImages | undefined> {
    const { outDir, svg = true, html = false, debugRaw = false, onProgress } = options;

    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    let images: RenderedImages | undefined = options.images;

    if (svg) {
        const total =
            diff.rooms.added.length +
            diff.rooms.deleted.length +
            Object.keys(diff.rooms.updated).length +
            diff.labels.added.length +
            diff.labels.deleted.length +
            Object.keys(diff.labels.updated).length;

        if (total > 0) {
            let completed = 0;
            onProgress?.(0, total);

            images = {
                rooms: { added: {}, deleted: {}, updated: {} },
                labels: { added: {}, deleted: {}, updated: {} },
            };

            const session1 = new MapRenderSession(v1);
            const session2 = new MapRenderSession(v2);

            for (const room of diff.rooms.added) {
                const img = session2.renderRoom(room.id);
                if (img) {
                    if (debugRaw) fs.writeFileSync(path.join(outDir, `room_${room.id}_added_raw.svg`), img);
                    const svgContent = singleSvg(img);
                    fs.writeFileSync(path.join(outDir, `room_${room.id}_added.svg`), svgContent);
                    images.rooms.added[room.id] = svgContent;
                }
                onProgress?.(++completed, total);
            }
            for (const room of diff.rooms.deleted) {
                const img = session1.renderRoom(room.id);
                if (img) {
                    if (debugRaw) fs.writeFileSync(path.join(outDir, `room_${room.id}_deleted_raw.svg`), img);
                    const svgContent = singleSvg(img);
                    fs.writeFileSync(path.join(outDir, `room_${room.id}_deleted.svg`), svgContent);
                    images.rooms.deleted[room.id] = svgContent;
                }
                onProgress?.(++completed, total);
            }
            for (const roomId in diff.rooms.updated) {
                const id = parseInt(roomId);
                const img1 = session1.renderRoom(id);
                const img2 = session2.renderRoom(id);
                if (img1 && img2) {
                    if (debugRaw) {
                        fs.writeFileSync(path.join(outDir, `room_${id}_updated_v1_raw.svg`), img1);
                        fs.writeFileSync(path.join(outDir, `room_${id}_updated_v2_raw.svg`), img2);
                    }
                    const svgContent = doubleSvg(img1, img2);
                    fs.writeFileSync(path.join(outDir, `room_${id}_updated.svg`), svgContent);
                    images.rooms.updated[id] = svgContent;
                }
                onProgress?.(++completed, total);
            }
            for (const label of diff.labels.added as Array<MudletLabel & { areaId: number; id: number }>) {
                const img = session2.renderLabel(label, true);
                if (img) {
                    if (debugRaw) fs.writeFileSync(path.join(outDir, `label_${label.areaId}_${label.id}_added_raw.svg`), img);
                    const svgContent = singleSvg(img);
                    fs.writeFileSync(path.join(outDir, `label_${label.areaId}_${label.id}_added.svg`), svgContent);
                    images.labels.added[`${label.areaId}-${label.id}`] = svgContent;
                }
                onProgress?.(++completed, total);
            }
            for (const label of diff.labels.deleted as Array<MudletLabel & { areaId: number; id: number }>) {
                const img = session1.renderLabel(label, true);
                if (img) {
                    if (debugRaw) fs.writeFileSync(path.join(outDir, `label_${label.areaId}_${label.id}_deleted_raw.svg`), img);
                    const svgContent = singleSvg(img);
                    fs.writeFileSync(path.join(outDir, `label_${label.areaId}_${label.id}_deleted.svg`), svgContent);
                    images.labels.deleted[`${label.areaId}-${label.id}`] = svgContent;
                }
                onProgress?.(++completed, total);
            }
            for (const compositeId in diff.labels.updated) {
                const [areaIdStr, labelIdStr] = compositeId.split("-");
                const areaId = parseInt(areaIdStr);
                const labelId = parseInt(labelIdStr);
                const label1 = (v1.labels[areaId] || []).find(l => (l.labelId ?? l.id) === labelId);
                const label2 = (v2.labels[areaId] || []).find(l => (l.labelId ?? l.id) === labelId);
                if (label1 && label2) {
                    const img1 = session1.renderLabel({ ...label1, areaId }, true);
                    const img2 = session2.renderLabel({ ...label2, areaId }, true);
                    if (img1 && img2) {
                        if (debugRaw) {
                            fs.writeFileSync(path.join(outDir, `label_${areaId}_${labelId}_updated_v1_raw.svg`), img1);
                            fs.writeFileSync(path.join(outDir, `label_${areaId}_${labelId}_updated_v2_raw.svg`), img2);
                        }
                        const svgContent = doubleSvg(img1, img2);
                        fs.writeFileSync(path.join(outDir, `label_${areaId}_${labelId}_updated.svg`), svgContent);
                        images.labels.updated[compositeId] = svgContent;
                    }
                }
                onProgress?.(++completed, total);
            }

            session1.destroy();
            session2.destroy();
        }
    }

    if (html) {
        const htmlContent = generateHtmlReport(v1, v2, diff, images);
        fs.writeFileSync(path.join(outDir, "report.html"), htmlContent);
    }

    return images;
}
