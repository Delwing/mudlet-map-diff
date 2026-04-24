import { MudletMap, MudletLabel } from "mudlet-map-binary-reader/dist/types.js";
import * as fs from "fs";
import * as path from "path";
import { MapDiff } from "./diff.js";
import { generateHtmlReport } from "./html-exporter.js";
import { Worker } from "worker_threads";
import * as os from "os";

export interface ExportOptions {
    outDir: string;
    svg?: boolean;
    html?: boolean;
}

type RenderTask =
    | { type: "room_added"; id: number }
    | { type: "room_deleted"; id: number }
    | { type: "room_updated"; id: number }
    | { type: "label_added"; label: MudletLabel & { areaId: number; id: number } }
    | { type: "label_deleted"; label: MudletLabel & { areaId: number; id: number } }
    | { type: "label_updated"; areaId: number; labelId: number; label1: MudletLabel & { areaId: number }; label2: MudletLabel & { areaId: number } };

function spawnWorker(workerUrl: URL, tasks: RenderTask[], outDir: string, v1: MudletMap, v2: MudletMap, onProgress: () => void): Promise<void> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(workerUrl, { workerData: { tasks, outDir, v1, v2 } });
        worker.on("message", (msg: { type: string }) => {
            if (msg.type === "progress") onProgress();
            else if (msg.type === "done") resolve();
        });
        worker.on("error", reject);
        worker.on("exit", (code) => {
            if (code !== 0) reject(new Error(`Render worker exited with code ${code}`));
        });
    });
}

function renderProgressBar(completed: number, total: number): void {
    const pct = Math.floor((completed / total) * 100);
    const filled = Math.floor((completed / total) * 30);
    const bar = "█".repeat(filled) + "░".repeat(30 - filled);
    process.stdout.write(`\rRendering SVGs [${bar}] ${pct}% (${completed}/${total})`);
}

export async function exportDiff(v1: MudletMap, v2: MudletMap, diff: MapDiff, options: ExportOptions): Promise<void> {
    const { outDir, svg = true, html = false } = options;

    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    if (svg) {
        const tasks: RenderTask[] = [];

        for (const room of diff.rooms.added) {
            tasks.push({ type: "room_added", id: room.id });
        }
        for (const room of diff.rooms.deleted) {
            tasks.push({ type: "room_deleted", id: room.id });
        }
        for (const roomId in diff.rooms.updated) {
            tasks.push({ type: "room_updated", id: parseInt(roomId) });
        }
        for (const label of diff.labels.added) {
            tasks.push({ type: "label_added", label: label as MudletLabel & { areaId: number; id: number } });
        }
        for (const label of diff.labels.deleted) {
            tasks.push({ type: "label_deleted", label: label as MudletLabel & { areaId: number; id: number } });
        }
        for (const compositeId in diff.labels.updated) {
            const [areaIdStr, labelIdStr] = compositeId.split("-");
            const areaId = parseInt(areaIdStr);
            const labelId = parseInt(labelIdStr);
            const label1 = (v1.labels[areaId] || []).find(l => (l.labelId ?? l.id) === labelId);
            const label2 = (v2.labels[areaId] || []).find(l => (l.labelId ?? l.id) === labelId);
            if (label1 && label2) {
                tasks.push({ type: "label_updated", areaId, labelId, label1: { ...label1, areaId }, label2: { ...label2, areaId } });
            }
        }

        if (tasks.length > 0) {
            const workerUrl = new URL("./render-worker.js", import.meta.url);
            const workerCount = Math.min(os.cpus().length, tasks.length);
            const chunkSize = Math.ceil(tasks.length / workerCount);

            let completed = 0;
            renderProgressBar(0, tasks.length);
            await Promise.all(
                Array.from({ length: workerCount }, (_, i) => {
                    const chunk = tasks.slice(i * chunkSize, (i + 1) * chunkSize);
                    return chunk.length ? spawnWorker(workerUrl, chunk, outDir, v1, v2, () => {
                        renderProgressBar(++completed, tasks.length);
                    }) : Promise.resolve();
                })
            );
            process.stdout.write("\n");
        }
    }

    if (html) {
        const htmlContent = generateHtmlReport(v1, v2, diff);
        fs.writeFileSync(path.join(outDir, "report.html"), htmlContent);
    }
}
