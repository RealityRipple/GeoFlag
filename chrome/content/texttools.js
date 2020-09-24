/*
 * Original Source:
 * Flagfox v5.2.11
 * Copyright 2007-2017, David Garrett
 * All rights reserved
 *
 * Modified Sept 24, 2020 for GeoFlag
 * See LICENSE for details.
 */
const geoflag_TextTools =
{
 loadTextFile: async function(url)
 {
  let p = new Promise((resolve, reject) => {
   const XMLHttpRequest = Components.Constructor("@mozilla.org/xmlextras/xmlhttprequest;1", "nsIXMLHttpRequest");
   let request = new XMLHttpRequest();
   request.open("GET", url, true);
   request.responseType = "text";
   request.onerror = function(event)
   {
    reject('Connection Error: ' + url);
   };
   request.onload = function(event)
   {
    if (request.response)
     resolve(request.response);
    else
     reject('Empty Response: ' + url);
   };
   request.send();
  });
  let sData = await p.catch(
   function(err)
   {
    console.log(err);
   }
  );
  if (typeof sData === 'undefined' || sData === null)
   return false;
  return sData;
 },
 cropTrailingChar: function(str, chr)
 {
  if (str.charAt(str.length - 1) !== chr)
   return str;
  return str.slice(0, str.length - 1);
 },
 truncateAfterLastChar: function(str, chr)
 {
  let pos = str.lastIndexOf(chr);
  if (pos === -1)
   return str;
  return str.substring(pos + 1);
 },
 truncateBeforeFirstChar: function(str, chr)
 {
  let pos = str.indexOf(chr);
  if (pos === -1)
   return str;
  return str.substring(0, pos);
 },
 copyStringToClipboard: function(str)
 {
  Components.classes["@mozilla.org/widget/clipboardhelper;1"].getService(Components.interfaces.nsIClipboardHelper).copyString(str);
 }
};
