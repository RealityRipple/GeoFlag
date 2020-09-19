"use strict";  // Use ES5 strict mode for this file

const EXPORTED_SYMBOLS = ["Flagfox"];  // Only symbol to be exported on Components.utils.import() for this file

Components.utils.import("resource://gre/modules/Services.jsm");

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");  // Currently only used for the lazy service/strings/module getters defined immediately below

XPCOMUtils.defineLazyServiceGetter(this, "dnsService", "@mozilla.org/network/dns-service;1", Components.interfaces.nsIDNSService);
XPCOMUtils.defineLazyServiceGetter(this, "proxyService", "@mozilla.org/network/protocol-proxy-service;1", Components.interfaces.nsIProtocolProxyService);
XPCOMUtils.defineLazyServiceGetter(this, "httpService", "@mozilla.org/network/protocol;1?name=http", Components.interfaces.nsIHttpProtocolHandler);

const sessionStartTime = Date.now();

// Load strings files on first use
XPCOMUtils.defineLazyGetter(this, "strings", function() { return Services.strings.createBundle(safeCachePath("chrome://flagfox/locale/flagfox.properties")); });
XPCOMUtils.defineLazyGetter(this, "helpstrings", function() { return Services.strings.createBundle(safeCachePath("chrome://flagfox/locale/help.properties")); });
XPCOMUtils.defineLazyGetter(this, "countrynames", function() { return Services.strings.createBundle(safeCachePath("chrome://flagfox/locale/countrynames.properties")); });

// Load ipdb.jsm on first use
// Individual IPDB files are each loaded automatically on first use
XPCOMUtils.defineLazyModuleGetter(this, "ipdb", "chrome://flagfox/content/ipdb.jsm");

// Load portableprefs.jsm on first use
XPCOMUtils.defineLazyModuleGetter(this, "prefs", "chrome://flagfox/content/portableprefs.jsm");

// Load textutil.jsm now, and import custom string methods/polyfill into this file's scope
Components.utils.import("chrome://flagfox/content/textutil.jsm");
textutil.importExtraStringMethodsIntoScope(this);

var FlagfoxVersion = "5.2.x";  // Fetched on startup in bootstrap.js; value here is a fallback

const FlagfoxAddonID = "{1018e4d6-728f-4b20-ad56-37578a4de76b}";

var mainPrefListener = null;
var warningsThisSession = null;

var hotKeys = {};
var hotClicks = {};

var actionsList = null;  // Loaded actions list (array of {name, template} with optional properties {iconclick, hotkey, show, custom})
var actionsListAge = 0;

