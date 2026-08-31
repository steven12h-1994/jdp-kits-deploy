<?php
/*
 * TEMPORARY capability probe for the live-board backend.
 *
 * Boards currently live in localStorage, which is per-browser by definition -- that is why the same
 * kit shows different boards in a normal window and a private window, and why a share link has to
 * carry every product. Making a board a LIVE document needs server-side storage.
 *
 * Before designing that, three things have to be established, and guessing any of them would be
 * reckless with customer data:
 *   1. Does PHP actually execute in the mirrored kits/ path?
 *   2. Which directory can PHP write to?
 *   3. Is that directory OUTSIDE the GitHub -> SiteGround mirror? If board JSON lives inside the
 *      mirrored tree, the next sync could delete every customer's board.
 *
 * Reports capability only: no site content, no credentials, no database access. Token-gated so it is
 * not publicly discoverable, and to be deleted the moment the backend design is settled.
 */

$TOKEN = 'jdp-probe-4a91c7';
header('Content-Type: application/json');
header('Cache-Control: no-store');

if (!isset($_GET['t']) || !hash_equals($TOKEN, (string)$_GET['t'])) {
    http_response_code(404);
    echo json_encode(['error' => 'not found']);
    exit;
}

function try_write($dir) {
    $out = ['dir' => $dir, 'exists' => is_dir($dir), 'writable' => false, 'created' => false];
    if (!$out['exists']) {
        $out['mkdir'] = @mkdir($dir, 0775, true);
        $out['exists'] = is_dir($dir);
    }
    if ($out['exists']) {
        $out['writable'] = is_writable($dir);
        $f = rtrim($dir, '/') . '/.probe-' . bin2hex(random_bytes(4)) . '.json';
        if (@file_put_contents($f, json_encode(['ok' => true, 'at' => time()])) !== false) {
            $out['created'] = true;
            $out['readback'] = (@file_get_contents($f) !== false);
            @unlink($f);
        }
    }
    return $out;
}

$here = __DIR__;                       // .../public_html/kits/_api
$kits = dirname($here);                // .../public_html/kits      (INSIDE the mirror)
$docroot = dirname($kits);             // .../public_html           (outside kits/)
$above = dirname($docroot);            // one level above the docroot -- safest for data

$candidates = [
    'inside_mirror_kits' => $kits . '/_data',
    'docroot_sibling'    => $docroot . '/jdp-board-data',
    'above_docroot'      => $above . '/jdp-board-data',
];

$res = [];
foreach ($candidates as $label => $dir) {
    $res[$label] = try_write($dir);
}

echo json_encode([
    'php'            => PHP_VERSION,
    'php_executes'   => true,
    'json_ok'        => function_exists('json_encode'),
    'flock_ok'       => function_exists('flock'),
    'script_dir'     => $here,
    'docroot_guess'  => $docroot,
    'candidates'     => $res,
    'server_time'    => gmdate('c'),
    'build'          => 'r2-php-allowed-under-api',
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
