"use strict";  // Use ES5 strict mode for this file

const EXPORTED_SYMBOLS = ["prefs"];  // Only symbol to be exported on Components.utils.import() for this file

Components.utils.import("resource://gre/modules/Services.jsm");

const FlagfoxPrefBranchName = "extensions.flagfox.";
const FlagfoxPrefBranch = Services.prefs.getBranch(FlagfoxPrefBranchName);
const FlagfoxDefaultPrefBranch = Services.prefs.getDefaultBranch(FlagfoxPrefBranchName);

var webExtensionPort = null;

var useWebExtPrefSys = undefined;
var suppressOldPrefEvents = false;

var defaultPrefData = new Map([
    ["useractions","[]"],  // Fetched seperately (async)
    ["maxflagwidth",26],
    ["showfavicons",true],
    ["openlinksin","tabFG"],
    ["warn.proxy","enabled"],
    ["warn.stale","enabled"],
    ["warn.tld","once"]
]);

var userPrefData = new Map();

var listeners = new Set();  // Keep track of listeners here so prefs.set can also trigger an event

var oldPrefListener = null;

// The prefs backend to use can be forced by setting extensions.flagfox.FORCE_OLD_PREF_SYS in about:config.
// No default value is set for this pref; it's a hidden switch that must be set manually, and primarily exists for debugging.
// WARNING: If left on after full transition to WebExtension, old prefs will be effectively lost due to lack of any API to access them.
const forceOldPrefSysPrefName = "FORCE_OLD_PREF_SYS";

function shouldUseWebExtPrefSys()
{
    return !getOldPref(forceOldPrefSysPrefName)
        && Services.vc.compare(Services.appinfo.platformVersion,"52.0") >= 0  // Don't attempt to migrate in Gecko < 52.0 (ESR)
        && Services.appinfo.ID == "{ec8030f7-c20a-464f-9b0e-13a3a9e97384}";   // Restrict to Firefox, for now, as SeaMonkey's WebExtension handling is broken (not just missing)
}

