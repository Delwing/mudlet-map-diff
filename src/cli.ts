#!/usr/bin/env node
import { Command } from 'commander';
import { Listr } from 'listr2';
import { compareMaps, MapDiff } from './diff.js';
import { exportDiff } from './exporter.js';
import { RenderedImages } from './html-exporter.js';
import { MudletMap } from 'mudlet-map-binary-reader/dist/types.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

interface Ctx {
    v1: MudletMap;
    v2: MudletMap;
    diff: MapDiff;
    images?: RenderedImages;
}

function diffSummary(diff: MapDiff): string {
    const parts: string[] = [];
    const rooms = diff.rooms.added.length + diff.rooms.deleted.length + Object.keys(diff.rooms.updated).length;
    const labels = diff.labels.added.length + diff.labels.deleted.length + Object.keys(diff.labels.updated).length;
    const areas = diff.areas.added.length + diff.areas.deleted.length + Object.keys(diff.areas.updated).length;
    if (rooms > 0) parts.push(`${rooms} room${rooms !== 1 ? 's' : ''}`);
    if (labels > 0) parts.push(`${labels} label${labels !== 1 ? 's' : ''}`);
    if (areas > 0) parts.push(`${areas} area${areas !== 1 ? 's' : ''}`);
    return parts.length > 0 ? parts.join(', ') + ' changed' : 'no changes';
}

function svgItemCount(diff: MapDiff): number {
    return diff.rooms.added.length + diff.rooms.deleted.length + Object.keys(diff.rooms.updated).length
         + diff.labels.added.length + diff.labels.deleted.length + Object.keys(diff.labels.updated).length;
}

const program = new Command();

program
    .name('mudlet-map-diff')
    .description('CLI to compare two Mudlet maps and generate SVG diffs')
    .version(packageJson.version)
    .argument('<oldMap>', 'path to the old map file (.dat)')
    .argument('<newMap>', 'path to the new map file (.dat)')
    .option('-o, --output <dir>', 'directory to save the SVG diffs', 'diff')
    .option('--html', 'generate interactive HTML report', false)
    .option('--no-svg', 'do not generate individual SVG files')
    .option('--debug-raw', 'also save raw renderer SVGs before composition', false)
    .action(async (oldMap, newMap, options) => {
        const tasks = new Listr<Ctx>(
            [
                {
                    title: 'Computing diff',
                    task: (ctx, task) => {
                        const result = compareMaps(oldMap, newMap);
                        ctx.v1 = result.v1;
                        ctx.v2 = result.v2;
                        ctx.diff = result.diff;
                        task.title = `Computing diff — ${diffSummary(ctx.diff)}`;
                    },
                },
                {
                    title: 'Rendering SVGs',
                    skip: (ctx) => {
                        if (!options.svg) return true;
                        if (svgItemCount(ctx.diff) === 0) return 'no visual changes';
                        return false;
                    },
                    rendererOptions: { persistentOutput: true },
                    task: async (ctx, task) => {
                        const total = svgItemCount(ctx.diff);
                        ctx.images = await exportDiff(ctx.v1, ctx.v2, ctx.diff, {
                            outDir: options.output,
                            svg: true,
                            html: false,
                            debugRaw: options.debugRaw,
                            onProgress: (done) => {
                                const pct = Math.floor((done / total) * 100);
                                const filled = Math.floor((done / total) * 30);
                                task.output = `[${'█'.repeat(filled)}${'░'.repeat(30 - filled)}] ${pct}% (${done}/${total})`;
                            },
                        });
                    },
                },
                {
                    title: 'Generating HTML report',
                    skip: () => !options.html,
                    task: async (ctx) => {
                        await exportDiff(ctx.v1, ctx.v2, ctx.diff, {
                            outDir: options.output,
                            svg: false,
                            html: true,
                            images: ctx.images,
                        });
                    },
                },
            ],
            { rendererOptions: { collapseSkips: false } }
        );

        try {
            await tasks.run();
            console.log(`\nOutput saved to ${options.output}/`);
        } catch (error) {
            console.error(error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });

program.parse();
