<?php
$config['product_name'] = 'Tradersho Webmail';
$config['support_url'] = 'https://my.tradersho.com';
$config['force_https'] = true;
$config['use_https'] = true;
$config['session_secure'] = true;
$config['session_samesite'] = 'Lax';
$config['enable_installer'] = false;
$config['display_product_info'] = 1;
$config['login_rate_limit'] = 3;
$config['identities_level'] = 3;
$config['smtp_user'] = '%u';
$config['smtp_pass'] = '%p';
$config['imap_conn_options'] = ['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'allow_self_signed' => false]];
$config['smtp_conn_options'] = ['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'allow_self_signed' => false]];
$config['des_key'] = trim(file_get_contents('/var/roundcube/config/session.key'));
