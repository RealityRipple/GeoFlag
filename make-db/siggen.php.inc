<?php
 require_once('./math.php.inc');
 require_once('./bigint.php.inc');

 require_once('./phpecc/classes/interface/CurveFpInterface.php');
 require_once('./phpecc/classes/interface/PointInterface.php');
 require_once('./phpecc/classes/interface/PrivateKeyInterface.php');
 require_once('./phpecc/classes/interface/PublicKeyInterface.php');
 require_once('./phpecc/classes/interface/SignatureInterface.php');

 require_once('./phpecc/classes/CurveFp.php');
 require_once('./phpecc/classes/NumberTheory.php');
 require_once('./phpecc/classes/Point.php');
 require_once('./phpecc/classes/PrivateKey.php');
 require_once('./phpecc/classes/PublicKey.php');
 require_once('./phpecc/classes/Signature.php');

 function saveSignatures()
 {
  if (USE_EXT == 'GMP')
  {
   $secp256r1   = new CurveFp(gmp_init('FFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF', 16), gmp_init(-3, 10), gmp_init('5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B', 16));
   $secp256r1_G = new Point($secp256r1,
     gmp_init('6B17D1F2E12C4247F8BCE6E563A440F277037D812DEB33A0F4A13945D898C296', 16),
     gmp_init('4FE342E2FE1A7F9B8EE7EB4A7C0F9E162BCE33576B315ECECBB6406837BF51F5', 16),
     gmp_init('FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551', 16));
  }
  else
  {
   $secp256r1   = new CurveFp('115792089210356248762697446949407573530086143415290314195533631308867097853951', '-3', '41058363725152142129326129780047268409114441015993725554835256314039467401291');
   $secp256r1_G = new Point($secp256r1,
     '48439561293906451759052585252797914202762949526041747995844080717082404635286',
     '36134250956749795798585127919587881956611106672985015071877198253568414405109',
     '115792089210356248762697446949407573529996955224135760342422259061068512044369');
  }

  // Replace these three values with an ECDSA Key.
  // The X and Y coordinates of your Public Key should be provided to users in the format
  //  "04XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY"
  $x = BigInt::bin2big(hex2bin('0000000000000000000000000000000000000000000000000000000000000000'));
  $y = BigInt::bin2big(hex2bin('0000000000000000000000000000000000000000000000000000000000000000'));
  // Keep D secret. Keep D safe.
  $d = BigInt::bin2big(hex2bin('0000000000000000000000000000000000000000000000000000000000000000'));

  $pub = new PublicKey($secp256r1_G, new Point($secp256r1, $x, $y));
  $pvk = new PrivateKey($pub, $d);

  $h4 = hash_file('sha256', './ipv4.db', true);
  $h6 = hash_file('sha256', './ipv6.db', true);

  $m4 = BigInt::bin2big($h4);
  $m6 = BigInt::bin2big($h6);

  $k4 = BigInt::bin2big(random_bytes(32));
  $k6 = BigInt::bin2big(random_bytes(32));

  $sig4 = $pvk->sign($m4, $k4);
  $r4 = bin2hex(BigInt::big2bin($sig4->getR()));
  $s4 = bin2hex(BigInt::big2bin($sig4->getS()));

  $sig6 = $pvk->sign($m6, $k6);
  $r6 = bin2hex(BigInt::big2bin($sig6->getR()));
  $s6 = bin2hex(BigInt::big2bin($sig6->getS()));

  $htData = file_get_contents('./.htaccess');

  if (strpos($htData, '<FilesMatch "ipv4\.db(\.gz)?$">') > -1)
   $htData = substr($htData, 0, strpos($htData, '<FilesMatch "ipv4\.db(\.gz)?$">'));

  $htData.= '<FilesMatch "ipv4\.db(\.gz)?$">'."\n";
  $htData.= '  Header set X-Signature-R "'.$r4.'"'."\n";
  $htData.= '  Header set X-Signature-S "'.$s4.'"'."\n";
  $htData.= '</FilesMatch>'."\n";
  $htData.= "\n";
  $htData.= '<FilesMatch "ipv6\.db(\.gz)?$">'."\n";
  $htData.= '  Header set X-Signature-R "'.$r6.'"'."\n";
  $htData.= '  Header set X-Signature-S "'.$s6.'"'."\n";
  $htData.= '</FilesMatch>'."\n";

  file_put_contents('./.htaccess', $htData);
 }
?>