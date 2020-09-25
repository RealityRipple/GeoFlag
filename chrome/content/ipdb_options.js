var geoflag_IPDBoptions =
{
 oldKey: null,
 bytesPerLine4: 10,
 bytesPerLine6: 34,
 hasEC: function()
 {
  let setKey = document.getElementById('prefECKey').value;
  if (setKey.length < 130 || setKey.substring(0, 2) !== '04')
  {
   document.getElementById('chkECDSA').checked = false;
   geoflag_IPDBoptions.toggleEC();
  }
  else
  {
   geoflag_IPDBoptions._showTestResult('signed');
   geoflag_IPDBoptions._changeReset();
  }
 },
 toggleEC: function()
 {
  if (document.getElementById('chkECDSA').checked)
  {
   if (geoflag_IPDBoptions.oldKey !== null)
    document.getElementById('prefECKey').value = geoflag_IPDBoptions.oldKey;
   document.getElementById('ecdsaKey').removeAttribute('disabled');
   document.getElementById('ecdsaCurve').removeAttribute('disabled');
   document.getElementById('ecdsaHash').removeAttribute('disabled');
   geoflag_IPDBoptions._showTestResult('signed');
  }
  else
  {
   let setKey = document.getElementById('prefECKey').value;
   if (setKey.length >= 130 || setKey.substring(0, 2) === '04')
    geoflag_IPDBoptions.oldKey = setKey;
   document.getElementById('prefECKey').value = '';
   document.getElementById('ecdsaKey').disabled = true;
   document.getElementById('ecdsaCurve').disabled = true;
   document.getElementById('ecdsaHash').disabled = true;
   geoflag_IPDBoptions._showTestResult('unsigned');
  }
  geoflag_IPDBoptions._changeReset();
 },
 changeEntry: function()
 {
  let ico = 'unsigned';
  if (document.getElementById('chkECDSA').checked)
   ico = 'signed';
  geoflag_IPDBoptions._showTestResult(ico);
  geoflag_IPDBoptions._changeReset();
 },
 runTest: async function()
 {
  geoflag_IPDBoptions._showTestResult('pending');
  document.getElementById('runTest').disabled = true;
  let gBundle = Components.classes['@mozilla.org/intl/stringbundle;1'].getService(Components.interfaces.nsIStringBundleService);
  let locale = gBundle.createBundle('chrome://geoflag/locale/geoflag.properties');
  let v4url = document.getElementById('v4URL').value;
  let v6url = document.getElementById('v6URL').value;
  let pubHex = document.getElementById('ecdsaKey').value;
  let pubCurve = document.getElementById('ecdsaCurve').value;
  let sigHash = document.getElementById('ecdsaHash').value;
  let sigPub;
  if (pubCurve !== 'P-256' && pubCurve !== 'P-384' && pubCurve !== 'P-521')
   pubHex = '';
  if (sigHash !== 'SHA-256' && sigHash !== 'SHA-384' && sigHash !== 'SHA-512')
   pubHex = '';
  if (pubHex !== '')
  {
   let pubRaw = geoflag_IPDBoptions._hexStringToArrayBuffer(pubHex);
   sigPub = await crypto.subtle.importKey('raw', pubRaw, {name: 'ECDSA', namedCurve: pubCurve}, false, ['verify']).catch((e) => {});
   if (sigPub === undefined)
   {
    geoflag_IPDBoptions._showTestResult('error');
    document.getElementById('runTest').disabled = false;
    alert(locale.GetStringFromName('db.error.key'));
    document.getElementById('ecdsaKey').focus();
    return;
   }
  }
  let v4ret = await geoflag_IPDBoptions._download(v4url, sigPub, sigHash);
  let v6ret = await geoflag_IPDBoptions._download(v6url, sigPub, sigHash);
  document.getElementById('runTest').disabled = false;
  if (v4ret === null || v6ret === null)
  {
   geoflag_IPDBoptions._showTestResult('error');
   if (v4ret === null && v6ret === null)
   {
    alert(locale.GetStringFromName('db.error.url'));
    document.getElementById('v4URL').focus();
   }
   else if (v4ret === null)
   {
    alert(locale.GetStringFromName('db.error.url4'));
    document.getElementById('v4URL').focus();
   }
   else
   {
    alert(locale.GetStringFromName('db.error.url6'));
    document.getElementById('v6URL').focus();
   }
   return;
  }
  if (v4ret === false || v6ret === false)
  {
   geoflag_IPDBoptions._showTestResult('error');
   alert(locale.GetStringFromName('db.error.sig'));
   document.getElementById('ecdsaKey').focus();
   return;
  }
  let v4Lines = v4ret / geoflag_IPDBoptions.bytesPerLine4;
  let v6Lines = v6ret / geoflag_IPDBoptions.bytesPerLine6;
  if (v4Lines !== Math.trunc(v4Lines) || v4Lines !== Math.trunc(v4Lines))
  {
   geoflag_IPDBoptions._showTestResult('error');
   if (v4Lines !== Math.trunc(v4Lines) && v4Lines !== Math.trunc(v4Lines))
   {
    alert(locale.GetStringFromName('db.error.len'));
    document.getElementById('v4URL').focus();
   }
   else if (v4Lines !== Math.trunc(v4Lines))
   {
    alert(locale.GetStringFromName('db.error.len4'));
    document.getElementById('v4URL').focus();
   }
   else if (v6Lines !== Math.trunc(v6Lines))
   {
    alert(locale.GetStringFromName('db.error.len6'));
    document.getElementById('v6URL').focus();
   }
   return;
  }
  if (pubHex !== '')
   geoflag_IPDBoptions._showTestResult('signed_success');
  else
   geoflag_IPDBoptions._showTestResult('success');
  alert(locale.formatStringFromName('db.success', [v4Lines.toLocaleString(), v6Lines.toLocaleString()], 2));
 },
 _download: async function(url, sigPub, sigHash)
 {
  let sigR = null;
  let sigS = null;
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
       case 'x-signature-r':
        sigR = val;
        break;
       case 'x-signature-s':
        sigS = val;
        break;
      }
     }
    }
    if(xmlhttp.status < 200 || xmlhttp.status > 299)
    {
     if(xmlhttp.status === 0)
      return;
     resolve(null);
     return;
    }
    if(xmlhttp.response === null || xmlhttp.response.byteLength === 0)
    {
     resolve(null);
     return;
    }
    let respData = xmlhttp.response;
    resolve(respData);
   };
   xmlhttp.onerror = function(err)
   {
    resolve(null);
   };
   xmlhttp.open('GET', url);
   xmlhttp.responseType = 'arraybuffer';
   xmlhttp.setRequestHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
   xmlhttp.setRequestHeader('Accept-Encoding', 'gzip, deflate, br');
   xmlhttp.send();
  });
  let bData = await p;
  if (typeof bData === 'undefined' || bData === null)
   return null;
  let uData = new Uint8Array(bData);
  if (sigR !== null && sigS !== null)
  {
   let verified = await geoflag_IPDBoptions._verifySignature(uData, sigPub, sigHash, sigR, sigS);
   if (verified !== true)
    return verified;
  }
  return uData.length
 },
 _verifySignature: async function(file, sigKey, hashAlg, r, s)
 {
  try
  {
   if (sigKey === null || sigKey === undefined)
    return true;
   if (hashAlg !== 'SHA-256' && hashAlg !== 'SHA-384' && hashAlg !== 'SHA-512')
    return true;
   let sigRaw = geoflag_IPDBoptions._hexStringToArrayBuffer(r + s);
   let isGood = await crypto.subtle.verify({name: 'ECDSA', hash: {name: hashAlg}}, sigKey, sigRaw, file).catch((e) => {});
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
 _showTestResult: function(ico)
 {
  document.getElementById('testResult_in').hidden = true;
  document.getElementById('testResult_is').hidden = true;
  document.getElementById('testResult_p').hidden = true;
  document.getElementById('testResult_sn').hidden = true;
  document.getElementById('testResult_ss').hidden = true;
  document.getElementById('testResult_e').hidden = true;
  switch (ico)
  {
   case 'success':
    document.getElementById('testResult_sn').hidden = false;
    break;
   case 'signed_success':
    document.getElementById('testResult_ss').hidden = false;
    break;
   case 'error':
    document.getElementById('testResult_e').hidden = false;
    break;
   case 'pending':
    document.getElementById('testResult_p').hidden = false;
    break;
   case 'signed':
    document.getElementById('testResult_is').hidden = false;
    break;
   default:
    document.getElementById('testResult_in').hidden = false;
  }
 },
 reset: function()
 {
  document.getElementById('prefv4URL').value = 'https://realityripple.com/Software/Mozilla-Extensions/GeoFlag/ipv4.db';
  document.getElementById('prefv6URL').value = 'https://realityripple.com/Software/Mozilla-Extensions/GeoFlag/ipv6.db';
  document.getElementById('chkECDSA').checked = true;
  geoflag_IPDBoptions.toggleEC();
  document.getElementById('prefECKey').value = '04ccbe48b77e1be728414a7f76e1a0490f6a491bdafcf3e4f9eb8e44331220c81b1205989d5799a43fbad3c3f049076d92f6f69d53404ee38915dc9d35589d121f';
  document.getElementById('prefECCurve').value = 'P-256';
  document.getElementById('prefECHash').value = 'SHA-256';
  geoflag_IPDBoptions._changeReset();
 },
 _changeReset: function()
 {
  document.documentElement._buttons.extra2.disabled = geoflag_IPDBoptions._isDefault();
 },
 _isDefault: function()
 {
  if (document.getElementById('v4URL').value.toLowerCase() !== 'https://realityripple.com/software/mozilla-extensions/geoflag/ipv4.db')
   return false;
  if (document.getElementById('v6URL').value.toLowerCase() !== 'https://realityripple.com/software/mozilla-extensions/geoflag/ipv6.db')
   return false;
  if (document.getElementById('chkECDSA').checked !== true)
   return false;
  if (document.getElementById('ecdsaKey').value.toLowerCase() !== '04ccbe48b77e1be728414a7f76e1a0490f6a491bdafcf3e4f9eb8e44331220c81b1205989d5799a43fbad3c3f049076d92f6f69d53404ee38915dc9d35589d121f')
   return false;
  if (document.getElementById('ecdsaCurve').value !== 'P-256')
   return false;
  if (document.getElementById('ecdsaHash').value !== 'SHA-256')
   return false;
  return true;
 }
};