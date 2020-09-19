/*
 * Original Source:
 * Flagfox v5.2.11
 * Copyright 2007-2017, David Garrett
 * All rights reserved
 *
 * Modified Nov 18, 2020 for GeoFlag
 * See LICENSE for details.
 */
var geoflag_Actions = {
 hotKeys: {},
 hotClicks: {},
 actionsList: null,
 actionsListAge: 0,
 load: async function()
 {
  let jActions = await geoflag_TextTools.loadTextFile('chrome://geoflag/content/defaultactions.json');
  if (jActions === false)
  {
   console.log('Could not load default GeoFlag actions file!');
   return;
  }
  try
  {
   const dActions = JSON.parse(jActions);
   let updatesApplied = {};
   if (geoflag.Prefs.prefHasUserValue('useractions'))
    geoflag_Actions.actionsList = geoflag_Actions._unpackJSON(dActions, geoflag.Prefs.getCharPref('useractions'), updatesApplied);
   else
    geoflag_Actions.actionsList = dActions;
   if (updatesApplied.value)
    geoflag_Actions.save();  // If any default actions have been updated, save them (also refreshes)
   else
    geoflag_Actions.refresh();
  }
  catch (e)
  {
   console.log('Error loading actions list:', e);
  }
 },
 _unpackJSON: function(defaults, jActions, needToSave={})
 {
  let updatesDone = [];
  let actionsToPromote = [];
  if (!defaults || !defaults.length || !Array.isArray(defaults))
   throw 'Error getting default actions list!';
  let loadedActions = JSON.parse(jActions);
  if (!loadedActions || !loadedActions.length || !Array.isArray(loadedActions))
   throw 'Error getting user actions list!';
  let defaultMap = new Map();
  for (let action of defaults)
  {
   defaultMap.set(action.name, action);
  }
  if (defaultMap.size !== defaults.length)
   throw 'Error building default actions Map() for user pref loading!';
  function getDefaultActionByName(name)
  {
   for (let action of loadedActions)
   {
    if (!action.custom && action.name === name)
     return action;
   }
   return null;
  }
  function exists(entry)
  {
   return entry !== null;
  }
  function maybeProp(value)
  {
   return value ? value : undefined;
  }
  function unpackAction(entry)
  {
   if (typeof entry === 'string')
    entry = [entry];
   else if (!Array.isArray(entry))
    throw 'Packed action entry is not a string or array!';
   const isCustom = !!entry[4];
   if (!isCustom)
   {
    let name = entry[0];
    let defaultAction = defaultMap.get(name);
    if (defaultAction)
    {
     entry[4] = defaultAction.template;
     defaultMap.delete(name);
    }
    else
    {
     updatesDone.push('action is no longer a default: "' + name + '"');
     return null;
    }
   }
   let action =
   {
    custom:    maybeProp(isCustom),
    name:      entry[0],
    show:      maybeProp(Boolean(entry[1])),
    iconclick: maybeProp(entry[2]),
    hotkey:    maybeProp(geoflag_Actions._unpackHotkey(entry[3])),
    template:  entry[4]
   };
   geoflag_Actions.assertValid(action);
   return action;
  }
  loadedActions = loadedActions.map(unpackAction);
  if (updatesDone.length)
   loadedActions = loadedActions.filter(exists);
  for (let i = 0; defaultMap.size > 0 && i < defaults.length; i++)
  {
   let defaultAction = defaults[i];
   if (defaultMap.has(defaultAction.name))
   {
    loadedActions.splice(i, 0, defaultAction);
    defaultMap.delete(defaultAction.name);
    updatesDone.push('new default action added: "' + defaultAction.name + '"');
   }
  }
  for (let [oldName, newName] of actionsToPromote)
  {
   let replacementAction = getDefaultActionByName(newName);
   if (replacementAction)
   {
    replacementAction.show = true;
    updatesDone.push('default action "' + newName + '" replaces old action "' + oldName + '" in default menu');
   }
  }
  if (updatesDone.length)
  {
   console.log('GeoFlag default action list updates applied:', updatesDone.join(';\n'));
   needToSave.value = true;
  }
  return loadedActions;
 },
 _packJSON: function(oActions)
 {
  function packAction(obj)
  {
   if (!obj.custom && !obj.iconclick && !obj.hotkey && !obj.show)
    return obj.name; 
   let packedAction = [];
   packedAction[0] = obj.name;
   if (obj.show)
    packedAction[1] = 1;
   if (obj.iconclick)
    packedAction[2] = obj.iconclick;
   if (obj.hotkey)
    packedAction[3] = geoflag_Actions._packHotkey(obj.hotkey);
   if (obj.custom && obj.template)
    packedAction[4] = obj.template;
   for (let i=0; i<packedAction.length; i++)
   {
    if (packedAction[i] === undefined)
     packedAction[i] = 0;
   }
   return packedAction;
  }
  if (!Array.isArray(oActions))
   throw 'Error attempting to pack actions list to JSON! List is not an array!';
  let jPacked = JSON.stringify(oActions.map(packAction));
  if (!jPacked || !jPacked.length || typeof jPacked !== 'string')
   throw 'Error saving actions list to JSON!';
  return jPacked;
 },
 _packHotkey: function(hotkeyObj)
 {
  if (!hotkeyObj)
   throw 'Tried to pack undefined hotkey object!';
  return hotkeyObj.mods + ' ' + hotkeyObj.key.replace(' ', 'space');
 },
 _unpackHotkey: function(hotkeyStr)
 {
  if (!hotkeyStr)
   return null;
  let lastSpacePos = hotkeyStr.lastIndexOf(' ');
  return {mods : hotkeyStr.substring(0,lastSpacePos), key : hotkeyStr.substring(lastSpacePos+1).replace('space',' ')};
 },
 getModsCode: function(ctrl, alt, meta)
 {
  let code = 0;
  if (ctrl)
   code |= 1;
  if (alt)
   code |= 2;
  if (meta)
   code |= 4;
  return code;
 },
 save: function()
 {
  geoflag_Actions.refresh();
  geoflag.Prefs.setCharPref('useractions', geoflag_Actions._packJSON(geoflag_Actions.actionsList));
 },
 refresh: function()
 {
  geoflag_Actions.actionsListAge = Date.now();
  geoflag_Actions.hotKeys = {};
  geoflag_Actions.hotClicks = {};
  geoflag_Actions.assertLoaded();
  geoflag_Actions.actionsList.forEach(
   function(action, index)
   {
    if (action.hotkey)
    {
     let key = action.hotkey.key;
     let mods = action.hotkey.mods;
     let charCode = (mods.includes('shift') ? key.toUpperCase() : key.toLowerCase()).charCodeAt(0);
     if (!geoflag_Actions.hotKeys[charCode])
      geoflag_Actions.hotKeys[charCode] = {};
     geoflag_Actions.hotKeys[charCode][geoflag_Actions.getModsCode(mods.includes('ctrl'), mods.includes('alt'), mods.includes('meta'))] = index;
    }
    if (action.iconclick)
     geoflag_Actions.hotClicks[action.iconclick] = index;
   }
  );
 },
 setBindings : function(id, newclick, newhotkey)
 {
  geoflag_Actions.assertLoaded();
  let action = geoflag_Actions.actionsList[id];
  geoflag_Actions.assertValid(action);
  if (newclick === '')
   newclick = undefined;
  if (newclick)
  {
   for (let i in geoflag_Actions.actionsList)
   {
    if (geoflag_Actions.actionsList[i].iconclick === newclick)
     geoflag_Actions.actionsList[i].iconclick = undefined;
   }
  }
  if (newhotkey)
  {
   for (let i in geoflag_Actions.actionsList)
   {
    if (geoflag_Actions.actionsList[i].hotkey && geoflag_Actions.actionsList[i].hotkey.key === newhotkey.key && geoflag_Actions.actionsList[i].hotkey.mods === newhotkey.mods)
     geoflag_Actions.actionsList[i].hotkey = undefined;
   }
  }
  if (newclick !== null)
   action.iconclick = newclick;
  if (newhotkey !== null)
   action.hotkey = newhotkey;
 },
 getLocalizedName: function(action)
 {
  try
  {
   if (!action.custom)
    return geoflag.localeGeneral.GetStringFromName('action.' + action.name.replace(/[ :]/g, '_').toLowerCase());
  }
  catch(e) {}
  return action.name;
 },
 assertLoaded : function()
 {
  if (!geoflag_Actions.actionsList || !geoflag_Actions.actionsList.length)
   throw Error('Actions not loaded!');
 },
 assertValid : function(action)
 {
  if (!action || !action.name || !action.template)
   throw Error('Invalid action: ' + JSON.stringify(action));
 },
 getByID: function(id)
 {
  return geoflag_Actions.actionsList[id];
 },
 create: function()
 {
  return geoflag_Actions.actionsList.push({custom:true}) - 1;
 },
 remove: function(id)
 {
  return geoflag_Actions.actionsList.splice(id, 1)[0];
 },
 insert: function(id, action)
 {
  geoflag_Actions.actionsList.splice(id, 0, action);
 },
 append: function(newactions)
 {
  geoflag_Actions.actionsList = geoflag_Actions.actionsList.concat(newactions);
 },
 get length()
 {
  return geoflag_Actions.actionsList.length;
 }
};
