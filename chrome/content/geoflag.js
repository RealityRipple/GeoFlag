/*
 * Original Source:
 * Flagfox v5.2.11
 * Copyright 2007-2017, David Garrett
 * All rights reserved
 *
 * Modified Sept 24, 2020
 *          Oct  30, 2020
 *                        for GeoFlag
 * See LICENSE for details.
 */
var geoflag = {
 Prefs: Components.classes['@mozilla.org/preferences-service;1'].getService(Components.interfaces.nsIPrefService).getBranch('extensions.geoflag.'),
 localeGeneral: null,
 _localeHelp: null,
 localeCtrys: null,
 shownWarnings: null,
 minIconSize: 16,
 codePoints: {
  flags: {
   a: 0x1f1e6,
   b: 0x1f1e7,
   c: 0x1f1e8,
   d: 0x1f1e9,
   e: 0x1f1ea,
   f: 0x1f1eb,
   g: 0x1f1ec,
   h: 0x1f1ed,
   i: 0x1f1ee,
   j: 0x1f1ef,
   k: 0x1f1f0,
   l: 0x1f1f1,
   m: 0x1f1f2,
   n: 0x1f1f3,
   o: 0x1f1f4,
   p: 0x1f1f5,
   q: 0x1f1f6,
   r: 0x1f1f7,
   s: 0x1f1f8,
   t: 0x1f1f9,
   u: 0x1f1fa,
   v: 0x1f1fb,
   w: 0x1f1fc,
   x: 0x1f1fd,
   y: 0x1f1fe,
   z: 0x1f1ff,
  },
  special: {
   about: 0x1f4d6,
   anonymous: 0x1f310,
   error: 0x26d4,
   localfile: 0x1f4c1,
   localhost: 0x1f3e0,
   offline: 0x1f50c,
   privateip: 0x1f5a5,
   resource: 0x1f9e9,
   satellite: 0x1f6f0,
   script: 0x1f4dc,
   unknown: 0x2753
  }
 },
 init: function()
 {
  let gBundle = Components.classes['@mozilla.org/intl/stringbundle;1'].getService(Components.interfaces.nsIStringBundleService);
  geoflag.localeGeneral = gBundle.createBundle('chrome://geoflag/locale/geoflag.properties');
  geoflag._localeHelp = gBundle.createBundle('chrome://geoflag/locale/help.properties');
  geoflag.localeCtrys = gBundle.createBundle('chrome://geoflag/locale/countrynames.properties');
  geoflag_Actions.load();
 },
 close: function()
 {
  geoflag_IPDB.close();
 },
 load: function(wnd)
 {
  geoflag._showDBNote(wnd);
  try
  {
   newGeoFlagInstance(wnd);
  }
  catch(e)
  {
   console.log('Error loading icon for window', e);
  }
 },
 setIconSize: function(wnd)
 {
  if (wnd.document.getElementById('urlbar-icons') === null)
   return;
  let icon = wnd.document.getElementById('geoflag-icon');
  if (icon === null)
   return;
  let spaceHeight = wnd.document.getElementById('urlbar-icons').clientHeight;
  let flagsize = geoflag.Prefs.getIntPref('flagsize');
  if (!flagsize)
  {
   flagsize = geoflag.Prefs.clearUserPref('flagsize');
   flagsize = geoflag.Prefs.getIntPref('flagsize');
  }
  if (flagsize < geoflag.minIconSize)
  {
   flagsize = geoflag.minIconSize;
   geoflag.Prefs.setIntPref('flagsize', flagsize);
  }
  if (flagsize > spaceHeight + 2)
  {
   flagsize = spaceHeight + 2;
   if (spaceHeight > 0)
    geoflag.Prefs.setIntPref('flagsize', flagsize);
  }
  icon.style.fontSize = flagsize + 'px';
  let boxH = icon.clientHeight;
  if (boxH < flagsize)
   return;
  let offset = (Math.ceil(flagsize / 6) + 1) * -1;
  let diffH = Math.floor((spaceHeight - (boxH + (offset * 2))) / 2);
  icon.style.marginTop = (offset + diffH) + 'px';
 },
 _showDBNote: function(wnd)
 {
  let dbNote = true;
  if (geoflag.Prefs.prefHasUserValue('db.v4.url') || geoflag.Prefs.prefHasUserValue('db.v6.url'))
   dbNote = false;
  if (geoflag.Prefs.prefHasUserValue('db.v4.meta') || geoflag.Prefs.prefHasUserValue('db.v6.meta'))
  {
   let today = new Date();
   let updateEvery = 28;
   if (geoflag_IPDB._Prefs.prefHasUserValue('update'))
   {
    updateEvery = geoflag_IPDB._Prefs.getIntPref('update');
    let trueUE = Math.ceil(updateEvery / 7) * 7;
    if (trueUE < 7)
     trueUE = 7;
    if (trueUE > 28)
     trueUE = 28;
    if (updateEvery != trueUE)
    {
     if (trueUE === 28)
      geoflag_IPDB._Prefs.clearUserPref('update');
     else
      geoflag_IPDB._Prefs.setIntPref('update', trueUE);
     updateEvery = trueUE;
    }
   }
   let uTime = Math.floor(today.getTime() / 1000);
   let meta4 = JSON.parse(geoflag.Prefs.getCharPref('db.v4.meta'));
   let meta6 = JSON.parse(geoflag.Prefs.getCharPref('db.v6.meta'));
   if (meta4.hasOwnProperty('date'))
   {
    try
    {
     if (((uTime - meta4.date) / 86400) < updateEvery)
      dbNote = false;
    }
    catch(e) {}
   }
   if (meta6.hasOwnProperty('date'))
   {
    try
    {
     if (((uTime - meta6.date) / 86400) < updateEvery)
      dbNote = false;
    }
    catch(e) {}
   }
  }
  if (dbNote)
  {
   let upNote = geoflag.localeGeneral.GetStringFromName('updatewarnmessage');
   if (!geoflag.Prefs.prefHasUserValue('warn.update'))
    upNote = geoflag.localeGeneral.GetStringFromName('firstupdatewarnmessage')
   geoflag_Tools.warning(wnd, 'update', upNote);
  }
 }
};

