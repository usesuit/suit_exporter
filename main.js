/*
 * Copyright (c) 2015 Dragon Army, Inc.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */

// using the Adobe asset exporter from https://github.com/adobe-photoshop/generator-assets
// as a base to build off of
(function () {
    "use strict";
    
    var DocumentManager = require("./lib/documentmanager"),
        StateManager = require('./lib/statemanager'),
        RenderManager = require("./lib/rendermanager"),
        AssetManager = require('./lib/assetmanager');
        
    var PLUGIN_ID = require("./package.json").name;
    
    var _generator = null,
        _currentDocumentId = null,
        _config = null,
        _logger = null,
        _documentManager = null,
        _stateManager = null,
        _renderManager = null;

    var _assetManagers = {};
    
    var _waitingDocuments = {},
        _canceledDocuments = {};

    /*********** INIT ***********/

    function init(generator, config, logger) {
        _generator = generator;
        _config = config;
        _logger = logger;

        console.log("initializing DA-Export generator with config %j", _config);
        
        //the adobe document manager keeps an up to date version of the document DOM and applies documentChanged events as patches to keep up
        _documentManager = new DocumentManager(generator, config, logger);
        _documentManager.on("openDocumentsChanged", handleOpenDocumentsChanged);
        
        _stateManager = new StateManager(generator, config, logger, _documentManager);
        _stateManager.on("enabled", startAssetGeneration);
        _stateManager.on("disabled", pauseAssetGeneration);
        
        _renderManager = new RenderManager(generator, config, logger);

        function initLater() {
            
          console.log("NEXT TICK");
          
          // _generator.onPhotoshopEvent("currentDocumentChanged", handleCurrentDocumentChanged);
          // _generator.onPhotoshopEvent("imageChanged", handleImageChanged);
          // _generator.onPhotoshopEvent("toolChanged", handleToolChanged);
          // requestEntireDocument();
            
        }
        
        process.nextTick(initLater);

    }  

    /*********** EVENTS ***********/
    
    //            DocumentManager Events
    //a lot of these handlers are pulled from the Adobe asset exporter, but I'm not down with _functionNames
    function handleOpenDocumentsChanged(all, opened) {
        var open = opened || all;

        open.forEach(function (id) {
            _documentManager.getDocument(id).done(function (document) {
                document.on("generatorSettings", handleDocGeneratorSettingsChange.bind(undefined, id));
            }, function (error) {
                _logger.warning("Error getting document during a document changed event, " +
                    "document was likely closed.", error);
            });
        });
    }
    function handleDocGeneratorSettingsChange(id, change) {
        var curSettings = getChangedSettings(change.current),
            prevSettings = getChangedSettings(change.previous),
            curEnabled = !!(curSettings && curSettings.enabled),
            prevEnabled = !!(prevSettings && prevSettings.enabled);
        
        if (prevEnabled !== curEnabled) {
            if (curEnabled) {
                _stateManager.activate(id);
            } else {
                _stateManager.deactivate(id);
            }
        }
    }
    function getChangedSettings(settings) {
        if (settings && typeof(settings) === "object") {
            return _generator.extractDocumentSettings({generatorSettings: settings}, PLUGIN_ID);
        }
        return null;
    }    
    
    
    //            StateManager Events
    function startAssetGeneration(id) {
        if (_waitingDocuments.hasOwnProperty(id)) {
            return;
        }

        var documentPromise = _documentManager.getDocument(id);
        
        _waitingDocuments[id] = documentPromise;

        documentPromise.done(function (document) {
            delete _waitingDocuments[id];

            if (_canceledDocuments.hasOwnProperty(id)) {
                delete _canceledDocuments[id];
            } else {
                if (!_assetManagers.hasOwnProperty(id)) {
                    _assetManagers[id] = new AssetManager(_generator, _config, _logger, document, _renderManager);

                    document.on("closed", stopAssetGeneration.bind(undefined, id));
                    document.on("end", restartAssetGeneration.bind(undefined, id));
                    document.on("file", handleFileChange.bind(undefined, id));
                }
                _assetManagers[id].start();
            }
        });
    }

    function restartAssetGeneration(id) {
        stopAssetGeneration(id);
        startAssetGeneration(id);
    }

    function pauseAssetGeneration(id) {
        if (_waitingDocuments.hasOwnProperty(id)) {
            _canceledDocuments[id] = true;
        } else if (_assetManagers.hasOwnProperty(id)) {
            _assetManagers[id].stop();
        }
    }

    function stopAssetGeneration(id) {
        pauseAssetGeneration(id);

        if (_assetManagers.hasOwnProperty(id)) {
            delete _assetManagers[id];
        }
    }
    
    function handleFileChange(id, change) {
        // If the filename changed but the saved state didn't change, then the file must have been renamed
        if (change.previous && !change.hasOwnProperty("previousSaved")) {
            _stopAssetGeneration(id);
            _stateManager.deactivate(id);
        }
    }
    
    
    
    //         MY LISTENERS
    
    

    function handleCurrentDocumentChanged(id) {
        console.log("handleCurrentDocumentChanged: "+id)
        setCurrentDocumentId(id);
    }

    function handleImageChanged(document) {
        console.log("Image " + document.id + " was changed:");//, stringify(document));
    }

    function handleToolChanged(document){
        console.log("Tool changed " + document.id + " was changed:");//, stringify(document));
    }

    function handleGeneratorMenuClicked(event) {
        // Ignore changes to other menus
        var menu = event.generatorMenuChanged;
        if (!menu || menu.name !== MENU_ID) {
            return;
        }

        var startingMenuState = _generator.getMenuState(menu.name);
        console.log("Menu event %s, starting state %s", stringify(event), stringify(startingMenuState));
    }

    /*********** CALLS ***********/

    function requestEntireDocument(documentId) {
        if (!documentId) {
            console.log("Determining the current document ID");
        }
        
        _generator.getDocumentInfo(documentId).then(
            function (document) {
                console.log("Received complete document:", stringify(document));
            },
            function (err) {
                console.error("[Tutorial] Error in getDocumentInfo:", err);
            }
        ).done();
    }

    function updateMenuState(enabled) {
        console.log("Setting menu state to", enabled);
        _generator.toggleMenu(MENU_ID, true, enabled);
    }

    /*********** HELPERS ***********/


    function sendJavascript(str){
        _generator.evaluateJSXString(str).then(
            function(result){
                console.log(result);
            },
            function(err){
                console.log(err);
            });
    }

    function setCurrentDocumentId(id) {
        if (_currentDocumentId === id) {
            return;
        }
        console.log("Current document ID:", id);
        _currentDocumentId = id;
    }

    function stringify(object) {
        try {
            return JSON.stringify(object, null, "    ");
        } catch (e) {
            console.error(e);
        }
        return String(object);
    }

    exports.init = init;
    
}());