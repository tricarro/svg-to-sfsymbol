import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
/** Absolute path to the `build-pipeline` package root (contains `resources/`). */
export const BUILD_PIPELINE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
