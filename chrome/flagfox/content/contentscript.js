(function(){
"use strict";  // Use ES5 strict mode for this file (within this scope)

const msgName = "flagfox-contentscriptaction";

function receiveMessage(msg)
{
    if (msg.name != msgName)
        return;
    try {
        switch (msg.data.type)
        {
            case "formfield":
                doFormFieldAction(msg.data.values);
                break;
            case "javascript":
                doJavaScriptAction(msg.data.script);
                break;
        }
    } finally {
        removeMessageListener(msgName,receiveMessage);
    }
}

addMessageListener(msgName,receiveMessage);

function doFormFieldAction(values)
{
    // Element IDs in HTML are supposed to be unique, but the real world is sloppy
    // querySelector() allows for easily searching in just the form, and allows for searching by name as well as id
    function getElement(id)
    {
        const selector = "form #" + id + ":not([type='hidden']), form [name='" + id + "']:not([type='hidden'])";  // Get shown form element by id or name
        return content.window.document.querySelector(selector);
    }

    try {
        var onLoad = function() {
            removeEventListener("load",onLoad,true);
            try {
                getElement(values.formID).value = values.formValue;  // Fill the form field
                if (values.buttonID) {
                    content.window.setTimeout(function() {  // Add 100ms delay for simulated button click
                        try {
                            getElement(values.buttonID).click();  // Click the submit button, if available
                        } catch (e) {}
                    }, 100);
                }
            } catch(e) {}
        };
        addEventListener("load",onLoad,true);
    } catch (e) {}
}

function doJavaScriptAction(script)
{
    function callFunction(name,arg,sync)  // Call a function exposed to JavaScript actions in the sandbox
    {
        arg = String(arg);  // User supplied arguments -> cast to string, just to be sure
        if (sync)
            return sendSyncMessage(msgName, { name:name, arg:arg })[0];  // Returns an array of responses from all listeners, though there's only one
        else
            sendAsyncMessage(msgName, { name:name, arg:arg });
        return undefined;
    }

    // Sandbox has access to content window object (not chrome window!)
    var sandbox = Components.utils.Sandbox(content.window, {
        sandboxName : msgName+"-sandbox",
        wantComponents : false
    });
    sandbox.window = content.window;

    // Sandbox has access to a few functions provided by Flagfox for JavaScript actions
    sandbox.log = function(message) { callFunction("log",message); };
    sandbox.copystring = function(string) { callFunction("copystring",string); };
    sandbox.openurl = function(newurl) { callFunction("openurl",newurl); };
    sandbox.getinfo = function(param) { return callFunction("getinfo",param,true); };  // Need sync to return a value
    sandbox.copyString = sandbox.copystring;
    sandbox.openURL = sandbox.openurl;
    sandbox.getInfo = sandbox.getinfo;

    try {
        // Allow direct access to content window methods/properties as if this action were running in the content
        const JStoEval = "with (window) {\n" + script + "\n}";
        Components.utils.evalInSandbox(JStoEval, sandbox);
    }
    catch (e) {
        if (e.result != Components.results.NS_ERROR_NOT_AVAILABLE)  // Ignore exception thrown if closing tab without closing tab-modal dialog
            callFunction("error",e.toString());
    }
    finally {
        callFunction("done");  // Tell calling chrome function to remove listeners for this content script
        Components.utils.nukeSandbox(sandbox);  // Just to be sure
    }
}

})();
