import { MudletMap } from "mudlet-map-binary-reader/dist/types.js";
import { MapDiff, PropertyDiff } from "./diff.js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface RenderedImages {
    rooms: {
        added: Record<number, string>;
        deleted: Record<number, string>;
        updated: Record<number, string>;
    };
    labels: {
        added: Record<string, string>;
        deleted: Record<string, string>;
        updated: Record<string, string>;
    };
}

function escapeHtml(unsafe: string): string {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function formatValue(value: unknown): string {
    if (value === undefined) return "<i>undefined</i>";
    if (value === null) return "<i>null</i>";
    if (Buffer.isBuffer(value)) {
        const base64 = value.toString("base64");
        return `<img src="data:image/png;base64,${base64}" class="pixmap-preview" title="Pixmap data" />`;
    }
    if (typeof value === "string") return `"${escapeHtml(value)}"`;
    return escapeHtml(String(value));
}

function renderPropertyDiff(diff: PropertyDiff): string {
    let html = "<table><thead><tr><th>Property</th><th>Old</th><th>New</th></tr></thead><tbody>";
    for (const [prop, change] of Object.entries(diff)) {
        html += `<tr><td>${escapeHtml(prop)}</td><td class="old-val">${formatValue(change.from)}</td><td class="new-val">${formatValue(change.to)}</td></tr>`;
    }
    html += "</tbody></table>";
    return html;
}

export function generateHtmlReport(v1: MudletMap, v2: MudletMap, diff: MapDiff, images?: RenderedImages): string {
    const sections: string[] = [];

    // Summary Section
    sections.push(`
        <section id="summary">
            <h2>Summary</h2>
            <div class="summary-grid">
                <div class="summary-card">
                    <h3>Rooms</h3>
                    <div class="count">${diff.rooms.added.length + diff.rooms.deleted.length + Object.keys(diff.rooms.updated).length}</div>
                    <div class="details">
                        <span class="badge badge-added">+${diff.rooms.added.length}</span>
                        <span class="badge badge-deleted">-${diff.rooms.deleted.length}</span>
                        <span class="badge badge-updated">~${Object.keys(diff.rooms.updated).length}</span>
                    </div>
                </div>
                <div class="summary-card">
                    <h3>Labels</h3>
                    <div class="count">${diff.labels.added.length + diff.labels.deleted.length + Object.keys(diff.labels.updated).length}</div>
                    <div class="details">
                        <span class="badge badge-added">+${diff.labels.added.length}</span>
                        <span class="badge badge-deleted">-${diff.labels.deleted.length}</span>
                        <span class="badge badge-updated">~${Object.keys(diff.labels.updated).length}</span>
                    </div>
                </div>
                <div class="summary-card">
                    <h3>Areas</h3>
                    <div class="count">${diff.areas.added.length + diff.areas.deleted.length + Object.keys(diff.areas.updated).length}</div>
                    <div class="details">
                        <span class="badge badge-added">+${diff.areas.added.length}</span>
                        <span class="badge badge-deleted">-${diff.areas.deleted.length}</span>
                        <span class="badge badge-updated">~${Object.keys(diff.areas.updated).length}</span>
                    </div>
                </div>
            </div>
        </section>
    `);

    // Map Properties Section
    if (Object.keys(diff.map).length > 0) {
        sections.push(`
            <section id="map-properties">
                <h2>Map Properties Changes</h2>
                ${renderPropertyDiff(diff.map)}
            </section>
        `);
    }

    // Detail Sections Helper
    const createDetailSection = (title: string, id: string, items: { id: string, label: string, svg: string, details?: string }[]) => {
        if (items.length === 0) return "";
        let html = `<section id="${id}"><h2>${title}</h2><div class="diff-list">`;
        for (const item of items) {
            html += `
                <div class="diff-item">
                    <div class="diff-header" onclick="showDetails('${id}-${item.id}')">
                        <span class="diff-label">${escapeHtml(item.label)}</span>
                        <span class="diff-toggle">▼</span>
                    </div>
                    <div id="details-${id}-${item.id}" class="diff-details" style="display:none">
                        ${item.svg ? `<div class="svg-container">${item.svg}</div>` : ""}
                        ${item.details ? `<div class="property-diff">${item.details}</div>` : ""}
                    </div>
                </div>
            `;
        }
        html += `</div></section>`;
        return html;
    };

    interface ReportItem {
        id: string;
        label: string;
        svg: string;
        details?: string;
    }

    // Rooms
    const roomItems: ReportItem[] = [];
    diff.rooms.added.forEach(r => {
        roomItems.push({ id: `added-${r.id}`, label: `Room ${r.id} (Added)`, svg: images?.rooms.added[r.id] ?? "" });
    });
    diff.rooms.deleted.forEach(r => {
        roomItems.push({ id: `deleted-${r.id}`, label: `Room ${r.id} (Deleted)`, svg: images?.rooms.deleted[r.id] ?? "" });
    });
    for (const [id, propDiff] of Object.entries(diff.rooms.updated)) {
        const rid = parseInt(id);
        roomItems.push({
            id: `updated-${id}`,
            label: `Room ${id} (Updated)`,
            svg: images?.rooms.updated[rid] ?? "",
            details: renderPropertyDiff(propDiff)
        });
    }
    sections.push(createDetailSection("Rooms", "rooms", roomItems));

    // Labels
    const labelItems: ReportItem[] = [];
    diff.labels.added.forEach(l => {
        labelItems.push({ id: `added-${l.id}`, label: `Label ${l.id} in Area ${l.areaId} (Added)`, svg: images?.labels.added[`${l.areaId}-${l.id}`] ?? "" });
    });
    diff.labels.deleted.forEach(l => {
        labelItems.push({ id: `deleted-${l.id}`, label: `Label ${l.id} in Area ${l.areaId} (Deleted)`, svg: images?.labels.deleted[`${l.areaId}-${l.id}`] ?? "" });
    });
    for (const [compositeId, propDiff] of Object.entries(diff.labels.updated)) {
        const [areaIdStr, labelIdStr] = compositeId.split("-");
        const areaId = parseInt(areaIdStr);
        const labelId = parseInt(labelIdStr);
        labelItems.push({
            id: `updated-${compositeId}`,
            label: `Label ${labelId} in Area ${areaId} (Updated)`,
            svg: images?.labels.updated[compositeId] ?? "",
            details: renderPropertyDiff(propDiff)
        });
    }
    sections.push(createDetailSection("Labels", "labels", labelItems));

    // Areas
    const areaItems: ReportItem[] = [];
    diff.areas.added.forEach(a => {
        const name = v2.areaNames[a.id] || "Unknown";
        areaItems.push({ id: `added-${a.id}`, label: `Area ${a.id} (${name}) (Added)`, svg: "" });
    });
    diff.areas.deleted.forEach(a => {
        const name = v1.areaNames[a.id] || "Unknown";
        areaItems.push({ id: `deleted-${a.id}`, label: `Area ${a.id} (${name}) (Deleted)`, svg: "" });
    });
    for (const [id, propDiff] of Object.entries(diff.areas.updated)) {
        const aid = parseInt(id);
        const name = v2.areaNames[aid] || "Unknown";
        areaItems.push({
            id: `updated-${id}`,
            label: `Area ${id} (${name}) (Updated)`,
            svg: "",
            details: renderPropertyDiff(propDiff)
        });
    }
    sections.push(createDetailSection("Areas", "areas", areaItems));

    const templatePath = path.join(__dirname, "templates", "report.template.html");
    const stylePath = path.join(__dirname, "templates", "report.css");
    const scriptPath = path.join(__dirname, "templates", "report.js");

    let htmlTemplate = fs.readFileSync(templatePath, "utf8");
    const styleContent = fs.readFileSync(stylePath, "utf8");
    const scriptContent = fs.readFileSync(scriptPath, "utf8");

    const navMapProperties = Object.keys(diff.map).length > 0 ? '<a href="#map-properties">Map Properties</a>' : '';
    const navRooms = diff.rooms.added.length + diff.rooms.deleted.length + Object.keys(diff.rooms.updated).length > 0 ? '<a href="#rooms">Rooms</a>' : '';
    const navLabels = diff.labels.added.length + diff.labels.deleted.length + Object.keys(diff.labels.updated).length > 0 ? '<a href="#labels">Labels</a>' : '';
    const navAreas = diff.areas.added.length + diff.areas.deleted.length + Object.keys(diff.areas.updated).length > 0 ? '<a href="#areas">Areas</a>' : '';

    return htmlTemplate
        .replace('<link rel="stylesheet" href="report.css">', `<style>${styleContent}</style>`)
        .replace('<script src="report.js"></script>', `<script>${scriptContent}</script>`)
        .replace("{{NAV_MAP_PROPERTIES}}", navMapProperties)
        .replace("{{NAV_ROOMS}}", navRooms)
        .replace("{{NAV_LABELS}}", navLabels)
        .replace("{{NAV_AREAS}}", navAreas)
        .replace("{{CONTENT}}", sections.join(""));
}
