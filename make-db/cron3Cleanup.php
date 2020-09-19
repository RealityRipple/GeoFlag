<?php
 // (Step 3) Run this after you're done with the Maxmind databases
 $tempDir = './tmp';

 if (file_exists($tempDir.'/csv.zip'))
  unlink($tempDir.'/csv.zip');
 if (file_exists($tempDir.'/GeoLite2-City-Blocks-IPv4.csv'))
  unlink($tempDir.'/GeoLite2-City-Blocks-IPv4.csv');
 if (file_exists($tempDir.'/GeoLite2-City-Blocks-IPv6.csv'))
  unlink($tempDir.'/GeoLite2-City-Blocks-IPv6.csv');
 if (file_exists($tempDir.'/GeoLite2-City-Locations-en.csv'))
  unlink($tempDir.'/GeoLite2-City-Locations-en.csv');
?>