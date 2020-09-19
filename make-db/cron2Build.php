<?php
 // (Step 2) Run this to build the GeoFlag databases from the Maxmind databases
 $tempDir = './tmp';
 header('Content-Type: text/plain');
 require_once('./siggen.php.inc');
 set_time_limit(5 * 60);

 function ip2long_v6($ip)
 {
  $ip_n = inet_pton($ip);
  $bin = '';
  for ($bit = strlen($ip_n) - 1; $bit >= 0; $bit--)
  {
   $bin = sprintf('%08b', ord($ip_n[$bit])) . $bin;
  }
  $dec = '0';
  for ($i = 0; $i < strlen($bin); $i++)
  {
   $dec = bcmul($dec, '2', 0);
   $dec = bcadd($dec, $bin[$i], 0);
  }
  return $dec;
 }

 function ip2bytes_v4($ip)
 {
  $ip_s = explode('.', $ip);
  $dec = '';
  for ($i = 0; $i < 4; $i++)
  {
   if ($i + 1 > count($ip_s))
    $dec.= chr(0);
   else
    $dec.= chr($ip_s[$i]);
  }
  return $dec;
 }

 function ip2bytes_v6($ip)
 {
  $ip_s = explode(':', $ip);
  $dec = '';
  for ($i = 0; $i < 8; $i++)
  {
   $l = '00';
   $r = '00';
   if ($i + 1 <= count($ip_s))
   {
    switch (strlen($ip_s[$i]))
    {
     case 0:
      $l = '00';
      $r = '00';
      break;
     case 1:
      $l = '00';
      $r = '0'.$ip_s[$i];
      break;
     case 2:
      $l = '00';
      $r = $ip_s[$i];
      break;
     case 3:
      $l = '0'.substr($ip_s[$i], 0, 1);
      $r = substr($ip_s[$i], 1, 2);
      break;
     case 4:
      $l = substr($ip_s[$i], 0, 2);
      $r = substr($ip_s[$i], 2, 2);
      break;
    }
   }
   $dec.= chr(hexdec($l)).chr(hexdec($r));
  }
  return $dec;
 }
 
 function gzdb($source)
 { 
  $dest = $source.'.gz';
  $mode = 'wb9';
  $fp_out = gzopen($dest, $mode);
  if ($fp_out === false)
   return false;
  $fp_in = fopen($source, 'rb');
  if ($fp_in === false)
  {
   gzclose($fp_out);
   return false;
  }
  while (!feof($fp_in))
  {
   gzwrite($fp_out, fread($fp_in, 1024 * 512));
  }
  fclose($fp_in);
  gzclose($fp_out);
  return $dest;
 }

 ob_start();
 $time_start = microtime(true);
 if (!file_exists($tempDir.'/GeoLite2-City-Locations-en.csv'))
 {
  echo "Unable to Access Locations CSV";
  return;
 }
 $isoList = array();
 echo("Parsing Locations List... "); ob_flush(); flush();
 $isos = fopen($tempDir.'/GeoLite2-City-Locations-en.csv', 'r');
 $topRow = fgetcsv($isos, 1024);
 while (!feof($isos))
 {
  $isoTmp = fgetcsv($isos, 1024);
  if ($isoTmp[4] != '')
   $isoList[$isoTmp[0]] = $isoTmp[4];
 }
 fclose($isos);
 echo("Complete!\n"); ob_flush(); flush();
 if (!file_exists($tempDir.'/GeoLite2-City-Blocks-IPv4.csv'))
 {
  echo "Unable to Access IPv4 CSV";
  return;
 }
 $ips = fopen($tempDir.'/GeoLite2-City-Blocks-IPv4.csv', 'r');
 $topRow = fgetcsv($ips, 1024);
 $db = fopen('./ipv4.db', 'wb');
 $lastLow  = '';
 $lastHigh = '';
 $lastISO  = '';
 $lastASet = '0';
 echo("Reading IPv4 Data for File... "); ob_flush(); flush();
 while (!feof($ips))
 {
  if (!file_exists($tempDir.'/GeoLite2-City-Blocks-IPv4.csv'))
  {
   echo("IPv4 List File is Gone! "); ob_flush(); flush();
   break;
  }
  $ipTmp   = fgetcsv($ips, 1024);
  $ipRange = $ipTmp[0];
  $ipID    = $ipTmp[1];
  $ipProxy = $ipTmp[4];
  $ipSat   = $ipTmp[5];
  if (array_key_exists($ipID, $isoList))
   $ipISO  = $isoList[$ipID];
  else
  {
   if ($ipProxy === '1')
    $ipISO = 'A1';
   else if ($ipSat === '1')
    $ipISO = 'A2';
   else
    continue;
  }
  list($subnet, $cidrMask) = explode("/", $ipRange, 2);
  $ipLow  = long2ip(ip2long($subnet) & (-1 << (32 - (int)$cidrMask)));
  $ipHigh = long2ip(ip2long($subnet) + pow(2, (32 - (int)$cidrMask)) - 1);
  if (substr($ipHigh, 0, strpos($ipHigh, '.')) != $lastASet)
  {
   $lastASet = substr($ipHigh, 0, strpos($ipHigh, '.'));
   echo("$lastASet/223, "); ob_flush(); flush();
  }
  if ($lastISO == '')
  {
   $lastLow  = $ipLow;
   $lastHigh = $ipHigh;
   $lastISO   = $ipISO;
   continue;
  }
  if ($ipISO != $lastISO)
  {
   $insertStr = ip2bytes_v4($lastLow).ip2bytes_v4($lastHigh).$lastISO;
   fwrite($db, $insertStr);
   $lastLow  = $ipLow;
   $lastHigh = $ipHigh;
   $lastISO   = $ipISO;
   continue;
  }
  if (($lastHigh != '') && (ip2long($lastHigh) == (ip2long($ipLow) - 1)))
  {
   $lastHigh = $ipHigh;
   continue;
  }
  $insertStr = ip2bytes_v4($lastLow).ip2bytes_v4($lastHigh).$lastISO;
  fwrite($db, $insertStr);
  $lastLow  = $ipLow;
  $lastHigh = $ipHigh;
  $lastISO   = $ipISO;
 }
 $insertStr = ip2bytes_v4($lastLow).ip2bytes_v4($lastHigh).$lastISO;
 fwrite($db, $insertStr);
 fclose($db);
 fclose($ips);
 echo("Compressing... "); ob_flush(); flush();
 gzdb('./ipv4.db');
 echo("Complete!\n"); ob_flush(); flush();
 if (!file_exists($tempDir.'/GeoLite2-City-Blocks-IPv6.csv'))
 {
  echo "Unable to Access IPv6 CSV";
  return;
 }
 $ips = fopen($tempDir.'/GeoLite2-City-Blocks-IPv6.csv', 'r');
 $topRow = fgetcsv($ips, 1024);
 $db = fopen('./ipv6.db', 'wb');
 $lastLow  = '';
 $lastHigh = '';
 $lastISO   = '';
 $lastASet = '0';
 echo("Reading IPv6 Data for File... "); ob_flush(); flush();
 while (!feof($ips))
 {
  if (!file_exists($tempDir.'/GeoLite2-City-Blocks-IPv6.csv'))
  {
   echo("IPv6 List File is Gone! "); ob_flush(); flush();
   break;
  }
  $ipTmp   = fgetcsv($ips, 1024);
  $ipRange = $ipTmp[0];
  $ipID    = $ipTmp[1];
  $ipProxy = $ipTmp[4];
  $ipSat   = $ipTmp[5];
  if (array_key_exists($ipID, $isoList))
   $ipISO  = $isoList[$ipID];
  else
  {
   if ($ipProxy === '1')
    $ipISO = 'A1';
   else if ($ipSat === '1')
    $ipISO = 'A2';
   else
    continue;
  }
  if (!preg_match('~^([0-9a-f:]+)[[:punct:]]([0-9]+)$~i', trim($ipRange), $v_Slices))
   continue;
  if (!filter_var($v_FirstAddress = $v_Slices[1], FILTER_VALIDATE_IP, FILTER_FLAG_IPV6))
   continue;
  $v_PrefixLength = intval($v_Slices[2]);
  if ($v_PrefixLength > 128)
   continue;
  $v_SuffixLength = 128 - $v_PrefixLength;
  $v_FirstAddressBin = inet_pton($v_FirstAddress);
  $v_FirstAddressHex = inet_ntop($v_FirstAddressBin);
  $v_NetworkMaskHex = str_repeat('1', $v_PrefixLength).str_repeat('0', $v_SuffixLength);
  $v_NetworkMaskHex_parts = str_split($v_NetworkMaskHex, 8);
  foreach($v_NetworkMaskHex_parts as &$v_NetworkMaskHex_part)
  {
   $v_NetworkMaskHex_part = base_convert($v_NetworkMaskHex_part, 2, 16);
   $v_NetworkMaskHex_part = str_pad($v_NetworkMaskHex_part, 2, '0', STR_PAD_LEFT);
  }
  $v_NetworkMaskHex = implode(null, $v_NetworkMaskHex_parts);
  unset($v_NetworkMaskHex_part, $v_NetworkMaskHex_parts);
  $v_NetworkMaskBin = inet_pton(implode(':', str_split($v_NetworkMaskHex, 4)));
  $v_FirstAddressBin &= $v_NetworkMaskBin;
  $v_FirstAddressHex = inet_ntop($v_FirstAddressBin);
  $v_LastAddressBin = $v_FirstAddressBin | ~$v_NetworkMaskBin;
  $v_LastAddressHex =  inet_ntop($v_LastAddressBin);
  $ipLow  = $v_FirstAddressHex;
  $ipHigh = $v_LastAddressHex;

  if (substr($ipHigh, 0, strpos($ipHigh, ':')) != $lastASet)
  {
   $lastASet = substr($ipHigh, 0, strpos($ipHigh, ':'));
   echo("$lastASet/2c0f, "); ob_flush(); flush();
  }
  if ($lastISO == '')
  {
   $lastLow  = $ipLow;
   $lastHigh = $ipHigh;
   $lastISO  = $ipISO;
   continue;
  }
  if ($ipISO != $lastISO)
  {
   $insertStr = ip2bytes_v6($lastLow).ip2bytes_v6($lastHigh).$lastISO;
   fwrite($db, $insertStr);
   $lastLow  = $ipLow;
   $lastHigh = $ipHigh;
   $lastISO  = $ipISO;
   continue;
  }
  if (($lastHigh != '') && (ip2long_v6($lastHigh) == bcsub(ip2long_v6($ipLow), 1)))
  {
   $lastHigh = $ipHigh;
   continue;
  }
  $insertStr = ip2bytes_v6($lastLow).ip2bytes_v6($lastHigh).$lastISO;
  fwrite($db, $insertStr);
  $lastLow  = $ipLow;
  $lastHigh = $ipHigh;
  $lastISO  = $ipISO;
 }
 $insertStr = ip2bytes_v6($lastLow).ip2bytes_v6($lastHigh).$lastISO;
 fwrite($db, $insertStr);
 fclose($db);
 fclose($ips);
 echo("Compressing... "); ob_flush(); flush();
 gzdb('./ipv6.db');
 echo("Complete!\n"); ob_flush(); flush();
 echo("Signing Databases... "); ob_flush(); flush();
 saveSignatures();
 echo("Complete!\n"); ob_flush(); flush();
 $time_end = microtime(true);
 echo("Completed in ".($time_end - $time_start)." seconds");
 ob_end_flush();
?>