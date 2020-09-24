/*
 * Original Source:
 * Flagfox v5.2.11
 * Copyright 2007-2017, David Garrett
 * All rights reserved
 *
 * Modified Sept 24, 2020 for GeoFlag
 * See LICENSE for details.
 */
var geoflag_ContentScript = {
 msgName: 'geoflag-contentscriptaction',
 receiveMessage: function(msg)
 {
  if (msg.name !== geoflag_ContentScript.msgName)
   return;
  try
  {
   switch (msg.data.type)
   {
    case 'formfield':
     geoflag_ContentScript._doFormFieldAction(msg.data.values);
     break;
    case 'javascript':
     geoflag_ContentScript._doJavaScriptAction(msg.data.script);
     break;
   }
  }
  finally
  {
   removeMessageListener(geoflag_ContentScript.msgName, geoflag_ContentScript.receiveMessage);
  }
 },
 _doFormFieldAction: function(values)
 {
  function getElement(id)
  {
   let selector = 'form #' + id + ":not([type='hidden']), form [name='" + id + "']:not([type='hidden'])";
   return content.window.document.querySelector(selector);
  }
  try
  {
   let onLoad = function()
   {
    removeEventListener('load', onLoad, true);
    try
    {
     getElement(values.formID).value = values.formValue;
     if (values.buttonID)
     {
      content.window.setTimeout(
       function()
       {
        try
        {
         getElement(values.buttonID).click();
        }
        catch(e) {console.log(e);}
       },
       100
      );
     }
    }
    catch(e) {console.log(e);}
   };
   addEventListener('load',onLoad,true);
  }
  catch(e) {console.log(e);}
 },
 _doJavaScriptAction: function(script)
 {
  function callFunction(name, arg, sync)
  {
   arg = String(arg);
   if (sync)
    return sendSyncMessage(geoflag_ContentScript.msgName, {name:name, arg:arg})[0];
   else
    sendAsyncMessage(geoflag_ContentScript.msgName, {name:name, arg:arg});
   return undefined;
  }
  let sandbox = Components.utils.Sandbox(content.window, {sandboxName: geoflag_ContentScript.msgName + '-sandbox', wantComponents: false});
  sandbox.window = content.window;
  sandbox.log = function(message) {callFunction('log', message);};
  sandbox.copystring = function(string) {callFunction('copystring', string);};
  sandbox.openurl = function(newurl) {callFunction('openurl', newurl);};
  sandbox.getinfo = function(param) {return callFunction('getinfo', param, true);};
  sandbox.copyString = sandbox.copystring;
  sandbox.openURL = sandbox.openurl;
  sandbox.getInfo = sandbox.getinfo;
  try
  {
   const JStoEval = 'with (window) {\n' + script + '\n}';
   Components.utils.evalInSandbox(JStoEval, sandbox);
  }
  catch(e)
  {
   console.log(e);
   if (e.result !== Components.results.NS_ERROR_NOT_AVAILABLE)
    callFunction('error', e.toString());
  }
  finally
  {
   callFunction('done');
   Components.utils.nukeSandbox(sandbox);
  }
 }
};
addMessageListener(geoflag_ContentScript.msgName, geoflag_ContentScript.receiveMessage);
