"use strict";  // Use ES5 strict mode for this file

// Connect to main Flagfox addon
const port = browser.runtime.connect();
const prefStore = browser.storage.local;

port.onMessage.addListener(function(msg) {
    switch (msg.type)
    {
        case "fetch":
            prefStore.get(null)  // Fetch all to be cached; due to async-hell design, fetching directly from storage every time is impractical
                     .then(function(results) {
                         port.postMessage({type:"fetched", data:results});
                     });
            return;
        case "store":
            prefStore.clear();
            prefStore.set(msg.data);
            return;
    }
});

/*
browser.storage.onChanged.addListener(function(changes,area) {
    if (area == "local")
        port.postMessage({type:"changed", changes:changes});
});
*/
