/*
 * Original Source:
 * Flagfox v5.2.11
 * Copyright 2007-2017, David Garrett
 * All rights reserved
 *
 * Modified Sept 24, 2020 for GeoFlag
 * See LICENSE for details.
 */
var geoflag_Tools =
{
 blankAddressPages: new Set(['about:blank', 'about:newtab', 'about:privatebrowsing', 'about:home', 'about:sessionrestore']),
 locationErrors: new Set(['unknownsite', 'lookuperror', 'nodnserror', 'offlinemode']),
 deferUpdate: false,
 getFaviconForTemplate: function(template)
 {
  try
  {
   switch (geoflag_TextTools.truncateBeforeFirstChar(template, ':'))
   {
    case 'formfield':
     template = template.slice(10).split('|')[0];
     break;
    case 'copystring':
     return 'chrome://geoflag/skin/icons/copy.png';
    case 'javascript':
    case 'data':
     return 'chrome://geoflag/skin/icons/special/script.png';
    case 'about':
     return 'chrome://geoflag/skin/icons/special/about.png';
    case 'chrome':
    case 'resource':
    case 'moz-icon':
    case 'moz-extension':
     return 'chrome://geoflag/skin/icons/special/resource.png';
    case 'file':
     return 'chrome://geoflag/skin/icons/special/localfile.png';
   }
   if (!geoflag.Prefs.getBoolPref('showfavicons'))
    return 'chrome://geoflag/skin/icons/default.png';
   if (!template.includes('://'))
    template = 'http://' + template;
   let uri = Components.classes['@mozilla.org/network/io-service;1'].getService(Components.interfaces.nsIIOService).newURI(template, null, null);
   uri.host = uri.host.replace(/\{[^{}\s]+\}\.?/gi, '');
   if (uri.host === 'realityripple.com')
   {
    if (uri.filePath === '/test.php')
     uri.path = 'test.ico';
    else
     uri.path = uri.path.substring(0, uri.path.lastIndexOf('/') + 1) + 'favicon.ico';
   }
   else if (uri.host === 'archive.org' || uri.host.indexOf('.archive.org') > -1)
   {
    uri.host = 'archive.org';
    uri.path = 'favicon.ico';
   }
   else if (uri.host === 'validator.w3.org' || uri.host === 'securityheaders.com')
    uri.path = 'images/favicon.ico';
   else if (uri.host === 'www.wormly.com')
    uri.path = 'favico2.ico';
   else if (uri.host === 'intodns.com')
    uri.path = 'static/images/favicon.ico';
   else if (uri.host === 'sitereport.netcraft.com')
   {
    uri.host = 'static.netcraft.com';
    uri.path = 'images/favicon.ico'
   }
   else
    uri.path = 'favicon.ico';
   return uri.spec;
  }
  catch (e)
  {
   return 'chrome://geoflag/skin/icons/default.png';
  }
 },
 getCachedFaviconForTemplate: async function(template)
 {
  try
  {
   switch (geoflag_TextTools.truncateBeforeFirstChar(template, ':'))
   {
    case 'formfield':
     template = template.slice(10).split('|')[0];
     break;
    case 'copystring':
     return 'chrome://geoflag/skin/icons/copy.png';
    case 'javascript':
    case 'data':
     return 'chrome://geoflag/skin/icons/special/script.png';
    case 'about':
     return 'chrome://geoflag/skin/icons/special/about.png';
    case 'chrome':
    case 'resource':
    case 'moz-icon':
    case 'moz-extension':
     return 'chrome://geoflag/skin/icons/special/resource.png';
    case 'file':
     return 'chrome://geoflag/skin/icons/special/localfile.png';
   }
   if (!geoflag.Prefs.getBoolPref('showfavicons'))
    return 'chrome://geoflag/skin/icons/default.png';
   if (!template.includes('://'))
    template = 'http://' + template;
   let uri = Components.classes['@mozilla.org/network/io-service;1'].getService(Components.interfaces.nsIIOService).newURI(template, null, null);
   uri.host = uri.host.replace(/\{[^{}\s]+\}\.?/gi, '');
   if (uri.host === 'realityripple.com')
   {
    if (uri.filePath === '/test.php')
     uri.path = '/test.ico';
    else
     uri.path = uri.path.substring(0, uri.path.lastIndexOf('/') + 1) + 'favicon.ico';
   }
   else if (uri.host === 'archive.org' || uri.host.indexOf('.archive.org') > -1)
   {
    uri.host = 'archive.org';
    uri.path = 'favicon.ico';
   }
   else if (uri.host === 'validator.w3.org' || uri.host === 'securityheaders.com')
    uri.path = 'images/favicon.ico';
   else if (uri.host === 'www.wormly.com')
    uri.path = 'favico2.ico';
   else if (uri.host === 'intodns.com')
    uri.path = 'static/images/favicon.ico';
   else if (uri.host === 'sitereport.netcraft.com')
   {
    uri.host = 'static.netcraft.com';
    uri.path = 'images/favicon.ico'
   }
   else
    uri.path = 'favicon.ico';
   let showIcon = await geoflag_IconDB.read(uri.spec);
   if (showIcon !== false)
    return showIcon;
   showIcon = await geoflag_IconDB.loadIcon(uri.spec);
   if (showIcon === false)
    return 'chrome://geoflag/skin/icons/default.png';
   await geoflag_IconDB.write(uri.spec, showIcon);
   return showIcon;
  }
  catch (e)
  {
   return 'chrome://geoflag/skin/icons/default.png';
  }
 },
 warning: function(wnd, type, message, msgID = type)
 {
  const messagePrefName = 'warn.' + type;
  const messagePrefValue = geoflag.Prefs.getCharPref(messagePrefName);
  if (messagePrefValue === 'disabled')
   return;
  if (!geoflag.shownWarnings)
   geoflag.shownWarnings = new Set();
  if (geoflag.shownWarnings.has(msgID))
   return;
  geoflag.shownWarnings.add(msgID);
  let notificationBox = wnd.getBrowser().getNotificationBox();
  const XULNS = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';
  let notification = wnd.document.createElementNS(XULNS, 'notification');
  if (type === 'update')
  {
   notification.setAttribute('type', 'info');
   notification.setAttribute('priority', notificationBox.PRIORITY_INFO_MEDIUM);
   notification.setAttribute('image', 'chrome://geoflag/skin/icons/default.png');
  }
  else
  {
   notification.setAttribute('type', 'warning');
   notification.setAttribute('priority', notificationBox.PRIORITY_WARNING_MEDIUM);
   notification.setAttribute('image', 'chrome://geoflag/skin/icons/help.png');
  }
  notification.setAttribute('label', message);
  let chkbox = wnd.document.createElementNS(XULNS, 'checkbox');
  if (messagePrefValue === 'once')
  {
   chkbox.setAttribute('checked', true);
   geoflag.Prefs.setCharPref(messagePrefName, 'disabled');
  }
  function onCheckboxToggled(evt)
  {
   geoflag.Prefs.setCharPref(messagePrefName, evt.target.checked ? 'disabled' : 'enabled');
  }
  let firstUpdate = false;
  geoflag_Tools.deferUpdate = false;
  function onButtonClicked(evt)
  {
   if (notificationBox.currentNotification === notification)
    notificationBox.removeNotification(notification);
   let deferring = geoflag_Tools.deferUpdate;
   geoflag_Tools.deferUpdate = false;
   let old4 = geoflag_IPDB._Prefs.getCharPref('v4.url');
   let old6 = geoflag_IPDB._Prefs.getCharPref('v6.url');
   wnd.openDialog('chrome://geoflag/content/ipdb.xul', 'GeoFlagDB', 'chrome,dialog,centerscreen,modal');
   let new4 = geoflag_IPDB._Prefs.getCharPref('v4.url');
   let new6 = geoflag_IPDB._Prefs.getCharPref('v6.url');
   if (deferring || old4 !== new4)
   {
    geoflag_IPDB.reset4(new4);
    if (geoflag.shownWarnings.has(msgID))
     geoflag.shownWarnings.delete(msgID);
    wnd.setTimeout(function(){wnd.geoflag_IPDB.update4(wnd);}, 400);
   }
   if (deferring || old6 !== new6)
   {
    geoflag_IPDB.reset6(new6);
    if (geoflag.shownWarnings.has(msgID))
     geoflag.shownWarnings.delete(msgID);
    wnd.setTimeout(function(){wnd.geoflag_IPDB.update6(wnd);}, 600);
   }
  }
  chkbox.addEventListener('command', onCheckboxToggled);
  chkbox.setAttribute('label', geoflag.localeGeneral.GetStringFromName('warnchecklabel'));
  notification.appendChild(chkbox);
  if (message === geoflag.localeGeneral.GetStringFromName('firstupdatewarnmessage') || type.substring(0, 12) === 'update_error')
  {
   if (message === geoflag.localeGeneral.GetStringFromName('firstupdatewarnmessage'))
   {
    firstUpdate = true;
    geoflag_Tools.deferUpdate = true;
   }
   let cfg = wnd.document.createElementNS(XULNS, 'button');
   cfg.addEventListener('command', onButtonClicked);
   cfg.setAttribute('label', geoflag.localeGeneral.GetStringFromName('firstupdatebutton'));
   notification.appendChild(cfg);
  }
  notification.setAttribute('persistence', 100);
  wnd.setTimeout(function() {notification.removeAttribute('persistence');}, 5000);
  notificationBox.appendChild(notification);
  if (notificationBox._showNotification)
   notificationBox._showNotification(notification, true);
  let evt = wnd.document.createEvent('Events');
  evt.initEvent('AlertActive', true, true);
  notification.dispatchEvent(evt);
  if (type === 'update')
  {
   if (firstUpdate)
    wnd.setTimeout(function() {if (notificationBox.currentNotification === notification) notificationBox.removeNotification(notification); geoflag_Tools.doDeference(wnd);}, 10000);
   else
    wnd.setTimeout(function() {if (notificationBox.currentNotification === notification) notificationBox.removeNotification(notification);}, 10000);
  }
 },
 doDeference: function(wnd)
 {
  if (geoflag_Tools.deferUpdate)
  {
   wnd.setTimeout(function(){wnd.geoflag_IPDB.update4(wnd);}, 400);
   wnd.setTimeout(function(){wnd.geoflag_IPDB.update6(wnd);}, 600);
  }
 },
 addTabInCurrentBrowser: function(url)
 {
  let currentWindow = Components.classes['@mozilla.org/appshell/window-mediator;1'].getService(Components.interfaces.nsIWindowMediator).getMostRecentWindow('navigator:browser');
  currentWindow.focus();
  let currentBrowser = currentWindow.getBrowser();
  currentBrowser.selectedTab = currentBrowser.addTab(url);
 },
 escapeQuotes: function(string)
 {
  return String(string).replace(/\\/g,"\\\\").replace(/\'/g,"\\\'").replace(/\"/g,"\\\"");
 },
 locale:
 {
  _clean: function(code)
  {
   return String(code).replace('_', '-').toLowerCase();
  },
  get content()
  {
   try
   {
    let gPrefs = Components.classes['@mozilla.org/preferences-service;1'].getService(Components.interfaces.nsIPrefService).getBranch('intl.')
    let accept_languages = null;
    try
    {
     accept_languages = gPrefs.getComplexValue('accept_languages', Components.interfaces.nsIPrefLocalizedString).data;
    }
    catch(e)
    {
     console.log(e);
     accept_languages = gPrefs.getCharPref('accept_languages');
    }
    return geoflag_Tools.locale._clean(/^[^\s,;]{2,}/.exec(accept_languages)[0]);
   }
   catch(e)
   {
    console.log(e);
    return 'en';
   }
  },
  get UI()
  {
   return geoflag_Tools.locale._clean(Components.classes['@mozilla.org/chrome/chrome-registry;1'].getService(Components.interfaces.nsIXULChromeRegistry).getSelectedLocale('global'));
  },
  get OS()
  {
   return geoflag_Tools.locale._clean(Components.classes['@mozilla.org/intl/nslocaleservice;1'].getService(Components.interfaces.nsILocaleService).getSystemLocale().getCategory('NSILOCALE_MESSAGES'));
  }
 }
};