var prefs =
{
    load : function(webExtension, onLoadedCallback)
    {
        function onLoaded()
        {
            oldPrefListener = new nsIPrefServiceListener(onOldPrefChanged);
            onLoadedCallback();
        }
        useWebExtPrefSys = (webExtension && shouldUseWebExtPrefSys());
        if (useWebExtPrefSys)
        {
            webExtension.startup().then(function(api) {
                api.browser.runtime.onConnect.addListener(function(port) {
                    webExtensionPort = port;
                    if (prefs.portPrefs()) {
                        onLoaded();
                        return;  // Just ported and saved to WebExtension storage for the first time; don't need to load it
                    }
                    webExtensionPort.onMessage.addListener(function(msg) {
                        if (msg.type != "fetched")
                            return;
                        webExtensionPort.onMessage.removeListener(this);
                        if (msg.data) {
                            for (let name in msg.data) {
                                setUserPrefData(name, msg.data[name]);
                                notifyListeners(name);  // Inform listeners registered during the async load time (e.g. loaded windows could only get defaults until this point)
                            }
                        }
                        onLoaded();
                    });
                    webExtensionPort.postMessage({type:"fetch"});
                });
            });
        }
        else  // Use nsIPrefService
        {
            for (let name of defaultPrefData.keys()) {
                setOldDefaultPref(name, defaultPrefData.get(name));  // Populate default prefs for about:config & etc. if still using old system
                setUserPrefData(name, getOldPref(name));
            }
            onLoaded();
        }
    },

    unload : function()
    {
        if (oldPrefListener)
            oldPrefListener.unregister();
        defaultPrefData.clear();
        userPrefData.clear();
        listeners.clear();
        webExtensionPort = null;  // Disconnected automatically on shutdown; running webExtensionPort.disconnect() throws an error at this point
        oldPrefListener = null;
        defaultPrefData = null;
        userPrefData = null;
        listeners = null;
    },

    isWebExtPrefSysInUse : function()
    {
        return useWebExtPrefSys && webExtensionPort;
    },

    portPrefs : function()  // Attempt to port prefs from old system to new; overwrites entire WebExtension storage and returns true on success
    {
        var found = false;
        for (let name of defaultPrefData.keys()) {
            if (FlagfoxPrefBranch.prefHasUserValue(name)) {
                found = true;
                setUserPrefData(name, getOldPref(name));
                suppressOldPrefEvents = true;
                FlagfoxPrefBranch.clearUserPref(name);
                suppressOldPrefEvents = false;
                notifyListeners(name);  // Suppress clear events from nsIPrefService but send update events from here (for listeners registered during async load)
            }
        }
        if (found)
        {
            prefs.reset("warn.stale", true);  // Reset out-of-date IPDB version detection notification once, on upgrade to Flagfox 5.2
            prefs.save();
            Services.console.logStringMessage("Flagfox 5.1 prefs ported to WebExtension storage");
        }
        return found;
    },

    cacheDefaultActionsPref : function(defaultValue)
    {
        defaultPrefData.set("useractions", defaultValue);
        if (!useWebExtPrefSys)
            setOldDefaultPref("useractions", defaultValue);
    },

    save : function()  // Save prefs to whatever pref store is currently in use
    {
        if (prefs.isWebExtPrefSysInUse())
        {
            var dataToStore = {};
            for (let name of userPrefData.keys())  // WebExtension storage prefs that have been reset to default are simply dropped
                dataToStore[name] = userPrefData.get(name);
            webExtensionPort.postMessage({type:"store", data:dataToStore});
        }
        else  // Use nsIPrefService
        {
            suppressOldPrefEvents = true;  // Avoid pref listener reloading stuff it doesn't need to
            for (let name of defaultPrefData.keys())  // nsIPrefService prefs that have been reset to default must be cleared (will get as undefined and be cleared on set)
                setOldPref(name, userPrefData.get(name));
            suppressOldPrefEvents = false;
        }
    },

    revertToOldPrefSys : function()
    {
        if (!prefs.isWebExtPrefSysInUse())  // Shouldn't happen, but check just in case
            throw Error("New pref system not in use!");
        useWebExtPrefSys = false;                                // Disable new system
        suppressOldPrefEvents = true;
        setOldPref(forceOldPrefSysPrefName, true);               // Set override pref to true to persist setting
        for (let name of defaultPrefData.keys())
        {
            setOldDefaultPref(name, defaultPrefData.get(name));  // Populate default prefs
            setOldPref(name, userPrefData.get(name));            // Store loaded user prefs
        }
        suppressOldPrefEvents = false;
        webExtensionPort.postMessage({type:"store", data:{}});   // Wipe WebExtension storage
        webExtensionPort.disconnect();                           // Close the port
        webExtensionPort = null;                                 // The embedded WebExtension is still techncially running, but disabled; restart required to re-enable
    },

    get : function(name)
    {
        const currentValue = userPrefData.get(name);
        return (currentValue !== undefined) ? currentValue : defaultPrefData.get(name) ;
    },

    set : function(name, value, forceNoEvent=false)
    {
        setUserPrefData(name, value);

        if (!forceNoEvent)
            notifyListeners(name);

        prefs.save();
    },

    reset : function(name, forceNoEvent=false)
    {
        prefs.set(name, null, forceNoEvent);
        return prefs.get(name);
    },

    hasUserValue : function(name)
    {
        return userPrefData.has(name);
    },

    registerListener : function(onChanged)
    {
        return new cachedPrefListener(onChanged);
    },

    dumpString : function()
    {
        var output = [];
        for (let name of defaultPrefData.keys())
            output.push(name + "=" + prefs.get(name));
        return output.join("\n");
    },

    old :  // Mostly needed for old pref migration
    {
        getPrefByFullName : function(name, throwOnFail=false)
        {
            const value = getOldPref(name, Services.prefs);
            if (value === undefined && throwOnFail)
                throw Error("Pref not found");
            else
                return value;
        },

        setPrefByFullName : function(name, value)
        {
            setOldPref(name, value, Services.prefs);
        },

        deletePrefBranch : function(branchName)  // Deletes both user and default branches at the same time
        {
            if (!branchName || branchName.length < 8 || branchName[branchName.length-1] != ".")
                throw Error("Bogus branch delete attempt!");
            try { Services.prefs.getDefaultBranch(branchName).deleteBranch(""); } catch (e) {}
        }
    }
};

