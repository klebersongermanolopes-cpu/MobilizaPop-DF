// Converte banco/schema.sql (MySQL) para SQLite, usado nos testes e na rede local de demonstração.
import { readFileSync } from "node:fs";
export function schemaSqlite(raiz) {
  return readFileSync(raiz + "/banco/schema.sql", "utf8")
    .replace(/^--.*$/gm, "")
    .replace(/SET NAMES utf8mb4;/, "")
    .replace(/\)\s*ENGINE=[^;]+;/g, ");")
    .replace(/(BIG)?INT UNSIGNED AUTO_INCREMENT PRIMARY KEY/g, "INTEGER PRIMARY KEY AUTOINCREMENT")
    .replace(/^\s*INDEX \([^)]*\),?\s*$/gm, "")
    .replace(/UNIQUE KEY \w+ \(/g, "UNIQUE (")
    .replace(/,(\s*\n\s*\))/g, "$1");
}
// Escreve um array PHP a partir de um objeto JS simples
export function phpArray(o) {
  if (Array.isArray(o)) return "[" + o.map(phpArray).join(",") + "]";
  if (o && typeof o === "object") return "[" + Object.entries(o).map(([k, v]) => JSON.stringify(k) + "=>" + phpArray(v)).join(",") + "]";
  if (typeof o === "string") return "'" + o.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
  return JSON.stringify(o);
}
