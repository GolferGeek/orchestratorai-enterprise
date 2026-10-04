import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from 'yaml';
import { validateRubric, type Rubric } from './rubric';

/** One rubric file. The folder is the group; a file may state its group, but it must agree. */
export function loadRubricFile(file: string, group: string): Rubric {
  const parsed = parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  if (parsed.group !== undefined && parsed.group !== group) throw new Error(`${file}: group '${String(parsed.group)}' disagrees with folder '${group}'`);
  parsed.group = group;
  validateRubric(parsed);
  return parsed;
}

/**
 * Load <dir>/<group>/*.yaml, keyed by rubric name (unique across groups). A
 * missing or empty directory is an error: every check would fail later, far
 * from the cause.
 */
export function loadRubricDir(dir: string): Map<string, Rubric> {
  if (!fs.existsSync(dir)) throw new Error(`rubric directory ${dir} does not exist`);
  const out = new Map<string, Rubric>();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (!entry.isDirectory()) throw new Error(`${full}: rubrics live in a group folder (rubrics/<group>/<name>.yaml)`);
    for (const file of fs.readdirSync(full).sort()) {
      if (!/\.ya?ml$/.test(file)) continue;
      const rubric = loadRubricFile(path.join(full, file), entry.name);
      if (out.has(rubric.name)) throw new Error(`duplicate rubric name ${rubric.name} (${entry.name}/${file})`);
      out.set(rubric.name, rubric);
    }
  }
  if (out.size === 0) throw new Error(`no rubrics in ${dir}`);
  return out;
}
