<?php
 // (Step 1) Run this to download the Maxmind databases
 $tempDir = './tmp';
 // Get your own API License Key from Maxmind
 $maxmind_key = '0000000000000000';
 header('Content-Type: text/plain');
 ini_set('memory_limit', '128M');
 set_time_limit(3 * 60);
 ob_start();
 $time_start = microtime(true);
 if (file_exists($tempDir.'/csv.zip'))
  unlink($tempDir.'/csv.zip');
 if (file_exists($tempDir.'/GeoLite2-City-Blocks-IPv4.csv'))
  unlink($tempDir.'/GeoLite2-City-Blocks-IPv4.csv');
 if (file_exists($tempDir.'/GeoLite2-City-Blocks-IPv6.csv'))
  unlink($tempDir.'/GeoLite2-City-Blocks-IPv6.csv');
 if (file_exists($tempDir.'/GeoLite2-City-Locations-en.csv'))
  unlink($tempDir.'/GeoLite2-City-Locations-en.csv');
 echo("Downloading GeoIP DataBase... "); ob_flush(); flush();
 $gh = fopen('https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City-CSV&license_key='.$maxmind_key.'&suffix=zip', 'r');
 file_put_contents($tempDir.'/csv.zip', $gh);
 fclose($gh);
 echo("Complete!\n"); ob_flush(); flush();
 $z = new ZipArchive;
 if ($z->open($tempDir.'/csv.zip') !== true)
  exit('Failed to open CSV ZIP');
 for ($i=0; $i < $z->numFiles; $i++)
 {
  $zippedName = $z->getNameIndex($i);
  $zippedDir = substr($zippedName, 0, strrpos($zippedName, '/'));
  if (strpos($zippedName, 'GeoLite2-City-Blocks-IPv4.csv') !== false)
  {
   echo("Extracting IPv4 List... "); ob_flush(); flush();
   $z->extractTo($tempDir.'/', $zippedName);
   rename($tempDir.'/'.$zippedName, $tempDir.'/GeoLite2-City-Blocks-IPv4.csv');
   rmdir($tempDir.'/'.$zippedDir);
   echo("Complete!\n"); ob_flush(); flush();
  }
  elseif (strpos($zippedName, 'GeoLite2-City-Blocks-IPv6.csv') !== false)
  {
   echo("Extracting IPv6 List... "); ob_flush(); flush();
   $z->extractTo($tempDir.'/', $zippedName);
   rename($tempDir.'/'.$zippedName, $tempDir.'/GeoLite2-City-Blocks-IPv6.csv');
   rmdir($tempDir.'/'.$zippedDir);
   echo("Complete!\n"); ob_flush(); flush();
  }
  elseif (strpos($zippedName, 'GeoLite2-City-Locations-en.csv') !== false)
  {
   echo("Extracting Location List... "); ob_flush(); flush();
   $z->extractTo($tempDir.'/',$zippedName);
   rename($tempDir.'/'.$zippedName, $tempDir.'/GeoLite2-City-Locations-en.csv');
   rmdir($tempDir.'/'.$zippedDir);
   echo("Complete!\n"); ob_flush(); flush();
  }
  if (!file_exists($tempDir.'/csv.zip'))
   break;
 }
 $z->close();
 unlink($tempDir.'/csv.zip');
 $time_end = microtime(true);
 echo("Completed in ".($time_end - $time_start)." seconds");
 ob_end_flush(); 
?>