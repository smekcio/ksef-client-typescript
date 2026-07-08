import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const source = path.resolve("src", "xml", "fa3-schemas");
const target = path.resolve("dist", "xml", "fa3-schemas");

await mkdir(path.dirname(target), { recursive: true });
await cp(source, target, { recursive: true });
