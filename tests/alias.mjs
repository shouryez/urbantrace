// Lets `node --test` and the scripts resolve imports the way Next.js does: "@/..." (tsconfig
// paths) and extensionless relative imports ("./geo") to .ts and .tsx files.
import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

function findFile(base) {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const file = findFile(root + specifier.slice(2));
      if (file) return nextResolve(pathToFileURL(file).href, context);
    }
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
      const parent = fileURLToPath(context.parentURL);
      if (parent.startsWith(root) && !parent.includes("node_modules")) {
        const file = findFile(fileURLToPath(new URL(specifier, context.parentURL)));
        if (file) return nextResolve(pathToFileURL(file).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});
