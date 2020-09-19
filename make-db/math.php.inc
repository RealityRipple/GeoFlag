<?php
 if (extension_loaded('gmp'))
  define('USE_EXT', 'GMP');
 elseif (extension_loaded('bcmath') && !defined('USE_EXT'))
  define ('USE_EXT', 'BCMATH');
 else
  die('GMP or BC Math extensions required.');
 require_once('./phpecc/classes/util/bcmath_Utils.php');
 require_once('./phpecc/classes/util/gmp_Utils.php');
?>