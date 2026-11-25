import { copyFile, mkdir, readdir } from "node:fs/promises";

const from = new URL("../node_modules/@mediapipe/tasks-vision/wasm/", import.meta.url);
const to = new URL("../public/vision/", import.meta.url);
await mkdir(to, { recursive: true });
const assets = await readdir(from);
await Promise.all(assets.map((name) => copyFile(new URL(name, from), new URL(name, to))));
