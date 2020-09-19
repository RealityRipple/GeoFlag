"use strict";  // Use ES5 strict mode for this file

const EXPORTED_SYMBOLS = ["ipdb"];  // Only symbol to be exported on Components.utils.import() for this file

const XMLHttpRequest = Components.Constructor("@mozilla.org/xmlextras/xmlhttprequest;1", "nsIXMLHttpRequest");  // For loading files from chrome:// URIs

Components.utils.import("chrome://flagfox/content/textutil.jsm");
textutil.importExtraStringMethodsIntoScope(this);

// Each IPDB file is loaded automatically on its first use
const pathToIPDBFiles = "chrome://flagfox/content/ipdb/";

/*  NOTE:
 *  For IPv4 the full 32-bit address is used. For IPv6 the 48-bit prefix of the 128-bit address is used. (cannot use full 64-bit prefix due to JS limitations)
 *  Each integer is big-endian binary packed: 4 bytes for each full IPv4 address & 6 bytes for each IPv6 address prefix.
 *  All IPs/prefixes must be included with unknown/unallocated ranges listed as code "??".
 *  Each IPDB has two typed arrays: the complete ordered list of start IPs/prefixes & the corresponding ordered list of country codes.
 *  In the uncompressed file format, these two lists can simply be concatenated together, but it's possible to pack this far more efficiently.
 *  In the compressed file format used in this version, ranges are stored as a series of range widths instead of absolute starting values.
 *  The list can be translated back into range starting values by counting up from zero by each range width, in order.
 *  IP address blocks are allocated in a relatively small number of sizes, so this information can be compressed down by assigning each one an ID.
 *  Likewise, there's a fixed number of country codes. The codes are two byte strings, however there are fewer than 256, so a one byte ID is sufficient.
 *  The one byte country code IDs are converted into two byte country code strings via the "IPDBmetadata.countryIDs" array in metadata.json.
 *  Total IPDB files size reductions are around 53%; after XPI/ZIP compression about 51%; up to 65% or so with a bad compressor (e.g. Mozilla's addon code signer)
 *  Overall, the Flagfox XPI file size is in the vicinity of a third smaller with this format (~300kB saved in the case of an AMO repack).
 *
 *  The compressed file has this information packed in the following format:
 *      [entries count][rangewidthsdict length][rangewidthsdict...][rangewidthsIDs...][codesIDs...]
 *         (4 bytes)          (2 bytes)         (bytesPerInt ea.)    (2 bytes ea.)    (1 byte ea.)
 */
var IPv4DB = { type : "IPv4", filename : "ip4.cdb", bytesPerInt : 4 };
var IPv6DB = { type : "IPv6", filename : "ip6.cdb", bytesPerInt : 6 };
var IPDBmetadata = null;

