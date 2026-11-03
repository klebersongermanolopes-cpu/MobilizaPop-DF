// Testes da API da rede social. Sobe o PHP embutido com um banco SQLite temporário e simula pessoas usando a rede.
// Rodar: node --test testes/api.test.mjs   (precisa de PHP 8.1+ com pdo_sqlite e gd)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { schemaSqlite, phpArray } from "./sqlite.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORTA = 8000 + Math.floor(Math.random() * 900);
const BASE = `http://127.0.0.1:${PORTA}/api/`;
let php, tmp;

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), "mp-api-"));
  const db = join(tmp, "teste.sqlite");
  mkdirSync(join(tmp, "uploads"));
  writeFileSync(join(tmp, "schema.sql"), schemaSqlite(RAIZ));
  execFileSync("php", ["-r", `$p=new PDO('sqlite:${db}');$p->exec(file_get_contents('${join(tmp, "schema.sql")}'));`]);
  writeFileSync(join(tmp, "config.php"), "<?php return " + phpArray({
    banco: { dsn: `sqlite:${db}` }, google_client_id: "teste", admins: ["admin@teste.org"], permitir_login_teste: true,
    pasta_uploads: join(tmp, "uploads"), url_uploads: "/uploads", denuncias_para_ocultar: 2, exigir_verificacao_idade: true,
  }) + ";");
  php = spawn("php", ["-S", `127.0.0.1:${PORTA}`, "-t", join(RAIZ, "site")], { env: { ...process.env, MP_CONFIG: join(tmp, "config.php") }, stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + "?r=eu"); return; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  throw new Error("PHP não subiu");
});
after(() => php?.kill());

// Uma "pessoa" com cookie de sessão e token CSRF próprios
function pessoa() {
  let cookie = "", csrf = "";
  async function chamar(rota, { metodo = "GET", corpo, form, semCsrf } = {}) {
    const h = { cookie, origin: `http://127.0.0.1:${PORTA}` };
    if (metodo === "POST" && !semCsrf) h["x-csrf"] = csrf;
    let body;
    if (form) body = form;
    else if (corpo) { body = JSON.stringify(corpo); h["content-type"] = "application/json"; }
    const r = await fetch(BASE + "?r=" + rota, { method: metodo, headers: h, body });
    const sc = r.headers.get("set-cookie");
    if (sc) cookie = sc.split(";")[0];
    const json = await r.json();
    if (json.csrf) csrf = json.csrf;
    return { status: r.status, ...json };
  }
  return {
    chamar,
    async entrar(sub, email, nome) {
      await chamar("eu");
      return chamar("entrar", { metodo: "POST", corpo: { credential: `teste:${sub}:${email}:${nome}` } });
    },
  };
}

function png() {
  // PNG 2x2 gerado pelo próprio PHP (com GD)
  const arq = join(tmp, "img.png");
  execFileSync("php", ["-r", `$i=imagecreatetruecolor(40,30);imagefill($i,0,0,imagecolorallocate($i,200,50,50));imagepng($i,'${arq}');`]);
  return new Blob([readFileSync(arq)], { type: "image/png" });
}

let admin, ana, bia, postTexto, postFoto, evento;

test("sem login: pode ler, não pode publicar", async () => {
  const p = pessoa();
  const eu = await p.chamar("eu");
  assert.equal(eu.usuario, null);
  assert.ok(eu.csrf);
  const f = await p.chamar("feed");
  assert.deepEqual(f.posts, []);
  const r = await p.chamar("post", { metodo: "POST", corpo: { tipo: "texto", texto: "oi" } });
  assert.equal(r.status, 401);
});

test("CSRF: POST sem token é recusado", async () => {
  const p = pessoa();
  await p.chamar("eu");
  const r = await p.chamar("entrar", { metodo: "POST", corpo: { credential: "teste:1:a@a.org:A" }, semCsrf: true });
  assert.equal(r.status, 403);
});