//// Main Flagfox object (only variable exported out of this file) //////////////////////////////////////////////////////////////////////////////////////////////////////
var Flagfox =
{
    startup : function(addonData)  // Initial addon startup (called from bootstrap.js:startup() once)
    {
        FlagfoxVersion = addonData.version;  // Get and cache current Flagfox version string

        ipdb.load();  // async load metadata now; will async load each database file on-demand

        // Point extension description to the localized version (still the best method to handle all supported versions)
        Services.prefs.getDefaultBranch("").setCharPref("extensions."+FlagfoxAddonID+".description","chrome://flagfox/locale/flagfox.properties");

        migrateOldFlagfox4Prefs();  // Do Flagfox 4 pref migration before loading prefs
        clearOldSyncPrefs();        // Clear these, if for some reason one is on; TODO: Add support for sync using WebExtension storage.sync

        prefs.load(addonData.webExtension, function onLoaded() {  // Load prefs handler; will do nsIPrefService or WebExtension storage depending on availability
            Flagfox.actions.load();  // async load for this too; will kick off old pref migration, once loaded
            mainPrefListener = prefs.registerListener(onGlobalPrefChange);
        });

        Services.obs.addObserver(memoryPressureObserver, "memory-pressure", false);
    },

    shutdown : function()  // Final addon shutdown (called from bootstrap.js:shutdown() once)
    {
        Services.obs.removeObserver(memoryPressureObserver, "memory-pressure", false);

        ipdb.close();

        prefs.unload();  // Also unregisters all listeners
    },

    load : function(window)
    {
        // Load the flag icon for this window
        try { newFlagInstance(window); }
        catch (e) { Flagfox.error("Error loading icon for window",e); }
    },

    actions :
    {
        load : function()
        {
            // Load default actions from JSON file
            textutil.loadTextFile("chrome://flagfox/content/defaultactions.json", function(defaultActionsJSONtext) {
                if (!defaultActionsJSONtext)
                {
                    Flagfox.error("Could not load default Flagfox actions file!");
                    return;
                }

                try
                {
                    const defaultActionsList = JSON.parse(defaultActionsJSONtext);

                    // Cache the packed default actions so that the prefs system can compare it to saved user prefs, and not save any actual data if they match
                    prefs.cacheDefaultActionsPref(packActionsJSON(defaultActionsList));

                    var updatesApplied = {};

                    if (prefs.hasUserValue("useractions"))
                        actionsList = unpackActionsJSON(defaultActionsList, prefs.get("useractions"), updatesApplied);
                    else
                        actionsList = defaultActionsList;  // If using defaults, just get directly from loaded unpacked JSON rather than unpacking pref

                    if (updatesApplied.value)
                        Flagfox.actions.save();  // If any default actions have been updated, save them (also refreshes)
                    else
                        Flagfox.actions.refresh();

                    migrateOldFlagfox3Action();  // If this is still lingering around for some strange reason, then import it now
                    maybeClearAllOldPrefs();     // If fully migrated to new pref backend, then cleanup the old one now
                }
                catch (e) { Flagfox.error("Error loading actions list",e); }
            });
        },

        save : function()
        {
            Flagfox.actions.refresh();  // Apply any new bindings and resync IDs if any have changed

            prefs.set("useractions", packActionsJSON(actionsList), true);  // Set pref and suppress its update event
        },

        refresh : function()  // Makes changes to actions list take effect; must Flagfox.actions.save() to make changes persist after application close
        {
            actionsListAge = Date.now();  // Make context menus refresh on next open

            hotKeys = {};
            hotClicks = {};

            Flagfox.actions.assertLoaded();

            actionsList.forEach(function(action,index)  // Refresh all keyboard and icon click shortcuts
            {
                if (action.hotkey)
                {
                    let key = action.hotkey.key;
                    let mods = action.hotkey.mods;
                    let charCode = (mods.includes("shift") ? key.toUpperCase() : key.toLowerCase()).charCodeAt(0);
                    if (!hotKeys[charCode])
                        hotKeys[charCode] = {};
                    hotKeys[charCode][getModsCode(mods.includes("ctrl"), mods.includes("alt"), mods.includes("meta"))] = index;
                }
                if (action.iconclick)
                {
                    hotClicks[action.iconclick] = index;
                }
            });
        },

        setBindings : function(id,newclick,newhotkey)  // Must actions.save() after setting (which will also actions.refresh() to make them active)
        {
            Flagfox.actions.assertLoaded();

            var action = actionsList[id];
            Flagfox.actions.assertValid(action);

            if (newclick == "")
                newclick = undefined;

            // Unset existing bindings first, if needed
            if (newclick)
                for (let i in actionsList)
                    if (actionsList[i].iconclick == newclick)
                        actionsList[i].iconclick = undefined;
            if (newhotkey)
                for (let i in actionsList)
                    if (actionsList[i].hotkey && actionsList[i].hotkey.key == newhotkey.key && actionsList[i].hotkey.mods == newhotkey.mods)
                        actionsList[i].hotkey = undefined;

            // Set new bindings (undefined clears; null leaves alone)
            if (newclick !== null)
                action.iconclick = newclick;
            if (newhotkey !== null)
                action.hotkey = newhotkey;
        },

        getLocalizedName : function(action)
        {
            try {
                if (!action.custom)  // Must be a default to have a localization
                    return strings.GetStringFromName( "action." + action.name.replace(/[ :]/g,"_").toLowerCase() );
            } catch (e) {}
            return action.name;
        },

        assertLoaded : function()
        {
            if (!actionsList || !actionsList.length)
                throw Error("Actions not loaded!");
        },

        assertValid : function(action)
        {
            if (!action || !action.name || !action.template)
                throw Error("Invalid action: " + JSON.stringify(action));
        },

        getByID : function(id) { return actionsList[id]; },  // Get an action by its current ID (position in array); IDs will change if an action is reordered

        create : function() { return actionsList.push({custom:true})-1; },                // Create a new custom action at the end of the array and return its ID
        remove : function(id) { return actionsList.splice(id,1)[0]; },                    // Remove an action from the array and return the removed action
        insert : function(id,action) { actionsList.splice(id,0,action); },                // Insert an action into the array at a specific ID
        append : function(newactions) { actionsList = actionsList.concat(newactions); },  // Append an array of new actions onto the end of the existing array

        get length() { return actionsList.length; }
    },

    getFaviconForTemplate : function(template)
    {
        try
        {
            switch (template.truncateBeforeFirstChar(":"))
            {
                case "formfield":  // Paste into form field pseudo-protocol; extract URL portion to get favicon
                    template = template.slice(10).split("|")[0];
                    break;
                case "copystring":
                    return getIconPath("copy");  // Copy to clipboard pseudo-protocol
                case "javascript":  case "data":
                    return getIconPath("special/script");
                case "about":
                    return getIconPath("special/about");
                case "chrome":  case "resource":  case "moz-icon":  case "moz-extension":
                    return getIconPath("special/resource");
                case "file":
                    return getIconPath("special/localfile");
            }

            if (!prefs.get("showfavicons"))
                return getIconPath("default");  // If favicons are disabled, and no other generic icon was found, then use default icon

            if (!template.includes("://"))
                template = "http://" + template;
            var uri = Services.io.newURI(template, null, null);
            uri.host = uri.host.replace(/\{[^{}\s]+\}\.?/gi,"");  // Clear out any placeholders in the domain name
            uri.path = "favicon.ico";

            if (uri.host == GeotoolDomainName)
                return "chrome://flagfox/content/geotoolicon.png";
            if (uri.host == "flagfox.wordpress.com")
                return "chrome://flagfox/content/flagfoxlogo.png";

            return uri.spec;  // nsIFaviconService doesn't seem to want to work without a bookmark, but the main cache seems to work fine with it
        }
        catch (e)
        {
            return getIconPath("default");  // Given template probably isn't a valid URL
        }
    },

    warning : function(window,type,message,msgID=type)  // Shows a slide-down info bar (max once per session for each unique message ID; 'type' by default, for simple messages)
    {
        const messagePrefName = "warn." + type;
        const messagePrefValue = prefs.get(messagePrefName);
        if (messagePrefValue == "disabled")  // Valid states are: "enabled", "once", & "disabled"
            return;  // Disabled by user

        if (!warningsThisSession)
            warningsThisSession = new Set();
        if (warningsThisSession.has(msgID))
            return;  // Shown before this session
        warningsThisSession.add(msgID);

        var notificationBox = window.getBrowser().getNotificationBox();

        const XULNS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
        var notification = window.document.createElementNS(XULNS,"notification");
        notification.setAttribute("type","warning");
        notification.setAttribute("priority",notificationBox.PRIORITY_WARNING_MEDIUM);
        notification.setAttribute("image","chrome://flagfox/content/icons/help.png");
        notification.setAttribute("label",message);

        var checkbox = window.document.createElementNS(XULNS,"checkbox");
        if (messagePrefValue == "once")  // If pref is "once", default to checked
        {
            checkbox.setAttribute("checked",true);
            prefs.set(messagePrefName, "disabled", true);  // Set pref and suppress its update event
        }
        function onCheckboxToggled(event)
        {
            prefs.set(messagePrefName, event.target.checked ? "disabled" : "enabled", true);  // Set pref and suppress its update event
        }
        checkbox.addEventListener("command",onCheckboxToggled);
        checkbox.setAttribute("label",strings.GetStringFromName("warnchecklabel"));
        notification.appendChild(checkbox);

        notification.setAttribute("persistence",100);  // Also give it a second of persistence to prevent accidental hide without user interaction
        window.setTimeout(function(){notification.removeAttribute("persistence");},1000);

        notificationBox.appendChild(notification);  // Add and show notification
        if (notificationBox._showNotification)
            notificationBox._showNotification(notification,true);  // Do slide animation (HACK: undocumented method...)

        // Fire event for accessibility APIs
        var event = window.document.createEvent("Events");
        event.initEvent("AlertActive", true, true);
        notification.dispatchEvent(event);
    },

    error : function(message,exception)  // This is more error info than others might do, but users have a bad habit of ignoring you if you don't ask for feedback
    {
        if (!message)
            message = "Unknown error!";

        logErrorMessage("Flagfox ERROR: " + message + " \n" + parseException(exception));

        try
        {
            // No L10N: We only speak English (well) and thus our forums and the problems reported on them need to be in English. Sorry.
            var outputMsg = "Sorry, the Flagfox extension has encountered a problem. " +
                            "It is recommended that you reinstall Flagfox and restart Firefox to attempt to repair the problem. " +
                            "The following error output and a Flagfox preferences dump has been sent to Tools -> Error Console.\n" +
                            "\n------------------------------------------------------------\n";

            outputMsg += "FLAGFOX VERSION: " + Flagfox.version + " (" + ipdb.version + ")\n";

            outputMsg += "\nERROR MESSAGE: " + message + "\n";
            if (exception)
            {
                outputMsg += "\nEXCEPTION THROWN: " + exception + "\n";
                if (exception.stack)
                    outputMsg += "\nSTACK TRACE:\n" + exception.stack;  // ends with "\n"
            }

            try { logErrorMessage("Flagfox PREFERENCES DUMP:\n" + prefs.dumpString()); }
            catch (prefsDumpError) { outputMsg += "\nEXCEPTION THROWN on preferences dump: " + parseException(prefsDumpError) + "\n"; }

            var appInfo = Services.appinfo;
            outputMsg += "\nBROWSER: " + appInfo.vendor + " " + appInfo.name + " " + appInfo.version +
                         " (Gecko " + appInfo.platformVersion + " / " + appInfo.platformBuildID + ")";
            outputMsg += "\nOS: " + httpService.oscpu + " (" + appInfo.OS + " " + appInfo.XPCOMABI + " " + appInfo.widgetToolkit + ")";
            outputMsg += "\nLOCALE: " + Flagfox.locale.content + " content / " + Flagfox.locale.UI + " UI / " + Flagfox.locale.OS + " OS";

            outputMsg += "\n------------------------------------------------------------\n" +
                         "\nSelect and copy the error report above. In order to fix this problem for you and others, please read and follow the " +
                         "troubleshooting and bug reporting instructions on the Flagfox support forums. Please post an abundance of information with any " +
                         "error reports, namely what you were doing at the time that may have triggered this. (English please)\n";

            var promptService = Services.prompt;
            var flags = promptService.BUTTON_POS_0 * promptService.BUTTON_TITLE_IS_STRING +
                        promptService.BUTTON_POS_1 * promptService.BUTTON_TITLE_IS_STRING +
                        promptService.BUTTON_POS_0_DEFAULT;
            var button = promptService.confirmEx( null, "Flagfox Error!", outputMsg, flags, "Go To Support Forums", "Ignore", "", null, {} );

            if (button == 0)  // "Forums" button
            {
                // Open forum in new tab (can't open new window; if error is on startup, we could hit another error)
                Flagfox.addTabInCurrentBrowser("https://flagfox.net/reportingbugs");
            }
        }
        catch (e) { Components.utils.reportError("EXCEPTION DURING FLAGFOX ERROR REPORTING: " + parseException(e)); }
    },

    addTabInCurrentBrowser : function(url)  // Add tab to most recent window, regardless of where this function was called from
    {
        var currentWindow = getCurrentWindow();
        currentWindow.focus();
        var currentBrowser = currentWindow.getBrowser();
        currentBrowser.selectedTab = currentBrowser.addTab(url);
    },

    locale :
    {
        get content()  // Firefox primary content locale (user set)
        {
            try
            {
                try { var accept_languages = Services.prefs.getComplexValue("intl.accept_languages",Components.interfaces.nsIPrefLocalizedString).data; }
                catch (e) { var accept_languages = Services.prefs.getCharPref("intl.accept_languages"); }
                return cleanLocaleCode( /^[^\s,;]{2,}/.exec(accept_languages)[0] );  // Extract first locale code in pref (space/comma/semicolon delimited list)
            } catch (e) { return "en"; }
        },
        get UI()  // Flagfox UI locale
        {
            return cleanLocaleCode( Components.classes["@mozilla.org/chrome/chrome-registry;1"]
                                              .getService(Components.interfaces.nsIXULChromeRegistry)
                                              .getSelectedLocale("flagfox") );
        },
        get OS()  // Main OS locale
        {
            return cleanLocaleCode( Components.classes["@mozilla.org/intl/nslocaleservice;1"]
                                              .getService(Components.interfaces.nsILocaleService)
                                              .getSystemLocale()
                                              .getCategory("NSILOCALE_MESSAGES") );
        }
    },

    get strings() { return strings; },
    get helpstrings() { return helpstrings; },
    get countrynames() { return countrynames; },

    get version() { return FlagfoxVersion; },
    get IPDBversion() { return ipdb.version; }
};

function checkIPDBage()  // Check if the IPDB version is getting old and results are beginning to get particularly stale (3 months or more old)
{
    if (ipdb.daysOld > 90)
        Flagfox.warning(getCurrentWindow(), "stale", strings.GetStringFromName("stalewarnmessage"));  // Will only show once per session
}

function onGlobalPrefChange(prefName)
{
    switch (prefName)
    {
        case "useractions":  // This event is only fired for changes not done by Flagfox itself
            Flagfox.actions.load();
            return;

        case "showfavicons":
            actionsListAge = Date.now();  // All menus will need to be updated
            return;

        case "warn.proxy": case "warn.stale": case "warn.tld":
            if (!prefs.hasUserValue(prefName))
                warningsThisSession = null;  // Reset list on reset to default
            return;
    }
}