var ipdb =
{
    load : function()  // Kicks off async load of metadata file
    {
        textutil.loadTextFile(pathToIPDBFiles+"metadata.json", function(metadataJSONtext) {
            if (!metadataJSONtext)
                throw "Could not load IPDB metadata file!";
            IPDBmetadata = JSON.parse(metadataJSONtext);
            IPDBmetadata.countryIDs = IPDBmetadata.countryIDs.chunkString(2);  // Stored as string blob; convert to array
        });
    },

    close : function()
    {
        closeIPDBfile(IPv4DB);
        closeIPDBfile(IPv6DB);
    },

    get version()  // Generates an IPDB version/date string in the form of YYYY-M
    {
        if (!IPDBmetadata || !IPDBmetadata.created)
            return "ERROR";
        var date = new Date(IPDBmetadata.created);
        return date.getUTCFullYear() + "-" + (date.getUTCMonth()+1);  // JS months are 0-11, just to be confusing
    },

    get daysOld()
    {
        if (!IPDBmetadata || !IPDBmetadata.created)
            return Infinity;
        return (Date.now() - IPDBmetadata.created) / 86400000;
    },

    get hmac()  // Truncated HMAC authenticating the Flagfox/IPDB versions (for Geotool cookie)
    {
        if (!IPDBmetadata || !IPDBmetadata.created || !IPDBmetadata.hmac)
            return "ERROR";
        return IPDBmetadata.hmac;
    },

    lookupIP : function(ipString)
    {
        try
        {
            if (!ipString)
                return null;

            // IPv6 uses colons and IPv4 uses dots
            if (!ipString.includes(":"))
                return searchDB( IPv4DB, IPv4StringToInteger(ipString) );  // Look up normal IPv4 address

            if (ipString == "::1")  // IPv6 Localhost (prefix is zero, so can't use IPv6 prefix DB)
                return "-L";

            if (ipString.includes("."))  // IPv4 address embedded in an IPv6 address using mixed notation ("::ffff:" or "::" followed by standard IPv4 notation)
                return searchDB( IPv4DB, IPv4StringToInteger(ipString.substr(ipString.lastIndexOf(":")+1)) );

            var longIPv6String = expandIPv6String(ipString);  // Full IPv6 notation in use; expand all shorthand to full 32 char hex string

            for (let rule of IPv4inIPv6rules)  // Look for tunneling and embedded IPv4 to IPv6 address types
                if (longIPv6String.startsWith(rule.prefix))
                    return searchDB( IPv4DB, rule.extractIPv4Integer(longIPv6String) );

            return searchDB( IPv6DB, hexStringToInteger(longIPv6String.substr(0,12)) );  // Look up normal IPv6 address prefix (48 bits = 6 bytes = 12 hex chars)
        }
        catch (e)
        {
            if (e == "LOADING IPDB" || e == "IPDB LOAD ERROR")
                return e;
            return null;
        }
    }
};

/*  NOTE:
 *  The IPDB files are not loaded automatically on startup. Instead, each file's loading is deferred until its first use, if at all.
 *  This load happens via the asynchronous callback from the DNS and proxy service handlers which calls ipdb.lookupIP().
 *  In order to load the IPDB file(s) asynchronously I need to instruct the flag icon handler to wait for load, triggered with the exception here.
 */
function autoLoadIPDB(db)
{
/*  db.loadState values:
 *      undefined = not loaded
 *      1 = just started load
 *      2 = file data is loaded
 *      3 = data is valid and view is loaded (ready to use)
 *     -1 = an error occured; do not auto-load again
 */
    if (db.loadState === 3)
        return; // Fully loaded and ready

    if (db.loadState === undefined)
        loadIPDBfile(db);

    throw (db.loadState > 0) ? "LOADING IPDB" : "IPDB LOAD ERROR" ;
}

function loadIPDBfile(db)
{
    if (!IPDBmetadata)
        throw "LOADING IPDB";  // Hasn't loaded yet

    if (db.rangeIPs != undefined || db.loadState > 0)
        throw "Tried to load " + db.type + " DB twice!";

    function handleIPDBLoadError(db,msg)
    {
        closeIPDBfile(db);
        db.loadState = -1;
        Components.utils.reportError(msg);
    }

    db.loadState = 1;

    // Open an XMLHttpRequest to the chrome:// URI and get a typed JavaScript array buffer with the data
    var request = new XMLHttpRequest();
    db.path = pathToIPDBFiles + db.filename;
    request.open("GET", db.path);  // async=true
    request.responseType = "arraybuffer";
    request.onerror = function(event) {
        handleIPDBLoadError(db, "Flagfox ERROR attempting to load " + db.type + " DB file from: " + db.path);
    };
    request.onload = function(event)
    {
        if (db.loadState != 1)  // If closed while opening, then abort
            return;
        try {
            db.loadState = 2;
            loadCompressedIPDBdata(db, request.response);
            db.loadState = 3;
        } catch (e) {
            handleIPDBLoadError(db, "Flagfox ERROR attempting to load " + db.type + " DB data: " + e);
        }
    };
    request.send();
}

