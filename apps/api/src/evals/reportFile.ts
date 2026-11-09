import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Saves the report so it outlives the terminal. Creates missing folders and
 * overwrites an earlier file of the same name. Throws on a path that cannot
 * be written; the caller reports that without losing the printed copy.
 */
export function writeReportFile(file: string, report: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${report}\n`);
}
