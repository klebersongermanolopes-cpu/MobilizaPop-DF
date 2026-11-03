# Mobiliza Pop: portal + rede social de mobilização

O projeto tem três partes:

1. **Portal** (já existia): alertas de projetos de lei, checagens, boletim e monitor do Congresso. O conteúdo fica em `site/data/*.json`.
2. **Rede social** (nova): login com Google, feed, stories, reels, fotos, vídeos, comentários, o "Tô junto" (apoio), eventos com "Eu vou" e um **mapa interativo** com zoom de Brasil → estado → cidade → bairro. Ela tem moderação híbrida, denúncias, painel da equipe e regras alinhadas à lei brasileira.
3. **Robô diário** (agora com **Claude**): coleta dados públicos duas vezes por dia, escreve os rascunhos do boletim e das checagens e abre um pull request. Nada vai para o ar sem uma pessoa aprovar.

Hospedagem: **Hostinger** (PHP 8 + MySQL). Código: **GitHub da Miracena** (`MiraTHC/mobiliza-pop`). Toda mudança aprovada na `main` é publicada sozinha.

```
GitHub (MiraTHC/mobiliza-pop)
  ├─ Robô diário (8h17 e 17h17) → Claude escreve rascunhos → pull request → equipe aprova
  └─ main → testes + validador → envio por FTPS → Hostinger (public_html)
                                                   ├─ portal (HTML/CSS/JS)
                                                   ├─ /api/   rede social (PHP)  ↔  MySQL da Hostinger
                                                   ├─ /painel/ painel da equipe
                                                   └─ /uploads/ fotos e vídeos (nunca vão para o GitHub)
```

## O que tem em cada pasta

| Pasta / arquivo | Para quê |
|---|---|
| `site/` | Tudo o que vai para a Hostinger |
| `site/api/` | API da rede social (PHP). O código interno em `lib/` fica bloqueado para a internet |
| `site/assets/js/rede.js` | Telas da rede: feed, stories, reels, mapa, eventos, perfil, publicar, borrar rostos |
| `site/painel/` | Painel da equipe: fila de aprovação, denúncias, pessoas, publicações oficiais e registro |
| `site/admin/` | Painel antigo de conteúdo editorial (alertas, checagens, boletim) via GitHub |
| `site/data/*.json` | Conteúdo do portal (editado pelo robô e pela equipe) |
| `banco/schema.sql` | Estrutura do banco MySQL |
| `banco/config.exemplo.php` | Modelo da configuração do servidor (senhas). O arquivo real **nunca** vai para o GitHub |
| `robo/` | Coleta de dados e validador |
| `.claude/skills/` | Tarefas que o Claude segue (boletim, alerta, checagem, revisão) |
| `.github/workflows/` | Robô diário, testes e publicação na Hostinger |
| `testes/` | Testes automáticos da API (16 cenários: login, filtro, upload, mapa, denúncias, permissões, LGPD…) |

---

## Passo a passo para colocar no ar

Faça na ordem. Cada etapa leva de 5 a 15 minutos.

### 1. Subir o código para o GitHub da Miracena