var memoryPressureObserver =
{
    observe : function(subject,topic,data)
    {
        if (topic == "memory-pressure" && data == "heap-minimize")
        {
            // Close IPDB files if asked to clear the heap (each will reload on next use)
            ipdb.close();
        }
    }
};

//// Flag icon instance closure (one per window) ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
function newFlagInstance(window)
{
    if (!window || !window.document || !window.getBrowser || !window.getBrowser())
    {
        logErrorMessage("Flagfox warning: attempted to load into an invalid window");
        return;
    }

    createIcon();

    var icon = window.document.getElementById("flagfox-icon");
    var menu = window.document.getElementById("flagfox-menu");
    var tooltip = window.document.getElementById("flagfox-tooltip");
    if (!icon || !menu || !tooltip)
    {
        destroyIcon();
        logErrorMessage("Flagfox Error: failed to create/find icon in new window");
        return;
    }

    setIconSize();

    var location = null;  // Location information (uri, url, protocol, host, ip, country, tldcountry, special, local)
    var DNSrequest = null;
    var menuContentAge = 0;

    var metaCache = null;
    var locationCache = new LocationCache(window);  // Cleared on window close (max entries is tabs count + 1)

    onLocationChange();

    var progressListener =
    {
        onLocationChange : onLocationChange,
        onProgressChange : function() {},
        onSecurityChange : function() {},
        onStateChange : function() {},
        onStatusChange : function() {}
    };
    window.getBrowser().addProgressListener(progressListener);

    var prefListener = prefs.registerListener(onIconPrefChange);

    // Go-go gadget events
    icon.addEventListener("click",onIconClick);
    icon.addEventListener("mousedown",onIconMouseDown);
    icon.addEventListener("mouseenter",onIconHover);
    menu.addEventListener("command",onMenuCommand);
    menu.addEventListener("mouseup",onMenuMouseUp);
    menu.addEventListener("popupshowing",onMenuShowing);
    tooltip.addEventListener("popupshowing",updateTooltipContent);
    window.addEventListener("keypress",onKeyPressed);
    window.addEventListener("online",onChangedOnlineStatus);
    window.addEventListener("offline",onChangedOnlineStatus);
    window.addEventListener("unload",unload);
    window.addEventListener("flagfox-unload",unload);

    function unload()
    {
        window.removeEventListener("flagfox-unload",unload);
        window.removeEventListener("unload",unload);
        window.removeEventListener("offline",onChangedOnlineStatus);
        window.removeEventListener("online",onChangedOnlineStatus);
        window.removeEventListener("keypress",onKeyPressed);
        tooltip.removeEventListener("popupshowing",updateTooltipContent);
        menu.removeEventListener("popupshowing",onMenuShowing);
        menu.removeEventListener("mouseup",onMenuMouseUp);
        menu.removeEventListener("command",onMenuCommand);
        icon.removeEventListener("mouseenter",onIconHover);
        icon.removeEventListener("mousedown",onIconMouseDown);
        icon.removeEventListener("click",onIconClick);
        prefListener.unregister();
        window.getBrowser().removeProgressListener(progressListener);
        if (DNSrequest)
            DNSrequest.cancel();
        DNSrequest = null;
        metaCache = null;
        locationCache = null;
        location = null;
        destroyIcon();
    }

/** Icon handling ******************************************************************************************************************************************************/

    function createIcon()
    {
        var urlBarIconsBox = window.document.getElementById("urlbar-icons");
        if (!urlBarIconsBox)
        {
            logErrorMessage("Flagfox Error: attempted to load into a window without an address bar and 'urlbar-icons' box");
            return;
        }

        var newIcon = window.document.createElement("box");
        newIcon.setAttribute("id","flagfox-button");
        newIcon.setAttribute("style","height: 100%;");
        newIcon.setAttribute("align","center");
        newIcon.setAttribute("pack","center");
        var newIcon_image = window.document.createElement("image");
        newIcon_image.setAttribute("id","flagfox-icon");
        newIcon_image.setAttribute("context","flagfox-menu");
        newIcon_image.setAttribute("tooltip","flagfox-tooltip");
        newIcon_image.setAttribute("style","margin: 0 3px;");
        var newIcon_menupopup = window.document.createElement("menupopup");
        newIcon_menupopup.setAttribute("id","flagfox-menu");
        var newIcon_tooltip = window.document.createElement("tooltip");
        newIcon_tooltip.setAttribute("id","flagfox-tooltip");

        newIcon.appendChild(newIcon_image);
        newIcon.appendChild(newIcon_menupopup);
        newIcon.appendChild(newIcon_tooltip);

        var starButton = urlBarIconsBox.querySelector("#star-button");  // In pre-Australis Firefox & SeaMonkey
        urlBarIconsBox.insertBefore(newIcon,starButton);
    }

    function destroyIcon()
    {
        tooltip = null;
        menu = null;
        icon = null;
        var button = window.document.getElementById("flagfox-button");
        if (button)
            button.parentNode.removeChild(button);
    }

    function setIcon(name)
    {
        if (!name)
        {
            icon.src = "";
            icon.style.border = "";
            return;
        }
        location.icon = name;
        var path = getIconPath(name);
        if (icon.src == path)
            return;
        var useBorder = name.startsWith("flags/");  // Flags with white fields shown on a white background blend in, so a border for flag icons is needed (e.g. Japan)
        icon.src = path;
        icon.style.border = useBorder ? "solid hsla(0,0%,50%,0.3) 1px" : "" ;  // Light grey with alpha so that it works well with light and dark themes
    }

    function setIconSize()  // Sets icon size based on pref
    {
        var maxwidth = prefs.get("maxflagwidth");
        if (!maxwidth || maxwidth < 16 || maxwidth > 45)  // Check bounds
            maxwidth = prefs.reset("maxflagwidth",true);
        icon.style.maxWidth = (maxwidth+2) + "px";  // Add 2px for border
    }

/** Update handling ****************************************************************************************************************************************************/

    function onLocationChange()
    {
        try {
            updateState();
        }
        catch (e) {
            Components.utils.reportError("Flagfox EXCEPTION: " + parseException(e));
        }
    }

    function updateState()
    {
        var currentURI = window.getBrowser().selectedBrowser.currentURI;
        if (currentURI.spec.startsWith("about:reader?url="))
            currentURI = Services.io.newURI(decodeURIComponent(currentURI.spec.slice(17)),null,null);
        if (currentURI.scheme == "view-source")
            currentURI = Services.io.newURI(currentURI.spec.slice(12),null,null);
        if (currentURI.scheme == "jar")
            currentURI = Services.io.newURI(currentURI.spec.slice(4).truncateBeforeFirstChar("!"),null,null);

        metaCache = null;  // Discarded on changed location or refresh

        if (location && !location.special && currentURI.equalsExceptRef(location.uri))
        {
            if (location.uri.ref != currentURI.ref)
                location.uri.ref = currentURI.ref;
            return;  // For refresh or navigation within page, only update uri; no need to look up again
        }

        // If we've changed pages before completing a lookup, then abort the old request first
        if (DNSrequest)
            DNSrequest.cancel();
        DNSrequest = null;

        location = new Location(currentURI);

        // First, see if we're not going to have a flag and can set a generic icon for this protocol
        switch (location.protocol)
        {
            case "file":
                setIcon("special/localfile");
                location.special = ["localfile"];
                location.local = true;
                return;

            case "data":
                setIcon("special/script");
                location.special = ["datauri", location.url.truncateBeforeFirstChar(",")];
                // not local; url can be sent to actions as it is portable
                return;

            case "about":
                setIcon(blankAddressPages.has(location.url) ? null : "special/about");  // No icon if nothing shown in address bar
                location.special = ["internalfile", location.url.truncateBeforeFirstChar("?")];
                location.local = true;
                return;

            case "chrome":  case "resource":  case "moz-icon":  case "moz-extension":
                setIcon("special/resource");
                location.special = ["internalfile", location.protocol + "://"];
                location.local = true;
                location.host = "";  // A host is returned from uri.host, however it's just the package name; drop it
                return;
        }

        if (!location.host)  // This probably shouldn't happen
        {
            setIcon("special/unknown");  // Nothing exploded; it's just a page that Flagfox doesn't understand. Just use the simple unknown icon.
            location.special = ["lookuperror"];
            return;
        }

        if (!window.navigator.onLine)
        {
            setIcon("special/offline");
            location.special = ["offlinemode"];
            return;  // Offline mode or otherwise not connected
        }

        // Check the location cache before checking DNS
        var cachedlocation = locationCache.fetch(location);
        if (cachedlocation)
        {
            location = cachedlocation;
            setIcon(location.icon);  // Will be updated below if needed
        }

        // Ideally just hitting the DNS cache here
        DNSrequest = resolveDNS(location.uri, onReturnedIP);

        function onReturnedIP(returnedIP)
        {
            DNSrequest = null;  // Request complete

            if (returnedIP == "PROXY")
            {
                setIcon("special/anonymous");
                location.special = ["nodnserror"];
                Flagfox.warning(window, "proxy", strings.GetStringFromName("proxywarnmessage"));
                return;  // Proxy in use for DNS; can't do a DNS lookup
            }

            if (returnedIP == "FAIL")
            {
                if (location.icon)  // If there's an icon in the cache, then keep it instead of an error
                {
                    locationCache.store(location);  // Move to newest slot in cache (oldest get evicted first)
                }
                else  // No cached icon, so show an error icon
                {
                    setIcon("special/error");
                    location.special = ["lookuperror"];
                }
                return;  // DNS lookup failed (ip/country/tldcountry stay empty, if not cached)
            }

            location.ip = returnedIP;
            location.country = ipdb.lookupIP(returnedIP);  // IPDB file loads will be autostarted if needed

            switch (location.country)
            {
                case "LOADING IPDB":
                    setIcon(null);
                    onLoadingIPDB(returnedIP);
                    return;  // Waiting for load
                case "IPDB LOAD ERROR":
                    logErrorMessage("Flagfox IPDB load error!");
                    onReturnedIP("FAIL");
                    return;  // Shouldn't happen
                case null:
                    setIcon("special/anonymous");  // IPDB is loaded, but it doesn't know where this is (recent Maxmind now does this with some CDNs)
                    location.special = ["unknownsite"];
                    break;
                case "-A":  case "-B":  case "-C":
                    setIcon("special/privateip");
                    location.local = true;
                    break;
                case "-L":
                    setIcon("special/localhost");
                    location.local = true;
                    break;
                case "A1":  case "A2":  case "AP":
                    setIcon("special/anonymous");
                    break;
                default:
                    setIcon("flags/" + location.country.toLowerCase());
                    break;
            }

            checkIPDBage();  // Doing this here instead of on initial load ensures that the IPDB metadata file is loaded first

            location.tldcountry = lookupTLD();
            locationCache.store(location);  // Save for quick retrieval
        }

        /* NOTE: The IPDB should load within the first few ms, but this allows a few more checks in case the system is otherwise busy.
                 This is not particularly elegant, but nothing async is, especially in JS. Using a traditional callback or an ES6
                 promise is not really a cleaner route, as I have to deal with the potential for lookups mid-loading, and neither are
                 easily cancellable (the way proxy/DNS lookups are). One way or another, a second lookup whilst loading will have to
                 wait without triggering a second load; the most straightforward way to do this without creating a mess is to just
                 have a wait loop. Deferred sync loading was far cleaner, however Mozilla now bans use of that API in addons, even if
                 it's a near instantaneous fetch from an already loaded XPI via the chrome:// protocol. (the actual parsing is slower)
                 The following settings give a 10 retry max; only one or two will be needed in the vast majority of instances. */
        const maxWait = 10000;
        var totalWait = 0;
        var waitInterval = 10;  // The interval between retries increases geometrically to avoid excessive retries when busy

        function onLoadingIPDB(pendingIP)
        {
            if (totalWait <= maxWait) {
                window.setTimeout(function() {
                    totalWait += waitInterval;
                    waitInterval *= 2;
                    if (location.ip == pendingIP && DNSrequest == null)  // This is stale if the IP has changed or a new request is pending
                        onReturnedIP(pendingIP);
                }, waitInterval);
            }
            else {
                onReturnedIP("FAIL");
            }
        }
    }

    function lookupTLD()
    {
        if (!location.host || !location.country)
            return null;

        var tld = location.host.truncateAfterLastChar(".").toLowerCase();
        var tldCountryCode;
        switch (tld)
        {
            case "edu":  case "gov":  case "mil":  // US-only TLDs (other nations may use them only as a second level domain name with their country TLD)
                tldCountryCode = "US";
                break;
            case "asia":  // Asia/Pacific TLD
                tldCountryCode = "AP";
                break;
            default:
                if (tld.length != 2)  // All country TLDs are 2 characters long; if it's not, then we don't have a nationality (e.g. com/net/org/info)
                    return null;
                tldCountryCode = tld.toUpperCase();
                break;
        }

        /* The nationality of the server location and the domain registration are not necissarily the same.
           This case is checked for and a notificaion is sent up for the user to attempt to reduce user confusion on the matter. */
        var doCheck = true;
        switch (tldCountryCode)         // Special TLD cases:
        {
            case "UK":
                tldCountryCode = "GB";  // List uses country code for Great Britan instead of United Kingdom
                break;
            case "EU":                  // Don't tell users European Union TLDs aren't in European countries
            case "AP":                  // Don't tell users Asia/Pacific TLDs aren't in Asian countries
                doCheck = false;
                break;
            // Some countries have TLDs that are frequently sold for other uses as abbreviations, words, or parts of words
            case "AD":  case "AM":  case "AS":  case "BZ":  case "CC":  case "CD":  case "CO":  case "DJ":  case "FM":
            case "GL":  case "IO":  case "LA":  case "LY":  case "ME":  case "MS":  case "TO":  case "TV":  case "WS":
                doCheck = false;
                break;
        }
        switch (location.country)  // Special IP range cases:
        {
            case "EU":             // Don't tell users European Union IPs aren't in European countries
            case "AP":             // Don't tell users Asia/Pacific IPs aren't in Asian countries
                doCheck = false;
                break;
        }

        try {
            var tldCountryName = countrynames.GetStringFromName(tldCountryCode);  // Throws an exception if not found
        } catch (e) {
            return null;  // The TLD is not for a country, or at least not one in the list that we can use
        }

        if (doCheck && tldCountryName && location.country != tldCountryCode)
        {
            try {
                var ipCountryName = countrynames.GetStringFromName(location.country);
                var messageText = strings.formatStringFromName("tldwarnmessage", [ipCountryName, "."+tld, tldCountryName], 3);
                var messageID = "tld:" + location.country + "/" + tld;
                Flagfox.warning(window, "tld", messageText, messageID);
            } catch (e) {}  // Will fail only if we're missing a localization for the given country
        }

        return tldCountryCode;  // Return the country code for the domain registration
    }

    function updateTooltipContent()
    {
        while (tooltip.firstChild)  // Clear previously generated tooltip, if one exists
            tooltip.removeChild(tooltip.firstChild);

        var grid = window.document.createElement("grid");
        var rows = window.document.createElement("rows");

        function addLabeledLine(labelID,lineValue)
        {
            var row = window.document.createElement("row");
            var label = window.document.createElement("label");
            label.setAttribute("value", strings.GetStringFromName(labelID));
            label.setAttribute("style", "font-weight: bold;");
            var value = window.document.createElement("label");
            value.setAttribute("value", lineValue);
            row.appendChild(label);
            row.appendChild(value);
            rows.appendChild(row);
        }

        function safeGetCountryName(code)
        {
            try { return countrynames.GetStringFromName(code); }
            catch (e) { return code + " (?)"; }
        }

        var isUnknownLocation = (location.special && location.special[0] == "unknownsite");

        if (location.host && location.host != location.ip)
            addLabeledLine("domainname", location.host);
        if (location.ip)
            addLabeledLine("ipaddress", location.ip);
        if (location.country || isUnknownLocation)  // State unknown location in location line (easier to read/understand; this includes CDNs now)
            addLabeledLine("serverlocation", isUnknownLocation ? strings.GetStringFromName("unknownsite") : safeGetCountryName(location.country));
        if (location.tldcountry && location.tldcountry != location.country)
            addLabeledLine("domainnationality", safeGetCountryName(location.tldcountry));

        if (location.special && !isUnknownLocation)
        {
            var extraString = strings.GetStringFromName(location.special[0]);
            if (location.special[1])
                extraString += " (" + location.special[1] + ")";
            var extraLine = window.document.createElement("label");
            extraLine.setAttribute("value", extraString);
            if (locationErrors.has(location.special[0]))
                extraLine.setAttribute("style", "font-style: italic;");
            rows.appendChild(extraLine);
        }

        grid.appendChild(rows);
        tooltip.appendChild(grid);
    }

    function updateMenuContent()  // Update actions in context menu based on current prefs
    {
        if (menuContentAge == actionsListAge)  // Only generate if this window's menu is stale
            return;

        Flagfox.actions.assertLoaded();

        const showAllItems = (menuContentAge == -1);  // Set menu age to -1 to show everything at once, regardless of show setting

        const showFavicons = prefs.get("showfavicons");

        while (menu.firstChild)  // Clear previously generated menu, if one exists
            menu.removeChild(menu.firstChild);

        function newMenuItem(value,label)
        {
            var newElement = window.document.createElement("menuitem");
            newElement.setAttribute("value", value);
            newElement.setAttribute("label", label);
            menu.appendChild(newElement);
            return newElement;
        }

        function newMenuItemForAction(action,id)
        {
            if ( !(action.show || showAllItems) )
                return;

            let newElement = newMenuItem(id, Flagfox.actions.getLocalizedName(action));

            if (showFavicons)
            {
                newElement.setAttribute("class", "menuitem-iconic");  // Allow icon
                newElement.setAttribute("validate", "never");  // Force use of cache
                newElement.setAttribute("image", Flagfox.getFaviconForTemplate(action.template));
                newElement.onerror = function() {
                    newElement.setAttribute("image", getIconPath("default"));
                };
            }
        }

        // Generate actions list
        for (let i in actionsList)
            newMenuItemForAction(actionsList[i], i);

        menu.appendChild(window.document.createElement("menuseparator"));

        // Add "Options"
        newMenuItem("options", strings.GetStringFromName("options"));

        if (showAllItems)
            menuContentAge = 0;  // All were shown; reset for next open
        else
            menuContentAge = actionsListAge;  // Menu content synced to actions list
    }

/** Action handling ****************************************************************************************************************************************************/

    function contentDoc()  // Needs to be fetched on each use (gets a CPOW in e10s)
    {
        var contentWindow = window.content ? window.content : window.getBrowser().selectedBrowser.contentWindowAsCPOW;
        return contentWindow.document;
    }

    function isActionAllowed(id)  // Is the given action allowed for this current state?
    {
        if (id === undefined || id === null)  // The id may be 0
            return false;

        if (id == "options")
            return true;

        var action = actionsList[id];
        Flagfox.actions.assertValid(action);
        var template = action.template;

        function needs(placeholder) { return RegExp(placeholder,"i").test(template); }  // Case-insensitive regexp search for placeholder in template

        if (needs("{(title|(base)?locale-page|meta-.*)}") && !contentDoc())
            return false;

        switch (template.truncateBeforeFirstChar(":"))
        {
            case "formfield":  // Nothing special needed to check viability of "formfield:" actions; just check whole template as a normal template
            default:
                if (!window.navigator.onLine)
                    return false;
                if (location.local)
                {
                    if ( needs("{fullURL}") )  // Don't send local URLs to remote lookups
                        return false;
                    if ( (location.host == location.ip || location.host == "localhost") && needs("{(IPaddress|(base)?domainName|TLD)}") )
                        return false;  // Don't send local IPs without hostnames to remote lookups
                }
                break;

            case "copystring":
                break;  // Nothing special needed (as apposed to "default:")

            case "javascript":
                if (!window.getBrowser().selectedBrowser)
                    return false;
                break;
        }

        if ( !location.host && needs("{((base)?domainName|TLD)}") )
            return false;
        if ( !location.ip && needs("{IPaddress}") && !needs("{((base)?domainName|TLD)}") )  // Allow optional IP when also using host (i.e. Geotool behind a proxy)
            return false;
        if ( !location.country && needs("{country(Code|Name)}") )
            return false;

        return true;
    }

    function doAction(id,openIn)  // 'openIn' override is optional
    {
        if (!isActionAllowed(id))
            return;

        if (id == "options")
        {
            // Flags from Add-ons Manager + resizable; focus() after open to refocus already open window, if needed
            window.openDialog("chrome://flagfox/content/options.xul", "FlagfoxOptions", "chrome,titlebar,toolbar,centerscreen,resizable").focus();
            return;
        }

        var action = actionsList[id];

        switch (action.template.truncateBeforeFirstChar(":"))
        {
            default:  // Lookup URL action
                if (action.name == "Geotool" && !action.custom)  // Identify this Flagfox version to Geotool for abuse prevention purposes
                    setGeotoolCookie();
                var parsedTemplate = parseTemplate(action.template, "url");  // Parse template as URL
                openURL(parsedTemplate, openIn);
                return;

            case "formfield":  // Paste into form field action pseudo-protocol; Syntax is "formfield:<URL>|<formID>|<formValue>|<buttonID>" (button ID is optional)
                var templateComponents = action.template.slice(10).split("|");
                var parsedTemplateURL = parseTemplate(templateComponents[0],"url");
                var parsedFormValue = parseTemplate(templateComponents[2]);

                var targetBrowser = openURL(parsedTemplateURL, openIn);
                var mm = targetBrowser.messageManager;
                mm.loadFrameScript(safeCachePath("chrome://flagfox/content/contentscript.js"),false);
                mm.sendAsyncMessage("flagfox-contentscriptaction", {
                    type : "formfield",
                    values : {
                        formValue : parsedFormValue,
                        formID : templateComponents[1],
                        buttonID : templateComponents[3]
                    }
                });
                return;

            case "copystring":  // Copy to clipboard action uses a pseudo-protocol
                var parsedTemplate = parseTemplate(action.template.slice(11), "none");  // Parse template after "copystring:"
                textutil.copyStringToClipboard(parsedTemplate);
                return;

            case "javascript":  // Javascript action; evaluate in sandbox instead of evaluating as a URL
                var parsedTemplate = parseTemplate(action.template.slice(11), "escapequotes");  // Parse template after "javascript:" and escape any quotes

                const msgName = "flagfox-contentscriptaction";
                var mm = window.getBrowser().selectedBrowser.messageManager;

                var sandboxFunctions =
                {
                    // Some functions for JavaScript actions to use
                    log : function(message) { Services.console.logStringMessage(message); },
                    copystring : function(string) { textutil.copyStringToClipboard(string); },
                    openurl : function(newurl) { openURL(newurl); },
                    getinfo : function(param) { return getParameterValue(param); },  // Returns a value -> sync call needed
                    // Some functions for the content script to use
                    error : function(errorMessage) {
                        errorMessage = errorMessage + "\n\n" + parsedTemplate;
                        var errorTitle = "Flagfox JavaScript Action \"" + Flagfox.actions.getLocalizedName(action) + "\" ERROR";
                        logErrorMessage(errorTitle + ":\n\n" + errorMessage);
                        Services.prompt.alert(window, errorTitle, errorMessage);
                    },
                    done : function() { mm.removeMessageListener(msgName,receiveMessage); }
                };

                var receiveMessage = function(msg) {
                    if (msg.name == msgName)
                        try { return sandboxFunctions[msg.data.name](msg.data.arg); } catch(e) {}
                };

                mm.loadFrameScript(safeCachePath("chrome://flagfox/content/contentscript.js"),false);
                mm.addMessageListener(msgName,receiveMessage);
                mm.sendAsyncMessage(msgName, {
                    type : "javascript",
                    script : parsedTemplate
                });
                return;
        }
    }

    function openURL(url,override)  // Open URL based on the user's pref and return a reference to the browser it will load in
    {
        try {
            var openPref = override ? override : prefs.get("openlinksin") ;
            switch (openPref)
            {
                case "tabFG":  case "tabBG":
                    var browser = window.getBrowser();
                    try { window.TreeStyleTabService.readyToOpenChildTab(browser.selectedTab); } catch (e) {}  // Support for Tree Style Tab extension
                    var newTab = browser.addTab(url, {ownerTab:browser.selectedTab, relatedToCurrent:true});   // Add tab as child of current tab
                    if (openPref == "tabFG")
                        browser.selectedTab = newTab;
                    return browser.getBrowserForTab(newTab);

                case "currentTab":  default:
                    var currentTabBrowser = window.getBrowser().selectedBrowser;
                    currentTabBrowser.loadURI(url);
                    return currentTabBrowser;

                case "winFG":  case "winBG":
                    window.open(url,"_blank");
                    var newWindow = getCurrentWindow();
                    if (openPref == "winBG")
                    {   // NOTE: still doesn't work on Linux
                        newWindow.blur();
                        window.focus();
                    }
                    return newWindow.getBrowser().selectedBrowser;
            }
        } catch (e) { Flagfox.error("Failed to open URL: "+url,e); }
    }

    function parseTemplate(template,encoding)  // Placeholders in templates are case-insensitive and may be used multiple times
    {
        function getReplacement(token) { return getParameterValue(token,template,encoding); }

        if (encoding == "url")
        {
            /* Both the full template and parameters need encoding but I can't do encodeURI() with the parameters as that
               ignores certain characters that might cause problems with searches. The parameters need encodeURIComponent().
               To prevent double encoding I do encodeURI() first and simply search using encoded placeholders. */
            return encodeURI(template).replace(/%7B[^%\s]+%7D/g, getReplacement);
        }
        else
        {
            return template.replace(/\{[^{}\s]+\}/g, getReplacement);
        }
    }

    function getParameterValue(token,template,encoding)
    {
        var parameter, maybeEncode;
        switch (token[0])
        {
            case "{":
                parameter = token.toLowerCase().slice(1,-1);  // Cut off { & }
                break;
            case "%":
                parameter = token.toLowerCase().slice(3,-3);  // Cut off %7B & %7D
                break;
            default:
                parameter = token.toLowerCase();  // Called without {} around parameter name
                break;
        }
        switch (encoding)
        {
            default:
            case "none":
                maybeEncode = function(a) { return a; };
                break;
            case "url":
                maybeEncode = encodeURIComponent;
                break;
            case "escapequotes":
                maybeEncode = escapeQuotes;
                break;
        }
        switch (parameter.truncateBeforeFirstChar("-"))  // Some parameters can have multiple components: {lhs-rhs}
        {
            case "fullurl":
                if (encoding == "url")  // Some templates will need the URL variable to be encoded and others will need it to not be
                {
                    var charBeforeURL = template[ template.search(/\{fullURL\}/i) - 1 ];
                    if (charBeforeURL == "=" || charBeforeURL == ":")
                        return encodeURIComponent(location.url);
                }
                return location.url;

            case "basedomainname":
                try { return maybeEncode(Services.eTLD.getBaseDomainFromHost(location.host)); }
                catch (e) {}  // Throws if something is wrong with host name or is IP address; fall-through and use full host name

            case "domainname":
                return maybeEncode(location.host);

            case "tld":
                try { return maybeEncode(Services.eTLD.getPublicSuffixFromHost(location.host)); }
                catch (e) { return maybeEncode(location.host.truncateAfterLastChar(".")); }

            case "ipaddress":
                return maybeEncode(location.ip ? location.ip : "");

            case "countrycode":
                return maybeEncode(location.country);

            case "countryname":
                return maybeEncode(countrynames.GetStringFromName(location.country));

            case "title":
                return maybeEncode(contentDoc().title);

            case "baselocale":
                var base = true;  // language-dialect -> language
            case "locale":
                var locale;
                switch (parameter.truncateAfterLastChar("-"))
                {
                    default:      locale = Flagfox.locale.content;             break;  // {locale}      -> primary user requested content locale
                    case "ui":    locale = Flagfox.locale.UI;                  break;  // {locale-ui}   -> Flagfox UI strings locale (e.g. country names)
                    case "os":    locale = Flagfox.locale.OS;                  break;  // {locale-os}   -> native operating system locale
                    case "page":  locale = contentDoc().documentElement.lang;  break;  // {locale-page} -> locale stated for the current page (empty string if none)
                }
                return maybeEncode( base ? locale.split("-")[0] : locale );  // Shouldn't need encoding, but do so if needed just in case of a bogus value in content

            case "meta":
                var name = parameter.slice(5);  // Get tag name after "meta-" (might contain another dash)
                return maybeEncode(getMetaTag(name));  // Returns an empty string if not found

            default:
                return token;  // Don't know what it is; leave it alone
        }
    }

    function getMetaTag(name)  // Get and cache meta tags on first use (cache cleared on navigation away from page)
    {
        if (!name)
            return "";
        if (!metaCache)
        {
            var metaTags = contentDoc().getElementsByTagName("meta");  // Case-insensitive tag search
            metaCache = new Map();
            for (let i=0; i < metaTags.length; i++)
                metaCache.set(metaTags[i].name.toLowerCase(), metaTags[i].content);  // Case-insensitive names as well
        }
        var tagContent = metaCache.get(name);
        return tagContent ? tagContent : "" ;
    }

/** Event handling *****************************************************************************************************************************************************/

    function onIconPrefChange(prefName)
    {
        if (prefName == "maxflagwidth")
            setIconSize();
    }

    function onIconClick(event)
    {
        function doClickAction()
        {
            if (event.button == 1 || (event.button == 0 && event.ctrlKey))  // Middle or Left+Ctrl
                var binding = "middleclick";
            else if (event.button == 0)  // Left
                var binding = "click";
            else
                return;
            // Button 2 (Right) shows popup menu via context attribute

            // event.detail for click events is the number of successive clicks thus far
            if (event.detail == 2)
                binding = "double" + binding;
            else if (event.detail == 3)
                binding = "triple" + binding;

            doAction(hotClicks[binding]);
        }

        /* There is a dblclick event, but I can't use that because it's sent out in addition to two click events,
           not instead of. As a result, I just use the click event and detect multiple clicks within a short timeframe.
           (which also allows for triple click detection) The time has to be very short, otherwise when a user does a
           single click action it will still have to wait a while to see if there's going to be a second click. */
        window.clearTimeout(this.clickTimer);
        this.clickTimer = window.setTimeout(doClickAction, 250);
        // Double click = two clicks within 250ms; Triple click = three clicks within 500ms
    }

    function onIconMouseDown(event)  // Handle keyboard modifiers when right-clicking on the icon
    {
        if (event.button == 2 && event.ctrlKey)  // Right+Ctrl
            menuContentAge = -1;  // Show all items at once
    }

    function onIconHover(event)  // Changes mouse hover cursor to a hand when there is a click action
    {
        icon.style.cursor = isActionAllowed(hotClicks["click"]) ? "pointer" : "default" ;
    }

    function onMenuCommand(event)
    {
        var actionID = event.target.value;
        if (event.button == 1)  // From onMenuMouseUp() (command event doesn't fire for middleclicks)
            doAction(actionID, "tabBG");
        else if (event.ctrlKey || event.shiftKey)
            doAction(actionID, (event.shiftKey?"win":"tab")+(event.ctrlKey?"BG":"FG") );
        else
            doAction(actionID);  // Action will open in tab/window based on pref
    }

    function onMenuMouseUp(event)  // Handle middle/ctrl+clicking menu items to open action(s) in background tab(s) (command and click events are too late)
    {
        if (event.button > 2)  // Ignore clicks with extra buttons here
            return;
        if (event.shiftKey)  // Handle shift modifier in onMenuCommand() only (will always close menu when opening a new window)
            return;
        if (event.target.value == "options")  // Options dialog will always open as its own window; make sure the menu closes
            return;

        if (event.button == 1 || event.ctrlKey)  // Middle-click or ctrl+click
        {
            event.preventDefault();   // Stop this event from closing the menu popup
            event.stopPropagation();  // Don't allow this event to reach other listeners
            onMenuCommand(event);     // Complete the action for this event (the command event won't trigger)
        }
    }

    function onMenuShowing(event)
    {
        updateMenuContent();  // Update menu, if need be

        var menuItems = menu.getElementsByTagName("menuitem");
        for (let i=0; i < menuItems.length; i++)  // Decide which menu items to grey out if they aren't available
            menuItems[i].setAttribute("disabled", !isActionAllowed( menuItems[i].getAttribute("value") ));  // Need to use attributes here
    }

    /* Listening to every keypress here because dynamically adding to a <keyset> with <keys> being listened to doesn't seem to work well.
       This function only takes around a microsecond or less to run so it shouldn't affect performance.
       event.charCode is case-sensitive so I don't need to check for shift separately. */
    function onKeyPressed(event)
    {
        if (event.ctrlKey || event.altKey || event.metaKey)
        {
            var boundKey = hotKeys[event.charCode];
            if (boundKey)
                doAction( boundKey[getModsCode(event.ctrlKey,event.altKey,event.metaKey)] );
        }
    }

    /* The "online" and "offline" events fire many times in a row for some annoying reason.
       To avoid redundant updates I wait a little bit and only handle the last update event. */
    function onChangedOnlineStatus(event)
    {
        window.clearTimeout(this.pendingOnlineStatusUpdate);
        this.pendingOnlineStatusUpdate = window.setTimeout(function() {
            location = null;
            menuContentAge = 0;  // If menu was opened offline reset it to force favicons to load
            updateState();
        }, 250);
    }
}

