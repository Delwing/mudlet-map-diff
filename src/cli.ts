#!/usr/bin/env node
import { Command } from 'commander';
import { createDiff } from './index.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

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
  .action(async (oldMap, newMap, options) => {
    try {
      console.log(`Comparing ${oldMap} and ${newMap}...`);
      await createDiff(oldMap, newMap, {
          outDir: options.output,
          svg: options.svg,
          html: options.html
      });
      console.log(`Diff generated successfully in ${options.output}/`);
    } catch (error) {
      console.error('Error generating diff:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