function newGeoFlagInstance(wnd)
{
 if (!wnd || !wnd.document || !wnd.getBrowser || !wnd.getBrowser())
  return;
 createIcon();
 let icon = wnd.document.getElementById('geoflag-icon');
 let menu = wnd.document.getElementById('geoflag-menu');
 let tooltip = wnd.document.getElementById('geoflag-tooltip');
 if (!icon || !menu || !tooltip)
 {
  destroyIcon();
  console.log('GeoFlag Error: failed to create/find icon in new window');
  return;
 }
 geoflag.setIconSize(wnd);
 let dLoc = null;
 let DNSrequest = null;
 let menuContentAge = 0;
 let metaCache = null;
 let locationCache = new GeoLocationCache(wnd);
 onLocationChange();
 let progressListener =
 {
  onLocationChange : onLocationChange,
  onProgressChange : function() {},
  onSecurityChange : function() {},
  onStateChange : function() {},
  onStatusChange : function() {}
 };
 wnd.getBrowser().addProgressListener(progressListener);
 icon.addEventListener('click',onIconClick);
 icon.addEventListener('mousedown',onIconMouseDown);
 icon.addEventListener('mouseenter',onIconHover);
 menu.addEventListener('command',onMenuCommand);
 menu.addEventListener('mouseup',onMenuMouseUp);
 menu.addEventListener('popupshowing',onMenuShowing);
 tooltip.addEventListener('popupshowing',updateTooltipContent);
 wnd.addEventListener('keypress',onKeyPressed);
 wnd.addEventListener('online',onChangedOnlineStatus);
 wnd.addEventListener('offline',onChangedOnlineStatus);
 wnd.addEventListener('unload',unload);
 wnd.addEventListener('geoflag-unload',unload);
 function unload()
 {
  wnd.removeEventListener('geoflag-unload',unload);
  wnd.removeEventListener('unload',unload);
  wnd.removeEventListener('offline',onChangedOnlineStatus);
  wnd.removeEventListener('online',onChangedOnlineStatus);
  wnd.removeEventListener('keypress',onKeyPressed);
  tooltip.removeEventListener('popupshowing',updateTooltipContent);
  menu.removeEventListener('popupshowing',onMenuShowing);
  menu.removeEventListener('mouseup',onMenuMouseUp);
  menu.removeEventListener('command',onMenuCommand);
  icon.removeEventListener('mouseenter',onIconHover);
  icon.removeEventListener('mousedown',onIconMouseDown);
  icon.removeEventListener('click',onIconClick);
  wnd.getBrowser().removeProgressListener(progressListener);
  if (DNSrequest)
   DNSrequest.cancel();
  DNSrequest = null;
  metaCache = null;
  locationCache = null;
  dLoc = null;
  destroyIcon();
 }
 function createIcon()
 {
  let urlBarIconsBox = wnd.document.getElementById('urlbar-icons');
  if (!urlBarIconsBox)
  {
   console.log("GeoFlag Error: attempted to load into a window without an address bar and 'urlbar-icons' box");
   return;
  }
  let spaceHeight = urlBarIconsBox.clientHeight;
  let newIcon = wnd.document.createElement('box');
  newIcon.setAttribute('id', 'geoflag-button');
  newIcon.setAttribute('class', 'urlbar-icon');
  newIcon.setAttribute('style', 'height: ' + spaceHeight + 'px; overflow: hidden; display: inline-block; padding: 0; margin-left: 3px; margin-right: 3px;');
  let newIcon_image = wnd.document.createElement('label');
  newIcon_image.setAttribute('id', 'geoflag-icon');
  newIcon_image.setAttribute('context', 'geoflag-menu');
  newIcon_image.setAttribute('tooltip', 'geoflag-tooltip');
  newIcon_image.setAttribute('style', 'margin: 0; text-align: center;');
  let newIcon_menupopup = wnd.document.createElement('menupopup');
  newIcon_menupopup.setAttribute('id', 'geoflag-menu');
  let newIcon_tooltip = wnd.document.createElement('tooltip');
  newIcon_tooltip.setAttribute('id', 'geoflag-tooltip');
  newIcon.appendChild(newIcon_image);
  newIcon.appendChild(newIcon_menupopup);
  newIcon.appendChild(newIcon_tooltip);
  let starButton = urlBarIconsBox.querySelector('#star-button');
  urlBarIconsBox.insertBefore(newIcon,starButton);
 }
 function destroyIcon()
 {
  tooltip = null;
  menu = null;
  icon = null;
  let btn = wnd.document.getElementById('geoflag-button');
  if (btn)
   btn.parentNode.removeChild(btn);
 }
 function setIcon(name)
 {
  let btn = wnd.document.getElementById('geoflag-button');
  if (!name)
  {
   icon.value = '';
   btn.style.display = 'none';
   return;
  }
  btn.style.display = 'inline-block';
  dLoc.icon = name;
  let sIcon = '';
  if (name.startsWith('flags/'))
  {
   let flagA = name.substring(6, 7);
   let flagB = name.substring(7, 8);
   sIcon = String.fromCodePoint(geoflag.codePoints.flags[flagA], geoflag.codePoints.flags[flagB], 0xfe0f);
  }
  else
   sIcon = String.fromCodePoint(geoflag.codePoints.special[name], 0xfe0f);
  if (icon.value === sIcon)
   return;
  geoflag.setIconSize(wnd);
  icon.value = sIcon;
 }
 function onLocationChange()
 {
  try
  {
   updateState();
  }
  catch (e)
  {
   console.log('GeoFlag EXCEPTION: ', e);
  }
 }
 function updateState()
 {
  let currentURI = wnd.getBrowser().selectedBrowser.currentURI;
  if (currentURI.spec.startsWith('about:reader?url='))
   currentURI = Components.classes['@mozilla.org/network/io-service;1'].getService(Components.interfaces.nsIIOService).newURI(decodeURIComponent(currentURI.spec.slice(17)), null, null);
  if (currentURI.scheme === 'view-source')
   currentURI = Components.classes['@mozilla.org/network/io-service;1'].getService(Components.interfaces.nsIIOService).newURI(currentURI.spec.slice(12),null,null);
  if (currentURI.scheme === 'jar')
   currentURI = Components.classes['@mozilla.org/network/io-service;1'].getService(Components.interfaces.nsIIOService).newURI(geoflag_TextTools.truncateBeforeFirstChar(currentURI.spec.slice(4), '!'),null,null);
  metaCache = null;
  if (dLoc && !dLoc.special && currentURI.equalsExceptRef(dLoc.uri))
  {
   if (dLoc.uri.ref !== currentURI.ref)
    dLoc.uri.ref = currentURI.ref;
   return;
  }
  if (DNSrequest)
   DNSrequest.cancel();
  DNSrequest = null;
  dLoc = new GeoLocation(currentURI);
  switch (dLoc.protocol)
  {
   case 'file':
    setIcon('localfile');
    dLoc.special = ['localfile'];
    dLoc.local = true;
    return;
   case 'data':
    setIcon('script');
    dLoc.special = ['datauri', geoflag_TextTools.truncateBeforeFirstChar(dLoc.url, ',')];
    return;
   case 'about':
    setIcon(geoflag_Tools.blankAddressPages.has(dLoc.url) ? null : 'about');
    dLoc.special = ['internalfile', geoflag_TextTools.truncateBeforeFirstChar(dLoc.url, '?')];
    dLoc.local = true;
    return;
   case 'chrome':
   case 'resource':
   case 'moz-icon':
   case 'moz-extension':
    setIcon('resource');
    dLoc.special = ['internalfile', dLoc.protocol + '://'];
    dLoc.local = true;
    dLoc.host = '';
    return;
  }
  if (!dLoc.host)
  {
   setIcon('unknown');
   dLoc.special = ['lookuperror'];
   return;
  }
  if (!wnd.navigator.onLine)
  {
   setIcon('offline');
   dLoc.special = ['offlinemode'];
   return;
  }
  let cachedlocation = locationCache.fetch(dLoc);
  if (cachedlocation)
  {
   dLoc = cachedlocation;
   setIcon(dLoc.icon);
  }
  DNSrequest = geoflag_DNS.resolve(dLoc.uri, onReturnedIP);
  async function onReturnedIP(returnedIP)
  {
   DNSrequest = null;
   if (returnedIP === 'PROXY')
   {
    setIcon('anonymous');
    dLoc.special = ['nodnserror'];
    geoflag_Tools.warning(wnd, 'proxy', geoflag.localeGeneral.GetStringFromName('proxywarnmessage'));
    return;
   }
   if (returnedIP === 'FAIL')
   {
    if (dLoc.icon)
     locationCache.store(dLoc);
    else
    {
     setIcon('error');
     dLoc.special = ['lookuperror'];
    }
    return;
   }
   dLoc.ip = returnedIP;
   dLoc.country = await geoflag_IPDB.lookupIP(returnedIP).catch((e) => {console.log('Failed to lookup', returnedIP, ':', e);});
   switch (dLoc.country)
   {
    case 'LOADING IPDB':
     setIcon(null);
     onLoadingIPDB(returnedIP);
     return;
    case 'IPDB LOAD ERROR':
     console.log('GeoFlag IPDB load error!');
     onReturnedIP('FAIL');
     return;
    case null:
     setIcon('anonymous');
     dLoc.special = ['unknownsite'];
     break;
    case '-A':
    case '-B':
    case '-C':
     setIcon('privateip');
     dLoc.local = true;
     break;
    case '-L':
     setIcon('localhost');
     dLoc.local = true;
     break;
    case 'A1':
    case 'AP':
     setIcon('anonymous');
     break;
    case 'A2':
     setIcon('satellite');
     break;
    default:
     setIcon('flags/' + dLoc.country.toLowerCase());
     break;
   }
   dLoc.tldcountry = lookupTLD();
   locationCache.store(dLoc);
  }
  const maxWait = 10000;
  let totalWait = 0;
  let waitInterval = 10;
  function onLoadingIPDB(pendingIP)
  {
   if (totalWait <= maxWait)
   {
    wnd.setTimeout(function()
     {
      totalWait += waitInterval;
      waitInterval *= 2;
      if (dLoc.ip === pendingIP && DNSrequest === null)
       onReturnedIP(pendingIP);
     },
     waitInterval
    );
   }
   else
   {
    onReturnedIP('FAIL');
   }
  }
 }
 function lookupTLD()
 {
  if (!dLoc.host || !dLoc.country)
   return null;
  let tld = geoflag_TextTools.truncateAfterLastChar(dLoc.host, '.').toLowerCase();
  let tldCountryCode;
  switch (tld)
  {
   case 'edu':  case 'gov':  case 'mil':
    tldCountryCode = 'US';
    break;
   case 'asia':
    tldCountryCode = 'AP';
    break;
   default:
    if (tld.length !== 2)
     return null;
    tldCountryCode = tld.toUpperCase();
    break;
  }
  let doCheck = true;
  switch (tldCountryCode)
  {
   case 'UK':
    tldCountryCode = 'GB';
    break;
   case 'EU':
   case 'AP':
    doCheck = false;
    break;
   case 'AD':  case 'AM':  case 'AS':  case 'BZ':  case 'CC':  case 'CD':  case 'CO':  case 'DJ':  case 'FM':
   case 'GL':  case 'IO':  case 'LA':  case 'LY':  case 'ME':  case 'MS':  case 'TO':  case 'TV':  case 'WS':
    doCheck = false;
    break;
  }
  switch (dLoc.country)
  {
   case 'EU':
   case 'AP':
    doCheck = false;
    break;
  }
  let tldCountryName = null;
  try
  {
   tldCountryName = geoflag.localeCtrys.GetStringFromName(tldCountryCode);
  }
  catch (e)
  {
   console.log(e);
   return null;
  }
  if (doCheck && tldCountryName && dLoc.country !== tldCountryCode)
  {
   try
   {
    let ipCountryName = geoflag.localeCtrys.GetStringFromName(dLoc.country);
    let messageText = geoflag.localeGeneral.formatStringFromName('tldwarnmessage', [ipCountryName, '.' + tld, tldCountryName], 3);
    let messageID = 'tld:' + dLoc.country + '/' + tld;
    geoflag_Tools.warning(wnd, 'tld', messageText, messageID);
   }
   catch(e) {console.log(e);}
  }
  return tldCountryCode;
 }
 function updateTooltipContent()
 {
  while (tooltip.firstChild)
  {
   tooltip.removeChild(tooltip.firstChild);
  }
  let grid = wnd.document.createElement('grid');
  let rows = wnd.document.createElement('rows');
  function addLabeledLine(labelID,lineValue)
  {
   let row = wnd.document.createElement('row');
   let label = wnd.document.createElement('label');
   label.setAttribute('value', geoflag.localeGeneral.GetStringFromName(labelID));
   label.setAttribute('style', 'font-weight: bold;');
   let value = wnd.document.createElement('label');
   value.setAttribute('value', lineValue);
   row.appendChild(label);
   row.appendChild(value);
   rows.appendChild(row);
  }
  function safeGetCountryName(code)
  {
   try
   {
    return geoflag.localeCtrys.GetStringFromName(code);
   }
   catch(e)
   {
    console.log(e);
    return code + ' (?)';
   }
  }
  let isUnknownLocation = (dLoc.special && dLoc.special[0] === 'unknownsite');
  if (dLoc.host && dLoc.host !== dLoc.ip)
   addLabeledLine('domainname', dLoc.host);
  if (dLoc.ip)
   addLabeledLine('ipaddress', dLoc.ip);
  if (dLoc.country || isUnknownLocation)
   addLabeledLine('serverlocation', isUnknownLocation ? geoflag.localeGeneral.GetStringFromName('unknownsite') : safeGetCountryName(dLoc.country));
  if (dLoc.tldcountry && dLoc.tldcountry !== dLoc.country)
   addLabeledLine('domainnationality', safeGetCountryName(dLoc.tldcountry));
  if (dLoc.special && !isUnknownLocation)
  {
   let extraString = geoflag.localeGeneral.GetStringFromName(dLoc.special[0]);
   if (dLoc.special[1])
    extraString += ' (' + dLoc.special[1] + ')';
   let extraLine = wnd.document.createElement('label');
   extraLine.setAttribute('value', extraString);
   if (geoflag_Tools.locationErrors.has(dLoc.special[0]))
    extraLine.setAttribute('style', 'font-style: italic;');
   rows.appendChild(extraLine);
  }
  grid.appendChild(rows);
  tooltip.appendChild(grid);
 }
 function updateMenuContent()
 {
  if (menuContentAge === geoflag_Actions.actionsListAge)
   return;
  geoflag_Actions.assertLoaded();
  const showAllItems = (menuContentAge === -1);
  const showFavicons = geoflag.Prefs.getBoolPref('showfavicons');
  while (menu.firstChild)
  {
   menu.removeChild(menu.firstChild);
  }
  function newMenuItem(value,label)
  {
   let newElement = wnd.document.createElement('menuitem');
   newElement.setAttribute('value', value);
   newElement.setAttribute('label', label);
   menu.appendChild(newElement);
   return newElement;
  }
  function newMenuItemForAction(action,id)
  {
   if (!(action.show || showAllItems))
    return;
   let newElement = newMenuItem(id, geoflag_Actions.getLocalizedName(action));
   if (showFavicons)
   {
    newElement.setAttribute('class', 'menuitem-iconic');
    newElement.setAttribute('validate', 'never');
    newElement.setAttribute('image', 'chrome://geoflag/skin/icons/default.png');
    wnd.setTimeout(async function(){newElement.setAttribute('image', await geoflag_Tools.getCachedFaviconForTemplate(action.template));}, 10);
    newElement.onerror = function()
    {
     newElement.setAttribute('image', 'chrome://geoflag/skin/icons/default.png');
    };
   }
  }
  for (let i in geoflag_Actions.actionsList)
  {
   newMenuItemForAction(geoflag_Actions.actionsList[i], i);
  }
  menu.appendChild(wnd.document.createElement('menuseparator'));
  newMenuItem('options', geoflag.localeGeneral.GetStringFromName('options'));
  if (showAllItems)
   menuContentAge = 0;
  else
   menuContentAge = geoflag_Actions.actionsListAge;
 }
 function contentDoc()
 {
  let contentwnd = wnd.content ? wnd.content : wnd.getBrowser().selectedBrowser.contentWindowAsCPOW;
  return contentWindow.document;
 }
 function isActionAllowed(id)
 {
  if (typeof id === 'undefined' || id === null)
   return false;
  if (id === 'options')
   return true;
  let action = geoflag_Actions.actionsList[id];
  geoflag_Actions.assertValid(action);
  let template = action.template;
  function needs(placeholder) {return RegExp(placeholder, 'i').test(template);}
  if (needs('{(title|(base)?locale-page|meta-.*)}') && !contentDoc())
   return false;
  switch (geoflag_TextTools.truncateBeforeFirstChar(template, ':'))
  {
   case 'copystring':
    break;
   case 'javascript':
    if (!wnd.getBrowser().selectedBrowser)
     return false;
    break;
   case 'formfield':
   default:
    if (!wnd.navigator.onLine)
     return false;
    if (dLoc.local)
    {
     if (needs('{fullURL}'))
      return false;
     if ((dLoc.host === dLoc.ip || dLoc.host === 'localhost') && needs('{(IPaddress|(base)?domainName|TLD)}'))
      return false;
    }
    break;
  }
  if (!dLoc.host && needs('{((base)?domainName|TLD)}'))
   return false;
  if (!dLoc.ip && needs('{IPaddress}') && !needs('{((base)?domainName|TLD)}'))
   return false;
  if (!dLoc.country && needs('{country(Code|Name)}'))
   return false;
  return true;
 }
 function doAction(id, openIn)
 {
  if (!isActionAllowed(id))
   return;
  if (id === 'options')
  {
   wnd.openDialog('chrome://geoflag/content/options.xul', 'GeoFlagOptions', 'chrome,titlebar,toolbar,centerscreen,resizable').focus();
   return;
  }
  let action = geoflag_Actions.actionsList[id];
  switch (geoflag_TextTools.truncateBeforeFirstChar(action.template, ':'))
  {
   case 'formfield':
    let templateComponents = action.template.slice(10).split('|');
    let parsedTemplateURL = parseTemplate(templateComponents[0],'url');
    let parsedFormValue = parseTemplate(templateComponents[2]);
    let targetBrowser = openURL(parsedTemplateURL, openIn);
    let tmm = targetBrowser.messageManager;
    tmm.loadFrameScript('chrome://geoflag/content/contentscript.js',false);
    tmm.sendAsyncMessage('geoflag-contentscriptaction',
     {
      type: 'formfield',
      values:
      {
       formValue : parsedFormValue,
       formID : templateComponents[1],
       buttonID : templateComponents[3]
      }
     }
    );
    return;
   case 'copystring':
    let parsedString = parseTemplate(action.template.slice(11), 'none');
    geoflag_TextTools.copyStringToClipboard(parsedString);
    return;
   case 'javascript':
    let parsedScript = parseTemplate(action.template.slice(11), 'escapequotes');
    const msgName = 'geoflag-contentscriptaction';
    let mm = wnd.getBrowser().selectedBrowser.messageManager;
    let sandboxFunctions = {
     log: function(message) {Components.classes['@mozilla.org/consoleservice;1'].getService(Components.interfaces.nsIConsoleService).logStringMessage(message);},
     copystring: function(string) {geoflag_TextTools.copyStringToClipboard(string);},
     openurl: function(newurl) {openURL(newurl);},
     getinfo: function(param) {return getParameterValue(param);},
     error: function(errorMessage)
     {
      errorMessage = errorMessage + '\n\n' + parsedScript;
      let errorTitle = 'GeoFlag JavaScript Action "' + geoflag_Actions.getLocalizedName(action) + '" ERROR';
      console.log(errorTitle + ':\n\n' + errorMessage);
      Components.classes['@mozilla.org/embedcomp/prompt-service;1'].getService(Components.interfaces.nsIPromptService).alert(wnd, errorTitle, errorMessage);
     },
     done: function() {mm.removeMessageListener(msgName, receiveMessage);}
    };
    let receiveMessage = function(msg)
    {
     if (msg.name === msgName)
      try {return sandboxFunctions[msg.data.name](msg.data.arg);} catch(e) {console.log(e);}
    };
    mm.loadFrameScript('chrome://geoflag/content/contentscript.js',false);
    mm.addMessageListener(msgName, receiveMessage);
    mm.sendAsyncMessage(msgName, {type : 'javascript', script : parsedScript});
    return;
   default:
    let parsedURL = parseTemplate(action.template, 'url');
    openURL(parsedURL, openIn);
    return;
  }
 }
 function openURL(url,override)
 {
  try
  {
   let openPref = override ? override : geoflag.Prefs.getCharPref('openlinksin') ;
   switch (openPref)
   {
    case 'tabFG':
    case 'tabBG':
     let browser = wnd.getBrowser();
     try { wnd.TreeStyleTabService.readyToOpenChildTab(browser.selectedTab); } catch (e) {}
     let newTab = browser.addTab(url, {ownerTab:browser.selectedTab, relatedToCurrent:true});
     if (openPref === 'tabFG')
      browser.selectedTab = newTab;
     return browser.getBrowserForTab(newTab);
    case 'winFG':
    case 'winBG':
     wnd.open(url,'_blank');
     let newWindow = Components.classes['@mozilla.org/appshell/window-mediator;1'].getService(Components.interfaces.nsIWindowMediator).getMostRecentWindow('navigator:browser');
     if (openPref === 'winBG')
     {
      newWindow.blur();
      wnd.focus();
     }
     return newWindow.getBrowser().selectedBrowser;
    case 'currentTab':
    default:
     let currentTabBrowser = wnd.getBrowser().selectedBrowser;
     currentTabBrowser.loadURI(url);
     return currentTabBrowser;
   }
  }
  catch(e)
  {
   console.log('Failed to open URL:', url, e);
  }
 }
 function parseTemplate(template,encoding)
 {
  function getReplacement(token)
  {
   return getParameterValue(token, template, encoding);
  }
  if (encoding === 'url')
  {
   return encodeURI(template).replace(/%7B[^%\s]+%7D/g, getReplacement);
  }
  else
  {
   return template.replace(/\{[^{}\s]+\}/g, getReplacement);
  }
 }
 function getParameterValue(token,template,encoding)
 {
  let parameter, maybeEncode;
  switch (token[0])
  {
   case '{':
    parameter = token.toLowerCase().slice(1, -1);
    break;
   case '%':
    parameter = token.toLowerCase().slice(3, -3);
    break;
   default:
    parameter = token.toLowerCase();
    break;
  }
  switch (encoding)
  {
   default:
   case 'none':
    maybeEncode = function(a) {return a;};
    break;
   case 'url':
    maybeEncode = encodeURIComponent;
    break;
   case 'escapequotes':
    maybeEncode = geoflag_Tools.escapeQuotes;
    break;
  }
  let base = false;
  let eTLDService = Components.classes['@mozilla.org/network/effective-tld-service;1'].getService(Components.interfaces.nsIEffectiveTLDService);
  switch (geoflag_TextTools.truncateBeforeFirstChar(parameter, '-'))
  {
   case 'fullurl':
    if (encoding === 'url')
    {
     let charBeforeURL = template[template.search(/\{fullURL\}/i) - 1];
     if (charBeforeURL === '=' || charBeforeURL === ':')
      return encodeURIComponent(dLoc.url);
    }
    return dLoc.url;
   case 'basedomainname':
    try
    {
     return maybeEncode(eTLDService.getBaseDomainFromHost(dLoc.host));
    }
    catch(e) {console.log(e);}
   case 'domainname':
    return maybeEncode(dLoc.host);
   case 'tld':
    try
    {
     return maybeEncode(eTLDService.getPublicSuffixFromHost(dLoc.host));
    }
    catch(e)
    {
     console.log(e);
     return maybeEncode(geoflag_TextTools.truncateAfterLastChar(dLoc.host, '.'));
    }
   case 'ipaddress':
    return maybeEncode(dLoc.ip ? dLoc.ip : '');
   case 'countrycode':
    return maybeEncode(dLoc.country);
   case 'countryname':
    return maybeEncode(geoflag.localeCtrys.GetStringFromName(dLoc.country));
   case 'title':
    return maybeEncode(contentDoc().title);
   case 'baselocale':
    base = true;
   case 'locale':
    let locale;
    switch (geoflag_TextTools.truncateAfterLastChar(parameter, '-'))
    {
     default:
      locale = geoflag_Tools.locale.content;
      break;
     case 'ui':
      locale = geoflag_Tools.locale.UI;
      break;
     case 'os':
      locale = geoflag_Tools.locale.OS;
      break;
     case 'page':
      locale = contentDoc().documentElement.lang;
      break;
    }
    return maybeEncode(base ? locale.split('-')[0] : locale);
   case 'meta':
    let name = parameter.slice(5);
    return maybeEncode(getMetaTag(name));
   default:
    return token;
  }
 }
 function getMetaTag(name)
 {
  if (!name)
   return '';
  if (!metaCache)
  {
   let metaTags = contentDoc().getElementsByTagName('meta');
   metaCache = new Map();
   for(let i = 0; i < metaTags.length; i++)
   {
    metaCache.set(metaTags[i].name.toLowerCase(), metaTags[i].content);
   }
  }
  let tagContent = metaCache.get(name);
  return tagContent ? tagContent : '' ;
 }
 function onIconClick(event)
 {
  function doClickAction()
  {
   let binding = null;
   if (event.button === 1 || (event.button === 0 && event.ctrlKey))
    binding = 'middleclick';
   else if (event.button === 0)
    binding = 'click';
   else
    return;
   if (event.detail === 2)
    binding = 'double' + binding;
   else if (event.detail === 3)
    binding = 'triple' + binding;
   doAction(geoflag_Actions.hotClicks[binding]);
  }
  wnd.clearTimeout(this.clickTimer);
  this.clickTimer = wnd.setTimeout(doClickAction, 250);
 }
 function onIconMouseDown(event)
 {
  if (event.button === 2 && event.ctrlKey)
   menuContentAge = -1;
 }
 function onIconHover(event)
 {
  icon.style.cursor = isActionAllowed(geoflag_Actions.hotClicks['click']) ? 'pointer' : 'default' ;
 }
 function onMenuCommand(event)
 {
  let actionID = event.target.value;
  if (event.button === 1)
   doAction(actionID, 'tabBG');
  else if (event.ctrlKey || event.shiftKey)
   doAction(actionID, (event.shiftKey ? 'win' : 'tab') + (event.ctrlKey ? 'BG' : 'FG'));
  else
   doAction(actionID);
 }
 function onMenuMouseUp(event)
 {
  if (event.button > 2)
   return;
  if (event.shiftKey)
   return;
  if (event.target.value === 'options')
   return;
  if (event.button === 1 || event.ctrlKey)
  {
   event.preventDefault();
   event.stopPropagation();
   onMenuCommand(event);
  }
 }
 function onMenuShowing(event)
 {
  updateMenuContent();
  let menuItems = menu.getElementsByTagName('menuitem');
  for (let i = 0; i < menuItems.length; i++)
  {
   menuItems[i].setAttribute('disabled', !isActionAllowed(menuItems[i].getAttribute('value')));
  }
 }
 function onKeyPressed(event)
 {
  if (event.ctrlKey || event.altKey || event.metaKey)
  {
   let boundKey = geoflag_Actions.hotKeys[event.charCode];
   if (boundKey)
    doAction(boundKey[geoflag_Actions.getModsCode(event.ctrlKey,event.altKey,event.metaKey)]);
  }
 }
 function onChangedOnlineStatus(event)
 {
  wnd.clearTimeout(this.pendingOnlineStatusUpdate);
  this.pendingOnlineStatusUpdate = wnd.setTimeout(
   function()
   {
    dLoc = null;
    menuContentAge = 0;
    updateState();
   },
   250
  );
 }
}

