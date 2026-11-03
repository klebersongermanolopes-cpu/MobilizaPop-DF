// Sobe a rede no seu computador, com um banco de demonstração (SQLite), para testar sem a Hostinger.
// Precisa do PHP 8.1+ instalado (no Windows: https://windows.php.net/download, ative pdo_sqlite, gd, intl, fileinfo e curl no php.ini).
// Uso: npm run rede-local   → abra http://localhost:8080 e use "Entrar como teste".
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { schemaSqlite, phpArray } from "./sqlite.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PASTA = join(RAIZ, "testes", ".local");
mkdirSync(join(PASTA, "uploads"), { recursive: true });
const db = join(PASTA, "rede.sqlite");
if (!existsSync(db)) {
  writeFileSync(join(PASTA, "schema.sql"), schemaSqlite(RAIZ));
  execFileSync("php", ["-r", `$p=new PDO('sqlite:'.$argv[1]);$p->exec(file_get_contents($argv[2]));`, db, join(PASTA, "schema.sql")]);
}
writeFileSync(join(PASTA, "config.php"), "<?php return " + phpArray({
  banco: { dsn: "sqlite:" + db }, google_client_id: "local", admins: ["admin@local"], permitir_login_teste: true,
  pasta_uploads: join(RAIZ, "site", "uploads"), url_uploads: "/uploads", exigir_verificacao_idade: true,
}) + ";");
console.log("Rede local em http://localhost:8080  (Ctrl+C para parar)\nEntre como teste com o e-mail admin@local para ser administrador.");
spawn("php", ["-S", "localhost:8080", "-t", join(RAIZ, "site")], { stdio: "inherit", env: { ...process.env, MP_CONFIG: join(PASTA, "config.php") } });
