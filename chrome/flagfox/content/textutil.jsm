"use strict";  // Use ES5 strict mode for this file

const EXPORTED_SYMBOLS = ["textutil"];  // Only symbol to be exported on Components.utils.import() for this file

const XMLHttpRequest = Components.Constructor("@mozilla.org/xmlextras/xmlhttprequest;1", "nsIXMLHttpRequest");  // For loading files from chrome:// URIs

const textutil =
{
    importExtraStringMethodsIntoScope : function(scope)  // Allows setting of custom methods on base types, but only within a specified scope
    {
        if (!scope.String.prototype.cropTrailingChar)
            scope.String.prototype.cropTrailingChar = function(character) {
                return (this.charAt(this.length-1)==character) ? this.slice(0,this.length-1) : this.valueOf();
            };
        if (!scope.String.prototype.truncateAfterLastChar)
            scope.String.prototype.truncateAfterLastChar = function(character) {
                let pos = this.lastIndexOf(character);
                return (pos != -1) ? this.substring(pos+1) : this.valueOf();
            };
        if (!scope.String.prototype.truncateBeforeFirstChar)
            scope.String.prototype.truncateBeforeFirstChar = function(character) {
                let pos = this.indexOf(character);
                return (pos != -1) ? this.substring(0,pos) : this.valueOf();
            };
        if (!scope.String.prototype.chunkString)
            scope.String.prototype.chunkString = function(n) {
                return this.match(new RegExp(".{1,"+Number(n)+"}","g"));  // return an array of n character chunks of a string
            };
        if (!scope.String.prototype.includes)
            scope.String.prototype.includes = scope.String.prototype.contains;  // Firefox 18-39 (there was a stupid rename of this method; use old name if needed)
    },

    loadTextFile : function(url,returnresult)
    {
        var request = new XMLHttpRequest();
        request.open("GET", url, true);  // async=true
        request.responseType = "text";  // Explicitly get as text to avoid autodetection attempts (loading JSON produces a syntax error otherwise, though it still works)
        request.onerror = function(event) {
            logErrorMessage("Error attempting to load: " + url);
            returnresult(null);
        };
        request.onload = function(event) {
            if (request.response)
                returnresult(request.response);
            else
                request.onerror(event);
        };
        request.send();
    },

    copyStringToClipboard : function(string)
    {
        Components.classes["@mozilla.org/widget/clipboardhelper;1"]
                  .getService(Components.interfaces.nsIClipboardHelper)
                  .copyString(string);
    }
};