// Pages with a blank address bar that will have a hidden Flagfox icon
const blankAddressPages = new Set(["about:blank", "about:newtab", "about:privatebrowsing", "about:home", "about:sessionrestore"]);

// Location lookup error types
const locationErrors = new Set(["unknownsite", "lookuperror", "nodnserror", "offlinemode"]);

// Location object used in flag instance
function Location(fromuri)
{
    this.uri = fromuri.clone();
    try {
        this.host = this.uri.host.cropTrailingChar(".");
    } catch (e) {
        this.host = "";  // uri.host throws for schemes that have no host
    }
}

Location.prototype =
{
    get url() { return this.uri.spec; },
    get protocol() { return this.uri.scheme; }
};

// Location object cache used in flag instance (one per window; cleared on window close)
function LocationCache(window)
{
    this.tabs = window.getBrowser().tabContainer;
    this.cache = new Map();
}

LocationCache.prototype =
{
    fetch : function(location)
    {
        var cached = this.cache.get(location.host);
        if (!cached)
            return undefined;
        cached.uri = location.uri;  // Found cached info for host, but use current full URI
        return cached;
    },
    store : function(location)
    {
        if (!location || !location.host)
            return;
        this.cache.delete(location.host);  // Delete possible old entry first so prune() can work
        this.cache.set(location.host,location);
        this.prune();
    },
    prune : function()
    {
        var evictionCount = this.cache.size - (this.tabs.itemCount + 1);  // Max count is tab count + 1
        var lastKey;
        for (let key of this.cache.keys())
        {
            if (evictionCount > 0)  // Evict oldest entries until limit is reached
            {
                this.cache.delete(key);
                --evictionCount;
                continue;
            }
            if (lastKey)
                this.cache.get(lastKey).uri = undefined;  // Discard full URI from all but most recently cached (fetch is for host)
            lastKey = key;
        }
    }
};

