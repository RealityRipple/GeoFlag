# Building an IP Database for GeoFlag

This directory contains simple PHP example code for downloading and converting the Maxmind GeoIP databases to a format that GeoFlag understands. Additionally, code to generate ECDSA signatures for the databases is included.  


The process is split into three tasks, in case you want to do other things with the Maxmind databases while you have them.  
1) `cron1Download.php` - Downloads the GeoLite2-City-CSV zip file from [maxmind.com](https://dev.maxmind.com/geoip/geoip2/geolite2/), and extracts the CSVs to a temp directory using PHP's [ZipArchive](https://www.php.net/manual/en/class.ziparchive.php) class. A free [License Key](https://www.maxmind.com/en/geolite2/signup) is required for this step.
2) `cron2Build.php` - Iterates through the IPv4 and IPv6 databases, organizing them into contiguous groups by country code. The new databases are saved and gz compressed.
   - Additionally calls `siggen.php.inc`'s `saveSignatures` function, which uses ECDSA to make signatures of the new databases and saves them to `.htaccess`, providing the signatures as headers when the databases are downloaded. This requires you to generate an Elliptic Curve Private Key. The Public Key should be provided to any users who you wish to share your databases with, so their copy of GeoFlag can verify the databases during the automatic update process.
3) `cron3Cleanup.php` - Erases the Maxmind databases from the temp directory. If you have anything else you want to do with the databases, take care of that before you run this script.

At the end of the process, you should have four files: `ipv4.db`, `ipv4.db.gz`, `ipv6.db`, and `ipv6.db.gz`. The GZ files should help speed up downloads and cut back on bandwidth usage.  

For best results, run these scripts regularly between once a week and once a month.  

This code was designed for Apache and PHP 7+. GMP and BCmath are both supported, but GMP is significantly faster. While the EC signature is technically optional, it does provide protection against transfer corruption, and a moderate level of security which your users will appreciate.  
If you want to skip the ECDSA process, just comment out lines 5 and 299-301 of `cron2Build.php`, delete `siggen.php.inc`, `bigint.php.inc`, `math.php.inc`, and the `phpecc` directory, and remove everything after line 16 in `.htaccess`.
