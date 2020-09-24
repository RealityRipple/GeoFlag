Components.utils.import('resource://geoflag/ipdb.jsm');
var geoflag_IPDB =
{
 _Prefs: Components.classes['@mozilla.org/preferences-service;1'].getService(Components.interfaces.nsIPrefService).getBranch('extensions.geoflag.db.'),
 profPath: null,
 dataPath: ['geoflag'],
 _dbURL4: null,
 _dbURL6: null,
 _fPerm: 0644,
 _dPerm: 0755,
 _dbInfo4: {type: 'IPv4', filename: 'geo_ipv4.db', bytesPerIP: 4, bytesPerLine: 10, meta: {}, sig: {r: null, s: null}},
 _dbInfo6: {type: 'IPv6', filename: 'geo_ipv6.db', bytesPerIP: 16, bytesPerLine: 34, meta: {}, sig: {r: null, s: null}},
 _from6to4: [
  {
   prefix : '00000000000000000000',
   extract4 : function(ipString)
   {
    let block6 = ipString.substr(20, 4);
    if (block6 === 'ffff' || block6 === '0000')
     return geoflag_IPDB._parseInt4(parseInt(ipString.substr(24, 8), 16));
    return false;
   }
  },
  {
   prefix : '2002',
   extract4 : function(ipString)
   {
    return geoflag_IPDB._parseInt4(parseInt(ipString.substr(4, 8), 16));
   }
  },
  {
   prefix : '20010000',
   extract4 : function(ipString)
   {
    return geoflag_IPDB._parseInt4(~parseInt(ipString.substr(24, 8), 16));
   }
  }
 ],
 load: function(wnd)
 {
  geoflag_IPDB.profPath = Components.classes['@mozilla.org/file/directory_service;1'].getService(Components.interfaces.nsIProperties).get('ProfD', Components.interfaces.nsIFile).path;
  geoflag_IPDB._dbURL4 = geoflag_IPDB._Prefs.getCharPref('v4.url');
  geoflag_IPDB._dbInfo4.meta = JSON.parse(geoflag_IPDB._Prefs.getCharPref('v4.meta'));
  geoflag_IPDB._dbURL6 = geoflag_IPDB._Prefs.getCharPref('v6.url');
  geoflag_IPDB._dbInfo6.meta = JSON.parse(geoflag_IPDB._Prefs.getCharPref('v6.meta'));
  if (!geoflag.Prefs.prefHasUserValue('warn.update'))
   return;
  let today = new Date();
  if (geoflag_IPDB._Prefs.prefHasUserValue('v4.meta') || geoflag_IPDB._Prefs.prefHasUserValue('v6.meta'))
  {
   if (today.getDate() < 8)
    return;
  }
  let uTime = Math.floor(today.getTime() / 1000);
  let getv4 = true;
  let getv6 = true;
  if (geoflag_IPDB._dbInfo4.meta.hasOwnProperty('date'))
  {
   try
   {
    if (((uTime - geoflag_IPDB._dbInfo4.meta.date) / 86400) < 28)
     getv4 = false;
   }
   catch(e) {console.log(e);}
  }
  if (geoflag_IPDB._dbInfo6.meta.hasOwnProperty('date'))
  {
   try
   {
    if (((uTime - geoflag_IPDB._dbInfo6.meta.date) / 86400) < 28)
     getv6 = false;
   }
   catch(e) {console.log(e);}
  }
  if (getv4)
   window.setTimeout(function(){geoflag_IPDB.update4(wnd);}, 400);
  if (getv6)
   window.setTimeout(function(){geoflag_IPDB.update6(wnd);}, 600);
 },
 update4: async function(wnd)
 {
  if(geoflag_IPDB.profPath === null)
   return;
  if(geoflag_IPDB._dbURL4 === null)
   return;
  let lastUpdate = new Date(0);
  try
  {
   if (geoflag_IPDB._dbInfo4.meta.hasOwnProperty('date'))
    lastUpdate = new Date(geoflag_IPDB._dbInfo4.meta.date * 1000);
  }
  catch(e) {console.log(e);}
  let lastETag = null;
  try
  {
   if (geoflag_IPDB._dbInfo4.meta.hasOwnProperty('etag'))
    lastETag = geoflag_IPDB._dbInfo4.meta.etag;
  }
  catch(e) {console.log(e);}
  let p = new Promise((resolve, reject) => {
   const XMLHttpRequest = Components.Constructor('@mozilla.org/xmlextras/xmlhttprequest;1', 'nsIXMLHttpRequest');
   let xmlhttp = new XMLHttpRequest();
   xmlhttp.onreadystatechange = function()
   {
    if(xmlhttp.readyState !== 4)
     return;
    let respHead = xmlhttp.getAllResponseHeaders();
    if (respHead !== null)
    {
     let aHeaders = respHead.trim().split(/[\r\n]+/);
     for (let i = 0; i < aHeaders.length; i++)
     {
      let line = aHeaders[i];
      var parts = line.split(': ');
      var key = parts.shift();
      var val = parts.join(': ');
      switch(key.toLowerCase())
      {
       case 'date':
        geoflag_IPDB._dbInfo4.meta.date = ((new Date(val)).getTime() / 1000);
        break;
       case 'etag':
        geoflag_IPDB._dbInfo4.meta.etag = val;
        break;
       case 'x-signature-r':
        geoflag_IPDB._dbInfo4.sig.r = val;
        break;
       case 'x-signature-s':
        geoflag_IPDB._dbInfo4.sig.s = val;
        break;
      }
     }
    }
    if(xmlhttp.status < 200 || xmlhttp.status > 299)
    {
     if(xmlhttp.status === 0)
      return;
     reject('HTTP Error ' + xmlhttp.status);
     return;
    }
    if(xmlhttp.response === null || xmlhttp.response.byteLength === 0)
    {
     reject('Empty Response');
     return;
    }
    let respData = xmlhttp.response;
    geoflag_IPDB._dbInfo4.meta.length = respData.byteLength;
    resolve(respData);
   };
   xmlhttp.onerror = function(err)
   {
    reject('Connection Error');
   };
   xmlhttp.open('GET', geoflag_IPDB._dbURL4);
   xmlhttp.responseType = 'arraybuffer';
   xmlhttp.setRequestHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
   xmlhttp.setRequestHeader('Accept-Encoding', 'gzip, deflate, br');
   //xmlhttp.setRequestHeader('If-Modified-Since', lastUpdate.toGMTString());
   if(lastETag !== null)
    xmlhttp.setRequestHeader('If-None-Match', lastETag);
   xmlhttp.send();
  });
  let bData = await p.catch(
   function(err)
   {
    if (err === 'HTTP Error 304')
    {
     geoflag_IPDB._Prefs.setCharPref('v4.meta', JSON.stringify(geoflag_IPDB._dbInfo4.meta));
     return;
    }
    let gBundle = Components.classes['@mozilla.org/intl/stringbundle;1'].getService(Components.interfaces.nsIStringBundleService);
    let locale = gBundle.createBundle('chrome://geoflag/locale/geoflag.properties');
    geoflag_Tools.warning(wnd, 'update_error', locale.formatStringFromName('downloadwarnmessage.v4', [(new URL(geoflag_IPDB._dbURL4)).hostname, err], 2));
   }
  );
  if (typeof bData === 'undefined' || bData === null)
   return;
  let uData = new Uint8Array(bData);
  let uLines = uData.length / geoflag_IPDB._dbInfo4.bytesPerLine;
  if (uLines !== Math.trunc(uLines))
   return;
  if (geoflag_IPDB._dbInfo4.sig.r !== null && geoflag_IPDB._dbInfo4.sig.s !== null)
  {
   let verified = await geoflag_IPDB._verifySignature(uData, geoflag_IPDB._dbInfo4.sig.r, geoflag_IPDB._dbInfo4.sig.s);
   if (!verified)
   {
    console.log('IPv4 Database Signature Mismatch!');
    return;
   }
  }
  let fTo = Components.classes['@mozilla.org/file/local;1'].createInstance(Components.interfaces.nsILocalFile);
  fTo.initWithPath(geoflag_IPDB.profPath);
  for (let d = 0; d < geoflag_IPDB.dataPath.length; d++)
  {
   fTo.appendRelativePath(geoflag_IPDB.dataPath[d]);
   if (!fTo.exists())
    fTo.create(1, geoflag_IPDB._dPerm);
  }
  fTo.appendRelativePath(geoflag_IPDB._dbInfo4.filename);
  if (fTo.exists())
   fTo.remove(false);
  let fOut = Components.classes['@mozilla.org/network/file-output-stream;1'].createInstance(Components.interfaces.nsIFileOutputStream);
  fOut.init(fTo, 0x02 | 0x08 | 0x20, geoflag_IPDB._fPerm, 0);
  let bOut = Components.classes['@mozilla.org/binaryoutputstream;1'].createInstance(Components.interfaces.nsIBinaryOutputStream);
  bOut.setOutputStream(fOut);
  bOut.writeByteArray(uData, uData.length);
  bOut.close();
  fOut.close();
  geoflag_IPDB._Prefs.setCharPref('v4.meta', JSON.stringify(geoflag_IPDB._dbInfo4.meta));
 },
 _read4: async function()
 {
  let fFrom = Components.classes['@mozilla.org/file/local;1'].createInstance(Components.interfaces.nsILocalFile);
  fFrom.initWithPath(geoflag_IPDB.profPath);
  for (let d = 0; d < geoflag_IPDB.dataPath.length; d++)
  {
   fFrom.appendRelativePath(geoflag_IPDB.dataPath[d]);
  }
  fFrom.appendRelativePath(geoflag_IPDB._dbInfo4.filename);
  if (!fFrom.exists())
  {
   geoflag_IPData.db4 = null;
   geoflag_IPData.range4 = null;
   return null;
  }
  let fIn = Components.classes['@mozilla.org/network/file-input-stream;1'].createInstance(Components.interfaces.nsIFileInputStream);
  fIn.init(fFrom, 0x01, geoflag_IPDB._fPerm, 0);
  let fLen = fIn.available();
  let bIn = Components.classes['@mozilla.org/binaryinputstream;1'].createInstance(Components.interfaces.nsIBinaryInputStream);
  bIn.setInputStream(fIn);
  let bData;
  try
  {
   bData = bIn.readByteArray(fLen);
  }
  catch(e)
  {
   console.log('Unable to read', fIn.path, ':', e);
  }
  bIn.close();
  fIn.close();
  if (typeof bData === 'undefined' || bData === null)
   return null;
  let uData = new Uint8Array(bData);
  geoflag_IPData.db4 = uData;
  await geoflag_IPDB._range4();
 },
 _range4: async function()
 {
  let bData = geoflag_IPData.db4;
  let lastStart = -1;
  geoflag_IPData.range4 = {};
  for (let i = 0; i < bData.byteLength; i+= geoflag_IPDB._dbInfo4.bytesPerLine)
  {
   let bStartOctet = bData[i];
   if (bStartOctet !== lastStart)
   {
    if (lastStart > -1)
     geoflag_IPData.range4[lastStart].end = i - 1;
    geoflag_IPData.range4[bStartOctet] = {start: i, end: -1};
    lastStart = bStartOctet;
   }
  }
  geoflag_IPData.range4[lastStart].end = bData.byteLength;
 },
 _parse4: function(ipString)
 {
  try
  {
   let parts = ipString.split('.');
   if (parts.length !== 4)
    return false;
   let aRet = [];
   for (let i = 0; i < 4; i++)
   {
    aRet[i] = parseInt(parts[i], 10);
   }
   return aRet;
  }
  catch(e)
  {
   console.log(e);
   return false;
  }
 },
 _parseInt4: function(ipInt)
 {
  try
  {
   let aRet = [];
   aRet[0] = (ipInt >>> 24);
   aRet[1] = (ipInt >> 16 & 255);
   aRet[2] = (ipInt >> 8 & 255);
   aRet[3] = (ipInt & 255);
   return aRet;
  }
  catch(e)
  {
   console.log(e);
   return false;
  }
 },
 _lookup4: async function(ip)
 {
  let bData = geoflag_IPData.db4;
  if (bData === null)
   return 'IPDB LOAD ERROR';
  if (geoflag_IPData.range4 === null)
   return 'IPDB LOAD ERROR';
  if (ip[0] === 127)
   return '-L';
  if (ip[0] === 192 && ip[1] === 168 && ip[2] === 0 && ip[3] === 1)
   return '-L';
  if (ip[0] === 10)
   return '-A';
  if (ip[0] === 172)
  {
   if (ip[1] >= 16 && ip[1] <= 31)
    return '-B';
  }
  if (ip[0] === 192 && ip[1] === 168)
   return '-C';
  if (!geoflag_IPData.range4.hasOwnProperty(ip[0]))
   return null;
  let range = geoflag_IPData.range4[ip[0]];
  for (let i = range.start; i <= range.end; i+= geoflag_IPDB._dbInfo4.bytesPerLine)
  {
   let x = i;
   let bStart = [];
   for (let n = x; n < x + geoflag_IPDB._dbInfo4.bytesPerIP; n++)
   {
    bStart.push(bData[n]);
   }
   x += geoflag_IPDB._dbInfo4.bytesPerIP;
   let bEnd = [];
   for (let n = x; n < x + geoflag_IPDB._dbInfo4.bytesPerIP; n++)
   {
    bEnd.push(bData[n]);
   }
   x += geoflag_IPDB._dbInfo4.bytesPerIP;
   let lMatch = true;
   let hMatch = true;
   let outOfRange = false;
   for (let n = 0; n < geoflag_IPDB._dbInfo4.bytesPerIP; n++)
   {
    if (lMatch)
    {
     if (ip[n] < bStart[n])
     {
      outOfRange = true;
      break;
     }
     else if (ip[n] > bStart[n])
      lMatch = false;
    }
    if (hMatch)
    {
     if (ip[n] > bEnd[n])
     {
      outOfRange = true;
      break;
     }
     else if (ip[n] < bEnd[n])
      hMatch = false;
    }
    if (!lMatch && !hMatch)
     break;
   }
   if (outOfRange)
    continue;
   let iso = String.fromCharCode(bData[x], bData[x + 1]);
   return iso;
  }
  return null;
 },
 update6: async function(wnd)
 {
  if(geoflag_IPDB.profPath === null)
   return;
  if(geoflag_IPDB._dbURL6 === null)
   return;
  let lastUpdate = new Date(0);
  try
  {
   if (geoflag_IPDB._dbInfo6.meta.hasOwnProperty('date'))
    lastUpdate = new Date(geoflag_IPDB._dbInfo6.meta.date * 1000);
  }
  catch(e) {console.log(e);}
  let lastETag = null;
  try
  {
   if (geoflag_IPDB._dbInfo6.meta.hasOwnProperty('etag'))
    lastETag = geoflag_IPDB._dbInfo6.meta.etag;
  }
  catch(e) {console.log(e);}
  let p = new Promise((resolve, reject) => {
   const XMLHttpRequest = Components.Constructor('@mozilla.org/xmlextras/xmlhttprequest;1', 'nsIXMLHttpRequest');
   let xmlhttp = new XMLHttpRequest();
   xmlhttp.onreadystatechange = function()
   {
    if(xmlhttp.readyState !== 4)
     return;
    let respHead = xmlhttp.getAllResponseHeaders();
    if (respHead !== null)
    {
     let aHeaders = respHead.trim().split(/[\r\n]+/);
     for (let i = 0; i < aHeaders.length; i++)
     {
      let line = aHeaders[i];
      var parts = line.split(': ');
      var key = parts.shift();
      var val = parts.join(': ');
      switch(key.toLowerCase())
      {
       case 'date':
        geoflag_IPDB._dbInfo6.meta.date = ((new Date(val)).getTime() / 1000);
        break;
       case 'etag':
        geoflag_IPDB._dbInfo6.meta.etag = val;
        break;
       case 'x-signature-r':
        geoflag_IPDB._dbInfo6.sig.r = val;
        break;
       case 'x-signature-s':
        geoflag_IPDB._dbInfo6.sig.s = val;
        break;
      }
     }
    }
    if(xmlhttp.status < 200 || xmlhttp.status > 299)
    {
     if(xmlhttp.status === 0)
      return;
     reject('HTTP Error ' + xmlhttp.status);
     return;
    }
    if(xmlhttp.response === null || xmlhttp.response.byteLength === 0)
    {
     reject('Empty Response');
     return;
    }
    let respData = xmlhttp.response;
    geoflag_IPDB._dbInfo6.meta.length = respData.byteLength;
    resolve(respData);
   };
   xmlhttp.onerror = function(err)
   {
    reject('Connection Error');
   };
   xmlhttp.open('GET', geoflag_IPDB._dbURL6);
   xmlhttp.responseType = 'arraybuffer';
   xmlhttp.setRequestHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
   xmlhttp.setRequestHeader('Accept-Encoding', 'gzip, deflate, br');
   //xmlhttp.setRequestHeader('If-Modified-Since', lastUpdate.toGMTString());
   if(lastETag !== null)
    xmlhttp.setRequestHeader('If-None-Match', lastETag);
   xmlhttp.send();
  });
  let bData = await p.catch(
   function(err)
   {
    if (err === 'HTTP Error 304')
    {
     geoflag_IPDB._Prefs.setCharPref('v6.meta', JSON.stringify(geoflag_IPDB._dbInfo6.meta));
     return;
    }
    let gBundle = Components.classes['@mozilla.org/intl/stringbundle;1'].getService(Components.interfaces.nsIStringBundleService);
    let locale = gBundle.createBundle('chrome://geoflag/locale/geoflag.properties');
    geoflag_Tools.warning(wnd, 'update_error', locale.formatStringFromName('downloadwarnmessage.v6', [(new URL(geoflag_IPDB._dbURL6)).hostname, err], 2));
   }
  );
  if (typeof bData === 'undefined' || bData === null)
   return;
  let uData = new Uint8Array(bData);
  let uLines = uData.length / geoflag_IPDB._dbInfo6.bytesPerLine;
  if (uLines !== Math.trunc(uLines))
   return;
  if (geoflag_IPDB._dbInfo6.sig.r !== null && geoflag_IPDB._dbInfo6.sig.s !== null)
  {
   let verified = await geoflag_IPDB._verifySignature(uData, geoflag_IPDB._dbInfo6.sig.r, geoflag_IPDB._dbInfo6.sig.s);
   if (!verified)
   {
    console.log('IPv6 Database Signature Mismatch!');
    return;
   }
  }
  let fTo = Components.classes['@mozilla.org/file/local;1'].createInstance(Components.interfaces.nsILocalFile);
  fTo.initWithPath(geoflag_IPDB.profPath);
  for (let d = 0; d < geoflag_IPDB.dataPath.length; d++)
  {
   fTo.appendRelativePath(geoflag_IPDB.dataPath[d]);
   if (!fTo.exists())
    fTo.create(1, geoflag_IPDB._dPerm);
  }
  fTo.appendRelativePath(geoflag_IPDB._dbInfo6.filename);
  if (fTo.exists())
   fTo.remove(false);
  let fOut = Components.classes['@mozilla.org/network/file-output-stream;1'].createInstance(Components.interfaces.nsIFileOutputStream);
  fOut.init(fTo, 0x02 | 0x08 | 0x20, geoflag_IPDB._fPerm, 0);
  let bOut = Components.classes['@mozilla.org/binaryoutputstream;1'].createInstance(Components.interfaces.nsIBinaryOutputStream);
  bOut.setOutputStream(fOut);
  bOut.writeByteArray(uData, uData.length);
  bOut.close();
  fOut.close();
  geoflag_IPDB._Prefs.setCharPref('v6.meta', JSON.stringify(geoflag_IPDB._dbInfo6.meta));
 },
 _read6: async function()
 {
  let fFrom = Components.classes['@mozilla.org/file/local;1'].createInstance(Components.interfaces.nsILocalFile);
  fFrom.initWithPath(geoflag_IPDB.profPath);
  for (let d = 0; d < geoflag_IPDB.dataPath.length; d++)
  {
   fFrom.appendRelativePath(geoflag_IPDB.dataPath[d]);
  }
  fFrom.appendRelativePath(geoflag_IPDB._dbInfo6.filename);
  if (!fFrom.exists())
  {
   geoflag_IPData.db6 = null;
   geoflag_IPData.range6 = null;
   return null;
  }
  let fIn = Components.classes['@mozilla.org/network/file-input-stream;1'].createInstance(Components.interfaces.nsIFileInputStream);
  fIn.init(fFrom, 0x01, geoflag_IPDB._fPerm, 0);
  let fLen = fIn.available();
  let bIn = Components.classes['@mozilla.org/binaryinputstream;1'].createInstance(Components.interfaces.nsIBinaryInputStream);
  bIn.setInputStream(fIn);
  let bData;
  try
  {
   bData = bIn.readByteArray(fLen);
  }
  catch(e)
  {
   console.log('Unable to read', fIn.path, ':', e);
  }
  bIn.close();
  fIn.close();
  if (typeof bData === 'undefined' || bData === null)
   return null;
  let uData = new Uint8Array(bData);
  geoflag_IPData.db6 = uData;
  await geoflag_IPDB._range6();
 },
 _range6: async function()
 {
  let bData = geoflag_IPData.db6;
  let lastStart = -1;
  geoflag_IPData.range6 = {};
  for (let i = 0; i < bData.byteLength; i+= geoflag_IPDB._dbInfo6.bytesPerLine)
  {
   let bStartQuartet = (bData[i] << 8) + bData[i + 1];
   if (bStartQuartet !== lastStart)
   {
    if (lastStart > -1)
     geoflag_IPData.range6[lastStart].end = i - 1;
    geoflag_IPData.range6[bStartQuartet] = {start: i, end: -1};
    lastStart = bStartQuartet;
   }
  }
  geoflag_IPData.range6[lastStart].end = bData.byteLength;
 },
 _parse6: function(ipString)
 {
  try
  {
   if (ipString.length !== 32)
    return false;
   let aRet = [];
   for (let i = 0; i < 32; i+=4)
   {
    aRet.push(parseInt(ipString.substr(i, 4), 16));
   }
   return aRet;
  }
  catch(e)
  {
   console.log(e);
   return false;
  }
 },
 _expand6: function(ipString)
 {
  let quartets = ipString.toLowerCase().split(':');
  for (let i = 0; i < quartets.length; i++)
  {
   if (quartets[i].length === 0)
   {
    quartets[i] = '0000';
    while (quartets.length < 8)
    {
     quartets.splice(i, 0, '0000');
    }
   }
   else
   {
    while (quartets[i].length < 4)
    {
     quartets[i] = '0' + quartets[i];
    }
   }
  }
  let expanded = quartets.join('');
  if (quartets.length !== 8 || expanded.length !== 32)
   return false;
  return expanded;
 },
 _lookup6: async function(ip)
 {
  let bData = geoflag_IPData.db6;
  if (bData === null)
   return 'IPDB LOAD ERROR';
  if (geoflag_IPData.range6 === null)
   return 'IPDB LOAD ERROR';
  if (!geoflag_IPData.range6.hasOwnProperty(ip[0]))
   return null;
  let range = geoflag_IPData.range6[ip[0]];
  for (let i = range.start; i <= range.end; i+= geoflag_IPDB._dbInfo6.bytesPerLine)
  {
   let x = i;
   let bStart = [];
   for (let n = x; n < x + geoflag_IPDB._dbInfo6.bytesPerIP; n+=2)
   {
    bStart.push((bData[n] << 8) + bData[n + 1]);
   }
   x += geoflag_IPDB._dbInfo6.bytesPerIP;
   let bEnd = [];
   for (let n = x; n < x + geoflag_IPDB._dbInfo6.bytesPerIP; n+=2)
   {
    bEnd.push((bData[n] << 8) + bData[n + 1]);
   }
   x += geoflag_IPDB._dbInfo6.bytesPerIP;
   let lMatch = true;
   let hMatch = true;
   let outOfRange = false;
   for (let n = 0; n < geoflag_IPDB._dbInfo6.bytesPerIP; n++)
   {
    if (lMatch)
    {
     if (ip[n] < bStart[n])
     {
      outOfRange = true;
      break;
     }
     else if (ip[n] > bStart[n])
      lMatch = false;
    }
    if (hMatch)
    {
     if (ip[n] > bEnd[n])
     {
      outOfRange = true;
      break;
     }
     else if (ip[n] < bEnd[n])
      hMatch = false;
    }
    if (!lMatch && !hMatch)
     break;
   }
   if (outOfRange)
    continue;
   let iso = String.fromCharCode(bData[x], bData[x + 1]);
   return iso;
  }
  return null;
 },
 _verifySignature: async function(file, r, s)
 {
  try
  {
   let sigCurve = geoflag_IPDB._Prefs.getCharPref('ecdsa.curve');
   if (sigCurve !== 'P-256' && sigCurve !== 'P-384' && sigCurve !== 'P-521')
    return true;
   let hashAlg = geoflag_IPDB._Prefs.getCharPref('ecdsa.hash');
   if (hashAlg !== 'SHA-256' && hashAlg !== 'SHA-384' && hashAlg !== 'SHA-512')
    return true;
   let pubHex = geoflag_IPDB._Prefs.getCharPref('ecdsa.key');
   if (pubHex === '')
    return true;
   let sigRaw = geoflag_IPDB._hexStringToArrayBuffer(r + s);
   let pubRaw = geoflag_IPDB._hexStringToArrayBuffer(pubHex);
   let pubKey = await crypto.subtle.importKey('raw', pubRaw, {name: 'ECDSA', namedCurve: sigCurve}, false, ['verify']).catch((e) => {console.log(e);});
   if (pubKey === undefined)
    return true;
   let isGood = await crypto.subtle.verify({name: 'ECDSA', hash: {name: hashAlg}}, pubKey, sigRaw, file).catch((e) => {console.log(e);});
   if (isGood === true)
    return true;
   return false;
  }
  catch(e)
  {
   return false;
  }
 },
 _hexStringToArrayBuffer: function(hexString)
 {
  if((hexString.length % 2) !== 0)
   return false;
  let byteArray = new Uint8Array(hexString.length / 2);
  for(let i = 0; i < hexString.length; i += 2)
  {
   byteArray[i / 2] = parseInt(hexString.substring(i, i + 2), 16);
  }
  return byteArray.buffer;
 },
 reset4: function(newURL)
 {
  geoflag_IPDB._dbURL4 = newURL;
  geoflag_IPData.db4 = null;
  geoflag_IPData.range4 = null;
  geoflag_IPDB._Prefs.clearUserPref('v4.meta');
  geoflag_IPDB._dbInfo4.meta = {};
 },
 reset6: function(newURL)
 {
  geoflag_IPDB._dbURL6 = newURL;
  geoflag_IPData.db6 = null;
  geoflag_IPData.range6 = null;
  geoflag_IPDB._Prefs.clearUserPref('v6.meta');
  geoflag_IPDB._dbInfo6.meta = {};
 },
 close: function()
 {
  geoflag_IPData.db4 = null;
  geoflag_IPData.db6 = null;
  geoflag_IPData.range4 = null;
  geoflag_IPData.range6 = null;
 },
 lookupIP: async function(ipString)
 {
  if (!ipString)
   return null;
  if (!ipString.includes(':'))
  {
   if (geoflag_IPData.db4 === null)
    await geoflag_IPDB._read4();
   if (geoflag_IPData.db4 === null)
    return null
   let rawIP = geoflag_IPDB._parse4(ipString);
   if (rawIP === false)
    return null;
   return await geoflag_IPDB._lookup4(rawIP);
  }
  if (ipString === '::1')
   return '-L';
  if (ipString.includes('.'))
  {
   if (geoflag_IPData.db4 === null)
    await geoflag_IPDB._read4();
   if (geoflag_IPData.db4 === null)
    return null
   let rawIP = geoflag_IPDB._parse4(ipString.substr(ipString.lastIndexOf(':')+1));
   if (rawIP === false)
    return null;
   return await geoflag_IPDB._lookup4(rawIP);
  }
  var ex6 = geoflag_IPDB._expand6(ipString);
  if (ex6 === false)
   return null;
  for (let rule of geoflag_IPDB._from6to4)
  {
   if (!ex6.startsWith(rule.prefix))
    continue;
   if (geoflag_IPData.db4 === null)
    await geoflag_IPDB._read4();
   if (geoflag_IPData.db4 === null)
    return null
   let rawIP = rule.extract4(ex6);
   if(rawIP === false)
    return null;
   return await geoflag_IPDB._lookup4(rawIP);
  }
  if (geoflag_IPData.db6 === null)
   await geoflag_IPDB._read6();
   if (geoflag_IPData.db6 === null)
    return null
  let rawIP = geoflag_IPDB._parse6(ex6);
  if (rawIP === false)
   return null;
  return await geoflag_IPDB._lookup6(rawIP);
 }
};
