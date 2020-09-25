var geoflag_IconDB = {
 profPath: null,
 dataPath: ['geoflag'],
 _dbName: 'toolicons.sqlite',
 _dbID: 'geoflag_toolicons',
 _db: null,
 loadIcon: async function(uri)
 {
  let p = new Promise((resolve, reject) => {
   let aMimeType = 'image/vnd.microsoft.icon';
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
       case 'content-type':
        aMimeType = val;
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
    let aData = xmlhttp.response;
    resolve('data:' + aMimeType + ';base64,' + btoa(String.fromCharCode.apply(null, new Uint8Array(aData))));
   };
   xmlhttp.onerror = function(err)
   {
    reject('Connection Error');
   };
   xmlhttp.open('GET', uri);
   xmlhttp.responseType = 'arraybuffer';
   xmlhttp.send();
   });
  let bRet = await p.catch(function(err) {console.log(err);});
  if (typeof bRet === 'undefined' || bRet === null)
   return false;
  return bRet;
 },
 read: async function(iconURL)
 {
  if (geoflag_IconDB.profPath === null)
   geoflag_IconDB.profPath = Components.classes['@mozilla.org/file/directory_service;1'].getService(Components.interfaces.nsIProperties).get('ProfD', Components.interfaces.nsIFile).path;
  let fFrom = Components.classes['@mozilla.org/file/local;1'].createInstance(Components.interfaces.nsILocalFile);
  fFrom.initWithPath(geoflag_IconDB.profPath);
  for (let d = 0; d < geoflag_IconDB.dataPath.length; d++)
  {
   fFrom.appendRelativePath(geoflag_IconDB.dataPath[d]);
  }
  fFrom.appendRelativePath(geoflag_IconDB._dbName);
  if(!fFrom.exists())
   return false;
  if (geoflag_IconDB._db === null)
   geoflag_IconDB._db = Components.classes["@mozilla.org/storage/service;1"].getService(Components.interfaces.mozIStorageService).openDatabase(fFrom);
  let p = new Promise((resolve, reject) => {
   let icondata = null;
   let q = 'SELECT icondata FROM ' + geoflag_IconDB._dbID + ' WHERE url = :url';
   let statement = geoflag_IconDB._db.createAsyncStatement(q);
   statement.params.url = iconURL;
   statement.executeAsync({
    handleResult: function(aResultSet)
    {
     let row;
     while (row = aResultSet.getNextRow())
     {
      icondata = row.getResultByName('icondata');
     }
    },
    handleError: function(aError)
    {
     reject(aError.message);
    },
    handleCompletion: function(aReason)
    {
     resolve(icondata);
    }
   });
   statement.finalize();
  });
  let bData = await p.catch(function(err) {console.log(err);});
  if (typeof bData === 'undefined' || bData === null)
   return false;
  return bData;
 },
 write: async function(iconURL, iconData)
 {
  if (geoflag_IconDB.profPath === null)
   geoflag_IconDB.profPath = Components.classes['@mozilla.org/file/directory_service;1'].getService(Components.interfaces.nsIProperties).get('ProfD', Components.interfaces.nsIFile).path;
  let fFrom = Components.classes['@mozilla.org/file/local;1'].createInstance(Components.interfaces.nsILocalFile);
  fFrom.initWithPath(geoflag_IconDB.profPath);
  for (let d = 0; d < geoflag_IconDB.dataPath.length; d++)
  {
   fFrom.appendRelativePath(geoflag_IconDB.dataPath[d]);
  }
  fFrom.appendRelativePath(geoflag_IconDB._dbName);
  let create = !fFrom.exists();
  if (geoflag_IconDB._db === null)
   geoflag_IconDB._db = Components.classes["@mozilla.org/storage/service;1"].getService(Components.interfaces.mozIStorageService).openDatabase(fFrom);
  if (create)
   geoflag_IconDB._db.createTable(geoflag_IconDB._dbID, 'url TEXT PRIMARY KEY, icondata TEXT');
  let p = new Promise((resolve, reject) => {
   let q;
   if (typeof iconData === 'undefined')
    q = 'DELETE FROM ' + geoflag_IconDB._dbID + ' WHERE url = ?1';
   else
    q = 'INSERT OR REPLACE INTO ' + geoflag_IconDB._dbID + ' (url, icondata) VALUES (?1, ?2)';
   let statement = geoflag_IconDB._db.createAsyncStatement(q);
   statement.bindUTF8StringParameter(0, iconURL);
   if (typeof iconData !== 'undefined')
    statement.bindUTF8StringParameter(1, iconData);
   statement.executeAsync({
    handleError: function(aError)
    {
     reject(aError.message);
    },
    handleCompletion: function(aReason)
    {
     resolve(true);
    }
   });
   statement.finalize();
  });
  let bRet = await p.catch(function(err) {console.log(err);});
  if (typeof bRet === 'undefined' || bRet === null)
   return false;
  return true;
 },
 drop: async function()
 {
  if (geoflag_IconDB.profPath === null)
   geoflag_IconDB.profPath = Components.classes['@mozilla.org/file/directory_service;1'].getService(Components.interfaces.nsIProperties).get('ProfD', Components.interfaces.nsIFile).path;
  let fFrom = Components.classes['@mozilla.org/file/local;1'].createInstance(Components.interfaces.nsILocalFile);
  fFrom.initWithPath(geoflag_IconDB.profPath);
  for (let d = 0; d < geoflag_IconDB.dataPath.length; d++)
  {
   fFrom.appendRelativePath(geoflag_IconDB.dataPath[d]);
  }
  fFrom.appendRelativePath(geoflag_IconDB._dbName);
  if(!fFrom.exists())
   return false;
  if (geoflag_IconDB._db === null)
   geoflag_IconDB._db = Components.classes["@mozilla.org/storage/service;1"].getService(Components.interfaces.mozIStorageService).openDatabase(fFrom);
  let p = new Promise((resolve, reject) => {
   let q = 'DROP TABLE ' + geoflag_IconDB._dbID;
   let statement = geoflag_IconDB._db.createAsyncStatement(q);
   statement.executeAsync({
    handleError: function(aError)
    {
     console.log(aError);
     resolve(false);
    },
    handleCompletion: function(aReason)
    {
     resolve(true);
    }
   });
   statement.finalize();
  });
  let bData = await p.catch(function(err) {console.log(err);});
  let r = new Promise((resolve, reject) => {
   geoflag_IconDB._db.asyncClose(
    {
     complete: function()
     {
      resolve(true);
     }
    }
   );
  });
  let bClose = await r.catch(function(err) {console.log(err);});
  if (typeof bClose === 'undefined' || bClose === null)
   return false;
  geoflag_IconDB._db = null;
  try
  {
   fFrom.remove(false);
  }
  catch(ex)
  {
   console.log(ex);
  }
  return bClose;
 }
};