function loadCompressedIPDBdata(db,data)
{
    if (!data)
        throw "got null data on attempt to load file";
    if (!data.byteLength)
        throw "file loaded with zero bytes";
    if (data.byteLength != IPDBmetadata.size[db.type])
        throw "file is corrupt (got " + data.byteLength + " bytes but expected " + IPDBmetadata.size[db.type] + " bytes)";

    var pos = 0;
    function newFastDataView(length,intbytes)
    {
        var size = (intbytes>1) ? length*intbytes : length ;
        var view = new FastDataViewUBE(data,pos,size,intbytes);  // New typed array view of 'size' length starting at 'pos' in buffer 'data'
        pos += size;                                             // Position in 'data' is now at 'pos' bytes
        return view;
    }

    // Create a set of typed array interfaces mapped to sections of the file's data buffer (big-endian packed)
    var header = newFastDataView(6);
    var entries = header.getUint32(0);                                            // 4 byte entries count
    var rangewidthsdictlength = header.getUint16(4);                              // 2 byte range width dictionary length
    var rangewidthsdict = newFastDataView(rangewidthsdictlength,db.bytesPerInt);  // range width dictionary: 4 or 6 bytes each, depending on IP version
    var rangewidthIDs = newFastDataView(entries,2);                               // range width ID list: 2 bytes each (one for each entry)
    var codeIDs = newFastDataView(entries,1);                                     // country code ID list: 1 byte each (one for each entry)
    if (pos != data.byteLength)
        throw "file read error (got " + data.byteLength + " bytes from file but data is " + pos + " bytes)";

    // Now that we have views on the compressed data, create an array to hold the decompressed data (native-endian typed-array for simplicity)
    // Float64Array can't hold a 64-bit integer, but it can hold a 48-bit integer just fine
    var rangeIPs = new (db.bytesPerInt==4 ? Uint32Array : Float64Array)(entries);

    // The 8-bit codes can be converted to strings as-needed; just copy into a new array (to not keep the whole file loaded)
    var rangeCodes = new Uint8Array(codeIDs.bytes);

    // HACK: Here I invoke black magic that should not exist... Isolating the hot loop in its own function forces the JIT to focus and doubles its speed.
    (function(){
        // Finally, read and decompress the ranges; each integer is the last integer plus the width of the range (starting from zero)
        var lastIP = 0;
        for (let i=0; i<entries; i++)
            rangeIPs[i] = (lastIP += rangewidthsdict.get(rangewidthIDs.get(i)));
    })();
    // With the optimizations used here, and avoidance of slow JS built-ins like DataView, decompress time is quick. (around 2ms on recent HW; 5ms on old)

    db.entryCount = entries;
    db.rangeIPs = rangeIPs;
    db.rangeCodes = rangeCodes;
    // Compressed file data and its views are garbage collected after this point
}

function closeIPDBfile(db)
{
    db.path = undefined;
    db.entryCount = undefined;
    db.rangeIPs = undefined;
    db.rangeCodes = undefined;
    db.loadState = undefined;
}

function decStringToInteger(string)
{
    return parseInt(string, 10);
}

function hexStringToInteger(string)
{
    return parseInt(string, 16);
}

function IPv4StringToInteger(ipString)
{
    const octets = ipString.split(".").map(decStringToInteger);
    if (octets.length != 4)
        throw "Attempted to parse invalid IPv4 address string!";
    return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;  // '>>> 0' forces read as unsigned integer (JS messes it up, otherwise)
}

function expandIPv6String(ipString)  // Expands an IPv6 shorthand string into its full long version (32 char hex string)
{
    var blocks = ipString.toLowerCase().split(":");
    for (let i=0; i<blocks.length; i++)
    {
        if (blocks[i].length == 0)  // Expand collapsed zeroes block
        {
            blocks[i] = "0000";
            while (blocks.length < 8)
                blocks.splice(i,0,"0000");
        }
        else while (blocks[i].length < 4)  // Add leading zeroes as needed
            blocks[i] = "0" + blocks[i];
    }
    var expanded = blocks.join("");  // Drop ":" notation
    if (blocks.length != 8 || expanded.length != 32)
        throw "Attempted to parse invalid IPv6 address string!";
    return expanded;
}

