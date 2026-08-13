import fs from "node:fs";
import path from "node:path";

const roots = ["src", "src-tauri/src"];
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".html", ".rs"]);

const cp = (...values) => String.fromCodePoint(...values);

const suspicious = [
  { token: cp(0x00c2), label: "U+00C2 stray character (common UTF-8 mojibake)" },
  { token: cp(0x00c3), label: "U+00C3 stray character (common UTF-8 mojibake)" },
  { token: cp(0x00e2, 0x20ac), label: "corrupted punctuation sequence beginning U+00E2 U+20AC" },
  { token: cp(0x00ef, 0x00bb, 0x00bf), label: "visible UTF-8 BOM byte sequence" },
  { token: cp(0xfffd), label: "Unicode replacement character U+FFFD" },
];

const failures = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(full);
      continue;
    }

    if (!extensions.has(path.extname(entry.name).toLowerCase())) continue;

    const text = fs.readFileSync(full, "utf8");
    const lines = text.split(/\r?\n/);

    lines.forEach((line, index) => {
      for (const rule of suspicious) {
        if (line.includes(rule.token)) {
          failures.push(`${full}:${index + 1}: ${rule.label}`);
        }
      }
    });
  }
}

for (const root of roots) walk(root);

if (failures.length) {
  console.error("Source encoding check failed:");
  for (const failure of failures) console.error(`  ${failure}`);
  console.error("");
  console.error("Remove corrupted display text before building.");
  process.exit(1);
}

console.log("Source encoding check passed.");
