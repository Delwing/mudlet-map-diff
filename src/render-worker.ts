import { workerData, parentPort } from "worker_threads";
import { renderRoom, renderLabel } from "./rendering.js";
import { singleSvg, doubleSvg } from "./svgs.js";
import * as fs from "fs";
import * as path from "path";
import { MudletMap, MudletLabel } from "mudlet-map-binary-reader/dist/types.js";

type RenderTask =
    | { type: "room_added"; id: number }
    | { type: "room_deleted"; id: number }
    | { type: "room_updated"; id: number }
    | { type: "label_added"; label: MudletLabel & { areaId: number; id: number } }
    | { type: "label_deleted"; label: MudletLabel & { areaId: number; id: number } }
    | { type: "label_updated"; areaId: number; labelId: number; label1: MudletLabel & { areaId: number }; label2: MudletLabel & { areaId: number } };

const { tasks, outDir, v1, v2 }: { tasks: RenderTask[]; outDir: string; v1: MudletMap; v2: MudletMap } = workerData;

for (const task of tasks) {
    switch (task.type) {
        case "room_added": {
            const img = renderRoom(v2, task.id);
            if (img) fs.writeFileSync(path.join(outDir, `room_${task.id}_added.svg`), singleSvg(img));
            break;
        }
        case "room_deleted": {
            const img = renderRoom(v1, task.id);
            if (img) fs.writeFileSync(path.join(outDir, `room_${task.id}_deleted.svg`), singleSvg(img));
            break;
        }
        case "room_updated": {
            const img1 = renderRoom(v1, task.id);
            const img2 = renderRoom(v2, task.id);
            if (img1 && img2) fs.writeFileSync(path.join(outDir, `room_${task.id}_updated.svg`), doubleSvg(img1, img2));
            break;
        }
        case "label_added": {
            const img = renderLabel(v2, task.label, true);
            if (img) fs.writeFileSync(path.join(outDir, `label_${task.label.areaId}_${task.label.id}_added.svg`), singleSvg(img));
            break;
        }
        case "label_deleted": {
            const img = renderLabel(v1, task.label, true);
            if (img) fs.writeFileSync(path.join(outDir, `label_${task.label.areaId}_${task.label.id}_deleted.svg`), singleSvg(img));
            break;
        }
        case "label_updated": {
            const img1 = renderLabel(v1, task.label1, true);
            const img2 = renderLabel(v2, task.label2, true);
            if (img1 && img2) fs.writeFileSync(path.join(outDir, `label_${task.areaId}_${task.labelId}_updated.svg`), doubleSvg(img1, img2));
            break;
        }
    }
    parentPort!.postMessage({ type: "progress" });
}

parentPort!.postMessage({ type: "done" });
