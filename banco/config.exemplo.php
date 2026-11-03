<?php
// MODELO do arquivo de configuração da rede Mobiliza Pop.
//
// 1. Copie este arquivo com o nome  mobiliza-config.php
// 2. Na Hostinger, envie para a pasta ACIMA de public_html (Gerenciador de Arquivos:
//    domains/SEU-DOMINIO/mobiliza-config.php). Assim ninguém consegue baixá-lo pela internet.
// 3. Preencha os dados abaixo. NUNCA coloque este arquivo preenchido no GitHub.

return [
    // hPanel > Bancos de dados > Gerenciamento: crie o banco e anote nome, usuário e senha.
    'banco' => [
        'host'    => 'localhost',
        'porta'   => 3306,
        'nome'    => 'u000000000_mobiliza',
        'usuario' => 'u000000000_mobiliza',
        'senha'   => 'TROQUE-PELA-SENHA-DO-BANCO',
    ],

    // Google Cloud Console > APIs e serviços > Credenciais > ID do cliente OAuth (tipo "Aplicativo da Web").
    // Em "Origens JavaScript autorizadas" coloque https://SEU-DOMINIO (e https://www.SEU-DOMINIO).
    'google_client_id' => '000000000000-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com',

    // E-mails que viram administradores ao entrar pela primeira vez.
    'admins' => ['contato@miracena.com'],

    // ECA Digital (Lei 15.211/2025): autodeclaração de idade não basta. Com "true", a pessoa entra,
    // vê tudo, apoia e confirma presença, mas só publica depois que a moderação confirmar a idade.
    'exigir_verificacao_idade' => true,
    'idade_minima' => 18,

    // Tamanho máximo dos envios (confira também upload_max_filesize e post_max_size no
    // hPanel > Avançado > Configuração do PHP: coloque pelo menos 110M nos dois).
    'limite_imagem_mb' => 10,
    'limite_video_mb'  => 100,

    // Quantas pessoas diferentes precisam denunciar um post para ele sair do ar até a moderação olhar.
    'denuncias_para_ocultar' => 3,

    // Se o site ficar atrás do Cloudflare, liste aqui os IPs do proxy para o registro de acesso pegar o IP real.
    'proxies_confiaveis' => [],

    // Só para testes no computador. Em produção, deixe false.
    'permitir_login_teste' => false,
];
