/*
 * Original Source:
 * Flagfox v5.2.11
 * Copyright 2007-2017, David Garrett
 * All rights reserved
 *
 * Modified Sept 24, 2020 for GeoFlag
 * See LICENSE for details.
 */
var geoflag_DNS = {
 resolve: function(uri, returnIP)
 {
  let requestWrapper =
  {
   _currentRequest: null,
   set: function(request)
   {
    requestWrapper._currentRequest = request;
   },
   cancel: function(reason = Components.results.NS_ERROR_ABORT)
   {
    try
    {
     requestWrapper._currentRequest.cancel(reason);
    }
    catch(e) {console.log(e);}
   }
  };
  let cbProxy =
  {
   onProxyAvailable: function(_request, _uri, proxyinfo, status)
   {
    if (status === Components.results.NS_ERROR_ABORT)
     return;
    if ((proxyinfo !== null) && (proxyinfo.flags & proxyinfo.TRANSPARENT_PROXY_RESOLVES_HOST))
    {
     returnIP('PROXY');
     return;
    }
    let curThread = Components.classes['@mozilla.org/thread-manager;1'].getService(Components.interfaces.nsIThreadManager).currentThread;
    let dResolved = Components.classes['@mozilla.org/network/dns-service;1'].getService(Components.interfaces.nsIDNSService).asyncResolve(uri.host, 0, cbLookup, curThread);
    requestWrapper.set(dResolved);
   }
  };
  let cbLookup =
  {
   onLookupComplete : function(_request, dnsrecord, status)
   {
    if (status === Components.results.NS_ERROR_ABORT)
     return;
    if (status !== 0 || !dnsrecord || !dnsrecord.hasMore())
    {
     returnIP('FAIL');
     return;
    }
    returnIP(dnsrecord.getNextAddrAsString());
   }
  };
  let pResolved = Components.classes['@mozilla.org/network/protocol-proxy-service;1'].getService(Components.interfaces.nsIProtocolProxyService).asyncResolve(uri, 0, cbProxy);
  requestWrapper.set(pResolved);
  return requestWrapper;
 }
};
