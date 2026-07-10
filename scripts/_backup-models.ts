/** Model list for the logical backup toolkit. Prisma 7 no longer exposes
 *  Prisma.dmmf at runtime, so we parse model names straight from the schema —
 *  robust and dependency-free. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function backupModelNames(): string[] {
  const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
  const names: string[] = [];
  const re = /^model\s+(\w+)\s*\{/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(schema))) names.push(m[1]);
  return names;
}

/** PascalCase model name → camelCase Prisma client delegate. */
export const delegateOf = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);