//// DNS handler (does lookups for IP addresses) ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
function resolveDNS(uri,returnIP)  // Returns cancelable request object wrapper
{
    // Two async functions need to be called here, both cancelable; this wrapper will always point to the one currently in progress so it can be canceled
    var requestWrapper =
    {
        currentRequest : null,
        set : function(request) { this.currentRequest = request; },
        cancel : function(reason = Components.results.NS_ERROR_ABORT) {
            try { this.currentRequest.cancel(reason); } catch(e) {}
        }
    };

    var callback1 =
    {
        onProxyAvailable : function(_request, _uri, proxyinfo, status)
        {
            if (status == Components.results.NS_ERROR_ABORT)
                return;  // Ignore cancel

            // If "network.proxy.socks_remote_dns" is set to true or the proxy is otherwise set up to be the one to do all DNS resolution, then don't do it here
            if ( (proxyinfo != null) && (proxyinfo.flags & proxyinfo.TRANSPARENT_PROXY_RESOLVES_HOST) )
            {
                returnIP("PROXY");
                return;
            }

            requestWrapper.set( dnsService.asyncResolve(uri.host, 0, callback2, Services.tm.currentThread) );  // Queue second lookup to get the IP address
        }
    };

    var callback2 =
    {
        onLookupComplete : function(_request, dnsrecord, status)
        {
            if (status == Components.results.NS_ERROR_ABORT)
                return;  // Ignore cancel

            if (status != 0 || !dnsrecord || !dnsrecord.hasMore())
            {
                returnIP("FAIL");
                return;  // IP not found in DNS
            }

            returnIP(dnsrecord.getNextAddrAsString());  // Done looking up the IP address
        }
    };

    requestWrapper.set( proxyService.asyncResolve(uri, 0, callback1) );  // Queue first lookup to see if DNS is allowed

    return requestWrapper;
}

