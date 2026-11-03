// Servidor local para ver o site no seu computador: node robo/servidor.mjs
// Depois abra http://localhost:8080 no navegador.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, normalize, sep } from "node:path";
import { RAIZ } from "./lib.mjs";

const SITE = resolve(RAIZ, "site");
const PORTA = Number(process.env.PORT || 8080);
const TIPOS = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
};

createServer(async (req, res) => {
  const caminho = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const alvo = normalize(resolve(SITE, "." + (caminho.endsWith("/") ? caminho + "index.html" : caminho)));
  if (!alvo.startsWith(SITE + sep) && alvo !== SITE) { res.writeHead(403).end(); return; }
  try {
    const corpo = await readFile(alvo);
    res.writeHead(200, { "Content-Type": TIPOS[extname(alvo)] || "application/octet-stream", "Cache-Control": "no-cache" }).end(corpo);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Não encontrado");
  }
}).listen(PORTA, () => console.log(`Site rodando em http://localhost:${PORTA}  (Ctrl+C para parar)`));
