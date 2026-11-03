// Notícias: RSS de busca do Google Notícias (Brasil, português).
import { baixar, limpar } from "../lib.mjs";

const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodificar(s) {
  return String(s ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n.toLowerCase()] ?? m);
}

const campo = (bloco, tag) => {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i").exec(bloco);
  return m ? limpar(decodificar(m[1])) : "";
};

export function lerRss(xml) {
  const itens = [];
  for (const m of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const b = m[1];
    const fonte = campo(b, "source");
    let titulo = campo(b, "title");
    if (fonte && titulo.endsWith(` - ${fonte}`)) titulo = titulo.slice(0, -(fonte.length + 3));
    const data = campo(b, "pubDate");
    const d = data ? new Date(data) : null;
    itens.push({
      titulo,
      url: campo(b, "link"),
      fonte: fonte || null,
      data: d && !isNaN(d) ? d.toISOString() : null,
    });
  }
  return itens.filter((i) => i.titulo && /^https:\/\//.test(i.url));
}

export async function buscarNoticias(consulta, { dias = 2, max = 8 } = {}) {
  const q = encodeURIComponent(`${consulta} when:${dias}d`);
  const xml = await baixar(`https://news.google.com/rss/search?q=${q}&hl=pt-BR&gl=BR&ceid=BR:pt-419`, { tipo: "texto" });
  return lerRss(xml).slice(0, max);
}