//// Actions JSON pack/unpack functions /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Returns packed JSON text from given actions list object (array-based JSON => JSAN, to sound fancy)
function packActionsJSON(actionsListObject)
{
    /* NOTE:
       Objects with properties are useful to work with, but in order to reduce pref space usage they're stored packed without property names.
       Store arrays with minimum number of entries needed for the given properties, listed in decending order of expected commonness.
         full format: [name(str), show(int), hotclick(str), hotkey(str), template(str) ] ('0' if empty; just a string for name, if no properties)
         examples: ["sam", ["bob",1], ["mary",0,"click"], ["alex",1,0,"ctrl alt a"], ["apple",1,0,0,"customtemplate"]]
    */
    function packAction(obj)
    {
        if (!obj.custom && !obj.iconclick && !obj.hotkey && !obj.show)
            return obj.name;  // Just store name without object if there's nothing else for this default entry but the template

        var packedAction = [];  // Array instead of Object so property names aren't stored in pref text
        packedAction[0] = obj.name;

        if (obj.show)
            packedAction[1] = 1;  // Just pack as '1' instead of 'true'
        if (obj.iconclick)
            packedAction[2] = obj.iconclick;
        if (obj.hotkey)
            packedAction[3] = packHotkey(obj.hotkey);  // 'obj.hotkey' is itself an object; pack that as a string
        if (obj.custom && obj.template)
            packedAction[4] = obj.template;  // If not custom, then template will be pulled from defaults list on unpack

        for (let i=0; i<packedAction.length; i++)  // Iterate over all indicies including those not set (i.e. need to use '<length' instead of 'for..of')
            if (packedAction[i] === undefined)
                packedAction[i] = 0;

        return packedAction;
    }

    if (!Array.isArray(actionsListObject))
        throw "Error attempting to pack actions list to JSON! List is not an array!";

    var packedActionsJSONtext = JSON.stringify(actionsListObject.map(packAction));
    if (!packedActionsJSONtext || !packedActionsJSONtext.length || typeof packedActionsJSONtext !== "string")
        throw "Error saving actions list to JSON!";
    return packedActionsJSONtext;
}

