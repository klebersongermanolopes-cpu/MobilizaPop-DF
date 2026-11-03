-- Mobiliza Pop: banco da rede social (MySQL 8 / MariaDB 10.6+, como o da Hostinger)
-- Como usar: hPanel > Bancos de dados > phpMyAdmin > escolha o banco > Importar > este arquivo.
-- Pode ser importado de novo sem apagar dados (usa CREATE TABLE IF NOT EXISTS).

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS usuarios (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  google_sub       VARCHAR(64)  NOT NULL UNIQUE,
  email            VARCHAR(190) NOT NULL,
  nome             VARCHAR(80)  NOT NULL,
  apelido          VARCHAR(30)  NOT NULL UNIQUE,
  foto_url         VARCHAR(500) NULL,
  bio              VARCHAR(300) NULL,
  uf               CHAR(2)      NULL,
  cidade           VARCHAR(80)  NULL,
  papel            VARCHAR(12)  NOT NULL DEFAULT 'membro',   -- membro | confiavel | moderador | admin
  status           VARCHAR(10)  NOT NULL DEFAULT 'ativo',    -- ativo | suspenso | banido | apagado
  nascimento       DATE         NULL,                        -- autodeclarado (primeira camada da aferição de idade)
  idade_verificada TINYINT(1)   NOT NULL DEFAULT 0,          -- marcada pela moderação (segunda camada)
  aceitou_regras_em DATETIME    NULL,
  criado_em        DATETIME     NOT NULL,
  ultimo_acesso    DATETIME     NULL,
  INDEX (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS eventos (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id   INT UNSIGNED NOT NULL,
  titulo       VARCHAR(120) NOT NULL,
  descricao    TEXT         NULL,
  inicio       DATETIME     NOT NULL,
  fim          DATETIME     NULL,
  local_nome   VARCHAR(120) NULL,
  lat          DECIMAL(9,6) NOT NULL,
  lng          DECIMAL(9,6) NOT NULL,
  uf           CHAR(2)      NULL,
  cidade       VARCHAR(80)  NULL,
  bairro       VARCHAR(80)  NULL,
  link         VARCHAR(500) NULL,
  status       VARCHAR(10)  NOT NULL DEFAULT 'pendente',  -- publicado | pendente | rejeitado | removido
  motivo       VARCHAR(300) NULL,
  presencas    INT UNSIGNED NOT NULL DEFAULT 0,
  criado_em    DATETIME     NOT NULL,
  INDEX (status, inicio),
  INDEX (lat, lng),
  INDEX (uf, cidade),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS posts (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id   INT UNSIGNED NOT NULL,
  tipo         VARCHAR(10)  NOT NULL,                     -- texto | foto | video | story | reel
  oficial      TINYINT(1)   NOT NULL DEFAULT 0,           -- publicação da equipe Mobiliza Pop
  titulo       VARCHAR(140) NULL,                         -- só em publicações oficiais
  texto        TEXT         NULL,
  fonte_url    VARCHAR(500) NULL,                         -- obrigatória em publicação oficial
  evento_id    INT UNSIGNED NULL,
  lat          DECIMAL(9,6) NULL,
  lng          DECIMAL(9,6) NULL,
  uf           CHAR(2)      NULL,
  cidade       VARCHAR(80)  NULL,
  bairro       VARCHAR(80)  NULL,
  status       VARCHAR(10)  NOT NULL DEFAULT 'pendente',
  motivo       VARCHAR(300) NULL,
  apoios       INT UNSIGNED NOT NULL DEFAULT 0,
  comentarios  INT UNSIGNED NOT NULL DEFAULT 0,
  denuncias    INT UNSIGNED NOT NULL DEFAULT 0,
  expira_em    DATETIME     NULL,                         -- stories somem em 24h
  criado_em    DATETIME     NOT NULL,
  editado_em   DATETIME     NULL,
  INDEX (status, criado_em),
  INDEX (tipo, status, criado_em),
  INDEX (evento_id),
  INDEX (uf, cidade),
  INDEX (usuario_id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS midias (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  post_id     INT UNSIGNED NULL,
  usuario_id  INT UNSIGNED NOT NULL,
  tipo        VARCHAR(6)   NOT NULL,                      -- imagem | video
  arquivo     VARCHAR(200) NOT NULL,                      -- caminho relativo dentro de /uploads
  mime        VARCHAR(40)  NOT NULL,
  bytes       INT UNSIGNED NOT NULL,
  largura     INT UNSIGNED NULL,
  altura      INT UNSIGNED NULL,
  ordem       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  criado_em   DATETIME     NOT NULL,
  INDEX (post_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comentarios (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  post_id     INT UNSIGNED NOT NULL,
  usuario_id  INT UNSIGNED NOT NULL,
  texto       VARCHAR(1000) NOT NULL,
  status      VARCHAR(10)  NOT NULL DEFAULT 'publicado',
  criado_em   DATETIME     NOT NULL,
  INDEX (post_id, status),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS apoios (
  post_id     INT UNSIGNED NOT NULL,
  usuario_id  INT UNSIGNED NOT NULL,
  criado_em   DATETIME     NOT NULL,
  PRIMARY KEY (post_id, usuario_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS presencas (
  evento_id   INT UNSIGNED NOT NULL,
  usuario_id  INT UNSIGNED NOT NULL,
  criado_em   DATETIME     NOT NULL,
  PRIMARY KEY (evento_id, usuario_id),
  FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS denuncias (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  alvo_tipo    VARCHAR(12)  NOT NULL,                     -- post | comentario | evento | usuario
  alvo_id      INT UNSIGNED NOT NULL,
  usuario_id   INT UNSIGNED NULL,                         -- quem denunciou (NULL = notificação externa)
  contato      VARCHAR(190) NULL,                         -- e-mail de quem notificou sem conta
  motivo       VARCHAR(20)  NOT NULL,
  detalhe      VARCHAR(1000) NULL,
  status       VARCHAR(12)  NOT NULL DEFAULT 'aberta',    -- aberta | procedente | improcedente
  resolvido_por INT UNSIGNED NULL,
  resolvido_em DATETIME     NULL,
  criado_em    DATETIME     NOT NULL,
  INDEX (status, criado_em),
  INDEX (alvo_tipo, alvo_id),
  UNIQUE KEY uma_por_pessoa (alvo_tipo, alvo_id, usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Registro de acesso exigido pelo Marco Civil da Internet (art. 15): guardar por 6 meses.
CREATE TABLE IF NOT EXISTS log_acesso (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT UNSIGNED NULL,
  ip          VARCHAR(45)  NOT NULL,
  porta       INT UNSIGNED NULL,
  acao        VARCHAR(30)  NOT NULL,
  criado_em   DATETIME     NOT NULL,
  INDEX (criado_em),
  INDEX (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tudo o que a moderação faz fica registrado (transparência e defesa jurídica).
CREATE TABLE IF NOT EXISTS log_moderacao (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  moderador_id  INT UNSIGNED NULL,                        -- NULL = filtro automático
  acao          VARCHAR(30)  NOT NULL,
  alvo_tipo     VARCHAR(12)  NOT NULL,
  alvo_id       INT UNSIGNED NOT NULL,
  motivo        VARCHAR(300) NULL,
  criado_em     DATETIME     NOT NULL,
  INDEX (criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Limite de envios por pessoa/IP (contra spam e robôs).
CREATE TABLE IF NOT EXISTS limites (
  chave       VARCHAR(120) NOT NULL PRIMARY KEY,
  contagem    INT UNSIGNED NOT NULL,
  expira_em   INT UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
