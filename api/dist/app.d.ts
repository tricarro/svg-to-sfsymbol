import Fastify from "fastify";
export declare const MAX_UPLOAD_BYTES: number;
export declare function safeStem(name: string): string;
export declare function resolveSquareTemplate(): string;
export declare function convertSync(svgBytes: Buffer, originalFilename: string): {
    data: Buffer;
    downloadName: string;
};
export declare function buildApp(): Promise<Fastify.FastifyInstance<import("http").Server<typeof import("http").IncomingMessage, typeof import("http").ServerResponse>, import("http").IncomingMessage, import("http").ServerResponse<import("http").IncomingMessage>, Fastify.FastifyBaseLogger, Fastify.FastifyTypeProviderDefault>>;
