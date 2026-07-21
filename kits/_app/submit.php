<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(array("ok"=>false,"err"=>"method")); exit; }
$raw = file_get_contents('php://input');
$d = json_decode($raw, true); if (!is_array($d)) { $d = $_POST; }
function g($d,$k){ return isset($d[$k]) ? trim($d[$k]) : ''; }
$name=substr(g($d,'name'),0,120); $email=substr(g($d,'email'),0,160);
$company=substr(g($d,'company'),0,160); $client=substr(g($d,'client'),0,160);
$kit=substr(g($d,'kit'),0,20000);
if ($email==='' || strpos($email,'@')===false || $kit==='') { http_response_code(422); echo json_encode(array("ok"=>false,"err"=>"missing")); exit; }
$to='steven@justdealspromotions.com';
$subject='Kit request — '.($company!=='' ? $company : ($client!=='' ? $client : 'Team Store')).($name!=='' ? ' — '.$name : '');
$body ="New kit request from the ".($client!=='' ? $client : '')." team store\n\n";
$body.="Name: $name\nEmail: $email\nCompany/team: $company\n\n".$kit."\n";
$re=preg_replace('/[\r\n]+/',' ',$email);
$headers ="From: JDP Team Store <noreply@justdealspromotions.com>\r\n";
$headers.="Reply-To: ".($re!=='' ? $re : 'noreply@justdealspromotions.com')."\r\n";
$headers.="Content-Type: text/plain; charset=UTF-8\r\n";
$ok=@mail($to,$subject,$body,$headers);
if(!$ok){ http_response_code(500); echo json_encode(array("ok"=>false,"err"=>"mail")); exit; }
echo json_encode(array("ok"=>true));