// Given default actions JSON and packed user actions JSON, returns unpacked actions list object (also applies any updates as needed)
function unpackActionsJSON(defaultActionsList, userJSONtext, needToSave={})
{
    var updatesDone = [];
    var actionsToPromote = [];

    // Default actions list (from JSON file)
    if (!defaultActionsList || !defaultActionsList.length || !Array.isArray(defaultActionsList))
        throw "Error getting default actions list!";

    // Load packed actions list (JSON text from pref)
    var loadedActions = JSON.parse(userJSONtext);
    if (!loadedActions || !loadedActions.length || !Array.isArray(loadedActions))
        throw "Error getting user actions list!";

    // Build map of default actions, by name (will remove from map as each is addressed)
    var defaultActionsBuffer = new Map();
    for (let action of defaultActionsList)
        defaultActionsBuffer.set(action.name, action);
    if (defaultActionsBuffer.size != defaultActionsList.length)
        throw "Error building default actions Map() for user pref loading!";

    function getDefaultActionByName(name)  // Find a default action in the loaded list
    {
        for (let action of loadedActions)
            if (!action.custom && action.name == name)
                return action;
        return null;
    }

    function exists(entry) { return entry !== null; }

    function maybeProp(value) { return value ? value : undefined; }  // If false or no value (not stored or packed as '0') then don't set property on object

    function unpackAction(entry)
    {
        if (typeof entry === "string")  // Defaults not currently with 'show' or any shortcuts are stored as just a string
            entry = [entry];
        else if (!Array.isArray(entry))  // typeof Array == "object", so use checking function
            throw "Packed action entry is not a string or array!";

        const isCustom = !!entry[4];  // If a template is stored then this is a custom action (if not, then it's a default)

        if (!isCustom)  // If default, get its template from the full version in the buffer
        {
            var name = entry[0];
            var defaultAction = defaultActionsBuffer.get(name);
            if (defaultAction)
            {
                entry[4] = defaultAction.template;  // Set template from loaded full list (will always be current template version for default actions)
                defaultActionsBuffer.delete(name);
            }
            else  // Not a default action anymore; will be deleted
            {
                var replacement = replacedDefaultActions[name];  // See if a replacement is declared
                if (replacement)
                    actionsToPromote.push([name,replacement]);
                updatesDone.push("action is no longer a default: \"" + name + "\"");
                return null;  // No action anymore; will be filtered out below
            }
        }

        // Create action object from data in packed array (leave properties as undefined if no data is set)
        var action =
        {
            custom : maybeProp(isCustom),
            name : entry[0],
            show : maybeProp(Boolean(entry[1])),
            iconclick : maybeProp(entry[2]),
            hotkey : maybeProp(unpackHotkey(entry[3])),
            template : entry[4]
        };
        Flagfox.actions.assertValid(action);
        return action;
    }

    // Unpack all actions
    loadedActions = loadedActions.map(unpackAction);

    // Remove all obsolete default actions that were found (nulled entries)
    if (updatesDone.length)
        loadedActions = loadedActions.filter(exists);

    // Add new default actions (remaining entries in the buffer)
    for (let i=0; defaultActionsBuffer.size>0 && i<defaultActionsList.length; i++)
    {
        var defaultAction = defaultActionsList[i];
        if (defaultActionsBuffer.has(defaultAction.name))
        {
            // NOTE: Doesn't account for existing shortcuts; if I ever add any new default actions with shortcuts, I may need to ammend this
            loadedActions.splice(i,0,defaultAction);
            defaultActionsBuffer.delete(defaultAction.name);
            updatesDone.push("new default action added: \"" + defaultAction.name + "\"");
        }
    }

    // If any default actions were replaced with new ones, promote its replacement to be shown in the menu in its stead
    for (let [oldName,newName] of actionsToPromote)
    {
        var replacementAction = getDefaultActionByName(newName);
        if (replacementAction)
        {
            replacementAction.show = true;
            updatesDone.push("default action \""+newName+"\" replaces old action \""+oldName+"\" in default menu");
        }
    }

    if (updatesDone.length)  // Templates aren't stored in packed JSON for default actions, so updates are automatically applied
    {
        Services.console.logStringMessage("Flagfox default action list updates applied for version " + Flagfox.version + ":\n" + updatesDone.join(";\n"));
        needToSave.value = true;
    }

    return loadedActions;  // Return unpacked list
}

function packHotkey(hotkeyObj)
{
    if (!hotkeyObj)
        throw "Tried to pack undefined hotkey object!";

    return hotkeyObj.mods + " " + hotkeyObj.key.replace(" ","space");
}

function unpackHotkey(hotkeyStr)
{
    if (!hotkeyStr)
        return null;  // Not packed

    var lastSpacePos = hotkeyStr.lastIndexOf(" ");
    return {
        mods : hotkeyStr.substring(0,lastSpacePos),
        key : hotkeyStr.substring(lastSpacePos+1).replace("space"," ")
    };
}

