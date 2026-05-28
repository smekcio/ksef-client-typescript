import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "src", "documents", "fa3", "schemas");
const target = path.join(root, "dist", "documents", "fa3", "schemas");

await mkdir(path.dirname(target), { recursive: true });
await cp(source, target, { recursive: true, force: true });