test("login Google, admin automático e aceite das regras", async () => {
  admin = pessoa();
  const a = await admin.entrar("100", "admin@teste.org", "Equipe Mobiliza");
  assert.equal(a.ok, true);
  const eu = await admin.chamar("eu");
  assert.equal(eu.usuario.papel, "admin");
  await admin.chamar("perfil", { metodo: "POST", corpo: { aceito_regras: true, nascimento: "1988-02-02" } });

  ana = pessoa();
  const r = await ana.entrar("200", "ana@teste.org", "Ana Souza");
  assert.equal(r.novo, true);
  assert.equal(r.usuario.apelido, "anasouza");
  const semRegras = await ana.chamar("post", { metodo: "POST", corpo: { tipo: "texto", texto: "Bora pro ato!" } });
  assert.equal(semRegras.precisa, "regras");

  const menor = await ana.chamar("perfil", { metodo: "POST", corpo: { aceito_regras: true, nascimento: new Date(Date.now() - 15 * 365.25 * 864e5).toISOString().slice(0, 10) } });
  assert.equal(menor.status, 403);
  const ok = await ana.chamar("perfil", { metodo: "POST", corpo: { aceito_regras: true, nascimento: "1995-04-10", uf: "DF", cidade: "Brasília" } });
  assert.equal(ok.usuario.aceitou_regras, true);
});

test("ECA Digital: sem idade verificada não publica; moderação verifica", async () => {
  const r = await ana.chamar("post", { metodo: "POST", corpo: { tipo: "texto", texto: "Bora pro ato!" } });
  assert.equal(r.precisa, "idade");
  assert.equal((await ana.chamar("pedir-verificacao", { metodo: "POST", corpo: {} })).ok, true);
  const den = await admin.chamar("admin/denuncias");
  const pedido = den.denuncias.find((d) => d.motivo === "verificacao");
  assert.ok(pedido);
  assert.equal((await admin.chamar("admin/usuario", { metodo: "POST", corpo: { id: pedido.alvo_id, idade_verificada: true } })).ok, true);
});

test("texto passa no filtro e publica na hora", async () => {
  const r = await ana.chamar("post", { metodo: "POST", corpo: { tipo: "texto", texto: "Ato contra a escala 6x1 no sábado, na Esplanada. Bora!", uf: "DF", cidade: "Brasília" } });
  assert.equal(r.status, 201);
  assert.equal(r.post.status, "publicado");
  postTexto = r.post.id;
  const feed = await pessoa().chamar("feed");
  assert.equal(feed.posts[0].id, postTexto);
});

test("filtro bloqueia ameaça e ataque à democracia; manda ofensa para revisão", async () => {
  const a = await ana.chamar("post", { metodo: "POST", corpo: { tipo: "texto", texto: "tem que matar esses caras" } });
  assert.equal(a.bloqueado, true);
  const b = await ana.chamar("post", { metodo: "POST", corpo: { tipo: "texto", texto: "Queremos INTERVENÇÃO MILITAR já" } });
  assert.equal(b.bloqueado, true);
  const c = await ana.chamar("post", { metodo: "POST", corpo: { tipo: "texto", texto: "esse deputado é um vagabundo" } });
  assert.equal(c.post.status, "pendente");
  const d = await ana.chamar("post", { metodo: "POST", corpo: { tipo: "texto", texto: "Olha isso: https://exemplo.com/noticia" } });
  assert.equal(d.post.status, "pendente");
  assert.match(d.aviso, /moderação/);
});

test("foto: vai para aprovação, metadados apagados, aprovada pela moderação", async () => {
  const form = new FormData();
  form.append("tipo", "foto");
  form.append("texto", "Registro do ato");
  form.append("lat", "-15.7998"); form.append("lng", "-47.8645"); form.append("uf", "DF"); form.append("cidade", "Brasília"); form.append("bairro", "Zona Cívico-Administrativa");
  form.append("arquivos[]", png(), "foto.png");
  const r = await ana.chamar("post", { metodo: "POST", form });
  assert.equal(r.status, 201);
  assert.equal(r.post.status, "pendente");
  assert.equal(r.post.midias.length, 1);
  assert.match(r.post.midias[0].url, /^\/uploads\/\d{4}\/\d{2}\/[a-f0-9]{24}\.(webp|jpg)$/);
  postFoto = r.post.id;

  const fila = await admin.chamar("admin/fila");
  assert.ok(fila.posts.some((p) => p.id === postFoto));
  const semMotivo = await admin.chamar("admin/moderar", { metodo: "POST", corpo: { alvo_tipo: "post", alvo_id: postFoto, acao: "rejeitar" } });
  assert.equal(semMotivo.status, 422);
  assert.equal((await admin.chamar("admin/moderar", { metodo: "POST", corpo: { alvo_tipo: "post", alvo_id: postFoto, acao: "aprovar" } })).status, "publicado");
});

