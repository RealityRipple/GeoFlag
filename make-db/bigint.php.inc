<?php
 require_once('./math.php.inc');

 class BigInt
 {
  public static function cmp($left, $right)
  {
   if (USE_EXT == 'GMP')
    return gmp_cmp($left, $right);
   return bccomp($left, $right);
  }
  public static function add($left, $right)
  {
   if (USE_EXT == 'GMP')
    return gmp_add($left, $right);
   return bcadd($left, $right);
  }
  public static function sub($left, $right)
  {
   if (USE_EXT == 'GMP')
    return gmp_sub($left, $right);
   return bcsub($left, $right);
  }
  public static function mul($left, $right)
  {
   if (USE_EXT == 'GMP')
    return gmp_mul($left, $right);
   return bcmul($left, $right);
  }
  public static function div($left, $right)
  {
   if (USE_EXT == 'GMP')
    return gmp_div_q($left, $right);
   return bcdiv($left, $right);
  }
  public static function mod($left, $right)
  {
   if (USE_EXT == 'GMP')
    return gmp_mod($left, $right);
   return bcmod($left, $right);
  }
  public static function pow($base, $exp)
  {
   if (USE_EXT == 'GMP')
    return gmp_pow($base, $exp);
   return bcpow($base, $exp);
  }
  public static function neg($val)
  {
   if (USE_EXT == 'GMP')
    return gmp_neg($val);
   if ($val[0] === '-')
    return substr($val, 1);
   return '-'.$val;
  }
  public static function bc_floor($val)
  {
   if (strpos($val, '.') === 0)
    return $val;
   $val = substr($val, 0, strpos($val, '.'));
   if ($val[0] === '-')
    $val = bcadd($val, -1);
   return $val;
  }
  public static function div_qr($left, $right)
  {
   if (USE_EXT == 'GMP')
   {
    list($n, $d) = gmp_div_qr($left, $right);
    return array($n, gmp_intval($d));
   }
   $q = self::bc_floor(bcdiv($left, $right, 4));
   $r = bcsub($left, bcmul($q, $right));
   return array($q, $r);
  }
  public static function bigintval($val)
  {
   if (USE_EXT == 'GMP')
    return gmp_intval($val);
   return intval($val);
  }
  public static function bin2big($binStr)
  {
   if (USE_EXT == 'GMP')
    $v = gmp_init('0');
   else
    $v = '0';
   $neg = false;
   if (substr($binStr, 0, 4) == chr(0x80).chr(0).chr(0).chr(0))
   {
    $neg = true;
    $binStr = substr($binStr, 4);
   }
   for ($i = 0; $i < strlen($binStr); $i++)
   {
    $v = self::add(self::mul($v, 256), ord($binStr[$i]));
   }
   if ($neg)
    $v = self::neg($v);
   return $v;
  }
  public static function big2bin($v)
  {
   $binStr = '';
   $neg = false;
   if (self::cmp($v, 0) < 0)
   {
    $neg = true;
    $v = self::neg($v);
   }
   while (self::cmp($v, 0) > 0)
   {
    list($v, $r) = self::div_qr($v, 256);
    $binStr = chr(self::bigintval($r)) . $binStr;
   }
   if ($neg)
    $binStr = chr(0x80).str_repeat(chr(0), 3).$binStr;
   return $binStr;
  }
 }
?>