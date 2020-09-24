Components.utils.import('resource://gre/modules/AddonManager.jsm');

var geoFlagOverlay = {
 cleanup: false,
 init: function()
 {
  geoflag_IPDB.load(window);
  geoflag.init();
  geoflag.load(window);
  let nob = Components.classes['@mozilla.org/observer-service;1'].getService(Components.interfaces.nsIObserverService)
  nob.addObserver(geoFlagOverlay, 'quit-application-granted', null);
  AddonManager.addAddonListener(
   {
    onUninstalling: function(addon)
    {
     if(addon.id === '{76843B06-C8C5-5088-90C5-679EA2F00123}')
      geoFlagOverlay.cleanup = true;
    },
    onOperationCancelled: function(addon)
    {
     if(addon.id === '{76843B06-C8C5-5088-90C5-679EA2F00123}')
      geoFlagOverlay.cleanup = false;
    }
   }
  );
 },
 observe: function(subject, topic, data)
 {
  if (topic !== 'quit-application-granted')
   return;
  if (!geoFlagOverlay.cleanup)
   return;
  geoflag.Prefs.clearUserPref('db.v4.meta');
  geoflag.Prefs.clearUserPref('db.v6.meta');
  let fRem = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
  fRem.initWithPath(geoflag_IPDB.profPath);
  for (let d = 0; d < geoflag_IPDB.dataPath.length; d++)
  {
   fRem.appendRelativePath(geoflag_IPDB.dataPath[d]);
  }
  if (fRem.exists())
   fRem.remove(true);
 }
};
window.addEventListener('load', geoFlagOverlay.init, false);
