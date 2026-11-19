// lucide-react-native's CommonJS entry requires all ~4,600 icon files, which every suite paid for on load; these
// getters require an icon file only when a test renders that icon. The entry's export lines are the name→file map.
const fs = require("node:fs");
const path = require("node:path");

// The bare name maps back to this file, and `exports` hides package.json, so locate the package through `./icons`.
const packageDir = require.resolve("lucide-react-native/icons").replace(/[/\\]dist[/\\].*$/, "");
const cjsDir = path.join(packageDir, "dist/cjs");
const entry = fs.readFileSync(path.join(cjsDir, "lucide-react-native.js"), "utf8");

const fileOf = new Map();

for (const [, variable, file] of entry.matchAll(/^var (\w+) = require\('\.\/(.+)'\);$/gm)) {
  fileOf.set(variable, path.join(cjsDir, file));
}

for (const [, name, variable, property] of entry.matchAll(
  /^exports\.(\w+) = (\w+)(?:\.(\w+))?;$/gm,
)) {
  Object.defineProperty(exports, name, {
    enumerable: true,
    get: () => {
      const loaded = require(fileOf.get(variable));

      return property ? loaded[property] : loaded;
    },
  });
}