const IPv4inIPv6rules =  // List of methods by which an IPv4 counterpart to an IPv6 address can be determined
[
    {   // IPv4 embedded IPv6 addresses not using mixed notation -> last 32-bits is IPv4 address
        prefix : "00000000000000000000",
        extractIPv4Integer : function(ipString) {
            var block6 = ipString.substr(20,4);
            if (block6 == "ffff" || block6 == "0000")
                return hexStringToInteger(ipString.substr(24,8));
            return null;  // IPv6 prefix is zero (reserved/special IP range)
        }
    },
    {   // "6to4" tunneling address -> next 32-bits is IPv4 address
        prefix : "2002",
        extractIPv4Integer : function(ipString) {
            return hexStringToInteger(ipString.substr(4,8));
        }
    },
    {   // "Teredo" tunneling address -> bitwise not of last 32-bits is IPv4 address
        prefix : "20010000",
        extractIPv4Integer : function(ipString) {
            return ~hexStringToInteger(ipString.substr(24,8));
        }
    }
];

function searchDB(db,int)  // Returns country code for integer in given DB, or null if not found
{
    if (!Number.isInteger(int) || int < 0)
        return null;

    autoLoadIPDB(db);  // Automatically load IPDB file on first use (throws exception to abort search if loading; will retry when done)

    // Do a binary search loop to find given integer in ordered list of ranges
    var min = 0;
    var max = db.entryCount-1;
    var mid;
    while (min <= max)
    {
        mid = Math.floor((min + max) / 2);
        if (int < db.rangeIPs[mid])
            max = mid - 1;
        else if (int >= db.rangeIPs[mid+1])  // The next number is the start of the next range; not part of this range
            min = mid + 1;
        else  /* range1start <= int && int < range2start */
            return countryCode8toString(db.rangeCodes[mid]);
    }
    return null;
}

function countryCode8toString(code8)  // Converts uint8 code to 2 char string code (0="??" is code for unknown and returns null)
{
    return code8 ? IPDBmetadata.countryIDs[code8] : null;
}

/*  NOTE:
 *  The type-specific arrays (e.g. Uint32Array) are native-endian only and require alignment in the buffer. DataView can work with either endianness from any point in a buffer.
 *  However, the performance of DataView is currently horrible. (see Mozilla bug 1065894) The below shouldn't be ideal, but it's actually much faster than the built-in DataView.
 *  Implementing it like this also makes it easier to add support for 48-bit integers and a better API for reading. (JS Proxy() is too slow to add '[]' syntax, though)
 *  As optimizations for use here, only unsigned big-endian getters are implemented. (for little-endian, reverse 'abcdef' to 'fedcba' when assembling)
 *  Note that you would think a Uint16Array or Uint32Array on a system with endianness matching the file would be faster than the byte fiddling below. It is not.
 */
function FastDataViewUBE(buffer,offset,size,bytesPerInt) {
    this.bytes = new Uint8Array(buffer,offset,size);
    switch (bytesPerInt) {
        case 2:  this.get = function(i) { return this.getUint16(i*2); };  return;
        case 4:  this.get = function(i) { return this.getUint32(i*4); };  return;
        case 6:  this.get = function(i) { return this.getUint48(i*6); };  return;
    }
}

FastDataViewUBE.prototype =
{
    getUint8 : function(offset) {
        return this.bytes[offset];
    },
    getUint16 : function(offset) {
        var bytes = this.bytes;
        var a = bytes[offset];
        var b = bytes[offset + 1];
        return ((a << 8) | b);
    },
    getUint32 : function(offset) {
        var bytes = this.bytes;
        var a = bytes[offset];
        var b = bytes[offset + 1];
        var c = bytes[offset + 2];
        var d = bytes[offset + 3];
        return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;  // '>>> 0' forces read as unsigned; left shifts >31 bits alter the sign (JS has no '<<<')
    },
    getUint48 : function(offset) {
        return this.getUint16(offset)*0x100000000 + this.getUint32(offset+2);  // JS cannot bitshift past 32 bits; read in two chunks and combine
    }
};
