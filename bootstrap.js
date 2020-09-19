"use strict";  // Use ES5 strict mode for this file

Components.utils.import("resource://gre/modules/Services.jsm");

function startup(data,reason)
{
    Components.utils.import("chrome://flagfox/content/flagfox.jsm");

    Flagfox.startup(data);

    forEachOpenWindow(loadIntoWindow);
    Services.wm.addListener(WindowListener);
}

function shutdown(data,reason)
{
    if (reason == APP_SHUTDOWN)
        return;  // Don't do anything special on application shutdown; the following is for uninstall/disable (and thus updates as well)

    forEachOpenWindow(unloadFromWindow);
    Services.wm.removeListener(WindowListener);

    Flagfox.shutdown();  // Also unloads IPDB

    // WARNING: JSM files need to NOT be inside a JAR; the JAR cache does not properly clear on addon update
    Components.utils.unload("chrome://flagfox/content/flagfox.jsm");
    Components.utils.unload("chrome://flagfox/content/ipdb.jsm");
    Components.utils.unload("chrome://flagfox/content/portableprefs.jsm");
    Components.utils.unload("chrome://flagfox/content/textutil.jsm");

    // HACK WARNING: The Addon Manager does not properly clear all addon related caches on update;
    //               in order to fully update images and locales, their caches need clearing here
    Services.obs.notifyObservers(null, "chrome-flush-caches", null);
}

function install(data,reason) { }

function uninstall(data,reason) { }

function loadIntoWindow(window)
{
    Flagfox.load(window);
}

function unloadFromWindow(window)
{
    var event = window.document.createEvent("Event");
    event.initEvent("flagfox-unload",false,false);
    window.dispatchEvent(event);
}

function forEachOpenWindow(fn)  // Apply a function to all open browser windows
{
    var windows = Services.wm.getEnumerator("navigator:browser");
    while (windows.hasMoreElements())
        fn(windows.getNext().QueryInterface(Components.interfaces.nsIDOMWindow));
}

var WindowListener =
{
    onOpenWindow: function(xulWindow)
    {
        var window = xulWindow.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                              .getInterface(Components.interfaces.nsIDOMWindow);
        function onWindowLoad()
        {
            window.removeEventListener("load",onWindowLoad);
            if (window.document.documentElement.getAttribute("windowtype") == "navigator:browser")
                loadIntoWindow(window);
        }
        window.addEventListener("load",onWindowLoad);
    },

    onCloseWindow: function(xulWindow) { },  // Each window has its own unload event handler

    onWindowTitleChange: function(xulWindow, newTitle) { }
};
