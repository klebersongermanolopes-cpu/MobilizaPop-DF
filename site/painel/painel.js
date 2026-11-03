/* Mobiliza Pop: painel da equipe (moderação, denúncias, pessoas, publicações oficiais e registro).
   Só funciona para contas com papel "moderador" ou "admin". Toda ação fica registrada no servidor. */
(function () {
  "use strict";
  var API = "../api/?r=";
  var S = { eu: null, csrf: "", aba: "resumo" };

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var toastT;
  function toast(m) { var t = $("toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("on"); }, 3000); }
  function data(s) { return s ? s.slice(8, 10) + "/" + s.slice(5, 7) + " " + s.slice(11, 16) : ""; }
  function api(rota, op) {
    op = op || {};
    var h = { "X-CSRF": S.csrf }, corpo;
    if (op.form) corpo = op.form; else if (op.corpo) { corpo = JSON.stringify(op.corpo); h["Content-Type"] = "application/json"; }
    return fetch(API + rota, { method: corpo ? "POST" : "GET", headers: h, body: corpo, credentials: "same-origin" }).then(function (r) {
      return r.json().catch(function () { return { erro: "Resposta inválida." }; }).then(function (j) {
        if (j.csrf) S.csrf = j.csrf;
        if (!r.ok) throw new Error(j.erro || "Erro " + r.status);
        return j;
      });
    });
  }
  function admin() { return S.eu && S.eu.papel === "admin"; }
  function midias(p) {
    return (p.midias || []).map(function (m) {
      return m.tipo === "video" ? '<video src="' + esc("../" + m.url.replace(/^\//, "")) + '" controls preload="metadata"></video>' : '<img src="' + esc("../" + m.url.replace(/^\//, "")) + '" alt="">';
    }).join("");
  }
  function botoesModerar(tipo, id, extra) {
    return '<div class="decidir" data-tipo="' + tipo + '" data-id="' + id + '">' +
      '<button type="button" class="mini forte" data-acao="aprovar">Aprovar</button>' +
      '<input type="text" maxlength="300" placeholder="Motivo (obrigatório para rejeitar)" aria-label="Motivo">' +
      '<button type="button" class="mini perigo" data-acao="rejeitar">Rejeitar</button>' + (extra || "") + "</div>";
  }

  /* ---------- abas ---------- */
  function mostrar() {
    S.aba = (location.hash || "#resumo").slice(1);
    document.querySelectorAll("#abas a").forEach(function (a) {
      a.hidden = a.hasAttribute("data-admin") && !admin();
      if (a.dataset.aba === S.aba) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    var f = { resumo: resumo, fila: fila, denuncias: denuncias, pessoas: pessoas, oficiais: oficiais, registro: registro }[S.aba] || resumo;
    $("painel").innerHTML = '<p class="carregando">Carregando…</p>';
    f();
  }
  function contadores() {
    return api("admin/resumo").then(function (r) {
      var fila = r.posts_pendentes + r.eventos_pendentes + r.comentarios_pendentes;
      $("n-fila").textContent = fila || ""; $("n-den").textContent = (r.denuncias_abertas + r.verificacoes) || "";
      return r;
    });
  }

  function resumo() {
    contadores().then(function (r) {
      var c = [["Na fila de aprovação", r.posts_pendentes + r.eventos_pendentes + r.comentarios_pendentes, "#fila", "verm"],
        ["Denúncias abertas", r.denuncias_abertas, "#denuncias", "verm"], ["Pedidos de verificação de idade", r.verificacoes, "#denuncias", "sol"],
        ["Pessoas ativas", r.usuarios, "#pessoas", ""], ["Novas pessoas (7 dias)", r.usuarios_7d, "#pessoas", "broto"],
        ["Publicações (7 dias)", r.posts_7d, "../#rede", "broto"], ["Atos marcados", r.eventos_futuros, "../#mapa", "sol"]];
      $("painel").innerHTML = '<h1 class="painel-h">Resumo</h1><div class="cartoes">' + c.map(function (x) {
        return '<a class="cartao-n ' + x[3] + '" href="' + x[2] + '"><b>' + x[1] + "</b><span>" + x[0] + "</span></a>";
      }).join("") + '</div><div class="bloco dicas"><p class="mono">Rotina sugerida</p><ol>' +
        "<li>Abra a <b>Fila</b> e decida tudo o que está esperando. Na dúvida, rejeite e explique o motivo.</li>" +
        "<li>Em <b>Denúncias</b>, priorize: menores, violência e ataque à democracia. Esses saem do ar na hora.</li>" +
        "<li>Confirme a idade das pessoas que pediram verificação (conversa por e-mail ou vídeo, sem guardar documento).</li>" +
        "<li>Contas que publicam bem e com fonte podem virar <b>confiáveis</b>: publicam sem esperar aprovação.</li></ol>" +
        (admin() ? '<div class="linha2"><button type="button" class="mini" id="limpeza">Rodar limpeza agora</button><a class="mini" href="../admin/">Conteúdo editorial (alertas, checagens, boletim)</a></div>' : "") + "</div>";
    }).catch(semAcesso);
  }

  function fila() {
    contadores();
    api("admin/fila").then(function (j) {
      var h = '<h1 class="painel-h">Fila de aprovação</h1>';
      if (!j.posts.length && !j.eventos.length && !j.comentarios.length) h += '<div class="vazio">Fila zerada. Bom trabalho!</div>';
      if (j.eventos.length) h += '<h2 class="sub-h">Eventos</h2><div class="itens">' + j.eventos.map(function (e) {
        return '<article class="item"><header><b>' + esc(e.titulo) + "</b><small>@" + esc(e.autor.apelido) + " · " + esc(data(e.inicio)) + " · " + esc([e.local_nome, e.bairro, e.cidade, e.uf].filter(Boolean).join(", ")) + "</small></header>" +
          (e.motivo ? '<p class="motivo">Filtro: ' + esc(e.motivo) + "</p>" : "") + "<p>" + esc(e.descricao || "") + "</p>" +
          '<p class="fonte-pq"><a href="https://www.openstreetmap.org/?mlat=' + e.lat + "&mlon=" + e.lng + '#map=17/' + e.lat + "/" + e.lng + '" target="_blank" rel="noopener">Ver o local no mapa</a>' + (e.link ? ' · <a href="' + esc(e.link) + '" target="_blank" rel="noopener">link informado</a>' : "") + "</p>" +
          botoesModerar("evento", e.id) + "</article>";
      }).join("") + "</div>";
      if (j.posts.length) h += '<h2 class="sub-h">Publicações</h2><div class="itens">' + j.posts.map(function (p) {
        return '<article class="item"><header><b>' + esc(p.autor.nome) + "</b><small>@" + esc(p.autor.apelido) + " · " + esc(p.tipo) + " · " + esc(data(p.criado_em)) + (p.cidade ? " · " + esc(p.cidade) : "") + "</small></header>" +
          (p.motivo ? '<p class="motivo">Motivo da revisão: ' + esc(p.motivo) + "</p>" : "") + (p.texto ? "<p>" + esc(p.texto) + "</p>" : "") +
          '<div class="midias-painel">' + midias(p) + "</div>" + botoesModerar("post", p.id) + "</article>";
      }).join("") + "</div>";
      if (j.comentarios.length) h += '<h2 class="sub-h">Comentários</h2><div class="itens">' + j.comentarios.map(function (c) {
        return '<article class="item"><header><b>' + esc(c.nome) + "</b><small>@" + esc(c.apelido) + ' · <a href="../#post/' + c.post_id + '" target="_blank">ver publicação</a></small></header><p>' + esc(c.texto) + "</p>" + botoesModerar("comentario", c.id) + "</article>";
      }).join("") + "</div>";
      $("painel").innerHTML = h;
    }).catch(semAcesso);
  }

  function denuncias() {
    contadores();
    var st = S.denStatus || "aberta";
    api("admin/denuncias&status=" + st).then(function (j) {
      var h = '<h1 class="painel-h">Denúncias</h1><div class="pilulas">' + ["aberta", "procedente", "improcedente"].map(function (s) {
        return '<button type="button" class="pilula" data-den-status="' + s + '" aria-pressed="' + (s === st) + '">' + s + "s</button>";
      }).join("") + "</div>";
      if (!j.denuncias.length) h += '<div class="vazio">Nenhuma denúncia ' + st + ".</div>";
      h += '<div class="itens">' + j.denuncias.map(function (d) {
        var a = d.alvo || {}, verif = d.motivo === "verificacao";
        var alvo = d.alvo_tipo === "usuario" ? "@" + esc(a.apelido) + " (" + esc(a.nome) + ")" + (a.nascimento ? " · nascimento declarado: " + esc(a.nascimento.split("-").reverse().join("/")) : "")
          : esc((a.texto || "").slice(0, 400)) + (a.apelido ? " <small>— @" + esc(a.apelido) + "</small>" : "");
        var link = d.alvo_tipo === "post" ? "../#post/" + d.alvo_id : d.alvo_tipo === "evento" ? "../#evento/" + d.alvo_id : d.alvo_tipo === "comentario" && a.post_id ? "../#post/" + a.post_id : d.alvo_tipo === "usuario" && a.apelido ? "../#perfil/" + a.apelido : "";
        var acoes = "";
        if (st === "aberta") {
          if (verif) acoes = '<div class="decidir"><button type="button" class="mini forte" data-verificar="' + d.alvo_id + '">Confirmar idade</button><button type="button" class="mini" data-resolver="' + d.id + '" data-decisao="improcedente">Recusar pedido</button></div>';
          else if (d.alvo_tipo === "usuario") acoes = '<div class="decidir"><button type="button" class="mini perigo" data-suspender="' + d.alvo_id + '">Suspender conta</button><button type="button" class="mini" data-resolver="' + d.id + '" data-decisao="procedente">Procedente</button><button type="button" class="mini" data-resolver="' + d.id + '" data-decisao="improcedente">Improcedente</button></div>';
          else acoes = '<div class="decidir" data-tipo="' + d.alvo_tipo + '" data-id="' + d.alvo_id + '"><input type="text" maxlength="300" placeholder="Motivo da remoção" aria-label="Motivo"><button type="button" class="mini perigo" data-acao="remover">Remover conteúdo</button><button type="button" class="mini" data-resolver="' + d.id + '" data-decisao="improcedente">Manter (improcedente)</button></div>';
        }
        return '<article class="item' + (["menores", "violencia", "antidemocratico"].indexOf(d.motivo) > -1 ? " grave" : "") + '"><header><b>' + esc(d.motivo_texto) + "</b><small>" + esc(d.alvo_tipo) + " · " + esc(data(d.criado_em)) +
          " · por " + (d.denunciante ? "@" + esc(d.denunciante) : d.contato ? esc(d.contato) + " (sem conta)" : "—") + "</small></header>" +
          "<p>" + alvo + "</p>" + (d.detalhe ? '<p class="motivo">' + esc(d.detalhe) + "</p>" : "") + (link ? '<p><a class="fonte-pq" href="' + link + '" target="_blank">Abrir no site</a> · situação atual: ' + esc(a.status || "?") + "</p>" : "") + acoes + "</article>";
      }).join("") + "</div>";
      $("painel").innerHTML = h;
    }).catch(semAcesso);
  }

  function pessoas() {
    var busca = S.busca || "";
    api("admin/usuarios&busca=" + encodeURIComponent(busca)).then(function (j) {
      var papeis = ["membro", "confiavel", "moderador", "admin"];
      $("painel").innerHTML = '<h1 class="painel-h">Pessoas</h1><form id="form-busca" class="busca-pessoas"><input id="busca-p" type="search" placeholder="Nome, apelido ou e-mail" value="' + esc(busca) + '"><button class="mini forte">Buscar</button></form>' +
        '<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Pessoa</th><th>Local</th><th>Desde</th><th>Posts</th><th>Idade</th><th>Papel</th><th>Situação</th></tr></thead><tbody>' +
        j.usuarios.map(function (u) {
          return "<tr><td><b>" + esc(u.nome) + '</b><br><a href="../#perfil/' + esc(u.apelido) + '" target="_blank">@' + esc(u.apelido) + "</a><br><small>" + esc(u.email) + "</small></td>" +
            "<td>" + esc([u.cidade, u.uf].filter(Boolean).join(", ")) + "</td><td>" + esc((u.criado_em || "").slice(0, 10).split("-").reverse().join("/")) + "</td><td>" + u.posts + (+u.strikes ? ' <span class="tag verm">' + u.strikes + " strike</span>" : "") + "</td>" +
            '<td><label class="marcar"><input type="checkbox" data-idade="' + u.id + '"' + (+u.idade_verificada ? " checked" : "") + "> confirmada</label>" + (u.nascimento ? "<small>" + esc(u.nascimento.split("-").reverse().join("/")) + "</small>" : "") + "</td>" +
            '<td><select data-papel="' + u.id + '"' + (admin() ? "" : " disabled") + ">" + papeis.map(function (p) { return "<option" + (p === u.papel ? " selected" : "") + ">" + p + "</option>"; }).join("") + "</select></td>" +
            '<td><select data-status="' + u.id + '">' + ["ativo", "suspenso", "banido"].map(function (s) { return "<option" + (s === u.status ? " selected" : "") + (s === "banido" && !admin() ? " disabled" : "") + ">" + s + "</option>"; }).join("") + "</select></td></tr>";
        }).join("") + "</tbody></table></div>" +
        '<p class="fonte-pq">Papéis: <b>membro</b> (fotos, vídeos e eventos passam por aprovação) · <b>confiável</b> (publica direto) · <b>moderador</b> (modera e suspende) · <b>admin</b> (tudo, inclusive banir e publicar como Mobiliza Pop).</p>';
    }).catch(semAcesso);
  }

  function oficiais() {
    api("admin/oficiais").then(function (j) {
      S.oficiais = j.posts;
      $("painel").innerHTML = '<h1 class="painel-h">Publicações oficiais</h1><p>Aparecem no feed com o selo Mobiliza Pop. <b>Sem fonte, não publica.</b></p>' +
        '<form id="form-oficial" class="bloco form-oficial"><input type="hidden" name="id"><p class="mono" id="of-modo">Nova publicação</p>' +
        '<div class="campo"><label for="of-titulo">Título</label><input id="of-titulo" name="titulo" required maxlength="140"></div>' +
        '<div class="campo"><label for="of-texto">Texto</label><textarea id="of-texto" name="texto" required rows="6" maxlength="8000"></textarea></div>' +
        '<div class="campo"><label for="of-fonte">Fonte (link https://)</label><input id="of-fonte" name="fonte_url" type="url" required pattern="https://.+" maxlength="500"></div>' +
        '<div class="linha2"><div class="campo"><label for="of-uf">UF (opcional)</label><input id="of-uf" name="uf" maxlength="2"></div><div class="campo"><label for="of-cidade">Cidade (opcional)</label><input id="of-cidade" name="cidade" maxlength="80"></div></div>' +
        '<div class="campo"><label for="of-img">Imagem (opcional)</label><input id="of-img" name="arquivos[]" type="file" accept="image/jpeg,image/png,image/webp"></div>' +
        '<div class="linha2"><button class="btn verm peq" type="submit">Publicar</button><button type="button" class="mini" id="of-cancelar" hidden>Cancelar edição</button></div></form>' +
        '<div class="itens">' + j.posts.map(function (p) {
          return '<article class="item"><header><b>' + esc(p.titulo) + "</b><small>" + esc(data(p.criado_em)) + " · " + p.apoios + " apoios · " + p.comentarios + " comentários</small></header><p>" + esc((p.texto || "").slice(0, 300)) + "</p>" +
            '<div class="midias-painel">' + midias(p) + '</div><div class="decidir"><button type="button" class="mini" data-editar="' + p.id + '">Editar</button><a class="mini" href="../#post/' + p.id + '" target="_blank">Ver</a><button type="button" class="mini perigo" data-apagar-oficial="' + p.id + '">Apagar</button></div></article>';
        }).join("") + "</div>";
    }).catch(semAcesso);
  }

  function registro() {
    api("admin/log").then(function (j) {
      $("painel").innerHTML = '<h1 class="painel-h">Registro da moderação</h1><p>Tudo o que a equipe e o filtro automático fizeram. Serve para transparência e para responder a pedidos de revisão.</p>' +
        '<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Alvo</th><th>Motivo</th></tr></thead><tbody>' +
        j.log.map(function (l) {
          return "<tr><td>" + esc(data(l.criado_em)) + "</td><td>" + (l.moderador ? "@" + esc(l.moderador) : "<i>filtro automático</i>") + "</td><td>" + esc(l.acao) + "</td><td>" + esc(l.alvo_tipo) + " #" + l.alvo_id + "</td><td>" + esc(l.motivo || "") + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    }).catch(semAcesso);
  }

  function semAcesso(e) {
    $("painel").innerHTML = '<div class="vazio">' + esc(e.message) + '<br><br><a class="btn peq" href="../#rede">Entrar pelo site</a></div>';
  }

  /* ---------- ações ---------- */
  document.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    var d = b.dataset;
    if (d.acao) {
      var caixa = b.closest(".decidir"), motivo = (caixa.querySelector("input") || {}).value || "";
      if (d.acao !== "aprovar" && !motivo.trim()) { toast("Escreva o motivo: ele aparece para quem publicou."); caixa.querySelector("input").focus(); return; }
      api("admin/moderar", { corpo: { alvo_tipo: caixa.dataset.tipo, alvo_id: +caixa.dataset.id, acao: d.acao, motivo: motivo } })
        .then(function () { toast("Feito."); mostrar(); }).catch(function (x) { toast(x.message); });
    } else if (d.resolver) {
      api("admin/denuncia", { corpo: { id: +d.resolver, decisao: d.decisao } }).then(function () { toast("Denúncia resolvida."); mostrar(); }).catch(function (x) { toast(x.message); });
    } else if (d.verificar) {
      api("admin/usuario", { corpo: { id: +d.verificar, idade_verificada: true } }).then(function () { toast("Idade confirmada. A pessoa já pode publicar."); mostrar(); }).catch(function (x) { toast(x.message); });
    } else if (d.suspender) {
      var m = window.prompt("Motivo da suspensão:"); if (!m) return;
      api("admin/usuario", { corpo: { id: +d.suspender, status: "suspenso", motivo: m } }).then(function () { toast("Conta suspensa."); mostrar(); }).catch(function (x) { toast(x.message); });
    } else if (d.denStatus) { S.denStatus = d.denStatus; mostrar(); }
    else if (d.editar) {
      var p = S.oficiais.filter(function (x) { return x.id === +d.editar; })[0], f = $("form-oficial");
      f.id.value = p.id; f.titulo.value = p.titulo || ""; f.texto.value = p.texto || ""; f.fonte_url.value = p.fonte_url || ""; f.uf.value = p.uf || ""; f.cidade.value = p.cidade || "";
      $("of-modo").textContent = "Editando #" + p.id; $("of-cancelar").hidden = false; f.scrollIntoView({ behavior: "smooth" });
    } else if (b.id === "of-cancelar") mostrar();
    else if (d.apagarOficial) {
      if (!window.confirm("Apagar esta publicação oficial?")) return;
      api("admin/oficial-apagar", { corpo: { id: +d.apagarOficial } }).then(function () { toast("Apagada."); mostrar(); }).catch(function (x) { toast(x.message); });
    } else if (b.id === "limpeza") {
      api("admin/limpeza", { corpo: {} }).then(function (r) { toast("Limpeza: " + r.acessos_apagados + " registros antigos e " + r.stories_apagados + " stories vencidos apagados."); });
    } else if (b.dataset.sair !== undefined) api("sair", { corpo: {} }).then(function () { location.href = "../#rede"; });
  });
  document.addEventListener("change", function (e) {
    var t = e.target, c = {};
    if (t.dataset.idade) c = { id: +t.dataset.idade, idade_verificada: t.checked };
    else if (t.dataset.papel) c = { id: +t.dataset.papel, papel: t.value };
    else if (t.dataset.status) {
      c = { id: +t.dataset.status, status: t.value };
      if (t.value !== "ativo") { c.motivo = window.prompt("Motivo (fica no registro):") || ""; if (!c.motivo) { mostrar(); return; } }
    } else return;
    api("admin/usuario", { corpo: c }).then(function () { toast("Salvo."); }).catch(function (x) { toast(x.message); mostrar(); });
  });
  document.addEventListener("submit", function (e) {
    e.preventDefault();
    if (e.target.id === "form-busca") { S.busca = $("busca-p").value; pessoas(); }
    else if (e.target.id === "form-oficial") {
      var f = e.target, fd = new FormData(f);
      if (!f.id.value) fd.delete("id");
      api("admin/oficial", { form: fd }).then(function () { toast("Publicado no feed."); mostrar(); }).catch(function (x) { toast(x.message); });
    }
  });
  window.addEventListener("hashchange", mostrar);

  api("eu").then(function (j) {
    S.eu = j.usuario;
    if (!S.eu || ["admin", "moderador"].indexOf(S.eu.papel) === -1) {
      semAcesso(new Error(S.eu ? "Sua conta não faz parte da equipe de moderação." : "Entre com sua conta Google no site para usar o painel."));
      document.querySelectorAll("#abas a").forEach(function (a) { a.hidden = true; });
      return;
    }
    $("conta-painel").innerHTML = '<span class="mono">@' + esc(S.eu.apelido) + " · " + esc(S.eu.papel) + '</span> <button type="button" class="mini" data-sair>Sair</button>';
    mostrar();
  }).catch(semAcesso);
})();
