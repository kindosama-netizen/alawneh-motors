import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public", "data");
fs.mkdirSync(out, { recursive: true });
for (const name of ["cars.json", "site.json"]) {
  fs.copyFileSync(path.join(root, "data", name), path.join(out, name));
}
console.log("exported static catalog");