test("arquivo disfarçado de imagem é recusado", async () => {
  const form = new FormData();
  form.append("tipo", "foto");
  form.append("arquivos[]", new Blob(["<?php system($_GET['c']); ?>"], { type: "image/png" }), "x.png");
  const r = await ana.chamar("post", { metodo: "POST", form });
  assert.equal(r.status, 415);
});

test("evento no mapa: criado, aprovado, aparece na área e recebe presenças", async () => {
  const inicio = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 16);
  const fora = await ana.chamar("evento", { metodo: "POST", corpo: { titulo: "Ato", inicio, lat: 48.85, lng: 2.35 } });
  assert.equal(fora.status, 422);
  const r = await ana.chamar("evento", { metodo: "POST", corpo: { titulo: "Ato pelo fim da 6x1", descricao: "Concentração às 9h.", inicio, local_nome: "Museu Nacional",
    lat: -15.7998, lng: -47.8645, uf: "DF", cidade: "Brasília", bairro: "Esplanada" } });
  assert.equal(r.status, "pendente");
  evento = r.id;
  let mapa = await pessoa().chamar("mapa&bbox=-48.5,-16.5,-47,-15");
  assert.equal(mapa.eventos.length, 0);
  await admin.chamar("admin/moderar", { metodo: "POST", corpo: { alvo_tipo: "evento", alvo_id: evento, acao: "aprovar" } });
  mapa = await pessoa().chamar("mapa&bbox=-48.5,-16.5,-47,-15");
  assert.equal(mapa.eventos[0].titulo, "Ato pelo fim da 6x1");
  assert.equal(mapa.registros.length, 1, "a foto geolocalizada aparece como registro");
  const longe = await pessoa().chamar("mapa&bbox=-47,-24,-46,-23");
  assert.equal(longe.eventos.length, 0);
  const v = await admin.chamar("presenca", { metodo: "POST", corpo: { evento_id: evento } });
  assert.equal(v.presencas, 1);
  const reg = await pessoa().chamar("regioes");
  assert.equal(reg.ufs.DF.eventos, 1);
});

test("apoio, comentário e story", async () => {
  const a = await admin.chamar("apoiar", { metodo: "POST", corpo: { post_id: postTexto } });
  assert.deepEqual([a.apoiei, a.apoios], [true, 1]);
  const b = await admin.chamar("apoiar", { metodo: "POST", corpo: { post_id: postTexto } });
  assert.deepEqual([b.apoiei, b.apoios], [false, 0]);
  const c = await admin.chamar("comentar", { metodo: "POST", corpo: { post_id: postTexto, texto: "Estaremos lá!" } });
  assert.equal(c.status, "publicado");
  const lista = await pessoa().chamar(`comentarios&post_id=${postTexto}`);
  assert.equal(lista.comentarios.length, 1);

  const form = new FormData();
  form.append("tipo", "story");
  form.append("arquivos[]", png(), "s.png");
  const s = await admin.chamar("post", { metodo: "POST", form });
  assert.equal(s.post.status, "publicado", "admin publica direto");
  const st = await pessoa().chamar("stories");
  assert.equal(st.grupos[0].stories.length, 1);
});

