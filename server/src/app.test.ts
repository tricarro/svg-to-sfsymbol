import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp, convertSync } from "./app.js";
import { defaultSquareTemplatePath } from "./phase5.js";
import type { FastifyInstance } from "fastify";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const templatePath = join(repoRoot, "resources", "square_template.svg");
const variableTemplatePath = join(repoRoot, "resources", "square_variable_template.svg");

describe("convertSync", () => {
  const prev = process.env.SFSYMBOL_TEMPLATE_PATH;
  beforeAll(() => {
    if (existsSync(templatePath)) {
      process.env.SFSYMBOL_TEMPLATE_PATH = templatePath;
    }
  });
  afterAll(() => {
    if (prev === undefined) delete process.env.SFSYMBOL_TEMPLATE_PATH;
    else process.env.SFSYMBOL_TEMPLATE_PATH = prev;
  });

  it("rejects non-svg extension", () => {
    expect(() => convertSync(Buffer.from("<svg/>"), "x.txt")).toThrow("Only .svg");
  });

  it("returns merged SVG when template exists", () => {
    if (!existsSync(templatePath)) {
      expect(defaultSquareTemplatePath()).toBeNull();
      return;
    }
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 12h16" stroke="black" stroke-width="2" fill="none"/></svg>`,
      "utf-8"
    );
    const { data, downloadName } = convertSync(svg, "icon.svg");
    expect(downloadName.endsWith("_SFSymbol.svg")).toBe(true);
    expect(data.toString("utf-8")).toContain("<svg");
    expect(data.toString("utf-8")).toContain("Symbols");
  });

  it("uses variable template and hyphen filename for fill-only icon", () => {
    if (!existsSync(variableTemplatePath)) return;
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6" fill="red"/></svg>`,
      "utf-8"
    );
    const { data, downloadName } = convertSync(svg, "myicon.svg");
    expect(downloadName).toBe("myicon-SFSymbol.svg");
    const s = data.toString("utf-8");
    expect(s).toContain('id="Ultralight-S"');
    expect(s).not.toMatch(/<path[^>]*class="[^"]*SFSymbolsPreviewWireframe/);
  });

  it("uses square template and underscore filename for mixed stroke+fill icon", () => {
    if (!existsSync(templatePath)) return;
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
        `<path d="M4 12h16" stroke="black" stroke-width="2" fill="none"/>` +
        `<circle cx="12" cy="12" r="5" fill="red"/>` +
        `</svg>`,
      "utf-8"
    );
    const { data, downloadName } = convertSync(svg, "mixed.svg");
    expect(downloadName).toBe("mixed_SFSymbol.svg");
    const s = data.toString("utf-8");
    expect(s).toContain("Symbols");
    expect(s).toContain("<svg");
  });
});

describe("POST /api/convert", () => {
  let app: FastifyInstance;
  const prev = process.env.SFSYMBOL_TEMPLATE_PATH;

  beforeAll(async () => {
    if (existsSync(templatePath)) {
      process.env.SFSYMBOL_TEMPLATE_PATH = templatePath;
    }
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    if (prev === undefined) delete process.env.SFSYMBOL_TEMPLATE_PATH;
    else process.env.SFSYMBOL_TEMPLATE_PATH = prev;
  });

  it("returns 400 for empty file", async () => {
    const boundary = "----BoundaryTest123";
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="a.svg"',
      "Content-Type: image/svg+xml",
      "",
      "",
      `--${boundary}--`,
      "",
    ].join("\r\n");

    const res = await app.inject({
      method: "POST",
      url: "/api/convert",
      payload: body,
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns SVG attachment when template and valid SVG", async () => {
    if (!existsSync(templatePath)) return;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 12h16" stroke="black" stroke-width="2" fill="none"/></svg>`;
    const boundary = "----BoundaryTest456";
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="z.svg"',
      "Content-Type: image/svg+xml",
      "",
      svg,
      `--${boundary}--`,
      "",
    ].join("\r\n");

    const res = await app.inject({
      method: "POST",
      url: "/api/convert",
      payload: body,
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/svg+xml");
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.body).toContain("Symbols");
  });
});
