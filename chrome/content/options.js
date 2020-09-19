/*
 * Original Source:
 * Flagfox v5.2.11
 * Copyright 2007-2017, David Garrett
 * All rights reserved
 *
 * Modified Nov 18, 2020 for GeoFlag
 * See LICENSE for details.
 */
var geoflag_Options = {
 _Prefs: Components.classes['@mozilla.org/preferences-service;1'].getService(Components.interfaces.nsIPrefService).getBranch('extensions.geoflag.'),
 _locale: null,
 nameMaxLength: 25,
 templateMaxLength: 1000,
 _importableTextTypes: ['text/x-moz-url', 'text/plain', 'text/html'],
 _clipboardStringBuffer: null,
 _actionsBox: null,
 _platformKeys: null,
 _needToSaveActions: false,
 init: async function()
 {
  await geoflag_Actions.load();
  let gBundle = Components.classes['@mozilla.org/intl/stringbundle;1'].getService(Components.interfaces.nsIStringBundleService);
  geoflag_Options._locale = gBundle.createBundle('chrome://geoflag/locale/geoflag.properties');
  geoflag_Options._actionsBox = document.getElementById('actionsRichlistbox');
  geoflag_Options._platformKeys = document.getElementById('platformKeys');
  geoflag_Options.generateActionsEditList();
  if (geoflag_Options._Prefs.prefHasUserValue('warn.proxy') || geoflag_Options._Prefs.prefHasUserValue('warn.tld') || geoflag_Options._Prefs.prefHasUserValue('warn.update'))
   document.getElementById('resetMessagesLink').hidden = false;
  document.getElementById('showFaviconsCheckbox').checked = geoflag_Options._Prefs.getBoolPref('showfavicons');
  document.getElementById('openLinksInMenu').selectedItem = document.getElementById(geoflag_Options._Prefs.getCharPref('openlinksin'));
  window.addEventListener('dragover', geoflag_Options._onDragOver);
  window.addEventListener('dragexit', geoflag_Options._onDragExit);
  window.addEventListener('drop', geoflag_Options._onDragDrop);
 },
 _getIDofActionFromChild: function(child)
 {
  let ancestor = child;
  do
  {
   if (ancestor.tagName === 'richlistitem')
    return geoflag_Options._actionsBox.getIndexOfItem(ancestor);
   ancestor = ancestor.parentNode;
  }
  while(ancestor);
  return -1;
 },
 onActionCheckboxClicked: function(evt)
 {
  let id = geoflag_Options._getIDofActionFromChild(evt.target);
  geoflag_Actions.getByID(id).show = evt.target.checked ? true : undefined;
  geoflag_Options._softSaveActions();
 },
 onEditActionClicked: async function(evt)
 {
  if(evt.button !== 0)
   return;
  if (evt.target.disabled)
   return;
  let id = geoflag_Options._getIDofActionFromChild(evt.target);
  await geoflag_Options.openEditAction(id);
 },
 onToggleDeleteActionClicked: function(evt)
 {
  if(evt.button !== 0)
   return;
  let id = geoflag_Options._getIDofActionFromChild(evt.target);
  geoflag_Options._toggleDeleteAction(id);
 },
 generateActionsEditList: function()
 {
  geoflag_Actions.assertLoaded();
  let getString = geoflag_Options._locale.GetStringFromName;
  function createElement(tagName)
  {
   let newElement = document.createElement(tagName);
   for (let i = 1; i < arguments.length; i++)
   {
    newElement.setAttribute(arguments[i][0], arguments[i][1]);
   }
   return newElement;
  }
  let defaultItemTemplate = createElement('richlistitem',
                                         ['style',      '-moz-padding-end: 3px;'],
                                         ['ondblclick', 'geoflag_Options.onEditActionClicked(event);']);
  defaultItemTemplate.appendChild(createElement('checkbox',
                                               ['tooltiptext', getString('showaction')],
                                               ['oncommand',   'geoflag_Options.onActionCheckboxClicked(event);']));
  defaultItemTemplate.appendChild(createElement('image',
                                               ['width',  '16'],
                                               ['height', '16']));
  defaultItemTemplate.appendChild(createElement('label',
                                               ['flex',  '1'],
                                               ['width', '80'],
                                               ['crop',  'end']));
  defaultItemTemplate.appendChild(createElement('label',
                                               ['flex',  '1'],
                                               ['width', '100'],
                                               ['crop',  'end']));
  let customItemTemplate = defaultItemTemplate.cloneNode(true);
  defaultItemTemplate.appendChild(createElement('label',
                                               ['class',       'emojicon'],
                                               ['value',       String.fromCodePoint(0x2699, 0xfe0f)],
                                               ['tooltiptext', getString('editdefaultaction')],
                                               ['onclick',     'geoflag_Options.onEditActionClicked(event);']));
  customItemTemplate.appendChild(createElement('label',
                                              ['class',       'emojicon'],
                                              ['value',       String.fromCodePoint(0x1f4dd, 0xfe0f)],
                                              ['tooltiptext', getString('editcustomaction')],
                                              ['onclick',     'geoflag_Options.onEditActionClicked(event);']) );
  customItemTemplate.appendChild(createElement('label',
                                              ['class',       'emojicon'],
                                              ['value',       String.fromCodePoint(0x1f5d1, 0xfe0f)],
                                              ['tooltiptext', getString('deleteaction')],
                                              ['onclick',     'geoflag_Options.onToggleDeleteActionClicked(event);']));
  customItemTemplate.appendChild(createElement('label',
                                              ['class',       'emojicon'],
                                              ['value',       String.fromCodePoint(0x267b, 0xfe0f)],
                                              ['tooltiptext', getString('undeleteaction')],
                                              ['onclick',     'geoflag_Options.onToggleDeleteActionClicked(event);'],
                                              ['hidden',      true]));
  defaultItemTemplate.appendChild(createElement('spacer',
                                               ['width',  '8']));
  let trashBin = [];
  for (let i = geoflag_Options._actionsBox.getRowCount() - 1; i >= 0; i--)
  {
   let item = geoflag_Options._actionsBox.getItemAtIndex(i);
   if (item.disabled)
    trashBin[i] = true;
   geoflag_Options._actionsBox.removeChild(item);
  }
  for (let i = 0; i < geoflag_Actions.length; i++)
  {
   let action = geoflag_Actions.getByID(i);
   let newItem = action.custom ? customItemTemplate.cloneNode(true) : defaultItemTemplate.cloneNode(true);
   let cbox = newItem.getElementsByTagName('checkbox')[0];
   cbox.setAttribute('checked', !!action.show);
   let icon = newItem.getElementsByTagName('image')[0];
   icon.setAttribute('src', geoflag_Tools.getFaviconForTemplate(action.template));
   icon.onerror = function()
   {
    icon.setAttribute('src', 'chrome://geoflag/skin/icons/default.png');
   };
   let labels = newItem.getElementsByTagName('label');
   let localizedName = geoflag_Actions.getLocalizedName(action);
   let nameLabel = labels[0];
   nameLabel.setAttribute('value', localizedName);
   nameLabel.setAttribute('tooltiptext', localizedName);
   if (action.iconclick || action.hotkey)
   {
    let shortcutsList = '';
    if (action.iconclick)
     shortcutsList += getString(action.iconclick);
    if (action.iconclick && action.hotkey)
     shortcutsList += ', ';
    if (action.hotkey)
     shortcutsList += geoflag_Options.hotkeyToString(action.hotkey);
    let shortcutsLabel = labels[1];
    shortcutsLabel.setAttribute('value', shortcutsList);
    shortcutsLabel.setAttribute('tooltiptext', shortcutsList);
   }
   let dragDataString = localizedName + '\n' + action.template + '\n';
   let onDragStart = function(evt)
   {
    if (!newItem.selected)
     return;
    evt.dataTransfer.setDragImage(icon, 16, 16);
    evt.dataTransfer.mozSetDataAt('application/x-moz-node', newItem, 0);
    evt.dataTransfer.setData('text/plain', dragDataString);
   };
   newItem.addEventListener('dragstart', onDragStart);
   geoflag_Options._actionsBox.appendChild(newItem);
  }
  for (let i in trashBin)
  {
   geoflag_Options._toggleDeleteAction(i);
  }
  geoflag_Options._actionsBox.selectedIndex = -1;
  geoflag_Options.setArrowStates();
 },
 _getDragTargetID: function(evt)
 {
  let target = evt.target;
  if (document.tooltipNode && target.tagName === 'window')
   target = document.tooltipNode;
  let targetID = geoflag_Options._getIDofActionFromChild(target);
  if (targetID === -1 && geoflag_Options._actionsBox === target)
   targetID = geoflag_Options._actionsBox.getRowCount()-1;
  return targetID;
 },
 _getActionDragDelta: function(draggedID, targetID)
 {
  if (draggedID === -1 || targetID === -1)
   return 0;
  return targetID - draggedID;
 },
 _onDragOver: function(evt)
 {
  if (!evt.dataTransfer)
   return;
  if (evt.dataTransfer.mozTypesAt(0).contains('application/x-moz-node'))
  {
   let targetID = geoflag_Options._getDragTargetID(evt);
   let targetItem = geoflag_Options._actionsBox.getItemAtIndex(targetID);
   if (!targetItem)
       return;
   evt.preventDefault();
   evt.dataTransfer.dropEffect = 'move';
   let draggedItem = evt.dataTransfer.mozGetDataAt('application/x-moz-node', 0);
   let draggedID = geoflag_Options._actionsBox.getIndexOfItem(draggedItem);
   let delta = geoflag_Options._getActionDragDelta(draggedID, targetID);
   if (delta > 0)
    targetItem.style.borderBottom = 'dotted';
   else if (delta < 0)
    targetItem.style.borderTop = 'dotted';
   targetItem.style.borderColor = 'Highlight';
   geoflag_Options._actionsBox.ensureIndexIsVisible(targetID - 1);
   geoflag_Options._actionsBox.ensureIndexIsVisible(targetID);
   geoflag_Options._actionsBox.ensureIndexIsVisible(targetID + 1);
  }
  else
  {
   for (let i in geoflag_Options._importableTextTypes)
   {
    if (evt.dataTransfer.types.contains(geoflag_Options._importableTextTypes[i]))
    {
     let data = evt.dataTransfer.getData(geoflag_Options._importableTextTypes[i]);
     if (!data || !data.length)
      continue;
     evt.preventDefault();
     evt.dataTransfer.dropEffect = 'copy';
     geoflag_Options._actionsBox.parentNode.style.border = 'dotted Highlight';
     break;
    }
   }
  }
 /*
  // Import debug
  let output = [];
  for (let i=0; i<evt.dataTransfer.types.length; i++)
  {
   let type = evt.dataTransfer.types[i];
   output.push(type + ': "' + evt.dataTransfer.getData(type) + '"');
  }
  Components.utils.reportError(output.join('\n'));
 */
 },
 _onDragExit: function(evt)
 {
  geoflag_Options._actionsBox.parentNode.style.border = 'dotted transparent';
  let targetID = geoflag_Options._getDragTargetID(evt);
  let targetItem = geoflag_Options._actionsBox.getItemAtIndex(targetID);
  if (targetItem)
   targetItem.style.border = '';
 },
 _onDragDrop: async function(evt)
 {
  geoflag_Options._onDragExit(evt);
  if (evt.dataTransfer.mozTypesAt(0).contains('application/x-moz-node'))
  {
   let draggedItem = evt.dataTransfer.mozGetDataAt('application/x-moz-node', 0);
   let draggedID = geoflag_Options._actionsBox.getIndexOfItem(draggedItem);
   let targetID = geoflag_Options._getDragTargetID(evt);
   let delta = geoflag_Options._getActionDragDelta(draggedID,targetID);
   if (delta !== 0)
    geoflag_Options.moveSelectedAction(delta);
  }
  else
  {
   for (let i = 0; i < geoflag_Options._importableTextTypes.length; i++)
   {
    if (evt.dataTransfer.types.contains(geoflag_Options._importableTextTypes[i]) && await geoflag_Options._importData(geoflag_Options._importableTextTypes[i], evt.dataTransfer.getData(geoflag_Options._importableTextTypes[i])))
     return;
   }
  }
 },
 _fetchStringFromClipboard: function()
 {
  try
  {
   let clipboard = Components.classes['@mozilla.org/widget/clipboard;1'].getService(Components.interfaces.nsIClipboard);
   if (!clipboard.hasDataMatchingFlavors(['text/unicode'], 1, clipboard.kGlobalClipboard))
    throw null;
   let transfer = Components.classes['@mozilla.org/widget/transferable;1'].createInstance(Components.interfaces.nsITransferable);
   transfer.init(null);
   transfer.addDataFlavor('text/unicode');
   clipboard.getData(transfer, clipboard.kGlobalClipboard);
   let supportsString = new Object();
   let supportsStringLength = new Object();
   transfer.getTransferData('text/unicode', supportsString, supportsStringLength);
   supportsString = supportsString.value.QueryInterface(Components.interfaces.nsISupportsString);
   geoflag_Options._clipboardStringBuffer = supportsString.data.substring(0, supportsStringLength.value / 2);
  }
  catch (e)
  {
   console.log(e);
   geoflag_Options._clipboardStringBuffer = null;
  }
 },
 _checkClipboardContents: function()
 {
  geoflag_Options._fetchStringFromClipboard();
  return geoflag_Options._clipboardStringBuffer ? geoflag_Options.containsTemplateText(geoflag_Options._clipboardStringBuffer) : false;
 },
 pasteFromBuffer: async function()
 {
  if (geoflag_Options._clipboardStringBuffer)
   await geoflag_Options._importData('text/plain', geoflag_Options._clipboardStringBuffer);
 },
 attemptPaste: async function()
 {
  if (geoflag_Options._checkClipboardContents())
   await geoflag_Options.pasteFromBuffer();
 },
 _importData: async function(mimeType,data)
 {
  switch (mimeType)
  {
   case 'text/x-moz-url':
    let mLines = data.split('\n');
    if (mLines.length !== 2)
     return false;
    await geoflag_Options.openEditAction('new', mLines[0], mLines[1]);
    return true;
   case 'text/plain':
    let sLines = data.split('\n').filter(function(line) {return line.length>0;});
    let parsed = geoflag_Options._parseTemplateList(sLines);
    if (parsed instanceof Array)
    {
     geoflag_Actions.append(parsed);
     geoflag_Actions.save();
     geoflag_Options.generateActionsEditList();
     geoflag_Options.focusAction(geoflag_Actions.length - 1);
     return true;
    }
    else if (parsed)
    {
     await geoflag_Options.openEditAction('new', parsed);
     return true;
    }
    const urlPattern = /(https?:\/\/|www\.)[^\s'"`<>(){}[\]]+/i;
    for (let i = 0; i < sLines.length; i++)
    {
     if (urlPattern.test(sLines[i]))
     {
      await geoflag_Options.openEditAction('new', sLines[i]);
      return true;
     }
    }
    return false;
   case 'application/xml':
   case 'text/html':
    try
    {
     let parser = new DOMParser();
     let firstLink = parser.parseFromString(data, mimeType).getElementsByTagName('a')[0];
     let href = firstLink.getAttribute('href');
     let name = firstLink.textContent;
     if (!href)
      return false;
    }
    catch(e)
    {
     console.log(e);
     return false;
    }
    await geoflag_Options.openEditAction('new', href, name)
    return true;
   default:
    throw Error('Invalid type passed to importData()');
  }
 },
 _parseTemplateList: function(lines)
 {
  let lineIsTemplate = lines.map(geoflag_Options.containsTemplateText);
  let newActions = [];
  for (let i = lineIsTemplate.lastIndexOf(true); i >= 0; i--)
  {
   if (lineIsTemplate[i] && lines[i-1] !== undefined && !lineIsTemplate[i-1])
   {
    newActions.unshift(
     {
      custom: true,
      name: geoflag_Options.cleanImportedLine(lines[i-1], geoflag_Options.nameMaxLength),
      template: geoflag_Options.safeDecodeURI(geoflag_Options.cleanImportedLine(lines[i], geoflag_Options.templateMaxLength))
     });
    i--;
   }
  }
  if (newActions.length)
   return newActions;
  let firstTemplateLineID = lineIsTemplate.indexOf(true);
  if (firstTemplateLineID !== -1)
   return lines[firstTemplateLineID];
  return null;
 },
 cleanImportedLine: function(line, cap)
 {
  return line.replace(/^[\s*#@>&\-=+.:]*/, '').trimRight().substr(0, cap);
 },
 containsTemplateText: function(data)
 {
  return (/\{(fullurl|(base)?domainname|tld|ipaddress|country(code|name)|title|meta-.*|(base)?locale(-ui|-os|-page)?)\}/i).test(data);
 },
 safeDecodeURI: function(uri)
 {
  try
  {
   return decodeURI(uri);
  }
  catch(e)
  {
   console.log(e);
   return uri;
  }
 },
 hotkeyToString: function(hotkey)
 {
  return hotkey.mods.replace(/ /g, '\u2219')
                    .replace('ctrl', geoflag_Options._platformKeys.getString('VK_CONTROL'))
                    .replace('alt', geoflag_Options._platformKeys.getString('VK_ALT'))
                    .replace('meta', geoflag_Options._platformKeys.getString('VK_META'))
                    .replace('shift', geoflag_Options._platformKeys.getString('VK_SHIFT'))
         + '\u2219' + hotkey.key.replace(' ', '\u2423');
 },
 _canMoveAction: function(id, delta)
 {
  if (id < 0 || id >= geoflag_Actions.length)
   return false;
  let newid = id + delta;
  if (newid < 0 || newid >= geoflag_Actions.length || newid === id)
   return false;
  return true;
 },
 moveSelectedAction: function(delta)
 {
  let id = geoflag_Options._actionsBox.selectedIndex;
  if (!geoflag_Options._canMoveAction(id, delta))
   return;
  let newid = id + delta;
  let action = geoflag_Actions.remove(id);
  geoflag_Actions.insert(newid, action);
  geoflag_Options._softSaveActions();
  let item = geoflag_Options._actionsBox.removeItemAt(id);
  let newNextSibling = geoflag_Options._actionsBox.getItemAtIndex(newid);
  geoflag_Options._actionsBox.insertBefore(item,newNextSibling);
  geoflag_Options.forceSelectedVisible();
  geoflag_Options.setArrowStates();
 },
 _toggleDeleteAction: function(id)
 {
  if (!geoflag_Actions.getByID(id).custom)
   return;
  let item = geoflag_Options._actionsBox.getItemAtIndex(id);
  item.disabled = !item.disabled;
  let children = item.getElementsByTagName('*');
  for (let i = 0; i < children.length; i++)
  {
   if (children[i].checked)
    children[i].click();
   else if (children[i].value)
    children[i].hidden = !children[i].hidden;
   if (children[i].value === String.fromCodePoint(0x267b, 0xfe0f))
    children[i].disabled = false;
   else
    children[i].disabled = item.disabled;
  }
 },
 onDeleteKeyPress: function()
 {
  if (geoflag_Options._actionsBox.selectedItem && geoflag_Actions.getByID(geoflag_Options._actionsBox.selectedIndex).custom)
  {
   geoflag_Options._toggleDeleteAction(geoflag_Options._actionsBox.selectedIndex);
   if (geoflag_Options._actionsBox.selectedIndex < geoflag_Options._actionsBox.itemCount)
    geoflag_Options._actionsBox.selectedIndex++;
  }
 },
 onEnterKeyPress: async function()
 {
  let selectedItem = geoflag_Options._actionsBox.selectedItem;
  if (selectedItem)
  {
   if (selectedItem.disabled)
    geoflag_Options._toggleDeleteAction(geoflag_Options._actionsBox.selectedIndex);
   await geoflag_Options.openEditAction(geoflag_Options._actionsBox.selectedIndex);
  }
 },
 onNavigationKeyPress: function(key)
 {
  geoflag_Options._actionsBox.focus();
  if (geoflag_Options._actionsBox.selectedItem)
   return;
  if (key === 'end')
   geoflag_Options._actionsBox.selectedIndex = geoflag_Options._actionsBox.itemCount - 1;
  else
   geoflag_Options._actionsBox.selectedIndex = 0;
 },
 _softSaveActions: function()
 {
  geoflag_Options._needToSaveActions = true;
  geoflag_Actions.refresh();
 },
 emptyTrashAndSave: function()
 {
  for (let i = geoflag_Options._actionsBox.getRowCount() - 1; i >= 0; i--)
  {
   if (geoflag_Options._actionsBox.getItemAtIndex(i).disabled)
   {
    geoflag_Actions.remove(i);
    geoflag_Options._needToSaveActions = true;
   }
  }
  if (geoflag_Options._needToSaveActions)
   geoflag_Actions.save();
  let wndList = Components.classes['@mozilla.org/appshell/window-mediator;1'].getService(Components.interfaces.nsIWindowMediator).getEnumerator('navigator:browser');
  while (wndList.hasMoreElements())
  {
   let wnd = wndList.getNext()
   wnd.geoflag_Actions.load();
  }
 },
 forceSelectedVisible: function()
 {
  geoflag_Options._actionsBox.ensureIndexIsVisible(geoflag_Options._actionsBox.selectedIndex);
 },
 focusAction: function(id)
 {
  geoflag_Options._actionsBox.selectedIndex = id;
  geoflag_Options.forceSelectedVisible();
 },
 setArrowStates: function()
 {
  let id = geoflag_Options._actionsBox.selectedIndex;
  document.getElementById('up').setAttribute('disabled', !geoflag_Options._canMoveAction(id, -1));
  document.getElementById('down').setAttribute('disabled', !geoflag_Options._canMoveAction(id, +1));
 },
 resetMessagesPrefs: function()
 {
  geoflag_Options._Prefs.clearUserPref('warn.proxy');
  geoflag_Options._Prefs.clearUserPref('warn.tld');
  geoflag_Options._Prefs.clearUserPref('warn.update');
  geoflag.shownWarnings = null;
  document.getElementById('resetMessagesLink').hidden = true;
 },
 openEditAction: async function(id, startingTemplate, startingName)
 {
  window.openDialog('chrome://geoflag/content/editaction.xul', 'GeoFlagEditAction', 'chrome,dialog,centerscreen,modal', id, startingTemplate, startingName).focus();
  //await geoflag_Actions.load();
  geoflag_Options.generateActionsEditList();
 },
 openCloneSelectedAction: async function()
 {
  if (geoflag_Options._actionsBox.selectedIndex === -1)
   return;
  let action = geoflag_Actions.getByID(geoflag_Options._actionsBox.selectedIndex);
  if (action)
   await geoflag_Options.openEditAction('new', action.template, geoflag_Actions.getLocalizedName(action));
 },
 openIPDB: function()
 {
  window.openDialog('chrome://geoflag/content/ipdb.xul', 'GeoFlagDB', 'chrome,dialog,centerscreen,modal').focus();
 },
 initAddPopup: function()
 {
  document.getElementById('clone').disabled = !geoflag_Options._actionsBox.selectedCount;
  document.getElementById('paste').disabled = !geoflag_Options._checkClipboardContents();
 },
 gotoGetMorePage: function()
 {
  geoflag_Tools.addTabInCurrentBrowser('https://flagfox.net/viewforum.php?f=5');
 },
 setShowFavicons: function()
 {
  geoflag_Options._Prefs.setBoolPref('showfavicons', document.getElementById('showFaviconsCheckbox').checked);
  geoflag_Actions.actionsListAge = Date.now();
 },
 setOpenLinksIn: function()
 {
  geoflag_Options._Prefs.setCharPref('openlinksin', document.getElementById('openLinksInMenu').selectedItem.id);
 }
};