1. Instale o [GitHub Desktop](https://desktop.github.com) e entre com a conta **MiraTHC**.
2. **File > Add local repository** e escolha esta pasta (`mobiliza-pop-miracena`). Ele vai dizer que ainda não é um repositório: clique em **create a repository** e depois em **Create repository**.
3. Clique em **Publish repository**. Em *Organization/owner* deixe **MiraTHC**, nome `mobiliza-pop`, e marque **Keep this code private**. A publicação na Hostinger funciona com o repositório privado.
4. No site do GitHub, no repositório novo: **Settings > Actions > General > Workflow permissions**. Marque **Read and write permissions** e **Allow GitHub Actions to create and approve pull requests**, depois **Save**.

### 2. Preparar a Hostinger

No **hPanel**:

1. **Sites**: adicione o domínio do Mobiliza Pop e ative o **SSL** (cadeado). O site força HTTPS.
2. **Avançado > Configuração do PHP**:
   - Versão **8.2 ou mais nova**.
   - Extensões ligadas: `pdo_mysql`, `gd`, `intl`, `fileinfo`, `curl`, `exif`.
   - Em *Opções do PHP*: `upload_max_filesize = 110M`, `post_max_size = 120M`, `max_execution_time = 120`, `memory_limit = 256M`.
3. **Bancos de dados > Gerenciamento**: crie um banco MySQL e anote **nome, usuário e senha**.
4. Abra o **phpMyAdmin** desse banco, vá em **Importar** e envie o arquivo `banco/schema.sql`.
5. **Arquivos > Contas FTP**: anote **Host FTP**, **usuário** e **senha**. Se quiser, crie uma conta FTP só para o GitHub.

### 3. Login com Google

1. Entre em [console.cloud.google.com](https://console.cloud.google.com) com a conta da Miracena e crie um projeto chamado "Mobiliza Pop".
2. **APIs e serviços > Tela de permissão OAuth**:
   - Tipo **Externo**, nome "Mobiliza Pop" e e-mail de suporte.
   - Domínio autorizado: o seu domínio.
   - Política de privacidade: `https://SEU-DOMINIO/#privacidade`. Termos: `https://SEU-DOMINIO/#termos`.
   - Escopos: só os padrões (`email`, `profile`, `openid`). Publique o app.
3. **Credenciais > Criar credenciais > ID do cliente OAuth > Aplicativo da Web**.
   - Em **Origens JavaScript autorizadas** coloque `https://SEU-DOMINIO` e `https://www.SEU-DOMINIO`.
   - Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`). Não precisa de "chave secreta".

### 4. Arquivo de configuração no servidor

1. Copie `banco/config.exemplo.php` com o nome `mobiliza-config.php` e preencha: dados do banco (passo 2.3), `google_client_id` (passo 3.3) e os e-mails de quem vai ser **admin**.
2. No **Gerenciador de Arquivos** da Hostinger, envie esse arquivo para a pasta **acima** de `public_html` (normalmente `domains/SEU-DOMINIO/`). Assim ninguém consegue baixá-lo.

### 5. Segredos no GitHub

No repositório: **Settings > Secrets and variables > Actions > New repository secret**:

| Nome | Valor |
|---|---|
| `FTP_SERVIDOR` | Host FTP da Hostinger |
| `FTP_USUARIO` | Usuário FTP |
| `FTP_SENHA` | Senha FTP |
| `CLAUDE_CODE_OAUTH_TOKEN` | Chave da sua assinatura Claude (abaixo) |

Na aba **Variables**, crie `FTP_PASTA` só se a pasta do site no FTP não for `public_html/` (confira no Gerenciador de Arquivos).

**Como gerar a chave do Claude (assinatura Pro, sem custo extra):**
1. Instale o Claude Code no seu computador (instruções em [code.claude.com/docs](https://code.claude.com/docs)).
2. No PowerShell, rode `claude setup-token`, autorize no navegador com a sua conta Pro e copie a chave que aparece (começa com `sk-ant-oat01-`).
3. Cole no segredo `CLAUDE_CODE_OAUTH_TOKEN`. **Essa chave é uma senha.** Se vazar, gere outra e apague a antiga.

O uso do robô sai do limite da sua assinatura (duas rodadas por dia). Use essa chave **só** para o robô que escreve rascunhos para a equipe revisar. Se um dia o site tiver uma função de IA aberta ao público, como um chat para visitantes, isso precisa de uma chave da API da Anthropic, paga por uso, e não da assinatura pessoal.

O Gemini fica como reserva: se o segredo do Claude não existir e o `GEMINI_API_KEY` existir, o robô usa o Gemini.

### 6. Primeira publicação

1. No GitHub: **Actions > Publicar na Hostinger > Run workflow**. Em uns 3 minutos o site está no ar.
2. Abra o site, clique em **Entrar** e entre com um e-mail da lista `admins`. Ele vira administrador automaticamente.
3. Abra `https://SEU-DOMINIO/painel/`.
4. **Actions > Robô diário > Run workflow** para testar o Claude. Em até 20 minutos aparece o pull request "Rascunhos do robô".

### 7. Limpeza automática (cron)

Em **hPanel > Avançado > Cron Jobs**, crie uma tarefa diária (por exemplo às 4h) com o comando:

```
php /home/SEU-USUARIO/domains/SEU-DOMINIO/public_html/api/index.php limpeza
```

Ela apaga os registros de acesso com mais de 6 meses (prazo do Marco Civil) e os stories vencidos. Também dá para rodar pelo botão "Rodar limpeza agora" no painel.

---

## Como a rede funciona

**Moderação híbrida**
- Texto aparece na hora, depois de passar pelo filtro automático.
- O filtro **bloqueia** ameaças e incitação à violência, pedidos de golpe ou intervenção militar, induzimento ao suicídio e conteúdo sexual envolvendo menores.
- Vão para a **fila** da moderação: ofensas, xingamentos, exposição de dados (CPF, telefone, endereço de alguém), correntes e links de contas novas.
- Fotos, vídeos, stories, reels e eventos de contas **membro** esperam aprovação. Contas **confiáveis** publicam direto.
- Três denúncias de pessoas diferentes tiram um post do ar até a equipe olhar. Denúncia grave feita por conta confiável tira na hora.
- As listas do filtro ficam em `site/api/lib/moderacao.php` e devem ser ajustadas com o tempo.

**Papéis**: membro → confiável → moderador → admin. Admin muda papéis, bane e publica como "Mobiliza Pop". Publicação oficial exige link da fonte.

**Idade (ECA Digital, Lei 15.211/2025)**: a autodeclaração não basta. A pessoa informa a data de nascimento ao entrar, e só publica depois que a equipe **confirma a idade** no painel. O ideal é confirmar por uma conversa rápida por e-mail ou vídeo, **sem guardar cópia de documento**. Para desligar essa etapa, mude `exigir_verificacao_idade` na configuração, mas só depois de falar com um advogado.

**Proteção de quem participa**
- A ferramenta **Borrar rostos** pixela o rosto de quem não autorizou aparecer, ainda no celular, antes do envio.
- O servidor apaga o GPS e os outros metadados das fotos.
- A pessoa pode usar apelido e um nome diferente do nome civil.
- Eventos só podem ser marcados em locais públicos.

**Mapa**
- Feito com MapLibre e OpenFreeMap (gratuitos, sem chave). As divisas dos estados vêm do IBGE.
- Mostra eventos (vermelho) e registros com foto ou vídeo (amarelo), agrupados por área.
- Tem filtro de período e busca por estado, cidade, bairro ou endereço.
- Tem o botão "Perto de mim", modo 3D (incline com o botão direito ou dois dedos) e tela cheia.

**Para espalhar**: todo post e todo evento têm o botão "Pro zap", e os eventos têm "Pôr na agenda" (arquivo de calendário).

## Segurança aplicada

- Login só pelo Google, com o token conferido no servidor. Não guardamos senha.
- Sessão em cookie `HttpOnly`, `Secure` e `SameSite`, com token anti-CSRF em todo envio e conferência de origem.
- Todas as consultas ao banco usam parâmetros, o que impede injeção de SQL. Todo texto é escapado na tela, o que impede XSS.
- Cabeçalhos de segurança: CSP, HSTS, `X-Frame-Options`, `nosniff`, `Permissions-Policy`.
- Uploads:
  - O tipo real do arquivo é conferido, não só a extensão.
  - Fotos são redesenhadas pelo servidor.
  - Os arquivos recebem nomes aleatórios.
  - A pasta `uploads` não executa código.
- Limites de envio por pessoa e por IP: posts, comentários, eventos, denúncias e login.
- Configuração com senhas fora da pasta pública e fora do GitHub.
- Registro de acesso (Marco Civil, art. 15) e registro de toda ação da moderação.
- LGPD:
  - Consentimento específico para dado sensível (opinião política).
  - Botões para baixar os próprios dados e apagar a conta.
  - Sem cookies de rastreamento.

## Rotina da equipe

1. **Painel** (`/painel/`): esvazie a fila e as denúncias pelo menos 2 vezes por dia. Priorize as denúncias marcadas em vermelho (menores, violência, democracia).
2. **Robô**: duas vezes por dia chega o pull request "Rascunhos do robô". Leia em *Files changed*, corrija se precisar e clique em **Merge**. O site atualiza sozinho.
3. **Publicações oficiais**: aba **Publicações** do painel. Sempre com fonte.

## Antes de lançar para o público

- [ ] **Revisão jurídica** dos Termos, da Privacidade e das Regras (páginas `#termos`, `#privacidade`, `#regras` no `site/index.html`). Preencher `[RAZÃO SOCIAL / CNPJ]` e indicar a pessoa encarregada de dados (LGPD).
- [ ] Definir com o advogado o processo de **verificação de idade** e o prazo de resposta às **notificações de conteúdo ilícito** (decisão do STF de 2025 sobre o art. 19 do Marco Civil).
- [ ] Preencher `canal_whatsapp` e `email_contato` em `site/data/config.json`. Esse e-mail recebe denúncias e pedidos LGPD.
- [ ] Aprovar o manifesto e trocar `manifesto_aprovado` para `true`.
- [ ] Ligar os **backups** automáticos da Hostinger, incluindo o banco.
- [ ] Testar com 5 a 10 pessoas de confiança antes de divulgar.

## Testar no computador (opcional)

Precisa do [Node.js 22+](https://nodejs.org) e, para a rede, do [PHP 8.2+](https://windows.php.net/download) com `pdo_sqlite`, `gd`, `intl`, `fileinfo` e `curl` ligados no `php.ini`.

```bash
npm run site         # só o portal, em http://localhost:8080
npm run rede-local   # portal + rede com banco de demonstração; use "Entrar como teste" (admin@local vira admin)
npm run testar       # testes do robô e da API
npm run validar      # confere o conteúdo do portal
```

No computador, o mapa e o login do Google precisam de internet. O login de teste só funciona com `permitir_login_teste`, que fica **desligado** em produção.