test("denúncias de pessoas diferentes ocultam o post; improcedente devolve", async () => {
  bia = pessoa();
  await bia.entrar("300", "bia@teste.org", "Bia");
  await bia.chamar("perfil", { metodo: "POST", corpo: { aceito_regras: true, nascimento: "1990-01-01" } });
  const sem = await pessoa();
  await sem.chamar("eu");
  const anonima = await sem.chamar("denunciar", { metodo: "POST", corpo: { alvo_tipo: "post", alvo_id: postTexto, motivo: "desinformacao", contato: "vitima@teste.org" } });
  assert.equal(anonima.ok, true);
  await bia.chamar("denunciar", { metodo: "POST", corpo: { alvo_tipo: "post", alvo_id: postTexto, motivo: "desinformacao", detalhe: "teste" } });
  const rep = await bia.chamar("denunciar", { metodo: "POST", corpo: { alvo_tipo: "post", alvo_id: postTexto, motivo: "desinformacao" } });
  assert.equal(rep.repetida, true);
  let p = await pessoa().chamar(`post&id=${postTexto}`);
  assert.equal(p.status, 404, "ocultado com 2 denúncias (limite do teste)");
  const den = await admin.chamar("admin/denuncias");
  for (const d of den.denuncias.filter((d) => d.alvo_tipo === "post" && d.alvo_id === postTexto)) {
    await admin.chamar("admin/denuncia", { metodo: "POST", corpo: { id: d.id, decisao: "improcedente" } });
  }
  p = await pessoa().chamar(`post&id=${postTexto}`);
  assert.equal(p.post.status, "publicado");
});

test("permissões: membro não modera, não apaga post alheio, não vira admin", async () => {
  assert.equal((await bia.chamar("admin/fila")).status, 403);
  assert.equal((await bia.chamar("post-apagar", { metodo: "POST", corpo: { id: postTexto } })).status, 403);
  assert.equal((await bia.chamar("admin/usuario", { metodo: "POST", corpo: { id: 3, papel: "admin" } })).status, 403);
  const ap = await bia.chamar("perfil", { metodo: "POST", corpo: { apelido: "anasouza" } });
  assert.equal(ap.status, 409);
});

test("publicação oficial exige fonte https", async () => {
  const sem = await admin.chamar("admin/oficial", { metodo: "POST", corpo: { titulo: "Nota", texto: "Texto" } });
  assert.equal(sem.status, 422);
  const ok = await admin.chamar("admin/oficial", { metodo: "POST", corpo: { titulo: "Senado vota PL da caça", texto: "Entenda o que muda.", fonte_url: "https://www12.senado.leg.br/ecidadania" } });
  assert.equal(ok.ok, true);
  const f = await pessoa().chamar("feed&tipo=oficial");
  assert.equal(f.posts[0].oficial, true);
  assert.equal((await ana.chamar("admin/oficial", { metodo: "POST", corpo: { titulo: "x", texto: "y", fonte_url: "https://a.org" } })).status, 403);
});

test("banir tira o conteúdo do ar e bloqueia novo login", async () => {
  const id = (await admin.chamar("admin/usuarios&busca=ana")).usuarios[0].id;
  await admin.chamar("admin/usuario", { metodo: "POST", corpo: { id, status: "banido", motivo: "teste" } });
  const p = await pessoa().chamar(`post&id=${postFoto}`);
  assert.equal(p.status, 404);
  const de = await pessoa().entrar("200", "ana@teste.org", "Ana Souza");
  assert.equal(de.status, 403);
});

test("LGPD: baixar meus dados e apagar a conta", async () => {
  const d = await bia.chamar("meus-dados");
  assert.equal(d.conta.email, "bia@teste.org");
  assert.equal(d.conta.google_sub, undefined);
  assert.equal((await bia.chamar("apagar-conta", { metodo: "POST", corpo: { confirmo: "sim" } })).status, 422);
  assert.equal((await bia.chamar("apagar-conta", { metodo: "POST", corpo: { confirmo: "APAGAR" } })).ok, true);
  assert.equal((await bia.chamar("eu")).usuario, null);
});

test("limite de envio contra spam", async () => {
  let ultimo;
  for (let i = 0; i < 12; i++) ultimo = await admin.chamar("post", { metodo: "POST", corpo: { tipo: "texto", texto: `teste ${i}` } });
  assert.equal(ultimo.status, 429);
});
