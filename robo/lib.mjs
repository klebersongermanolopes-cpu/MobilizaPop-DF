// Funções comuns do robô: baixar dados com tentativas, salvar JSON e datas no fuso de Brasília.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DADOS = resolve(RAIZ, "site", "data");
export const PAUTA = resolve(RAIZ, "robo", "pauta");

const AGENTE = "MobilizaPop/1.0 (+https://www.instagram.com/mobilizapop/)";

export async function baixar(url, { tipo = "json", tentativas = 3, tempo = 20000 } = {}) {
  let erro;
  for (let i = 1; i <= tentativas; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), tempo);
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": AGENTE, Accept: tipo === "json" ? "application/json" : "application/rss+xml, text/xml, */*" },
        signal: ctrl.signal,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
      return tipo === "json" ? await r.json() : await r.text();
    } catch (e) {
      erro = e;
      if (i < tentativas) await esperar(1500 * i);
    } finally {
      clearTimeout(t);
    }
  }
  throw erro;
}

export const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

export async function lerJSON(caminho, padrao = null) {
  try {
    return JSON.parse(await readFile(caminho, "utf8"));
  } catch {
    return padrao;
  }
}

export async function salvarJSON(caminho, dados) {
  await mkdir(dirname(caminho), { recursive: true });
  await writeFile(caminho, JSON.stringify(dados, null, 2) + "\n", "utf8");
}

// Data de hoje (AAAA-MM-DD) e agora (ISO com -03:00) no horário de Brasília.
export function hoje(base = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(base);
}
export function agora(base = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
      .formatToParts(base).map((x) => [x.type, x.value])
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}-03:00`;
}
export function diasAtras(n, base = new Date()) {
  return hoje(new Date(base.getTime() - n * 86400000));
}

export function limpar(texto) {
  return String(texto ?? "").replace(/\s+/g, " ").trim();
}
