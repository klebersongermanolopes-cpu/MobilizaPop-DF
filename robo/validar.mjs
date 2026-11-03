// Validador do conteúdo do site. Roda antes de publicar (no GitHub e no seu PC).
// Barra: JSON quebrado, campos obrigatórios vazios, links sem https, checagem sem fonte,
// datas fora do formato e texto com caracteres corrompidos (ex.: "Ã§" no lugar de "ç").
//
// Uso: node robo/validar.mjs
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DADOS } from "./lib.mjs";

const RESERVADAS = ["inicio", "alertas", "monitor", "checagem", "boletim", "sobre", "settings", "sidebar", "customize", "upgrade", "downloads"];
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const DATAHORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)?$/;
// Sinais típicos de texto UTF-8 lido com a codificação errada, e o caractere de substituição.
const CORROMPIDO = /Ã[\u0080-¿]|Â[\u0080-¿ ]|â€|�|&(amp|quot|#\d+);/;

export function procurarCorrompidos(obj, caminho = "") {
  const achados = [];
  if (typeof obj === "string") {
    if (CORROMPIDO.test(obj)) achados.push(`${caminho}: texto com caractere corrompido: "${obj.slice(0, 60)}"`);
  } else if (Array.isArray(obj)) {
    obj.forEach((v, i) => achados.push(...procurarCorrompidos(v, `${caminho}[${i}]`)));
  } else if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) achados.push(...procurarCorrompidos(v, caminho ? `${caminho}.${k}` : k));
  }
  return achados;
}

function regras(erros, arquivo) {
  const e = (msg) => erros.push(`${arquivo}: ${msg}`);
  const texto = (v, onde, max) => {
    if (typeof v !== "string" || !v.trim()) e(`${onde} está vazio`);
    else if (max && v.length > max) e(`${onde} tem ${v.length} caracteres (máximo ${max})`);
  };
  const link = (v, onde, opcional = false) => {
    if (v == null || v === "") { if (!opcional) e(`${onde} sem link`); return; }
    if (!/^https:\/\/[^\s]+$/.test(v)) e(`${onde} precisa ser um link https válido: ${v}`);
  };
  const data = (v, onde, opcional = false) => {
    if (v == null || v === "") { if (!opcional) e(`${onde} sem data`); return; }
    if (!DATA.test(v)) e(`${onde} deve estar no formato AAAA-MM-DD: ${v}`);
  };
  return { e, texto, link, data };
}