function setUserPrefData(name, value)  // Sets a value in userPrefData only if it differs from the value in defaultPrefData; value=null clears
{
    if (value === defaultPrefData.get(name) || (!value && value !== false))
        userPrefData.delete(name);  // Clear the current value if one exists and let get() use the default value
    else
        userPrefData.set(name, value);
}

const sStringType = Components.interfaces.nsISupportsString;

function getOldPref(name, branch=FlagfoxPrefBranch)  // Get any pref without needing to know its type
{
    switch (branch.getPrefType(name))
    {
        default:
        case 0:   // PREF_INVALID (doesn't exist)
            return undefined;
        case 32:  // PREF_STRING
            return branch.getComplexValue(name,sStringType).data;  // Gunk needed to handle Unicode
        case 64:  // PREF_INT
            return branch.getIntPref(name);
        case 128: // PREF_BOOL
            return branch.getBoolPref(name);
    }
}

function setOldPref(name, value, branch=FlagfoxPrefBranch)
{
    switch (typeof value)
    {
        case "undefined":
            branch.clearUserPref(name);
            return;
        case "string":
            var string = Components.classes["@mozilla.org/supports-string;1"]  // Yet more gunk needed to handle Unicode
                                   .createInstance(sStringType);
            string.data = value;
            branch.setComplexValue(name,sStringType,string);
            return;
        case "number":
            branch.setIntPref(name,value);
            return;
        case "boolean":
            branch.setBoolPref(name,value);
            return;
    }
    throw Error("Bogus pref type for: " + name);
}

function setOldDefaultPref(name, value)
{
    setOldPref(name, value, FlagfoxDefaultPrefBranch);
}

function onOldPrefChanged(name)  // Called when nsIPrefServiceListener fires an update event; only happens if a pref is changed outside of Flagfox, e.g. about:config
{
    if (defaultPrefData.has(name))                // Don't reload anything not being cached (e.g. "FORCE_OLD_PREF_SYS")
    {
        setUserPrefData(name, getOldPref(name));  // Update the cached prefs with the new value
        notifyListeners(name);                    // Notify the regular listeners
        if (useWebExtPrefSys)
            prefs.save();                         // If the new pref sys is enabled, then save to it; if not, it's already saved
    }
    else if (name == forceOldPrefSysPrefName)     // WARNING: This is mildly hideous, but not general-user-facing; just for debugging
    {
        const usingNewPrefSys = prefs.isWebExtPrefSysInUse();
        const forceOldPrefSys = (getOldPref(forceOldPrefSysPrefName) === true);  // No default exists; must always be set manually
        if (usingNewPrefSys && forceOldPrefSys)
        {
            prefs.revertToOldPrefSys();  // Recreates old nsIPrefService prefs based on loaded prefs currently stored in the WebExtension storage
            Services.console.logStringMessage("Flagfox reverted from WebExtension storage to nsIPrefService (about:config)");
            Services.console.logStringMessage("WARNING: WebExtension-only browser versions cannot import old prefs! Import is REQUIRED to not lose prefs on upgrade.");
        }
        else if (!(usingNewPrefSys || forceOldPrefSys))  // === (!usingNewPrefSys && !forceOldPrefSys)
        {
            Components.utils
                      .import("chrome://flagfox/content/flagfox.jsm",{})
                      .restartFlagfox();  // If reverting the revert, then we need to reload Flagfox; normal migration will kick in and port back to WebExtension storage
        }
    }
}

function nsIPrefServiceListener(onChanged)  // nsIPrefService listener class
{
    FlagfoxPrefBranch.addObserver("", this, false);
    this.unregister = function() {
        FlagfoxPrefBranch.removeObserver("", this);
    };
    this.observe = function(subject, topic, name) {
        if (topic == "nsPref:changed" && !suppressOldPrefEvents)
            onChanged(name);
    };
}

function cachedPrefListener(onChanged)  // portableprefs.jsm pref listener class; notifies on changes to prefs cached in this file
{
    listeners.add(this);
    this.unregister = function() {
        this.observe = null;
        listeners.delete(this);
    };
    this.observe = onChanged;
}

function notifyListeners(name)
{
    for (let listener of listeners.values())
        listener.observe(name);
}
