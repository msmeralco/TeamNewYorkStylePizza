import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

/** Dev server only: POST /__save?name=x.png (body = data URL) writes into ./test-output. Never part of a build. */
function devSave(): Plugin {
  return {
    name: "dev-save",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__save", (req, res) => {
        const name = path.basename(new URL(req.url ?? "", "http://x").searchParams.get("name") ?? "out.bin");
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          const b64 = body.replace(/^data:[^,]+,/, "");
          const dir = path.resolve(__dirname, "test-output");
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, name), Buffer.from(b64, "base64"));
          res.end(path.join(dir, name));
        });
      });
    },
  };
}

// `--mode hosted` builds the public version for the judges (reader tools hidden).
export default defineConfig(({ mode }) => ({
  plugins: [react(), devSave()],
  define: mode === "hosted" ? { "import.meta.env.VITE_HOSTED": JSON.stringify("1") } : {},
}));
