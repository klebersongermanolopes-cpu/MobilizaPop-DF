// Testes do robô e do validador: node --test robo/testes/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { paraDeputado, proximaPagina, paraProposicao } from "../fontes/camara.mjs";
import { lerSenadores } from "../fontes/senado.mjs";
import { lerRss, decodificar } from "../fontes/noticias.mjs";
import { validarTudo, procurarCorrompidos } from "../validar.mjs";
import { hoje, agora, DADOS } from "../lib.mjs";

const fx = (nome) => readFile(new URL(`./fixtures/${nome}`, import.meta.url), "utf8");

test("Câmara: converte deputado e força https na foto", async () => {
  const j = JSON.parse(await fx("camara-deputados.json"));
  const [erika, fraga] = j.dados.map(paraDeputado);
  assert.equal(erika.id, "160575");
  assert.equal(erika.partido, "PT");
  assert.equal(erika.url, "https://www.camara.leg.br/deputados/160575");
  assert.equal(fraga.foto, "https://www.camara.leg.br/internet/deputado/bandep/73579.jpg");
  assert.equal(fraga.email, null);
  assert.match(proximaPagina(j.links), /pagina=2/);
  assert.equal(proximaPagina([{ rel: "self", href: "x" }]), null);
});

test("Câmara: monta número da proposição", () => {
  const p = paraProposicao({ id: 1, siglaTipo: "PL", numero: 123, ano: 2026, ementa: "  Altera  a lei " }, "armas");
  assert.equal(p.numero, "PL 123/2026");
  assert.equal(p.ementa, "Altera a lei");
  assert.deepEqual(p.temas, ["armas"]);
});

test("Senado: lê lista, limpa e-mail, remove repetidos e força https", async () => {
  const lista = lerSenadores(JSON.parse(await fx("senado-atuais.json")));
  assert.equal(lista.length, 2);
  const leany = lista.find((s) => s.id === "5977");
  assert.equal(leany.email, "sen.leanylemos@senado.leg.br");
  const damares = lista.find((s) => s.id === "6335");
  assert.match(damares.foto, /^https:/);
  assert.match(damares.url, /^https:/);
});

test("Senado: aceita resposta com um parlamentar só (objeto em vez de lista)", () => {
  const j = { ListaParlamentarEmExercicio: { Parlamentares: { Parlamentar: { IdentificacaoParlamentar: { CodigoParlamentar: "1", NomeParlamentar: "Fulana", SiglaPartidoParlamentar: "X", UfParlamentar: "AM" } } } } };
  assert.equal(lerSenadores(j).length, 1);
});

test("Notícias: lê RSS, decodifica entidades, tira o nome da fonte do título e ignora link inválido", async () => {
  const itens = lerRss(await fx("google-news.xml"));
  assert.equal(itens.length, 2);
  assert.equal(itens[0].titulo, "Senado discute projeto que libera a caça & armas");
  assert.equal(itens[0].fonte, "Agência Senado");
  assert.equal(itens[0].data, "2026-10-28T14:00:00.000Z");
  assert.equal(itens[1].titulo, "Ambientalistas criticam PL da caça");
  assert.equal(decodificar("Na&#231;&#xE3;o"), "Nação");
});

test("Datas no horário de Brasília", () => {
  const base = new Date("2026-10-29T02:30:00Z"); // 23h30 do dia 28 em Brasília
  assert.equal(hoje(base), "2026-10-28");
  assert.equal(agora(base), "2026-10-28T23:30:00-03:00");
});

test("Validador: detecta caracteres corrompidos", () => {
  assert.equal(procurarCorrompidos({ a: "Ação correta" }).length, 0);
  assert.equal(procurarCorrompidos({ a: "MOBILIZAÇÃO" }).length, 0);
  assert.equal(procurarCorrompidos({ a: "AÃ§Ã£o" }).length, 1);
  assert.equal(procurarCorrompidos({ a: ["ok", "aspas â€œerradasâ€"] }).length, 1);
  assert.equal(procurarCorrompidos({ a: "caça &amp; armas" }).length, 1);
});

test("Validador: o conteúdo atual do site passa", async () => {
  const erros = await validarTudo();
  assert.deepEqual(erros, []);
});

test("Validador: barra checagem publicada sem fonte e link sem https", async () => {
  const pasta = await mkdtemp(join(tmpdir(), "mobiliza-"));
  await cp(DADOS, pasta, { recursive: true });
  await writeFile(resolve(pasta, "checagens.json"), JSON.stringify({
    checagens: [{ id: "x", veredito: "falso", titulo: "T", circula: "C", verdade: "V", data: "2026-10-28", fontes: [] }],
  }));
  const alertas = JSON.parse(await readFile(resolve(pasta, "alertas.json"), "utf8"));
  alertas.alertas[0].fontes[0].url = "http://inseguro.com";
  await writeFile(resolve(pasta, "alertas.json"), JSON.stringify(alertas));
  const erros = await validarTudo(pasta);
  assert.ok(erros.some((e) => e.includes("sem fonte não pode ser publicada")));
  assert.ok(erros.some((e) => e.includes("link https válido")));
});
