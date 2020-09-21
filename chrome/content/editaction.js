/*
 * Original Source:
 * Flagfox v5.2.11
 * Copyright 2007-2017, David Garrett
 * All rights reserved
 *
 * Modified Nov 18, 2020 for GeoFlag
 * See LICENSE for details.
 */
var geoflag_Edit = {
 _fullHelpContents: [
  'new_column',
  ['url','{baseDomainName}','{domainName}','{TLD}','{fullURL}'],
  ['meta','{title}','{meta-author}','{meta-description}','{meta-keywords}','_meta'],
  ['advanced','copystring:','javascript:'],
  'new_column',
  ['server','{IPaddress}','{countryCode}','{countryName}'],
  ['languages','{locale}','{locale-page}','{locale-UI}','{locale-OS}','{baseLocale}','_baselocale'],
  ['tips','_bookmarklets']
 ],
 _id: null,
 currentHotkey: null,
 _saveButton: null,
 _nameField: null,
 _templateField: null,
 _autocomplete: null,
 _favicon: null,
 init: function()
 {
  geoflag_Actions.actionsList = opener.geoflag_Actions.actionsList;
  geoflag_Actions.refresh();
  geoflag_Edit._saveButton = document.getElementById('savebutton');
  geoflag_Edit._nameField = document.getElementById('name');
  geoflag_Edit._templateField = document.getElementById('template');
  geoflag_Edit._autocomplete = document.getElementById('templateAutocompletePopup');
  let gBundle = Components.classes['@mozilla.org/intl/stringbundle;1'].getService(Components.interfaces.nsIStringBundleService);
  let locale = gBundle.createBundle('chrome://geoflag/locale/geoflag.properties');
  let localeCtry = gBundle.createBundle('chrome://geoflag/locale/countrynames.properties');
  document.getElementById('show').label = locale.GetStringFromName('showaction');
  geoflag_Edit._favicon = document.getElementById('favicon');
  geoflag_Edit._favicon.onerror = function() {geoflag_Edit._favicon.setAttribute('src', 'chrome://geoflag/skin/icons/default.png');};
  let clickMenu = document.getElementById('iconclick');
  clickMenu.setAttribute('width',clickMenu.boxObject.width);
  clickMenu.removeAttribute('flex');
  let clickMenuItems = clickMenu.getElementsByTagName('menuitem');
  for (let i = 1; i < clickMenuItems.length; i++)
  {
   clickMenuItems[i].label = locale.GetStringFromName(clickMenuItems[i].id);
  }
  if (!window.arguments || typeof window.arguments[0] === 'undefined' || window.arguments[0] === null)
   throw 'No argument passed to dialog';
  geoflag_Edit._id = window.arguments[0];
  if (geoflag_Edit._id !== 'new')
  {
   let action = geoflag_Actions.getByID(geoflag_Edit._id);
   geoflag_Actions.assertValid(action);
   if (!action.custom)
   {
    geoflag_Edit._nameField.readOnly = true;
    geoflag_Edit._templateField.readOnly = true;
    document.getElementById('templateBox').hidden = true;
    document.getElementById('helpBox').hidden = true;
    document.getElementById('getmoreBox').hidden = true;
   }
   document.title = locale.GetStringFromName(action.custom ? 'editcustomactiontitle' : 'editdefaultactiontitle');
   document.getElementById('show').checked = !!action.show;
   geoflag_Edit._nameField.value = geoflag_Actions.getLocalizedName(action);
   geoflag_Edit._templateField.value = action.template;
   geoflag_Edit.updateFavicon();
   if (action.iconclick)
    document.getElementById('iconclick').selectedItem = document.getElementById(action.iconclick);
   if (action.hotkey)
    document.getElementById('hotkey').value = opener.geoflag_Options.hotkeyToString(action.hotkey);
   geoflag_Edit.currentHotkey = action.hotkey;
  }
  else
  {
   document.title = locale.GetStringFromName('addnewactiontitle');
   document.getElementById('savebutton').setAttribute('icon','add');
   let createNewWithTemplate = window.arguments[1];
   if (typeof createNewWithTemplate === 'string')
   {
    geoflag_Edit._templateField.value = opener.geoflag_Options.cleanImportedLine(createNewWithTemplate, opener.geoflag_Options.templateMaxLength);
    geoflag_Edit.updateFavicon();
   }
   let createNewWithName = window.arguments[2];
   if (typeof createNewWithName === 'string')
    geoflag_Edit._nameField.value = opener.geoflag_Options.cleanImportedLine(createNewWithName, opener.geoflag_Options.nameMaxLength);
  }
  geoflag_Edit._watchForRequiredFields();
  document.getElementById('countryName-row').tooltipText += localeCtry.GetStringFromName('US');
  if (!geoflag_Edit._templateField.readOnly)
  {
   window.addEventListener('dragover', geoflag_Edit._onDragOver);
   window.addEventListener('drop', geoflag_Edit._onDragDrop);
  }
  window.sizeToContent();
 },
 save: function()
 {
  geoflag_Actions.assertLoaded();
  if (typeof geoflag_Edit._id === 'undefined' || geoflag_Edit._id === null)
   throw 'No id to save';
  if (geoflag_Edit._id === 'new')
   geoflag_Edit._id = geoflag_Actions.create();
  let action = geoflag_Actions.getByID(geoflag_Edit._id);
  if (action.custom)
  {
   action.name = geoflag_Edit._nameField.value.trim();
   action.template = opener.geoflag_Options.safeDecodeURI(geoflag_Edit._templateField.value.trim());
   geoflag_Actions.assertValid(action);
  }
  action.show = document.getElementById('show').checked ? true : undefined;
  let currentHotclick = document.getElementById('iconclick').selectedItem.id;
  geoflag_Actions.setBindings(geoflag_Edit._id, currentHotclick, geoflag_Edit.currentHotkey);
  geoflag_Actions.save();
  opener.geoflag_Options.generateActionsEditList();
  opener.geoflag_Options.focusAction(geoflag_Edit._id);
  opener.geoflag_Actions.actionsList = geoflag_Actions.actionsList;
  opener.geoflag_Actions.refresh();
 },
 _onDragOver: function(event)
 {
  if (!event.dataTransfer || event.target.id === 'template')
   return;
  if ((event.dataTransfer.types.contains('text/x-moz-url') && event.dataTransfer.getData('text/x-moz-url').length) ||
      (event.dataTransfer.types.contains('text/plain') && event.dataTransfer.getData('text/plain').length))
  {
   event.preventDefault();
   event.dataTransfer.dropEffect = 'copy';
  }
 },
 _onDragDrop: function(event)
 {
  let templateToDrop = null;
  let nameToDrop = null;
  if (event.dataTransfer.types.contains('text/x-moz-url'))
  {
   let lines = event.dataTransfer.getData('text/x-moz-url').split('\n');
   templateToDrop = lines[0];
   nameToDrop = lines[1];
  }
  else if (event.dataTransfer.types.contains('text/plain'))
  {
   let text = event.dataTransfer.getData('text/plain');
   let lines = text.split('\n').filter(function(line){return line.length > 0;});
   for (let i in lines)
   {
    if (opener.geoflag_Options.containsTemplateText(lines[i]))
    {
     templateToDrop = lines[i];
     if (typeof lines[i-1] !== 'undefined' && lines[i-1] !== null && !opener.geoflag_Options.containsTemplateText(lines[i-1]))
      nameToDrop = lines[i-1];
     break;
    }
   }
   if (!templateToDrop)
    templateToDrop = text;
  }
  if (templateToDrop && !geoflag_Edit._templateField.readOnly)
  {
   geoflag_Edit._templateField.value = opener.geoflag_Options.cleanImportedLine(templateToDrop, opener.geoflag_Options.templateMaxLength);
   geoflag_Edit.updateFavicon();
  }
  if (nameToDrop && !geoflag_Edit._nameField.readOnly)
   geoflag_Edit._nameField.value = opener.geoflag_Options.cleanImportedLine(nameToDrop, opener.geoflag_Options.nameMaxLength);
 },
 enterHotkey: function(event)
 {
  let mods = '';
  if (event.ctrlKey)
   mods += 'ctrl ';
  if (event.altKey)
   mods += 'alt ';
  if (event.metaKey)
   mods += 'meta ';
  if (mods === '' || !event.charCode)
   return;
  if (event.shiftKey)
   mods += 'shift ';
  mods = mods.trim();
  let key = String.fromCharCode(event.charCode).toLowerCase();
  if (event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey &&
      (key === 'a' || key === 'z' || key === 'x' || key === 'c' || key === 'v'))
   return;
  geoflag_Edit.currentHotkey = {mods:mods, key:key};
  event.target.value = opener.geoflag_Options.hotkeyToString(geoflag_Edit.currentHotkey);
 },
 _watchForRequiredFields: function()
 {
  let checkRequiredInterval = setInterval(
   function()
   {
    geoflag_Edit._saveButton.disabled = (!geoflag_Edit._nameField.value.trim().length || !geoflag_Edit._templateField.value.trim().length);
   }, 100);
  window.onunload = function() {clearInterval(geoflag_Edit.checkRequiredInterval);};
 },
 updateFavicon: function()
 {
  let msg = geoflag_Edit._templateField.value.trim();
  geoflag_Edit._favicon.src = msg ? geoflag_Tools.getFaviconForTemplate(msg) : '' ;
 },
 generateAutocomplete: function()
 {
  function newListBox(rowCount)
  {
   let listBox = document.createElement('listbox');
   listBox.setAttribute('rows', rowCount + 1);
   listBox.setAttribute('style', 'margin: 0;');
   let listCols = document.createElement('listcols');
   listCols.appendChild(document.createElement('listcol'));
   listCols.appendChild(document.createElement('listcol'));
   listBox.appendChild(listCols);
   return listBox;
  }
  function newItem(label, value)
  {
   let row = document.createElement('listitem');
   let cell = document.createElement('listcell');
   cell.setAttribute('label', label);
   row.appendChild(cell);
   cell = document.createElement('listcell');
   cell.setAttribute('label', value);
   row.appendChild(cell);
   return row;
  }
  function findPossibleCompletions(str)
  {
   let matches1 = [];
   let matches2 = [];
   geoflag_Edit._fullHelpContents.forEach(
    function(sectionContents)
    {
     if (sectionContents instanceof Array)
     {
      sectionContents.forEach(
       function(content)
       {
        if (content[0] === '{')
        {
         let contentLabel = geoflag_Edit._getHelpString(content);
         let contentPos = content.toLowerCase().indexOf(str);
         if (contentPos !== -1)
         {
          matches1.push([content, contentLabel, contentPos]);
          return;
         }
         let labelPos = contentLabel.toLocaleLowerCase().indexOf(str);
         if (labelPos !== -1)
         {
          matches2.push([content, contentLabel, labelPos]);
          return;
         }
        }
       }
      );
     }
    }
   );
   function sortByRank(a,b) {return a[2] - b[2];}
   matches1.sort(sortByRank);
   matches2.sort(sortByRank);
   return matches1.concat(matches2);
  }
  if (geoflag_Edit._autocomplete.firstChild)
   geoflag_Edit._autocomplete.removeChild(geoflag_Edit._autocomplete.firstChild);
  let textBeforeCursor = geoflag_Edit._templateField.value.substring(0, geoflag_Edit._templateField.selectionEnd);
  let openBracePos = textBeforeCursor.lastIndexOf('{');
  let textToAutocomplete = (openBracePos !== -1) ? textBeforeCursor.substring(openBracePos+1) : '';
  if (textToAutocomplete.length && textToAutocomplete.lastIndexOf('}') === -1)
  {
   let autocompletions = findPossibleCompletions(textToAutocomplete.toLocaleLowerCase());
   if (autocompletions.length)
   {
    let listBox = newListBox(autocompletions.length);
    for (let i in autocompletions)
    {
     let param = autocompletions[i][0];
     let label = autocompletions[i][1];
     let item = newItem(label, param);
     let onSelectItem = function()
     {
      geoflag_Edit._templateField.value = geoflag_Edit._templateField.value.substring(0,openBracePos) + param + geoflag_Edit._templateField.value.substring(geoflag_Edit._templateField.selectionEnd);
      geoflag_Edit._templateField.selectionStart = geoflag_Edit._templateField.selectionEnd = openBracePos + param.length;
      geoflag_Edit._autocomplete.hidePopup();
     };
     item.addEventListener('click', onSelectItem);
     let onHoverItem = function(event)
     {
      listBox.selectedItem = event.target;
     };
     item.addEventListener('mouseover', onHoverItem);
     listBox.appendChild(item);
    }
    geoflag_Edit._autocomplete.appendChild(listBox);
    geoflag_Edit._autocomplete.openPopup(geoflag_Edit._templateField, 'after_start');
    return;
   }
  }
  geoflag_Edit._autocomplete.hidePopup();
 },
 onEnterKeyPress: function()
 {
  if (geoflag_Edit._autocomplete.state === 'open')
  {
   let listBox = geoflag_Edit._autocomplete.firstChild;
   if (!listBox.selectedItem)
    geoflag_Edit._autocomplete.hidePopup();
   else
    listBox.selectedItem.click();
  }
  else
  {
   if (geoflag_Edit._saveButton.disabled || geoflag_Edit._nameField.readOnly)
    return;
   let focusedID = document.commandDispatcher.focusedElement.parentNode.parentNode.id;
   if (focusedID !== 'template' && focusedID !== 'name')
    return;
   geoflag_Edit.save();
   window.close();
  }
 },
 onArrowKeyPress: function(key)
 {
  if (geoflag_Edit._autocomplete.state === 'open')
  {
   let listBox = geoflag_Edit._autocomplete.firstChild;
   if (key === 'up')
   {
    if (listBox.selectedIndex > 0)
     listBox.selectedIndex--;
    else
     listBox.selectedIndex = listBox.getRowCount()-1;
   }
   else if (key === 'down')
   {
    if (listBox.selectedIndex < listBox.getRowCount()-1)
     listBox.selectedIndex++;
    else
     listBox.selectedIndex = 0;
   }
  }
 },
 _getHelpString: function(name)
 {
  let gBundle = Components.classes['@mozilla.org/intl/stringbundle;1'].getService(Components.interfaces.nsIStringBundleService);
  let localeHelp = gBundle.createBundle('chrome://geoflag/locale/help.properties');
  return localeHelp.GetStringFromName(name.toLowerCase().replace(/[{}:]/g,''));
 },
 _generateFullHelpPopup: function(fullPlaceholdersPallete)
 {
  function createLabel(text)
  {
   let label = document.createElement('label');
   label.setAttribute('value',text);
   return label;
  }
  function createDescription(text)
  {
   let desc = document.createElement('description');
   desc.setAttribute('width','100%');
   desc.setAttribute('flex','1');
   desc.textContent = text;
   return desc;
  }
  function createPasteButton(toPaste)
  {
   let icon = document.createElement('label');
   icon.setAttribute('class', 'emojicon');
   icon.setAttribute('value', String.fromCodePoint(0x1f4cb, 0xfe0f));
   let gBundle = Components.classes['@mozilla.org/intl/stringbundle;1'].getService(Components.interfaces.nsIStringBundleService);
   let locale = gBundle.createBundle('chrome://geoflag/locale/geoflag.properties');
   icon.setAttribute('tooltiptext',locale.GetStringFromName('pasteintotemplate'));
   icon.onclick = function(evt)
   {
    if (evt.button !== 0)
     return;
    geoflag_Edit.closeFullHelpPopup();
    geoflag_Edit._pastePlaceholder(toPaste);
   };
   return icon;
  }
  let columnRows;
  geoflag_Edit._fullHelpContents.forEach(
   function(sectionContents)
   {
    if (sectionContents === 'new_column')
    {
     let columnGrid = document.createElement('grid');
     columnGrid.setAttribute('style','padding: 2px 10px;');
     let gridColumns = document.createElement('columns');
     let gridColumn = document.createElement('column');
     gridColumn.setAttribute('flex','1');
     gridColumns.appendChild(gridColumn);
     gridColumns.appendChild(gridColumn.cloneNode(false));
     gridColumns.appendChild(gridColumn.cloneNode(false));
     columnGrid.appendChild(gridColumns);
     columnRows = document.createElement('rows');
     columnGrid.appendChild(columnRows);
     fullPlaceholdersPallete.appendChild(columnGrid);
     return;
    }
    sectionContents.forEach(
     function(content)
     {
      if (content[0] === '{')
      {
       let row = document.createElement('row');
       row.appendChild(createLabel(geoflag_Edit._getHelpString(content)));
       row.appendChild(createLabel(content));
       row.appendChild(createPasteButton(content));
       columnRows.appendChild(row);
      }
      else if (content[content.length-1] === ':')
      {
       let row = document.createElement('hbox');
       row.appendChild(createDescription(geoflag_Edit._getHelpString(content)));
       row.appendChild(createPasteButton(content));
       columnRows.appendChild(row);
      }
      else if (content[0] === '_')
      {
       let desc = createDescription(geoflag_Edit._getHelpString(content));
       columnRows.appendChild(desc);
      }
      else
      {
       let label = createLabel(geoflag_Edit._getHelpString(content));
       label.setAttribute('style','font-weight: bold; padding-top: 10px;');
       columnRows.appendChild(label);
      }
     }
    );
   }
  );
 },
 showFullHelpPopup: function()
 {
  let popup = document.getElementById('fullHelpPopup');
  let fullPlaceholdersPallete = document.getElementById('fullPlaceholdersPallete');
  if (fullPlaceholdersPallete.firstChild)
  {
   let x = window.screenX + window.outerWidth / 2 - popup.boxObject.width / 2;
   let y = window.screenY + window.outerHeight / 2 - popup.boxObject.height / 2;
   popup.openPopupAtScreen(x, y);
   return;
  }
  geoflag_Edit._generateFullHelpPopup(fullPlaceholdersPallete);
  if (!fullPlaceholdersPallete.firstChild)
   throw 'Failed to generate help popup contents!';
  function onceMoreWithFeeling()
  {
   popup.removeEventListener('popupshown', onceMoreWithFeeling);
   popup.hidePopup();
   geoflag_Edit.showFullHelpPopup();
  }
  popup.addEventListener('popupshown', onceMoreWithFeeling);
  popup.openPopup();
 },
 closeFullHelpPopup: function()
 {
  document.getElementById('fullHelpPopup').hidePopup();
 },
 _pastePlaceholder: function(toPaste)
 {
  if (toPaste[toPaste.length-1] === ':')
  {
   if (geoflag_Edit._templateField.value.substr(0,toPaste.length) === toPaste)
    return;
   if (geoflag_Edit._templateField.value[10] !== ':')
    geoflag_Edit._templateField.value = toPaste + geoflag_Edit._templateField.value;
   else
    geoflag_Edit._templateField.value = toPaste + geoflag_Edit._templateField.value.substr(11);
   geoflag_Edit.updateFavicon();
  }
  else
   geoflag_Edit._templateField.value = geoflag_Edit._templateField.value.substr(0, geoflag_Edit._templateField.selectionStart) + toPaste + geoflag_Edit._templateField.value.substr(geoflag_Edit._templateField.selectionEnd);
 },
 gotoGetMorePage: function()
 {
  opener.geoflag_Options.gotoGetMorePage();
  if (geoflag_Edit._id === 'new' && geoflag_Edit._templateField.value === '')
   window.close();
 }
};
