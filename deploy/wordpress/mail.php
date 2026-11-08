<?php
/** Organizational SMTP for the migrated WordPress installation. Secrets are server environment only. */
add_action('phpmailer_init', static function ($mailer) {
    $secretFile = '/run/secrets/wordpress-smtp.json';
    $smtp = is_readable($secretFile) ? json_decode(file_get_contents($secretFile), true) : [];
    $host = $smtp['SMTP_HOST'] ?? '';
    $user = $smtp['SMTP_USER'] ?? '';
    $password = $smtp['SMTP_PASSWORD'] ?? '';
    if (!$host || !$user || !$password) {
        return;
    }
    $mailer->isSMTP();
    $mailer->Host = $host;
    $mailer->Port = (int) ($smtp['SMTP_PORT'] ?: 587);
    $mailer->SMTPAuth = true;
    $mailer->Username = $user;
    $mailer->Password = $password;
    $mailer->SMTPSecure = 'tls';
    $mailer->SMTPAutoTLS = true;
    $mailer->SMTPOptions = ['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'allow_self_signed' => false]];
    $mailer->setFrom($user, wp_specialchars_decode(get_option('blogname'), ENT_QUOTES));
});