function GeoLocation(fromuri)
{
 this.uri = fromuri.clone();
 try
 {
  let myHost = this.uri.host;
  this.host = geoflag_TextTools.cropTrailingChar(myHost, '.');
 }
 catch(e)
 {
  if (this.uri.prePath !== 'about:')
   console.log(this.uri, e);
  this.host = '';
 }
}
GeoLocation.prototype =
{
 get url() {return this.uri.spec;},
 get protocol() {return this.uri.scheme;}
};
function GeoLocationCache(wnd)
{
 this.tabs = wnd.getBrowser().tabContainer;
 this.cache = new Map();
}
GeoLocationCache.prototype =
{
 fetch: function(dLoc)
 {
  let cached = this.cache.get(dLoc.host);
  if (!cached)
   return undefined;
  cached.uri = dLoc.uri;
  return cached;
 },
 store: function(dLoc)
 {
  if (!dLoc || !dLoc.host)
   return;
  this.cache.delete(dLoc.host);
  this.cache.set(dLoc.host,dLoc);
  this.prune();
 },
 prune: function()
 {
  let evictionCount = this.cache.size - (this.tabs.itemCount + 1);
  let lastKey;
  for (let key of this.cache.keys())
  {
   if (evictionCount > 0)
   {
    this.cache.delete(key);
    --evictionCount;
    continue;
   }
   if (lastKey)
    this.cache.get(lastKey).uri = undefined;
   lastKey = key;
  }
 }
};
