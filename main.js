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
    
    var PLUGIN_ID = require("./package.json").name,
        MENU_ID = PLUGIN_ID,
        MENU_LABEL = "$$$/JavaScripts/Generator/DAExport/Menu=DA Export";
    
    
    var DocumentManager = require("./lib/documentmanager"),
        RenderManager = require("./lib/rendermanager"),
        AssetManager = require('./lib/assetmanager');
        
    var PLUGIN_ID = require("./package.json").name;
    
    var _generator = null,
        _currentDocumentId = null,
        _config = null,
        _logger = null,
        _documentManager = null,
        _renderManager = null;

    var _assetManagers = {};
    
    var _waitingDocuments = {},
        _canceledDocuments = {};
        
    var   activeDocumentId = null,
          menuPromise = null,
          nextMenuState = null;

    /*********** INIT ***********/

    function init(generator, config, logger) {
        _generator = generator;
        _config = config;
        _logger = logger;

        console.log("initializing DA-Export generator with config %j", _config);
        
        //the adobe document manager keeps an up to date version of the document DOM and applies documentChanged events as patches to keep up
        _documentManager = new DocumentManager(generator, config, logger);
        _renderManager = new RenderManager(generator, config, logger);
        
        function initLater() {
          
          _renderManager.on("idle", onIdle);
          
          _generator.addMenuItem(MENU_ID, MENU_LABEL, true, false);
          // menuPromise = this._generator.addMenuItem(MENU_ID, MENU_LABEL, false, false)
            // .finally(processNextMenuOperation);

          _documentManager.on("activeDocumentChanged", handleActiveDocumentChanged);
          _generator.onPhotoshopEvent("generatorMenuChanged", handleMenuClicked);
            
        }
        
        process.nextTick(initLater);
    }  
    
    function handleActiveDocumentChanged(id) 
    {
        activeDocumentId = id;
    };
    
    function handleMenuClicked(event)
    {
        var menu = event.generatorMenuChanged;
        if (!menu) {
            return;
        }

        // Ignore changes to other menus
        if (menu.name !== MENU_ID) {
            return;
        }

        if (activeDocumentId === null) {
            _logger.warn("Ignoring menu click without a current document.");
            return;
        }

        //TODO: EXPORT
        _logger.warn("TODO: EXPORT");
        startAssetGeneration(activeDocumentId);
    }

    /*********** EVENTS ***********/
    
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
    
    function onIdle()
    {
      stopAssetGeneration(activeDocumentId);
      sendJavascript("alert('EXPORT COMPLETE');");
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
        }
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