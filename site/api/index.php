<?php
// Mobiliza Pop: API da rede social. Todas as chamadas passam por aqui: /api/?r=nome-da-rota
declare(strict_types=1);
define('MP_API', true);

ini_set('display_errors', '0');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');

require __DIR__ . '/lib/base.php';
require __DIR__ . '/lib/moderacao.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/midia.php';
require __DIR__ . '/lib/rede.php';
require __DIR__ . '/lib/admin.php';

const ROTAS = [
    'GET eu'                  => 'r_eu',
    'POST entrar'             => 'r_entrar',
    'POST sair'               => 'r_sair',
    'POST perfil'             => 'r_perfil_salvar',
    'GET meus-dados'          => 'r_meus_dados',
    'POST apagar-conta'       => 'r_apagar_conta',
    'POST pedir-verificacao'  => 'r_pedir_verificacao',
    'GET usuario'             => 'r_usuario',
    'GET feed'                => 'r_feed',
    'GET stories'             => 'r_stories',
    'GET post'                => 'r_post',
    'POST post'               => 'r_post_criar',
    'POST post-editar'        => 'r_post_editar',
    'POST post-apagar'        => 'r_post_apagar',
    'POST apoiar'             => 'r_apoiar',
    'GET comentarios'         => 'r_comentarios',
    'POST comentar'           => 'r_comentar',
    'POST comentario-apagar'  => 'r_comentario_apagar',
    'GET mapa'                => 'r_mapa',
    'GET regioes'             => 'r_resumo_regioes',
    'GET evento'              => 'r_evento',
    'POST evento'             => 'r_evento_criar',
    'POST presenca'           => 'r_presenca',
    'POST denunciar'          => 'r_denunciar',
    'GET admin/resumo'        => 'r_admin_resumo',
    'GET admin/fila'          => 'r_admin_fila',
    'POST admin/moderar'      => 'r_admin_moderar',
    'GET admin/denuncias'     => 'r_admin_denuncias',
    'POST admin/denuncia'     => 'r_admin_denuncia_resolver',
    'GET admin/usuarios'      => 'r_admin_usuarios',
    'POST admin/usuario'      => 'r_admin_usuario',
    'GET admin/oficiais'      => 'r_admin_oficiais',
    'POST admin/oficial'      => 'r_admin_oficial_salvar',
    'POST admin/oficial-apagar' => 'r_admin_oficial_apagar',
    'GET admin/log'           => 'r_admin_log',
    'POST admin/limpeza'      => 'r_admin_limpeza',
];

function despachar(string $metodo, string $rota): void {
    $f = ROTAS["$metodo $rota"] ?? null;
    if (!$f) erro(404, 'Rota não encontrada.');
    iniciar_sessao();
    if ($metodo === 'POST') exigir_csrf();
    try {
        $f();
    } catch (RespostaEnviada $e) {
        throw $e;
    } catch (Throwable $e) {
        error_log('[mobiliza] ' . $rota . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
        erro(500, 'Algo deu errado do nosso lado. Tente de novo.');
    }
}

if (!defined('MP_TESTE')) {
    if (PHP_SAPI === 'cli') {                       // cron: php api/index.php limpeza
        if (($argv[1] ?? '') === 'limpeza') { iniciar_sessao(); r_admin_limpeza(); }
        exit;
    }
    $rota = preg_replace('#[^a-z/\-]#', '', (string) ($_GET['r'] ?? ''));
    despachar($_SERVER['REQUEST_METHOD'] === 'POST' ? 'POST' : 'GET', $rota);
}
