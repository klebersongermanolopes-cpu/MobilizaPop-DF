/* Mobiliza Pop: rede social (feed, stories, reels, mapa, eventos, perfil, login com Google).
   Conversa com a API PHP em /api/. O app.js chama MPRede.mostrar(rota, resto) quando a #hash muda. */
(function () {
  "use strict";

  var API = "api/?r=";
  var S = { eu: null, csrf: "", cfg: { motivos_denuncia: {} }, pronto: null, feed: { tipo: "", uf: "", cidade: "", ultimo: null, fim: false, carregando: false } };
  var UFS = { AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
    MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
    RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins" };
  var CODIGO_UF = { 11: "RO", 12: "AC", 13: "AM", 14: "RR", 15: "PA", 16: "AP", 17: "TO", 21: "MA", 22: "PI", 23: "CE", 24: "RN", 25: "PB", 26: "PE", 27: "AL", 28: "SE", 29: "BA",
    31: "MG", 32: "ES", 33: "RJ", 35: "SP", 41: "PR", 42: "SC", 43: "RS", 50: "MS", 51: "MT", 52: "GO", 53: "DF" };
  var ESTILO_MAPA = "https://tiles.openfreemap.org/styles/liberty";
  var BRASIL = [[-74.1, -33.9], [-28.6, 5.4]];

  /* ---------- utilidades ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function icone(id) { return '<svg class="ico" aria-hidden="true"><use href="#' + id + '"/></svg>'; }
  // Texto com quebras de linha e links https clicáveis (depois de escapar: seguro contra XSS)
  function textoRico(t) {
    return esc(t).replace(/(https:\/\/[^\s<]+[^\s<.,;:!?)\]])/g, function (u) {
      return '<a href="' + u + '" target="_blank" rel="noopener nofollow ugc">' + u.replace(/^https:\/\/(www\.)?/, "").slice(0, 48) + "</a>";
    }).replace(/\n/g, "<br>");
  }
  var toastEl, toastT;
  function toast(msg) {
    toastEl = toastEl || $("toast");
    toastEl.textContent = msg;
    toastEl.classList.add("on");
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove("on"); }, 3200);
  }
  function paraData(s) { // "2026-10-30 14:05:00" (horário de Brasília) → Date
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s || "");
    return m ? new Date(m[1] + "-" + m[2] + "-" + m[3] + "T" + m[4] + ":" + m[5] + ":00-03:00") : null;
  }
  function relativo(s) {
    var d = paraData(s); if (!d) return "";
    var seg = (Date.now() - d.getTime()) / 1000;
    if (seg < 60) return "agora";
    if (seg < 3600) return "há " + Math.floor(seg / 60) + " min";
    if (seg < 86400) return "há " + Math.floor(seg / 3600) + " h";
    if (seg < 7 * 86400) return "há " + Math.floor(seg / 86400) + " d";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  }
  var DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"], MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  function quando(s) {
    var d = paraData(s); if (!d) return "";
    var bsb = new Date(d.getTime() - 3 * 3600 * 1000); // mostra no horário de Brasília
    return DIAS[bsb.getUTCDay()] + ", " + bsb.getUTCDate() + " " + MESES[bsb.getUTCMonth()] + " · " + String(bsb.getUTCHours()).padStart(2, "0") + "h" + String(bsb.getUTCMinutes()).padStart(2, "0");
  }
  function lugar(o) { return [o.bairro, o.cidade, o.uf].filter(Boolean).join(", "); }
  function avatar(a, cls) {
    var ini = esc(((a && (a.nome || a.apelido)) || "?").trim().charAt(0).toUpperCase());
    if (a && a.foto) return '<img class="avatar ' + (cls || "") + '" src="' + esc(a.foto) + '" alt="" referrerpolicy="no-referrer" loading="lazy">';
    return '<span class="avatar ' + (cls || "") + '" aria-hidden="true">' + ini + "</span>";
  }
  function selo(a) {
    if (!a) return "";
    if (a.papel === "admin") return '<span class="selo-papel equipe">Equipe</span>';
    if (a.papel === "moderador") return '<span class="selo-papel mod">Moderação</span>';
    return "";
  }
  function urlPagina(hash) { return location.origin + location.pathname + "#" + hash; }
  function zap(texto, hash) { return "https://wa.me/?text=" + encodeURIComponent(texto + "\n\n" + urlPagina(hash)); }
  function carregarScript(src) {
    return new Promise(function (ok, falha) {
      if (document.querySelector('script[src="' + src + '"]')) return ok();
      var s = document.createElement("script"); s.src = src; s.async = true; s.onload = ok; s.onerror = falha; document.head.appendChild(s);
    });
  }
  function esperarMapLibre() {
    return new Promise(function (ok, falha) {
      var n = 0;
      (function ver() {
        if (window.maplibregl) return ok(window.maplibregl);
        if (++n > 100) return falha(new Error("mapa"));
        setTimeout(ver, 100);
      })();
    });
  }

  /* ---------- API ---------- */
  function api(rota, op) {
    op = op || {};
    var h = { "X-CSRF": S.csrf }, corpo;
    if (op.form) corpo = op.form;
    else if (op.corpo) { corpo = JSON.stringify(op.corpo); h["Content-Type"] = "application/json"; }
    return fetch(API + rota, { method: op.metodo || (corpo ? "POST" : "GET"), headers: h, body: corpo, credentials: "same-origin" })
      .then(function (r) {
        return r.json().catch(function () { return { erro: "Resposta inválida do servidor." }; }).then(function (j) {
          j._status = r.status;
          if (j.csrf) S.csrf = j.csrf;
          if (!r.ok) {
            if (r.status === 401 && !op.silencioso) abrirEntrar(j.erro);
            else if (j.precisa === "regras") abrirBoasVindas();
            var e = new Error(j.erro || "Erro " + r.status); e.dados = j; throw e;
          }
          return j;
        });
      });
  }
  // Envio com barra de progresso (vídeos grandes)
  function enviarComProgresso(rota, form, aoProgresso) {
    return new Promise(function (ok, falha) {
      var x = new XMLHttpRequest();
      x.open("POST", API + rota);
      x.setRequestHeader("X-CSRF", S.csrf);
      x.upload.onprogress = function (e) { if (e.lengthComputable) aoProgresso(Math.round(e.loaded / e.total * 100)); };
      x.onload = function () {
        var j; try { j = JSON.parse(x.responseText); } catch (e) { j = { erro: "Resposta inválida do servidor." }; }
        if (x.status >= 200 && x.status < 300) return ok(j);
        if (j.precisa === "regras") abrirBoasVindas();
        if (x.status === 401) abrirEntrar(j.erro);
        var e = new Error(j.erro || (x.status === 413 ? "Arquivo grande demais." : "Erro " + x.status)); e.dados = j; falha(e);
      };
      x.onerror = function () { falha(new Error("Sem conexão. Tente de novo.")); };
      x.send(form);
    });
  }

  /* ---------- conta ---------- */
  function iniciar() {
    S.pronto = api("eu", { silencioso: true }).then(function (j) {
      S.eu = j.usuario; S.cfg = j;
      renderConta();
      if (S.eu && !S.eu.aceitou_regras) abrirBoasVindas();
      return j;
    }).catch(function () { S.cfg = S.cfg || {}; renderConta(); });
    preencherUFs();
  }
  function renderConta() {
    var c = $("conta"); if (!c) return;
    if (!S.eu) { c.innerHTML = '<button type="button" class="mini forte" data-entrar>Entrar</button>'; return; }
    var mod = S.eu.papel === "admin" || S.eu.papel === "moderador";
    c.innerHTML = '<details class="menu-conta"><summary aria-label="Sua conta">' + avatar(S.eu, "p") + "</summary><div>" +
      '<a href="#perfil/' + esc(S.eu.apelido) + '">Meu perfil</a>' + (mod ? '<a href="painel/">Painel da equipe</a>' : "") +
      '<button type="button" data-sair>Sair</button></div></details>';
  }
  function abrirEntrar(msg) {
    var j = $("j-entrar");
    $("entrar-aviso").textContent = msg || "";
    if (!j.open) j.showModal();
    var cid = S.cfg && S.cfg.google_client_id;
    if (S.cfg && S.cfg.login_teste) { // só no computador de quem desenvolve (permitir_login_teste)
      $("botao-google").innerHTML = '<form id="form-teste" class="linha2"><input name="email" type="email" required placeholder="e-mail de teste" class="campo-teste"><input name="nome" required placeholder="nome" class="campo-teste"><button class="mini forte">Entrar como teste</button></form>';
      return;
    }
    if (!cid) { $("botao-google").innerHTML = '<p class="erro-form">Login com Google ainda não configurado neste servidor.</p>'; return; }
    carregarScript("https://accounts.google.com/gsi/client").then(function () {
      google.accounts.id.initialize({ client_id: cid, callback: aoEntrarGoogle, ux_mode: "popup", context: "signin", itp_support: true });
      google.accounts.id.renderButton($("botao-google"), { theme: "filled_black", size: "large", shape: "rectangular", text: "continue_with", locale: "pt-BR", width: 280 });
    }).catch(function () { $("botao-google").innerHTML = '<p class="erro-form">Não deu para carregar o login do Google. Verifique sua conexão.</p>'; });
  }
  function aoEntrarGoogle(resp) {
    api("entrar", { corpo: { credential: resp.credential } }).then(function (j) {
      $("j-entrar").close();
      return api("eu").then(function (e) { S.eu = e.usuario; renderConta(); if (j.novo) abrirBoasVindas(); else toast("Bem-vindo de volta, " + S.eu.nome.split(" ")[0] + "!"); recarregarRota(); });
    }).catch(function (e) { $("entrar-aviso").textContent = e.message; });
  }
  function abrirBoasVindas() {
    if (!S.eu) return;
    var j = $("j-boasvindas"); if (j.open) return;
    var f = $("form-boasvindas");
    f.apelido.value = S.eu.apelido || "";
    if (S.eu.uf) f.uf.value = S.eu.uf;
    j.showModal();
  }
  function exigirConta(fn) {
    return function (e) {
      if (!S.eu) { abrirEntrar("Entre para participar."); return; }
      if (!S.eu.aceitou_regras) { abrirBoasVindas(); return; }
      fn(e);
    };
  }
  function preencherUFs() {
    ["feed-uf", "mapa-uf", "bv-uf"].forEach(function (id) {
      var s = $(id); if (!s || s.options.length > 2) return;
      Object.keys(UFS).forEach(function (u) { s.add(new Option(UFS[u] + " (" + u + ")", u)); });
    });
  }
  var cacheCidades = {};
  function cidadesDaUF(uf) {
    if (cacheCidades[uf]) return Promise.resolve(cacheCidades[uf]);
    return fetch("https://servicodados.ibge.gov.br/api/v1/localidades/estados/" + uf + "/municipios?orderBy=nome")
      .then(function (r) { return r.json(); })
      .then(function (l) { cacheCidades[uf] = l.map(function (c) { return c.nome; }); return cacheCidades[uf]; })
      .catch(function () { return []; });
  }
  function encherCidades(sel, uf, rotuloVazio) {
    sel.innerHTML = ""; sel.add(new Option(rotuloVazio, ""));
    sel.disabled = !uf;
    if (!uf) return Promise.resolve();
    return cidadesDaUF(uf).then(function (l) { l.forEach(function (n) { sel.add(new Option(n, n)); }); });
  }

  /* ---------- cartões de publicação ---------- */
  function htmlMidias(p) {
    if (!p.midias.length) return "";
    var itens = p.midias.map(function (m) {
      if (m.tipo === "video") return '<video src="' + esc(m.url) + '" controls playsinline preload="metadata"></video>';
      return '<img src="' + esc(m.url) + '" alt="Foto publicada por ' + esc(p.autor.nome) + '" loading="lazy"' + (m.largura ? ' width="' + m.largura + '" height="' + m.altura + '"' : "") + ">";
    }).join("");
    return '<div class="midias n' + Math.min(p.midias.length, 4) + (p.tipo === "reel" ? " reel" : "") + '">' + itens + "</div>";
  }
  function cartao(p, completo) {
    var pend = p.status !== "publicado";
    var resumo = (p.titulo || p.texto || "Publicação na rede Mobiliza Pop").slice(0, 140);
    return '<article class="post' + (p.oficial ? " oficial" : "") + (pend ? " pendente" : "") + '" data-post="' + p.id + '">' +
      (pend ? '<p class="faixa-pend">' + (p.status === "pendente" ? "Aguardando aprovação" : p.status === "rejeitado" ? "Não aprovado" : "Removido") +
        (p.motivo ? ": " + esc(p.motivo) : "") + "</p>" : "") +
      '<header class="post-cab">' + (p.oficial ? '<span class="avatar oficial" aria-hidden="true"><span class="marca-img"></span></span>' : avatar(p.autor)) +
      '<div class="quem">' + (p.oficial ? "<b>Mobiliza Pop</b>" : '<a href="#perfil/' + esc(p.autor.apelido) + '"><b>' + esc(p.autor.nome) + "</b></a>") +
      selo(p.oficial ? null : p.autor) + '<small>@' + esc(p.autor.apelido) + " · " + relativo(p.criado_em) + (lugar(p) ? " · " + esc(lugar(p)) : "") + "</small></div>" +
      '<details class="post-menu"><summary aria-label="Mais opções">⋯</summary><div>' +
      '<button type="button" data-denunciar="post:' + p.id + '">' + icone("i-bandeira") + " Denunciar</button>" +
      (p.meu || (S.eu && (S.eu.papel === "admin" || S.eu.papel === "moderador")) ? '<button type="button" data-apagar="' + p.id + '">' + icone("i-x") + " Apagar</button>" : "") +
      "</div></details></header>" +
      (p.titulo ? '<h3 class="post-titulo">' + esc(p.titulo) + "</h3>" : "") +
      (p.texto ? '<div class="post-texto' + (completo ? "" : " curto") + '">' + textoRico(p.texto) + "</div>" : "") +
      (p.fonte_url ? '<p class="post-fonte">Fonte: <a href="' + esc(p.fonte_url) + '" target="_blank" rel="noopener">' + esc(p.fonte_url.replace(/^https:\/\/(www\.)?/, "").split("/")[0]) + "</a></p>" : "") +
      htmlMidias(p) +
      (p.evento_id ? '<a class="chip-evento" href="#evento/' + p.evento_id + '">' + icone("i-pino") + " " + esc(p.evento_titulo || "Ver evento") + "</a>" : "") +
      (pend ? "" : '<footer class="post-acoes">' +
        '<button type="button" class="acao apoio" aria-pressed="' + p.apoiei + '" data-apoiar="' + p.id + '">' + icone("i-punho") + ' <span>Tô junto</span> <b>' + (p.apoios || "") + "</b></button>" +
        '<a class="acao" href="#post/' + p.id + '">' + icone("i-balao") + " <span>Comentar</span> <b>" + (p.comentarios || "") + "</b></a>" +
        '<a class="acao" href="' + esc(zap(resumo, "post/" + p.id)) + '" target="_blank" rel="noopener">' + icone("i-sai") + " <span>Pro zap</span></a>" +
        "</footer>") +
      "</article>";
  }

  /* ---------- feed ---------- */
  function renderRede() {
    S.feed.ultimo = null; S.feed.fim = false;
    $("feed").innerHTML = '<p class="carregando">Carregando a rede…</p>';
    carregarFeed(true);
    carregarStories();
    carregarLadoEventos();
  }
  function carregarFeed(limpar) {
    if (S.feed.carregando) return;
    S.feed.carregando = true;
    var q = "feed" + (S.feed.tipo ? "&tipo=" + S.feed.tipo : "") + (S.feed.uf ? "&uf=" + S.feed.uf : "") +
      (S.feed.cidade ? "&cidade=" + encodeURIComponent(S.feed.cidade) : "") + (S.feed.ultimo ? "&antes=" + S.feed.ultimo : "");
    api(q, { silencioso: true }).then(function (j) {
      var html = j.posts.map(function (p) { return cartao(p); }).join("");
      if (limpar) $("feed").innerHTML = html || '<div class="vazio">Nada por aqui ainda. Que tal ser a primeira pessoa a publicar?</div>';
      else $("feed").insertAdjacentHTML("beforeend", html);
      var publicados = j.posts.filter(function (p) { return p.status === "publicado"; });
      if (publicados.length) S.feed.ultimo = publicados[publicados.length - 1].id;
      S.feed.fim = j.fim;
      $("mais-feed").hidden = j.fim;
    }).catch(function (e) {
      $("feed").innerHTML = '<div class="vazio">A rede está fora do ar agora (' + esc(e.message) + "). O portal de notícias continua funcionando.</div>";
    }).then(function () { S.feed.carregando = false; });
  }
  function carregarLadoEventos() {
    api("mapa&periodo=proximos&registros=0", { silencioso: true }).then(function (j) {
      var l = j.eventos.slice(0, 5);
      $("lado-eventos").innerHTML = l.length ? l.map(function (e) {
        return '<a class="ev-mini" href="#evento/' + e.id + '"><b>' + esc(e.titulo) + "</b><small>" + esc(quando(e.inicio)) + " · " + esc(lugar(e)) + "</small></a>";
      }).join("") : '<p class="fonte-pq">Nenhum ato marcado. Crie o primeiro!</p>';
    }).catch(function () { $("lado-eventos").innerHTML = '<p class="fonte-pq">Indisponível.</p>'; });
  }

  /* ---------- stories ---------- */
  var ST = { grupos: [], g: 0, i: 0, t: null };
  function carregarStories() {
    api("stories", { silencioso: true }).then(function (j) {
      ST.grupos = j.grupos;
      $("stories").innerHTML = '<button type="button" class="story-bola nova" data-publicar="story"><span class="anel">' + icone("i-mais") + "</span><small>Seu story</small></button>" +
        j.grupos.map(function (g, i) {
          return '<button type="button" class="story-bola" data-abrir-story="' + i + '"><span class="anel">' + avatar(g.autor) + "</span><small>" + esc(g.autor.apelido) + "</small></button>";
        }).join("");
    }).catch(function () { $("stories").innerHTML = ""; });
  }
  function abrirStory(g, i) {
    ST.g = g; ST.i = i || 0;
    var j = $("j-story"); if (!j.open) j.showModal();
    mostrarStory();
  }
  function mostrarStory() {
    clearTimeout(ST.t);
    var g = ST.grupos[ST.g]; if (!g) return fecharStory();
    var s = g.stories[ST.i]; if (!s) return fecharStory();
    $("story-barras").innerHTML = g.stories.map(function (x, k) { return '<span class="' + (k < ST.i ? "cheia" : k === ST.i ? "atual" : "") + '"><i></i></span>'; }).join("");
    $("story-cab").innerHTML = avatar(g.autor) + "<b>" + esc(g.autor.apelido) + "</b><small>" + relativo(s.criado_em) + '</small><button type="button" class="mini" data-denunciar="post:' + s.id + '">Denunciar</button>';
    var m = s.midias[0], dur = 6000;
    if (m && m.tipo === "video") {
      $("story-midia").innerHTML = '<video src="' + esc(m.url) + '" autoplay playsinline></video>';
      var v = $("story-midia").querySelector("video");
      v.onloadedmetadata = function () { dur = Math.min(60, v.duration || 15) * 1000; animarBarra(dur); ST.t = setTimeout(proxStory, dur); };
    } else {
      $("story-midia").innerHTML = m ? '<img src="' + esc(m.url) + '" alt="">' : "";
      animarBarra(dur); ST.t = setTimeout(proxStory, dur);
    }
    $("story-texto").textContent = s.texto || "";
  }
  function animarBarra(ms) {
    var b = document.querySelector("#story-barras .atual i");
    if (b) { b.style.transition = "none"; b.style.width = "0"; requestAnimationFrame(function () { b.style.transition = "width " + ms + "ms linear"; b.style.width = "100%"; }); }
  }
  function proxStory(d) {
    d = d || 1;
    var g = ST.grupos[ST.g];
    ST.i += d;
    if (ST.i >= g.stories.length) { ST.g++; ST.i = 0; }
    else if (ST.i < 0) { ST.g = Math.max(0, ST.g - 1); ST.i = 0; }
    if (ST.g >= ST.grupos.length) return fecharStory();
    mostrarStory();
  }
  function fecharStory() { clearTimeout(ST.t); $("story-midia").innerHTML = ""; var j = $("j-story"); if (j.open) j.close(); }

  /* ---------- reels ---------- */
  var obsReels;
  function renderReels() {
    var r = $("reels");
    r.innerHTML = '<p class="carregando">Carregando reels…</p>';
    api("feed&tipo=reel", { silencioso: true }).then(function (j) {
      var l = j.posts.filter(function (p) { return p.status === "publicado" && p.midias[0]; });
      if (!l.length) { r.innerHTML = '<div class="vazio reels-vazio">Nenhum reel ainda. <button type="button" class="btn verm peq" data-publicar="reel">Publicar o primeiro</button></div>'; return; }
      r.innerHTML = l.map(function (p) {
        return '<div class="reel" data-post="' + p.id + '"><video src="' + esc(p.midias[0].url) + '" loop muted playsinline preload="metadata"></video>' +
          '<div class="reel-info"><a href="#perfil/' + esc(p.autor.apelido) + '">' + avatar(p.autor) + " @" + esc(p.autor.apelido) + "</a>" +
          (p.texto ? "<p>" + esc(p.texto.slice(0, 220)) + "</p>" : "") + (lugar(p) ? "<small>" + icone("i-pino") + " " + esc(lugar(p)) + "</small>" : "") + "</div>" +
          '<div class="reel-acoes"><button type="button" class="acao apoio" aria-pressed="' + p.apoiei + '" data-apoiar="' + p.id + '">' + icone("i-punho") + "<b>" + (p.apoios || "") + "</b></button>" +
          '<a class="acao" href="#post/' + p.id + '">' + icone("i-balao") + "<b>" + (p.comentarios || "") + "</b></a>" +
          '<a class="acao" href="' + esc(zap(p.texto || "Reel na Mobiliza Pop", "post/" + p.id)) + '" target="_blank" rel="noopener">' + icone("i-sai") + "</a>" +
          '<button type="button" class="acao" data-som aria-label="Ligar som">🔇</button></div></div>';
      }).join("");
      if (obsReels) obsReels.disconnect();
      obsReels = new IntersectionObserver(function (ents) {
        ents.forEach(function (e) { var v = e.target.querySelector("video"); if (e.isIntersecting) v.play().catch(function () {}); else v.pause(); });
      }, { threshold: 0.6 });
      r.querySelectorAll(".reel").forEach(function (el) { obsReels.observe(el); });
    }).catch(function (e) { r.innerHTML = '<div class="vazio">' + esc(e.message) + "</div>"; });
  }

  /* ---------- post e comentários ---------- */
  function renderPost(id) {
    var v = $("v-post");
    v.innerHTML = '<p class="carregando">Carregando…</p>';
    api("post&id=" + encodeURIComponent(id), { silencioso: true }).then(function (j) {
      v.innerHTML = '<div class="wrap estreito"><a class="voltar mini" href="#rede">← Voltar para a rede</a>' + cartao(j.post, true) +
        '<section class="comentarios" aria-label="Comentários"><h2>Comentários</h2><div id="lista-coment"></div>' +
        (j.post.status === "publicado" ? '<form id="form-coment" class="form-coment"><label class="so-leitor" for="coment-texto">Seu comentário</label><textarea id="coment-texto" maxlength="1000" rows="2" required placeholder="Escreva com respeito"></textarea><button class="btn peq" type="submit">Comentar</button></form>' : "") +
        "</section></div>";
      v.querySelector("#form-coment") && (v.querySelector("#form-coment").dataset.post = j.post.id);
      carregarComentarios(j.post.id);
    }).catch(function (e) { v.innerHTML = '<div class="wrap estreito"><div class="vazio">' + esc(e.message) + '</div><a class="mini" href="#rede">Voltar</a></div>'; });
  }
  function carregarComentarios(id) {
    api("comentarios&post_id=" + id, { silencioso: true }).then(function (j) {
      $("lista-coment").innerHTML = j.comentarios.length ? j.comentarios.map(function (c) {
        return '<div class="coment' + (c.status !== "publicado" ? " pendente" : "") + '">' + avatar(c.autor, "p") + '<div><a href="#perfil/' + esc(c.autor.apelido) + '"><b>' + esc(c.autor.nome) + "</b></a>" + selo(c.autor) +
          " <small>" + relativo(c.criado_em) + (c.status !== "publicado" ? " · aguardando moderação" : "") + "</small><p>" + textoRico(c.texto) + "</p>" +
          '<div class="coment-acoes"><button type="button" class="link" data-denunciar="comentario:' + c.id + '">Denunciar</button>' +
          (c.meu || (S.eu && (S.eu.papel === "admin" || S.eu.papel === "moderador")) ? ' <button type="button" class="link" data-apagar-coment="' + c.id + '" data-post="' + id + '">Apagar</button>' : "") + "</div></div></div>";
      }).join("") : '<p class="fonte-pq">Nenhum comentário ainda.</p>';
    });
  }

  /* ---------- evento ---------- */
  function renderEvento(id) {
    var v = $("v-evento");
    v.innerHTML = '<p class="carregando">Carregando evento…</p>';
    api("evento&id=" + encodeURIComponent(id), { silencioso: true }).then(function (j) {
      var e = j.evento, passou = paraData(e.fim || e.inicio) < new Date();
      var texto = e.titulo + " — " + quando(e.inicio) + (e.local_nome ? " — " + e.local_nome : "") + (lugar(e) ? ", " + lugar(e) : "");
      v.innerHTML = '<div class="evento-topo"><div class="wrap"><a class="voltar" href="#mapa">← Mapa</a>' +
        (e.status !== "publicado" ? '<p class="faixa-pend">Aguardando aprovação' + (e.motivo ? ": " + esc(e.motivo) : "") + "</p>" : "") +
        '<p class="mono">' + (passou ? "Já aconteceu" : "Próximo ato") + "</p><h1>" + esc(e.titulo) + "</h1>" +
        '<div class="evento-meta"><span class="tag sol">' + esc(quando(e.inicio)) + (e.fim ? " até " + esc(quando(e.fim).split(" · ")[1]) : "") + "</span>" +
        (e.local_nome || lugar(e) ? '<span class="tag">' + icone("i-pino") + " " + esc([e.local_nome, lugar(e)].filter(Boolean).join(" · ")) + "</span>" : "") +
        '<span class="tag broto"><b id="n-pres">' + e.presencas + "</b> vão</span></div>" +
        '<div class="acoes">' + (passou ? "" : '<button type="button" class="btn verm peq" data-vou="' + e.id + '" aria-pressed="' + e.vou + '">' + (e.vou ? "Eu vou ✓" : "Eu vou") + "</button>") +
        '<button type="button" class="btn broto peq" data-registrar="' + e.id + '">Registrar foto ou vídeo</button>' +
        '<a class="btn claro peq" href="' + esc(zap(texto, "evento/" + e.id)) + '" target="_blank" rel="noopener">Mandar no zap</a>' +
        (passou ? "" : '<button type="button" class="btn claro peq" data-agenda="' + e.id + '">Pôr na agenda</button>') + "</div></div></div>" +
        '<div class="wrap evento-corpo"><div>' + (e.descricao ? '<div class="texto-longo"><p>' + textoRico(e.descricao) + "</p></div>" : "") +
        (e.link ? '<p><a class="mini" href="' + esc(e.link) + '" target="_blank" rel="noopener">Link oficial ' + icone("i-sai") + "</a></p>" : "") +
        (e.autor ? '<p class="fonte-pq">Criado por <a href="#perfil/' + esc(e.autor.apelido) + '">@' + esc(e.autor.apelido) + '</a> · <button type="button" class="link" data-denunciar="evento:' + e.id + '">Denunciar evento</button></p>' : "") +
        '<h2 class="sub-h">Registros da rede</h2><div class="registros">' +
        (j.registros.length ? j.registros.map(function (p) { return cartao(p); }).join("") : '<div class="vazio">Ainda sem registros. Esteve lá? Publique fotos e vídeos.</div>') +
        '</div></div><div class="mini-mapa alto evento-mapa" id="evento-mapa"></div></div>';
      S.eventoAtual = e;
      esperarMapLibre().then(function (ml) {
        var m = new ml.Map({ container: "evento-mapa", style: ESTILO_MAPA, center: [e.lng, e.lat], zoom: 15, attributionControl: { compact: true } });
        new ml.Marker({ color: "#AD4F4D" }).setLngLat([e.lng, e.lat]).addTo(m);
        m.addControl(new ml.NavigationControl({ showCompass: false }));
      }).catch(function () {});
    }).catch(function (e) { v.innerHTML = '<div class="wrap estreito"><div class="vazio">' + esc(e.message) + '</div><a class="mini" href="#mapa">Voltar ao mapa</a></div>'; });
  }
  function baixarAgenda(e) {
    function f(s) { var d = paraData(s); return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
    var fim = e.fim || (function () { var d = paraData(e.inicio); d.setHours(d.getHours() + 2); return d.toISOString(); })();
    var fimTxt = e.fim ? f(e.fim) : new Date(fim).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    var ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mobiliza Pop//PT", "BEGIN:VEVENT", "UID:evento-" + e.id + "@mobilizapop", "DTSTAMP:" + f(e.inicio),
      "DTSTART:" + f(e.inicio), "DTEND:" + fimTxt, "SUMMARY:" + e.titulo.replace(/[,;]/g, " "), "LOCATION:" + [e.local_nome, lugar(e)].filter(Boolean).join(" - ").replace(/[,;]/g, " "),
      "URL:" + urlPagina("evento/" + e.id), "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" })); a.download = "ato-mobiliza.ics"; a.click();
  }

  /* ---------- perfil ---------- */
  function renderPerfil(apelido) {
    var v = $("v-perfil");
    if (!apelido) { if (S.eu) { location.hash = "perfil/" + S.eu.apelido; return; } v.innerHTML = '<div class="wrap estreito"><div class="vazio">Entre para ver seu perfil. <button type="button" class="btn peq" data-entrar>Entrar</button></div></div>'; return; }
    v.innerHTML = '<p class="carregando">Carregando perfil…</p>';
    api("usuario&apelido=" + encodeURIComponent(apelido), { silencioso: true }).then(function (j) {
      var u = j.usuario, meu = S.eu && S.eu.id === u.id;
      v.innerHTML = '<div class="perfil-topo"><div class="wrap">' + avatar(u, "g") + '<div><h1>' + esc(u.nome) + "</h1>" + selo(u) +
        '<p class="mono">@' + esc(u.apelido) + (u.cidade || u.uf ? " · " + esc([u.cidade, u.uf].filter(Boolean).join(", ")) : "") + " · na rede desde " + esc(u.desde.split("-").reverse().join("/")) + "</p>" +
        (u.bio ? "<p>" + esc(u.bio) + "</p>" : "") + '<p class="mono">' + u.publicacoes + " publicações</p>" +
        (meu ? "" : '<button type="button" class="link" data-denunciar="usuario:' + u.id + '">Denunciar perfil</button>') + "</div></div></div>" +
        '<div class="wrap perfil-corpo"><div class="feed">' + (j.posts.length ? j.posts.map(function (p) { return cartao(p); }).join("") : '<div class="vazio">Nenhuma publicação ainda.</div>') + "</div>" +
        (meu ? painelMeuPerfil() : "") + "</div>";
    }).catch(function (e) { v.innerHTML = '<div class="wrap estreito"><div class="vazio">' + esc(e.message) + "</div></div>"; });
  }
  function painelMeuPerfil() {
    var u = S.eu, ufs = Object.keys(UFS).map(function (k) { return '<option value="' + k + '"' + (u.uf === k ? " selected" : "") + ">" + k + "</option>"; }).join("");
    var verif = S.cfg.exigir_verificacao_idade ? (u.idade_verificada ? '<p class="ok-txt">✓ Idade confirmada: você pode publicar.</p>' :
      '<p>Para publicar, a equipe precisa confirmar sua idade (exigência do ECA Digital). Peça a verificação: a equipe vai entrar em contato pelo seu e-mail.</p><button type="button" class="mini forte" id="pedir-verif">Pedir verificação</button>') : "";
    return '<aside class="meu-perfil"><div class="bloco"><p class="mono">Editar perfil</p><form id="form-perfil">' +
      '<div class="campo"><label for="pf-nome">Nome exibido</label><input id="pf-nome" name="nome" maxlength="80" value="' + esc(u.nome) + '"><small>Pode ser diferente do seu nome real.</small></div>' +
      '<div class="campo"><label for="pf-apelido">Apelido</label><input id="pf-apelido" name="apelido" maxlength="30" pattern="[a-z0-9_]{3,30}" value="' + esc(u.apelido) + '"></div>' +
      '<div class="linha2"><div class="campo"><label for="pf-uf">UF</label><select id="pf-uf" name="uf"><option value="">—</option>' + ufs + '</select></div><div class="campo"><label for="pf-cidade">Cidade</label><input id="pf-cidade" name="cidade" maxlength="80" value="' + esc(u.cidade || "") + '"></div></div>' +
      '<div class="campo"><label for="pf-bio">Bio</label><textarea id="pf-bio" name="bio" maxlength="300" rows="3">' + esc(u.bio || "") + "</textarea></div>" +
      '<p class="erro-form" id="pf-erro" role="alert"></p><button class="btn peq" type="submit">Salvar</button></form></div>' +
      (verif ? '<div class="bloco sol"><p class="mono">Verificação de idade</p>' + verif + "</div>" : "") +
      '<div class="bloco"><p class="mono">Seus dados (LGPD)</p><p style="font-size:15px">Baixe tudo o que guardamos sobre você ou apague sua conta de vez.</p>' +
      '<div class="linha2"><button type="button" class="mini" id="baixar-dados">Baixar meus dados</button><button type="button" class="mini perigo" id="apagar-conta">Apagar conta</button></div>' +
      '<button type="button" class="mini" data-sair style="margin-top:12px">Sair</button></div></aside>';
  }

  /* ---------- publicar ---------- */
  var PUB = { arquivos: [], lat: null, lng: null, uf: null, cidade: null, bairro: null, mapa: null, marcador: null };
  function abrirPublicar(tipo, evento) {
    var f = $("form-publicar");
    f.reset(); PUB.arquivos = []; PUB.lat = PUB.lng = PUB.uf = PUB.cidade = PUB.bairro = null;
    $("previas").innerHTML = ""; $("pub-erro").textContent = ""; $("pub-lugar").textContent = "Toque no mapa para marcar o local.";
    if (PUB.marcador) { PUB.marcador.remove(); PUB.marcador = null; }
    var tipoEl = f.querySelector('input[name="tipo"][value="' + (tipo || "texto") + '"]'); if (tipoEl) tipoEl.checked = true;
    ajustarTipo();
    var sel = $("pub-evento"); sel.innerHTML = '<option value="">Não</option>';
    api("mapa&periodo=todos&registros=0", { silencioso: true }).then(function (j) {
      j.eventos.slice(-60).reverse().forEach(function (e) { sel.add(new Option(e.titulo + " (" + quando(e.inicio).split(" · ")[0] + ")", e.id)); });
      if (evento) { sel.value = String(evento.id); $("pub-onde").open = true; marcarLocal(evento.lng, evento.lat, evento); }
    });
    $("j-publicar").showModal();
  }
  function ajustarTipo() {
    var t = $("form-publicar").tipo.value, inp = $("pub-arquivos");
    $("campo-arquivos").hidden = t === "texto";
    var video = t === "video" || t === "reel";
    inp.accept = video ? "video/mp4,video/webm,video/quicktime" : (t === "story" ? "image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" : "image/jpeg,image/png,image/webp");
    inp.multiple = t === "foto";
    $("rotulo-arquivos").textContent = video ? "Vídeo" : t === "story" ? "Foto ou vídeo" : "Fotos";
    $("dica-arquivos").textContent = video ? "Um vídeo de até " + (S.cfg.limite_video_mb || 100) + " MB. " + (t === "reel" ? "Grave na vertical. " : "") + "Dica: desligue a localização da câmera antes de gravar."
      : t === "story" ? "Some do ar em 24 horas." : "Até 6 fotos. A localização gravada pelo celular é apagada automaticamente.";
    $("pub-texto").required = t === "texto";
    PUB.arquivos = []; $("previas").innerHTML = ""; inp.value = "";
    if ($("pub-onde").open) iniciarMiniMapaPub();
  }
  function renderPrevias() {
    $("previas").innerHTML = PUB.arquivos.map(function (a, i) {
      var url = a.url || (a.url = URL.createObjectURL(a.arquivo));
      var img = /^image\//.test(a.arquivo.type);
      return '<div class="previa">' + (img ? '<img src="' + url + '" alt="">' : '<video src="' + url + '" muted playsinline></video>') +
        '<div>' + (img ? '<button type="button" class="mini" data-borrar="' + i + '">Borrar rostos</button>' : "") +
        '<button type="button" class="mini" data-tirar="' + i + '" aria-label="Remover">' + icone("i-x") + "</button></div></div>";
    }).join("");
  }
  function iniciarMiniMapaPub() {
    if (PUB.mapa) { PUB.mapa.resize(); return; }
    esperarMapLibre().then(function (ml) {
      PUB.mapa = new ml.Map({ container: "pub-mapa", style: ESTILO_MAPA, bounds: BRASIL, attributionControl: { compact: true } });
      PUB.mapa.on("click", function (ev) { marcarLocal(ev.lngLat.lng, ev.lngLat.lat); });
    }).catch(function () { $("pub-mapa").innerHTML = '<p class="fonte-pq">Mapa indisponível.</p>'; });
  }
  function marcarLocal(lng, lat, conhecido) {
    PUB.lat = +lat.toFixed(6); PUB.lng = +lng.toFixed(6);
    esperarMapLibre().then(function (ml) {
      if (!PUB.mapa) iniciarMiniMapaPub();
      setTimeout(function () {
        if (!PUB.mapa) return;
        if (PUB.marcador) PUB.marcador.setLngLat([lng, lat]); else PUB.marcador = new ml.Marker({ color: "#AD4F4D" }).setLngLat([lng, lat]).addTo(PUB.mapa);
        PUB.mapa.flyTo({ center: [lng, lat], zoom: Math.max(PUB.mapa.getZoom(), 14) });
      }, PUB.mapa ? 0 : 600);
    });
    if (conhecido && conhecido.cidade) { PUB.uf = conhecido.uf; PUB.cidade = conhecido.cidade; PUB.bairro = conhecido.bairro; $("pub-lugar").textContent = lugar(conhecido); return; }
    $("pub-lugar").textContent = "Buscando o endereço…";
    endereco(lat, lng).then(function (r) { PUB.uf = r.uf; PUB.cidade = r.cidade; PUB.bairro = r.bairro; $("pub-lugar").textContent = lugar(r) || "Local marcado."; });
  }
  // Endereço aproximado (bairro, cidade, UF) a partir do ponto, pelo OpenStreetMap
  var ultimoNominatim = 0;
  function nominatim(url) {
    var espera = Math.max(0, ultimoNominatim + 1100 - Date.now()); // política de uso: 1 pedido por segundo
    ultimoNominatim = Date.now() + espera;
    return new Promise(function (ok) { setTimeout(ok, espera); }).then(function () {
      return fetch("https://nominatim.openstreetmap.org/" + url + (url.indexOf("?") > -1 ? "&" : "?") + "format=jsonv2&accept-language=pt-BR").then(function (r) { return r.json(); });
    });
  }
  function endereco(lat, lng) {
    return nominatim("reverse?lat=" + lat + "&lon=" + lng + "&zoom=16&addressdetails=1").then(function (j) {
      var a = j.address || {};
      var uf = (a["ISO3166-2-lvl4"] || "").replace("BR-", "") || null;
      return { uf: UFS[uf] ? uf : null, cidade: a.city || a.town || a.village || a.municipality || null, bairro: a.suburb || a.neighbourhood || a.quarter || a.city_district || null };
    }).catch(function () { return { uf: null, cidade: null, bairro: null }; });
  }
  function usarGPS(cb) {
    if (!navigator.geolocation) { toast("Seu navegador não informa a localização."); return; }
    navigator.geolocation.getCurrentPosition(function (p) { cb(p.coords.longitude, p.coords.latitude); },
      function () { toast("Não deu para pegar sua localização. Marque no mapa."); }, { enableHighAccuracy: true, timeout: 10000 });
  }
  function enviarPublicacao(ev) {
    ev.preventDefault();
    var f = ev.target, t = f.tipo.value, fd = new FormData();
    fd.append("tipo", t);
    fd.append("texto", f.texto.value.trim());
    if (t !== "texto" && !PUB.arquivos.length) { $("pub-erro").textContent = "Escolha " + (t === "video" || t === "reel" ? "um vídeo." : "uma foto."); return; }
    PUB.arquivos.forEach(function (a) { fd.append("arquivos[]", a.arquivo, a.arquivo.name || "arquivo"); });
    if ($("pub-evento").value) fd.append("evento_id", $("pub-evento").value);
    if (PUB.lat !== null) { fd.append("lat", PUB.lat); fd.append("lng", PUB.lng); }
    ["uf", "cidade", "bairro"].forEach(function (k) { if (PUB[k]) fd.append(k, PUB[k]); });
    var b = $("pub-enviar"); b.disabled = true; b.textContent = "Enviando…"; $("pub-erro").textContent = "";
    enviarComProgresso("post", fd, function (pc) { b.textContent = "Enviando " + pc + "%"; }).then(function (j) {
      $("j-publicar").close();
      toast(j.aviso || "Publicado!");
      if (location.hash === "#rede") renderRede(); else if (/^#evento\//.test(location.hash)) renderEvento(location.hash.split("/")[1]); else location.hash = "rede";
    }).catch(function (e) {
      $("pub-erro").textContent = e.message;
      if (e.dados && e.dados.precisa === "idade") setTimeout(function () { $("j-publicar").close(); location.hash = "perfil/" + S.eu.apelido; }, 2500);
    }).then(function () { b.disabled = false; b.textContent = "Publicar"; });
  }

  /* ---------- borrar rostos (no próprio aparelho, antes de enviar) ---------- */
  var BR = { i: -1, img: null, hist: [] };
  function abrirBorrar(i) {
    BR.i = i; BR.hist = [];
    var img = new Image();
    img.onload = function () {
      var c = $("borrar-canvas"), max = 1600, f = Math.min(1, max / Math.max(img.width, img.height));
      c.width = Math.round(img.width * f); c.height = Math.round(img.height * f);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      $("j-borrar").showModal();
    };
    img.src = PUB.arquivos[i].url;
  }
  function pixelar(ctx, x, y, r) {
    var t = Math.max(10, Math.round(r / 2.2)), x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), w = Math.min(ctx.canvas.width - x0, r * 2), h = Math.min(ctx.canvas.height - y0, r * 2);
    if (w <= 0 || h <= 0) return;
    for (var yy = y0; yy < y0 + h; yy += t) for (var xx = x0; xx < x0 + w; xx += t) {
      var d = ctx.getImageData(xx, yy, 1, 1).data;
      ctx.fillStyle = "rgb(" + d[0] + "," + d[1] + "," + d[2] + ")";
      ctx.fillRect(xx, yy, t, t);
    }
  }
  function ligarBorrar() {
    var c = $("borrar-canvas"), ctx = c.getContext("2d", { willReadFrequently: true }), pintando = false;
    function ponto(e) { var r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; }
    c.addEventListener("pointerdown", function (e) { pintando = true; BR.hist.push(ctx.getImageData(0, 0, c.width, c.height)); if (BR.hist.length > 15) BR.hist.shift(); c.setPointerCapture(e.pointerId); var p = ponto(e); pixelar(ctx, p[0], p[1], Math.round(c.width / 18)); });
    c.addEventListener("pointermove", function (e) { if (!pintando) return; var p = ponto(e); pixelar(ctx, p[0], p[1], Math.round(c.width / 18)); });
    c.addEventListener("pointerup", function () { pintando = false; });
    $("borrar-desfazer").addEventListener("click", function () { var h = BR.hist.pop(); if (h) ctx.putImageData(h, 0, 0); });
    $("borrar-ok").addEventListener("click", function () {
      c.toBlob(function (b) {
        var a = PUB.arquivos[BR.i];
        URL.revokeObjectURL(a.url);
        PUB.arquivos[BR.i] = { arquivo: new File([b], "foto-borrada.jpg", { type: "image/jpeg" }) };
        renderPrevias(); $("j-borrar").close();
      }, "image/jpeg", 0.9);
    });
    document.querySelector("[data-fechar-borrar]").addEventListener("click", function () { $("j-borrar").close(); });
  }

  /* ---------- criar evento ---------- */
  var EV = { mapa: null, marcador: null, lat: null, lng: null, uf: null, cidade: null, bairro: null };
  function abrirEvento() {
    var f = $("form-evento"); f.reset(); $("ev-erro").textContent = ""; EV.lat = EV.lng = null;
    $("ev-lugar").textContent = "Toque no mapa para marcar o ponto de encontro.";
    var agora = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
    f.inicio.min = agora.toISOString().slice(0, 16);
    $("j-evento").showModal();
    esperarMapLibre().then(function (ml) {
      if (EV.mapa) { EV.mapa.resize(); if (EV.marcador) { EV.marcador.remove(); EV.marcador = null; } return; }
      var centro = M.mapa ? M.mapa.getCenter() : null;
      EV.mapa = new ml.Map({ container: "ev-mapa", style: ESTILO_MAPA, bounds: centro && M.mapa.getZoom() > 8 ? null : BRASIL, center: centro && M.mapa.getZoom() > 8 ? centro : undefined, zoom: centro && M.mapa.getZoom() > 8 ? M.mapa.getZoom() : undefined, attributionControl: { compact: true } });
      EV.mapa.addControl(new ml.NavigationControl({ showCompass: false }));
      EV.mapa.on("click", function (e) { marcarEvento(e.lngLat.lng, e.lngLat.lat); });
    }).catch(function () { $("ev-mapa").innerHTML = '<p class="fonte-pq">Mapa indisponível agora.</p>'; });
  }
  function marcarEvento(lng, lat) {
    EV.lat = +lat.toFixed(6); EV.lng = +lng.toFixed(6);
    if (EV.marcador) EV.marcador.setLngLat([lng, lat]);
    else {
      EV.marcador = new maplibregl.Marker({ color: "#AD4F4D", draggable: true }).setLngLat([lng, lat]).addTo(EV.mapa);
      EV.marcador.on("dragend", function () { var p = EV.marcador.getLngLat(); marcarEvento(p.lng, p.lat); });
    }
    EV.mapa.flyTo({ center: [lng, lat], zoom: Math.max(EV.mapa.getZoom(), 15) });
    $("ev-lugar").textContent = "Buscando o endereço…";
    endereco(lat, lng).then(function (r) { EV.uf = r.uf; EV.cidade = r.cidade; EV.bairro = r.bairro; $("ev-lugar").textContent = lugar(r) || "Ponto marcado."; });
  }
  function enviarEvento(ev) {
    ev.preventDefault();
    var f = ev.target;
    if (EV.lat === null) { $("ev-erro").textContent = "Marque o ponto de encontro no mapa."; return; }
    var corpo = { titulo: f.titulo.value, inicio: f.inicio.value, fim: f.fim.value || null, local_nome: f.local_nome.value, descricao: f.descricao.value,
      link: f.link.value || null, lat: EV.lat, lng: EV.lng, uf: EV.uf, cidade: EV.cidade, bairro: EV.bairro };
    api("evento", { corpo: corpo }).then(function (j) {
      $("j-evento").close(); toast(j.aviso || "Evento publicado!");
      location.hash = "evento/" + j.id;
    }).catch(function (e) { $("ev-erro").textContent = e.message; });
  }

  /* ---------- denúncia ---------- */
  var DEN = null;
  function abrirDenuncia(alvo) {
    var p = alvo.split(":"); DEN = { alvo_tipo: p[0], alvo_id: +p[1] };
    var sel = $("den-motivo"); sel.innerHTML = '<option value="">Escolha…</option>';
    var m = S.cfg.motivos_denuncia || {};
    Object.keys(m).forEach(function (k) { sel.add(new Option(m[k], k)); });
    $("form-denunciar").reset(); $("den-erro").textContent = "";
    $("den-contato-campo").hidden = !!S.eu; $("den-contato").required = !S.eu;
    if ($("j-story").open) fecharStory();
    $("j-denunciar").showModal();
  }

  /* ---------- mapa ---------- */
  var M = { mapa: null, periodo: "proximos", registros: true, dados: { eventos: [], registros: [] }, ufGeo: null, timer: null, trilhaT: null };
  function abrirMapa() {
    if (M.mapa) { setTimeout(function () { M.mapa.resize(); }, 50); return; }
    $("mapa").innerHTML = '<p class="carregando">Carregando mapa…</p>';
    esperarMapLibre().then(function (ml) {
      $("mapa").innerHTML = "";
      M.mapa = new ml.Map({ container: "mapa", style: ESTILO_MAPA, bounds: BRASIL, fitBoundsOptions: { padding: 20 }, maxBounds: [[-95, -45], [-10, 15]], attributionControl: { compact: true }, cooperativeGestures: false });
      M.mapa.addControl(new ml.NavigationControl({ visualizePitch: true }), "top-right");
      M.mapa.addControl(new ml.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, showUserLocation: true }), "top-right");
      M.mapa.addControl(new ml.FullscreenControl(), "top-right");
      M.mapa.on("load", montarCamadas);
      M.mapa.on("moveend", function () { clearTimeout(M.timer); M.timer = setTimeout(carregarPontos, 250); atualizarTrilha(); });
    }).catch(function () { $("mapa").innerHTML = '<div class="vazio">Não deu para carregar o mapa. Verifique sua conexão.</div>'; });
  }
  function montarCamadas() {
    var m = M.mapa;
    m.addSource("ufs", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    m.addLayer({ id: "ufs-preench", type: "fill", source: "ufs", maxzoom: 6.5, paint: { "fill-color": ["interpolate", ["linear"], ["get", "total"], 0, "rgba(174,200,103,0.05)", 1, "rgba(233,181,59,0.35)", 20, "rgba(173,79,77,0.45)"] } });
    m.addLayer({ id: "ufs-linha", type: "line", source: "ufs", paint: { "line-color": "#16170F", "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.8, 8, 2], "line-opacity": 0.7 } });
    m.addLayer({ id: "ufs-rotulo", type: "symbol", source: "ufs", maxzoom: 6.5, layout: { "text-field": ["case", [">", ["get", "total"], 0], ["concat", ["get", "uf"], "\n", ["to-string", ["get", "total"]]], ["get", "uf"]], "text-font": ["Noto Sans Bold"], "text-size": 12 }, paint: { "text-color": "#16170F", "text-halo-color": "#F1E7CF", "text-halo-width": 1.5 } });
    m.addSource("eventos", { type: "geojson", data: { type: "FeatureCollection", features: [] }, cluster: true, clusterRadius: 44, clusterMaxZoom: 13 });
    m.addSource("registros", { type: "geojson", data: { type: "FeatureCollection", features: [] }, cluster: true, clusterRadius: 36, clusterMaxZoom: 15 });
    m.addLayer({ id: "rg-cluster", type: "circle", source: "registros", filter: ["has", "point_count"], paint: { "circle-color": "#E9B53B", "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 50, 24], "circle-stroke-width": 2.5, "circle-stroke-color": "#16170F" } });
    m.addLayer({ id: "rg-cluster-n", type: "symbol", source: "registros", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 12 } });
    m.addLayer({ id: "rg-ponto", type: "circle", source: "registros", filter: ["!", ["has", "point_count"]], paint: { "circle-color": "#E9B53B", "circle-radius": 8, "circle-stroke-width": 2.5, "circle-stroke-color": "#16170F" } });
    m.addLayer({ id: "ev-cluster", type: "circle", source: "eventos", filter: ["has", "point_count"], paint: { "circle-color": "#AD4F4D", "circle-radius": ["step", ["get", "point_count"], 17, 10, 22, 50, 28], "circle-stroke-width": 3, "circle-stroke-color": "#16170F" } });
    m.addLayer({ id: "ev-cluster-n", type: "symbol", source: "eventos", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 13 }, paint: { "text-color": "#F1E7CF" } });
    m.addLayer({ id: "ev-ponto", type: "circle", source: "eventos", filter: ["!", ["has", "point_count"]], paint: { "circle-color": "#AD4F4D", "circle-radius": 11, "circle-stroke-width": 3, "circle-stroke-color": "#16170F" } });
    m.addLayer({ id: "ev-rotulo", type: "symbol", source: "eventos", minzoom: 11, filter: ["!", ["has", "point_count"]], layout: { "text-field": ["get", "titulo"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-offset": [0, 1.4], "text-anchor": "top", "text-max-width": 12 }, paint: { "text-color": "#16170F", "text-halo-color": "#F1E7CF", "text-halo-width": 2 } });

    ["ev-cluster", "rg-cluster"].forEach(function (id) {
      m.on("click", id, function (e) {
        var f = e.features[0], src = m.getSource(id === "ev-cluster" ? "eventos" : "registros");
        Promise.resolve(src.getClusterExpansionZoom(f.properties.cluster_id)).then(function (z) { m.easeTo({ center: f.geometry.coordinates, zoom: z + 0.5 }); });
      });
    });
    m.on("click", "ev-ponto", function (e) { popupEvento(e.features[0]); });
    m.on("click", "rg-ponto", function (e) { popupRegistro(e.features[0]); });
    m.on("click", "ufs-preench", function (e) {
      if (m.queryRenderedFeatures(e.point, { layers: ["ev-ponto", "ev-cluster", "rg-ponto", "rg-cluster"] }).length) return;
      irParaUF(e.features[0].properties.uf);
    });
    ["ev-ponto", "rg-ponto", "ev-cluster", "rg-cluster", "ufs-preench"].forEach(function (id) {
      m.on("mouseenter", id, function () { m.getCanvas().style.cursor = "pointer"; });
      m.on("mouseleave", id, function () { m.getCanvas().style.cursor = ""; });
    });
    carregarUFs();
    carregarPontos();
    atualizarTrilha();
  }
  function carregarUFs() {
    Promise.all([
      M.ufGeo ? Promise.resolve(M.ufGeo) : fetch("https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&intrarregiao=UF&qualidade=minima").then(function (r) { return r.json(); }),
      api("regioes", { silencioso: true }).catch(function () { return { ufs: {} }; }),
    ]).then(function (r) {
      M.ufGeo = r[0];
      var tot = r[1].ufs || {};
      M.ufGeo.features.forEach(function (f) {
        var uf = CODIGO_UF[f.properties.codarea] || f.properties.codarea;
        f.properties.uf = uf;
        f.properties.total = ((tot[uf] || {}).eventos || 0) + ((tot[uf] || {}).registros || 0);
      });
      M.mapa.getSource("ufs").setData(M.ufGeo);
    }).catch(function () {});
  }
  function limitesDe(geom) {
    var o = 180, s = 90, l = -180, n = -90;
    (function andar(c) { if (typeof c[0] === "number") { o = Math.min(o, c[0]); l = Math.max(l, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]); } else c.forEach(andar); })(geom.coordinates);
    return [[o, s], [l, n]];
  }
  function irParaUF(uf) {
    $("mapa-uf").value = uf || "";
    encherCidades($("mapa-cidade"), uf, uf ? "Todas as cidades" : "Escolha o estado");
    if (!uf) { M.mapa.fitBounds(BRASIL, { padding: 20 }); return; }
    var f = M.ufGeo && M.ufGeo.features.filter(function (x) { return x.properties.uf === uf; })[0];
    if (f) M.mapa.fitBounds(limitesDe(f.geometry), { padding: 30, duration: 1200 });
    else buscarLugar(UFS[uf] + ", Brasil");
  }
  function buscarLugar(q) {
    return nominatim("search?countrycodes=br&limit=1&q=" + encodeURIComponent(q)).then(function (l) {
      if (!l.length) { toast("Lugar não encontrado."); return; }
      var b = l[0].boundingbox.map(Number); // [s, n, o, l]
      M.mapa.fitBounds([[b[2], b[0]], [b[3], b[1]]], { padding: 30, maxZoom: 16, duration: 1200 });
    }).catch(function () { toast("A busca de endereços está fora do ar."); });
  }
  function carregarPontos() {
    if (!M.mapa || !M.mapa.getSource("eventos")) return;
    var b = M.mapa.getBounds();
    var bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(function (n) { return n.toFixed(4); }).join(",");
    api("mapa&bbox=" + bbox + "&periodo=" + M.periodo + "&registros=" + (M.registros ? 1 : 0), { silencioso: true }).then(function (j) {
      M.dados = j;
      M.mapa.getSource("eventos").setData({ type: "FeatureCollection", features: j.eventos.map(function (e) {
        return { type: "Feature", geometry: { type: "Point", coordinates: [e.lng, e.lat] }, properties: e };
      }) });
      M.mapa.getSource("registros").setData({ type: "FeatureCollection", features: j.registros.map(function (r) {
        return { type: "Feature", geometry: { type: "Point", coordinates: [r.lng, r.lat] }, properties: r };
      }) });
      renderListaMapa();
    }).catch(function () { $("mapa-lista").innerHTML = '<p class="fonte-pq">Não deu para carregar os pontos agora.</p>'; });
  }
  function renderListaMapa() {
    var ev = M.dados.eventos.slice(0, 40), rg = M.dados.registros.length;
    $("mapa-lista").innerHTML = '<p class="mono">' + M.dados.eventos.length + " evento(s) e " + rg + " registro(s) nesta área</p>" +
      (ev.length ? ev.map(function (e) {
        return '<div class="ev-mini com-botao"><a href="#evento/' + e.id + '"><b>' + esc(e.titulo) + "</b><small>" + esc(quando(e.inicio)) + " · " + esc(lugar(e) || e.local_nome || "") + " · " + e.presencas + ' vão</small></a><button type="button" class="mini" data-voar="' + e.lng + "," + e.lat + '" aria-label="Mostrar no mapa">' + icone("i-pino") + "</button></div>";
      }).join("") : '<div class="vazio">Nenhum evento aqui. <button type="button" class="link" data-novo-evento>Crie um</button>.</div>');
  }
  function popupEvento(f) {
    var e = f.properties;
    new maplibregl.Popup({ offset: 14, maxWidth: "280px" }).setLngLat(f.geometry.coordinates).setHTML(
      '<div class="pop"><span class="tag sol">' + esc(quando(e.inicio)) + "</span><h3>" + esc(e.titulo) + "</h3><p>" + esc([e.local_nome, lugar(e)].filter(Boolean).join(" · ")) + "</p><p><b>" + e.presencas + '</b> pessoas vão</p><a class="mini forte" href="#evento/' + e.id + '">Abrir evento</a></div>').addTo(M.mapa);
  }
  function popupRegistro(f) {
    var r = f.properties;
    var midia = r.capa && r.capa !== "null" ? '<img src="' + esc(r.capa) + '" alt="">' : r.video && r.video !== "null" ? '<video src="' + esc(r.video) + '" muted playsinline controls preload="metadata"></video>' : "";
    new maplibregl.Popup({ offset: 10, maxWidth: "260px" }).setLngLat(f.geometry.coordinates).setHTML(
      '<div class="pop">' + midia + "<p>" + esc(lugar(r)) + " · " + relativo(r.criado_em) + '</p><a class="mini forte" href="#post/' + r.id + '">Ver registro</a></div>').addTo(M.mapa);
  }
  // Trilha "Brasil › UF › Cidade › Bairro" conforme o zoom
  function atualizarTrilha() {
    clearTimeout(M.trilhaT);
    var z = M.mapa.getZoom(), c = M.mapa.getCenter();
    if (z < 5.5) { $("mapa-trilha").innerHTML = "<b>Brasil</b>"; return; }
    M.trilhaT = setTimeout(function () {
      endereco(c.lat, c.lng).then(function (r) {
        var partes = ['<button type="button" class="link" data-ir-uf="">Brasil</button>'];
        if (r.uf) partes.push('<button type="button" class="link" data-ir-uf="' + r.uf + '">' + esc(UFS[r.uf]) + "</button>");
        if (z >= 9 && r.cidade) partes.push("<span>" + esc(r.cidade) + "</span>");
        if (z >= 13 && r.bairro) partes.push("<b>" + esc(r.bairro) + "</b>");
        $("mapa-trilha").innerHTML = partes.join(" › ");
      });
    }, 900);
  }

  /* ---------- eventos da página ---------- */
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-entrar],[data-sair],[data-publicar],[data-novo-evento],[data-apoiar],[data-denunciar],[data-apagar],[data-apagar-coment],[data-feed],[data-abrir-story],[data-story],[data-fechar-story],[data-vou],[data-registrar],[data-agenda],[data-borrar],[data-tirar],[data-periodo],[data-ir-uf],[data-voar],[data-som],#mais-feed,#pub-gps,#ev-gps,#minha-local,#baixar-dados,#apagar-conta,#pedir-verif");
    if (!el) return;
    var d = el.dataset;
    if ("entrar" in d) abrirEntrar();
    else if ("sair" in d) api("sair", { corpo: {} }).then(function () { S.eu = null; renderConta(); toast("Você saiu."); location.hash = "rede"; recarregarRota(); });
    else if ("publicar" in d) exigirConta(function () { abrirPublicar(d.publicar || "texto"); })();
    else if ("novoEvento" in d) exigirConta(abrirEvento)();
    else if (d.apoiar) exigirConta(function () {
      api("apoiar", { corpo: { post_id: +d.apoiar } }).then(function (j) {
        document.querySelectorAll('[data-apoiar="' + d.apoiar + '"]').forEach(function (b) { b.setAttribute("aria-pressed", j.apoiei); b.querySelector("b").textContent = j.apoios || ""; });
      }).catch(function (x) { toast(x.message); });
    })();
    else if (d.denunciar) abrirDenuncia(d.denunciar);
    else if (d.apagar) {
      if (!confirmar("Apagar esta publicação?")) return;
      api("post-apagar", { corpo: { id: +d.apagar, motivo: "removido pela moderação" } }).then(function () {
        var a = document.querySelector('.post[data-post="' + d.apagar + '"]'); if (a) a.remove(); toast("Apagado.");
        if (/^#post\//.test(location.hash)) location.hash = "rede";
      }).catch(function (x) { toast(x.message); });
    } else if (d.apagarComent) {
      api("comentario-apagar", { corpo: { id: +d.apagarComent } }).then(function () { carregarComentarios(+d.post); }).catch(function (x) { toast(x.message); });
    } else if ("feed" in d && el.getAttribute("role") === "tab") {
      document.querySelectorAll("[data-feed]").forEach(function (b) { b.setAttribute("aria-selected", String(b === el)); });
      S.feed.tipo = d.feed; renderRede();
    } else if (d.abrirStory) abrirStory(+d.abrirStory, 0);
    else if (d.story) proxStory(+d.story);
    else if ("fecharStory" in d) fecharStory();
    else if (d.vou) exigirConta(function () {
      api("presenca", { corpo: { evento_id: +d.vou } }).then(function (j) {
        el.setAttribute("aria-pressed", j.vou); el.textContent = j.vou ? "Eu vou ✓" : "Eu vou"; $("n-pres").textContent = j.presencas;
        if (j.vou) toast("Presença confirmada. Chama mais gente pelo zap!");
      }).catch(function (x) { toast(x.message); });
    })();
    else if (d.registrar) exigirConta(function () { abrirPublicar("foto", S.eventoAtual); })();
    else if (d.agenda) baixarAgenda(S.eventoAtual);
    else if (d.borrar) abrirBorrar(+d.borrar);
    else if (d.tirar) { PUB.arquivos.splice(+d.tirar, 1); renderPrevias(); }
    else if (d.periodo) {
      document.querySelectorAll("[data-periodo]").forEach(function (b) { b.setAttribute("aria-pressed", String(b === el)); });
      M.periodo = d.periodo; carregarPontos();
    } else if ("irUf" in d) irParaUF(d.irUf);
    else if (d.voar && M.mapa) { var c = d.voar.split(",").map(Number); M.mapa.flyTo({ center: c, zoom: Math.max(M.mapa.getZoom(), 15) }); if (window.innerWidth < 900) $("mapa").scrollIntoView({ behavior: "smooth" }); }
    else if ("som" in d) { var v = el.closest(".reel").querySelector("video"); v.muted = !v.muted; el.textContent = v.muted ? "🔇" : "🔊"; }
    else if (el.id === "mais-feed") carregarFeed(false);
    else if (el.id === "pub-gps") usarGPS(function (lng, lat) { $("pub-onde").open = true; iniciarMiniMapaPub(); marcarLocal(lng, lat); });
    else if (el.id === "ev-gps") usarGPS(marcarEvento);
    else if (el.id === "minha-local") usarGPS(function (lng, lat) { M.mapa && M.mapa.flyTo({ center: [lng, lat], zoom: 13 }); });
    else if (el.id === "baixar-dados") api("meus-dados").then(function (j) {
      var a = document.createElement("a"); delete j._status;
      a.href = URL.createObjectURL(new Blob([JSON.stringify(j, null, 2)], { type: "application/json" })); a.download = "meus-dados-mobiliza.json"; a.click();
    });
    else if (el.id === "apagar-conta") {
      var c2 = window.prompt("Isso apaga sua conta, publicações, fotos e vídeos. Não tem volta. Digite APAGAR para confirmar:");
      if (c2 !== "APAGAR") return;
      api("apagar-conta", { corpo: { confirmo: "APAGAR" } }).then(function () { S.eu = null; renderConta(); toast("Conta apagada."); location.hash = "inicio"; });
    } else if (el.id === "pedir-verif") api("pedir-verificacao", { corpo: {} }).then(function () { el.outerHTML = '<p class="ok-txt">Pedido enviado. A equipe vai falar com você pelo e-mail da sua conta.</p>'; }).catch(function (x) { toast(x.message); });
  });
  function confirmar(msg) { return window.confirm(msg); }

  document.addEventListener("submit", function (e) {
    var id = e.target.id;
    if (id === "form-publicar") enviarPublicacao(e);
    else if (id === "form-evento") enviarEvento(e);
    else if (id === "form-boasvindas") {
      e.preventDefault();
      var f = e.target;
      api("perfil", { corpo: { apelido: f.apelido.value.trim().toLowerCase(), uf: f.uf.value || null, nascimento: f.nascimento.value, aceito_regras: true } }).then(function (j) {
        S.eu = Object.assign(S.eu, j.usuario); renderConta(); $("j-boasvindas").close(); toast("Pronto! Bem-vindo à rede.");
        recarregarRota();
      }).catch(function (x) { $("bv-erro").textContent = x.message; });
    } else if (id === "form-denunciar") {
      e.preventDefault();
      var fd = e.target;
      api("denunciar", { corpo: Object.assign({}, DEN, { motivo: fd.motivo.value, detalhe: fd.detalhe.value, contato: fd.contato.value || undefined }) })
        .then(function () { $("j-denunciar").close(); toast("Denúncia recebida. Obrigado por cuidar da rede."); })
        .catch(function (x) { $("den-erro").textContent = x.message; });
    } else if (id === "form-coment") {
      e.preventDefault();
      var pid = +e.target.dataset.post, t = $("coment-texto");
      exigirConta(function () {
        api("comentar", { corpo: { post_id: pid, texto: t.value } }).then(function (j) { t.value = ""; if (j.aviso) toast(j.aviso); carregarComentarios(pid); }).catch(function (x) { toast(x.message); });
      })();
    } else if (id === "form-perfil") {
      e.preventDefault();
      var p = e.target;
      api("perfil", { corpo: { nome: p.nome.value, apelido: p.apelido.value.trim().toLowerCase(), uf: p.uf.value || null, cidade: p.cidade.value || null, bio: p.bio.value } })
        .then(function (j) { S.eu = Object.assign(S.eu, j.usuario); renderConta(); toast("Perfil salvo."); location.hash = "perfil/" + S.eu.apelido; })
        .catch(function (x) { $("pf-erro").textContent = x.message; });
    } else if (id === "form-teste") {
      e.preventDefault();
      var ft = e.target;
      aoEntrarGoogle({ credential: "teste:" + ft.email.value + ":" + ft.email.value + ":" + ft.nome.value });
    } else if (id === "busca-lugar") {
      e.preventDefault();
      var q = $("mapa-busca").value.trim(); if (q) buscarLugar(q + ($("mapa-uf").value && !/,/.test(q) ? ", " + $("mapa-uf").value : ""));
    }
  });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.name === "tipo" && t.closest("#form-publicar")) ajustarTipo();
    else if (t.id === "pub-arquivos") {
      var lim = $("form-publicar").tipo.value === "foto" ? 6 : 1;
      Array.prototype.slice.call(t.files).forEach(function (f) { if (PUB.arquivos.length < lim) PUB.arquivos.push({ arquivo: f }); });
      t.value = ""; renderPrevias();
    } else if (t.id === "feed-uf") {
      S.feed.uf = t.value; S.feed.cidade = "";
      encherCidades($("feed-cidade"), t.value, "Todas as cidades"); renderRede();
    } else if (t.id === "feed-cidade") { S.feed.cidade = t.value; renderRede(); }
    else if (t.id === "mapa-uf") irParaUF(t.value);
    else if (t.id === "mapa-cidade" && t.value) buscarLugar(t.value + ", " + UFS[$("mapa-uf").value] + ", Brasil");
    else if (t.id === "mapa-registros") { M.registros = t.checked; carregarPontos(); }
  });
  document.addEventListener("toggle", function (e) { if (e.target.id === "pub-onde" && e.target.open) iniciarMiniMapaPub(); }, true);
  document.addEventListener("input", function (e) {
    if (e.target.id === "pub-texto") $("aviso-link").hidden = !/https?:\/\/|www\./i.test(e.target.value);
  });
  document.addEventListener("keydown", function (e) {
    if (!$("j-story") || !$("j-story").open) return;
    if (e.key === "ArrowRight") proxStory(1); else if (e.key === "ArrowLeft") proxStory(-1);
  });
  // Rolagem infinita no feed
  window.addEventListener("scroll", function () {
    if (location.hash !== "#rede" || S.feed.fim || S.feed.carregando) return;
    if (window.innerHeight + window.scrollY > document.body.offsetHeight - 900) carregarFeed(false);
  }, { passive: true });

  var rotaAtual = ["", ""];
  function recarregarRota() { if (rotaAtual[0]) mostrar(rotaAtual[0], rotaAtual[1]); }
  function mostrar(r, resto) {
    rotaAtual = [r, resto];
    (S.pronto || Promise.resolve()).then(function () {
      if (r === "rede") renderRede();
      else if (r === "mapa") abrirMapa();
      else if (r === "reels") renderReels();
      else if (r === "evento") renderEvento(resto);
      else if (r === "post") renderPost(resto);
      else if (r === "perfil") renderPerfil(resto);
    });
  }

  ligarBorrar();
  iniciar();
  window.MPRede = { mostrar: mostrar };
})();
