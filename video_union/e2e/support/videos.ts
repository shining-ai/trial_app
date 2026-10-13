import { join } from "node:path";

// global-setup.ts がテスト前に作る動画の置き場所と名前
export const VIDEO_DIR = "/tmp/e2e-videos";

export const videoPath = (name: string) => join(VIDEO_DIR, name);