//// Update migration ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function migrateOldFlagfox3Action()
{
    Flagfox.actions.assertLoaded();

    try  // Import flagfox.customlookup.* from Flagfox 3.3.x
    {
        var oldCustomAction = new Object();
        oldCustomAction.name = prefs.old.getPrefByFullName("flagfox.customlookup.name",true);
        oldCustomAction.template = prefs.old.getPrefByFullName("flagfox.customlookup.url",true);
        oldCustomAction.show = prefs.old.getPrefByFullName("flagfox.customlookup.enabled",false) ? true : undefined;
        oldCustomAction.custom = true;
        actionsList.push(oldCustomAction);
        Flagfox.actions.save();
        Services.console.logStringMessage("Flagfox 3 custom action imported");
        prefs.old.deletePrefBranch("flagfox.customlookup.");
    }
    catch (e) {}  // Throw -> pref doesn't exist (was default or already imported)

    try  // Import flagfox.middleclick from Flagfox 3
    {
        var oldClickPref = prefs.old.getPrefByFullName("flagfox.middleclick",true);
        if (oldClickPref == "CopyIP")
            oldClickPref = "Copy IP";
        else if (oldClickPref == "Custom")
            oldClickPref = oldCustomAction.name;
        for (let i in actionsList)
            if (actionsList[i].name == oldClickPref)
            {
                Flagfox.actions.setBindings(i, "middleclick", null);
                Flagfox.actions.save();
                Services.console.logStringMessage("Flagfox 3 middleclick option imported");
                Services.prefs.clearUserPref("flagfox.middleclick");
                break;
            }
    }
    catch (e) {}  // Throw -> pref doesn't exist (was default or already imported)
}

const Flagfox4PrefBranchName = "flagfox.";
const Flagfox5PrefBranchName = "extensions.flagfox.";
const SyncEnablePrefBranchName = "services.sync.prefs.sync.";

function migrateOldFlagfox4Prefs()
{
    try  // Import unpacked actions pref from Flagfox 4
    {
        const oldActionsPrefName = Flagfox4PrefBranchName+"actions";
        const newActionsPrefName = Flagfox5PrefBranchName+"useractions";
        if (Services.prefs.prefHasUserValue(oldActionsPrefName) &&
            !Services.prefs.prefHasUserValue(newActionsPrefName))  // Don't overwrite current pref with an import (also avoids importing twice)
        {
            const oldActionsPrefValue = prefs.old.getPrefByFullName(oldActionsPrefName,true);
            const newActionsPrefValue = packActionsJSON(JSON.parse(oldActionsPrefValue));  // If this throws, import nothing
            prefs.old.setPrefByFullName(newActionsPrefName, newActionsPrefValue);
            Services.prefs.clearUserPref(oldActionsPrefName);
            Services.console.logStringMessage("Flagfox 4 action customizations imported");
        }
    }
    catch (e) {}

    try  // Port other "flagfox.*" named prefs to "extensions.flagfox.*" named prefs
    {
        var found = false;
        ["openlinksin","showfavicons","warn.proxy","warn.stale","warn.tld"].forEach(function(name) {
            let oldPrefName = Flagfox4PrefBranchName+name;
            if (Services.prefs.prefHasUserValue(oldPrefName))
            {
                found = true;
                prefs.old.setPrefByFullName(Flagfox5PrefBranchName+name, prefs.old.getPrefByFullName(oldPrefName));
                Services.prefs.clearUserPref(oldPrefName);
            }
        });
        if (found)
            Services.console.logStringMessage("Flagfox 4 user preferences imported");
    }
    catch (e) {}
}

function clearOldSyncPrefs()
{
    prefs.old.deletePrefBranch(SyncEnablePrefBranchName+Flagfox4PrefBranchName);
    prefs.old.deletePrefBranch(SyncEnablePrefBranchName+Flagfox5PrefBranchName);
}

function maybeClearAllOldPrefs()  // If not using the old pref system anymore, clear all old Flagfox prefs from it
{
    if (prefs.isWebExtPrefSysInUse())
    {
        prefs.old.deletePrefBranch(Flagfox4PrefBranchName);
        prefs.old.deletePrefBranch(Flagfox5PrefBranchName);
    }
}

// List of default actions in the shown menu that had to be replaced for one reason or another
const replacedDefaultActions =
{
    "tr.im URL" : "Tiny URL",       // Shut down (though, it did come back later at some point)
    "bit.ly URL" : "Tiny URL",      // Removed URL API (a form field action has since been added under "Bit.ly", case-sensitive)
    "SiteAdvisor" : "Google Cache"  // Removed SiteAdvisor from defaults and promoted Google Cache to default menu (already existed; just promoted to default menu)
};

function restartFlagfox()  // Dear Mozilla, FIXME: This works in current main release but is broken in current ESR, due to some Addon Manager bug that I can't figure out
{
    Services.console.logStringMessage("A Flagfox addon restart is required for the change to take effect.");

    function onGetAddon(addon) {
        addon.reload();
        Services.console.logStringMessage("Flafox automatically restarted successfully.");
    }

    function onReloadError(e) {
        logErrorMessage("Failed to automatically restart Flagfox. Please disable and re-enable manually or restart your browser.");
        //logErrorMessage(e);
    }

    try {
        Components.utils
                  .import("resource://gre/modules/AddonManager.jsm",{})
                  .AddonManager
                  .getAddonByID(FlagfoxAddonID)  // Ah, my old nemesis, AddonManager.getAddonByID()... it will always find a way to break and confuse me forever
                  .then(onGetAddon)              // In Firefox 56, this all works fine; in 52 ESR, it throws claiming the callback is not a function (!?)
                  .catch(onReloadError);
    } catch (e) { onReloadError(e); }
}

//// Utility functions //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function getIconPath(filename)
{
    return "chrome://flagfox/content/icons/" + filename + ".png";
}

function safeCachePath(path)
{
    /* HACK: The string bundle cache is cleared on addon shutdown, however it doesn't appear to do so reliably.
       Errors can erratically happen on next load of the same file in certain instances. (at minimum, when strings are added/removed)
       The apparently accepted solution to reliably load new versions is to always create bundles with a unique URL so as to bypass the cache.
       This is accomplished by passing a unique string in a parameter after a '?'. (this random ID is otherwise ignored)
       The loaded string bundle is still cached on startup by Flagfox and should still be cleared out of the cache on addon shutdown.
       The frame script cache suffers from a similar issue, and is similarly fixed, however there is not currently a way to clear it at all.
       Additional loads this session will come from the cache. Future loads after addon restart will bypass the built-in cache and load cleanly. */
    return path + "?" + sessionStartTime;
}

function getCurrentWindow()
{
    return Services.wm.getMostRecentWindow("navigator:browser");
}

/* Set secret decoder ring for Geotool to try to reduce crippling server abuse from other sources.
   This gives up-to-date Flagfox users an all-access pass and restricts everyone else via a captcha at certain times.
   This does not, however, allow for infinite requests. Geotool will still auto-block after many excessive requests.
   This only identifies the Flagfox version. All users on all systems will get the same cookie for the same Flagfox version.
   No information that would identify this computer, profile, or user is sent and it is only sent to the Geotool server. */
const GeotoolDomainName = "iplookup.flagfox.net";
function setGeotoolCookie()
{
    const expiry = (Date.now()/1000) + 600;  // Set 10 minute expiration time (automatically reset as needed on each call)
    const values = [
        ["Flagfox-version", FlagfoxVersion],    // Flagfox extension version string
        ["Flagfox-IPDBversion", ipdb.version],  // Flagfox IP location database version string (year and month)
        ["Flagfox-IPDBhash", ipdb.hmac]         // Truncated HMAC for the above (used to verify versions; name kept for backwards-compatibility)
    ];
    values.forEach(function(value) {
        Services.cookies.add(GeotoolDomainName,"/",value[0],value[1],false,true,false,expiry);  // HttpOnly mode on: only accessible by Geotool server, not client scripts
    });
}

function escapeQuotes(string)
{
    return String(string).replace(/\\/g,"\\\\").replace(/\'/g,"\\\'").replace(/\"/g,"\\\"");
}

function cleanLocaleCode(code)  // Cleans a locale code to use a consistent format (lowercase is needed in a few places)
{
    return String(code).replace("_","-").toLowerCase();
}

function getModsCode(ctrl,alt,meta)  // Convert boolean triplet into an integer
{
    var code = 0;
    if (ctrl)
        code |= 1;
    if (alt)
        code |= 2;
    if (meta)
        code |= 4;
    return code;
}

function logErrorMessage(message)  // Logs a string message to the error console with no file link, similar to Services.console.logStringMessage(), but with "error" status
{
    var scriptError = Components.classes["@mozilla.org/scripterror;1"]
                                .createInstance(Components.interfaces.nsIScriptError);
    scriptError.init(message,null,null,null,null,0,null);
    Services.console.logMessage(scriptError);
}

function parseException(e)  // Returns a string version of an exception object with its stack trace
{
    if (!e)
        return "";
    else if (!e.stack)
        return String(e);
    else
        return String(e) + " \n" + String(e.stack);
}
