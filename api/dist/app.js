import { readFileSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { runFullConvert } from "./pipeline.js";
import { defaultSquareTemplatePath } from "./phase5.js";
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ENV_TEMPLATE = "SFSYMBOL_TEMPLATE_PATH";
function expandUser(p) {
    if (p === "~")
        return homedir();
    if (p.startsWith("~/"))
        return join(homedir(), p.slice(2));
    return p;
}
export function safeStem(name) {
    const base = name.replace(/^.*[/\\]/, "");
    let stem = base.replace(/\.svg$/i, "");
    if (!stem)
        stem = "upload";
    stem = stem.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^[._-]+|[._-]+$/g, "") || "upload";
    if (stem.length > 120)
        stem = stem.slice(0, 120);
    return stem;
}
export function resolveSquareTemplate() {
    const raw = process.env[ENV_TEMPLATE];
    if (raw) {
        const p = resolve(expandUser(raw.trim()));
        if (!existsSync(p)) {
            throw new Error(`${ENV_TEMPLATE} is set but file not found: ${p}`);
        }
        return p;
    }
    const def = defaultSquareTemplatePath();
    if (!def) {
        throw new Error(`No SF Symbol square template found. Set ${ENV_TEMPLATE} to the template file path, ` +
            "or add resources/square_template.svg at the repository root.");
    }
    return def;
}
export function convertSync(svgBytes, originalFilename) {
    if (svgBytes.length > MAX_UPLOAD_BYTES) {
        throw new Error(`SVG exceeds maximum size (${MAX_UPLOAD_BYTES} bytes).`);
    }
    if (!originalFilename.toLowerCase().endsWith(".svg")) {
        throw new Error("Only .svg uploads are supported.");
    }
    const stem = safeStem(originalFilename);
    const template = resolveSquareTemplate();
    const tmp = mkdtempSync(join(tmpdir(), "svg2sfs_"));
    const inputPath = join(tmp, `${stem}.svg`);
    writeFileSync(inputPath, svgBytes);
    const outSvg = join(tmp, `${stem}_SFSymbol.svg`);
    const result = runFullConvert(inputPath, tmp, {
        phase5Template: template,
        phase5Out: outSvg,
        phase5Missing: "skip",
    });
    const merged = result.mergedSvg;
    if (!merged || !existsSync(merged)) {
        throw new Error("Conversion finished without a merged SVG output.");
    }
    const data = readFileSync(merged);
    return { data, downloadName: `${stem}_SFSymbol.svg` };
}
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FRONTEND_DIST = join(__dirname, "..", "..", "frontend", "dist");
export async function buildApp() {
    const app = Fastify({ logger: true });
    await app.register(multipart, {
        limits: { fileSize: MAX_UPLOAD_BYTES },
    });
    app.post("/api/convert", async (request, reply) => {
        const data = await request.file();
        if (!data) {
            return reply.code(400).send({ detail: "Missing file." });
        }
        const filename = data.filename || "";
        if (!filename) {
            return reply.code(400).send({ detail: "Missing file name." });
        }
        const chunks = [];
        for await (const ch of data.file) {
            chunks.push(Buffer.from(ch));
        }
        const body = Buffer.concat(chunks);
        if (body.length > MAX_UPLOAD_BYTES) {
            return reply.code(413).send({ detail: `File too large (max ${MAX_UPLOAD_BYTES} bytes).` });
        }
        if (body.length === 0) {
            return reply.code(400).send({ detail: "Empty file." });
        }
        try {
            const { data: out, downloadName } = convertSync(body, filename);
            return reply
                .header("Content-Type", "image/svg+xml")
                .header("Content-Disposition", `attachment; filename="${downloadName}"`)
                .send(out);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes("Only .svg")) {
                return reply.code(400).send({ detail: msg });
            }
            if (msg.includes("exceeds maximum")) {
                return reply.code(400).send({ detail: msg });
            }
            if (msg.includes("No SF Symbol") || msg.includes("SFSYMBOL_TEMPLATE_PATH")) {
                return reply.code(503).send({ detail: msg });
            }
            return reply.code(500).send({ detail: msg });
        }
    });
    if (existsSync(FRONTEND_DIST)) {
        await app.register(fastifyStatic, {
            root: FRONTEND_DIST,
        });
        app.get("/", async (_req, reply) => reply.sendFile("index.html"));
    }
    return app;
}