const validadores = {
  "alertas.json"(j, erros) {
    const { e, texto, link, data } = regras(erros, "alertas.json");
    if (!Array.isArray(j.alertas)) return e("falta a lista \"alertas\"");
    const slugs = new Set();
    j.alertas.forEach((a, i) => {
      const o = `alerta ${a.slug || i}`;
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug || "")) e(`${o}: slug deve ter só letras minúsculas, números e hífens`);
      if (RESERVADAS.includes(a.slug)) e(`${o}: slug "${a.slug}" é reservado`);
      if (slugs.has(a.slug)) e(`${o}: slug repetido`);
      slugs.add(a.slug);
      texto(a.numero, `${o}.numero`, 40);
      texto(a.titulo, `${o}.titulo`, 120);
      texto(a.casa, `${o}.casa`);
      texto(a.resumo, `${o}.resumo`, 280);
      data(a.atualizado_em, `${o}.atualizado_em`);
      if (typeof a.gerado_por_ia !== "boolean") e(`${o}.gerado_por_ia deve ser true ou false`);
      if (!["alta", "media", "baixa"].includes(a.prioridade)) e(`${o}.prioridade deve ser alta, media ou baixa`);
      if (!Array.isArray(a.capitulos) || !a.capitulos.length) e(`${o}: precisa de pelo menos um capítulo`);
      (a.capitulos || []).forEach((c, k) => {
        texto(c.rotulo, `${o}.capitulos[${k}].rotulo`, 30);
        texto(c.titulo, `${o}.capitulos[${k}].titulo`, 90);
        if (!Array.isArray(c.texto) || !c.texto.length) e(`${o}.capitulos[${k}].texto precisa de pelo menos um parágrafo`);
        (c.texto || []).forEach((p, n) => texto(p, `${o}.capitulos[${k}].texto[${n}]`, 600));
        if (c.tipo && !["placar", "acao"].includes(c.tipo)) e(`${o}.capitulos[${k}].tipo inválido: ${c.tipo}`);
      });
      if (a.consulta) {
        link(a.consulta.url, `${o}.consulta.url`);
        for (const k of ["sim", "nao"]) if (!Number.isInteger(a.consulta[k]) || a.consulta[k] < 0) e(`${o}.consulta.${k} deve ser um número inteiro`);
        if (!DATAHORA.test(a.consulta.apurado_em || "")) e(`${o}.consulta.apurado_em deve ser data e hora ISO`);
      }
      if (a.acao) { texto(a.acao.texto, `${o}.acao.texto`, 30); link(a.acao.url, `${o}.acao.url`); }
      if (!Array.isArray(a.fontes) || !a.fontes.length) e(`${o}: precisa de pelo menos uma fonte`);
      (a.fontes || []).forEach((f, k) => { texto(f.nome, `${o}.fontes[${k}].nome`); link(f.url, `${o}.fontes[${k}].url`); });
    });
  },
  "checagens.json"(j, erros) {
    const { e, texto, link, data } = regras(erros, "checagens.json");
    if (!Array.isArray(j.checagens)) return e("falta a lista \"checagens\"");
    j.checagens.forEach((c, i) => {
      const o = `checagem ${c.id || i}`;
      texto(c.id, `${o}.id`);
      if (!["falso", "enganoso", "verdadeiro"].includes(c.veredito)) e(`${o}.veredito deve ser falso, enganoso ou verdadeiro`);
      texto(c.titulo, `${o}.titulo`, 120);
      texto(c.circula, `${o}.circula`, 500);
      texto(c.verdade, `${o}.verdade`, 900);
      data(c.data, `${o}.data`);
      if (!c.modelo && (!Array.isArray(c.fontes) || !c.fontes.length)) e(`${o}: checagem sem fonte não pode ser publicada`);
      (c.fontes || []).forEach((f, k) => { texto(f.nome, `${o}.fontes[${k}].nome`); link(f.url, `${o}.fontes[${k}].url`); });
    });
  },
  "agenda.json"(j, erros) {
    const { e, texto, link, data } = regras(erros, "agenda.json");
    if (!Array.isArray(j.eventos)) return e("falta a lista \"eventos\"");
    j.eventos.forEach((ev, i) => {
      const o = `evento ${i + 1}`;
      data(ev.data, `${o}.data`, true);
      if (ev.data == null || ev.data === "") texto(ev.rotulo_data, `${o}.rotulo_data (obrigatório quando não há data)`, 14);
      texto(ev.titulo, `${o}.titulo`, 90);
      texto(ev.descricao, `${o}.descricao`, 200);
      texto(ev.tag, `${o}.tag`, 16);
      link(ev.url, `${o}.url`, true);
    });
  },
  "boletim.json"(j, erros) {
    const { e, texto, link, data } = regras(erros, "boletim.json");
    if (!Array.isArray(j.edicoes)) return e("falta a lista \"edicoes\"");
    const ids = new Set();
    j.edicoes.forEach((ed, i) => {
      const o = `edição ${ed.id || i}`;
      texto(ed.id, `${o}.id`);
      if (ids.has(ed.id)) e(`${o}: id repetido`);
      ids.add(ed.id);
      data(ed.data, `${o}.data`);
      texto(ed.manchete, `${o}.manchete`, 120);
      if (!Array.isArray(ed.itens) || !ed.itens.length) e(`${o}: precisa de pelo menos um item`);
      (ed.itens || []).forEach((it, k) => {
        if (!["alerta", "noticia", "agenda", "checagem"].includes(it.tipo)) e(`${o}.itens[${k}].tipo inválido: ${it.tipo}`);
        texto(it.titulo, `${o}.itens[${k}].titulo`, 110);
        texto(it.texto, `${o}.itens[${k}].texto`, 400);
        link(it.url, `${o}.itens[${k}].url`, true);
        if (it.tipo === "noticia" && !ed.exemplo && !it.url) e(`${o}.itens[${k}]: notícia sem link da fonte`);
      });
    });
  },
  "deputados.json"(j, erros) { parlamentares(j, erros, "deputados.json"); },
  "senadores.json"(j, erros) { parlamentares(j, erros, "senadores.json"); },
};

function parlamentares(j, erros, arquivo) {
  const { e, texto } = regras(erros, arquivo);
  if (!Array.isArray(j.parlamentares) || !j.parlamentares.length) return e("lista de parlamentares vazia");
  j.parlamentares.forEach((p, i) => {
    const o = `parlamentar ${p.nome || i}`;
    texto(p.id, `${o}.id`);
    texto(p.nome, `${o}.nome`);
    texto(p.partido, `${o}.partido`);
    if (!/^[A-Z]{2}$/.test(p.uf || "")) e(`${o}.uf deve ser a sigla do estado (ex.: DF)`);
  });
}

export async function validarTudo(pasta = DADOS) {
  const erros = [];
  const arquivos = (await readdir(pasta)).filter((f) => f.endsWith(".json"));
  for (const arquivo of arquivos) {
    let j;
    try {
      j = JSON.parse(await readFile(resolve(pasta, arquivo), "utf8"));
    } catch (err) {
      erros.push(`${arquivo}: JSON inválido (${err.message})`);
      continue;
    }
    erros.push(...procurarCorrompidos(j).map((x) => `${arquivo}: ${x}`));
    validadores[arquivo]?.(j, erros);
  }
  return erros;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const erros = await validarTudo();
  if (erros.length) {
    console.error(`✘ ${erros.length} problema(s) no conteúdo:\n- ` + erros.join("\n- "));
    process.exit(1);
  }
  console.log("✔ Conteúdo válido: pode publicar.");
}
