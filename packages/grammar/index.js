// Resolve the grammar assets from consumers (bundlers, the VS Code extension)
// without hardcoding paths.
import { fileURLToPath } from "node:url";

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));

export const grammarPath = here("./lunas.tmLanguage.json");
export const languageConfigurationPath = here("./language-configuration.json");
export const scopeName = "source.lunas";
export const languageId = "lunas";
export const extensions = [".lunas"];
