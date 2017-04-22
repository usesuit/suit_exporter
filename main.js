/*
 * Copyright (c) 2017 Dragon Army, Inc.
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


(function () {

    var fs = require('fs');

    var generator = null;
    var config = null;
    var logger = null;

    var PLUGIN_ID = require("./package.json").name;
    var SK_MENU_ID = PLUGIN_ID;
    var NATIVE_MENU_ID = PLUGIN_ID + "_native";
    var EXPORT_ALL_ID = PLUGIN_ID + "_full";
    var CROP_ALL_ID = PLUGIN_ID + "_cropped";

    var activeDocumentId = null;
    var lastMenuClicked = null;
    var activeDocumentRoot = null;

    function init(_generator, _config, _logger) {
    
        generator = _generator;
        config = _config;
        logger = _logger;
        logger.info("REALLY intializing DA-Export with config %j", _config);

        initializeMenus();


        generator.onPhotoshopEvent("currentDocumentChanged", handleActiveDocumentChanged);
        generator.onPhotoshopEvent("generatorMenuChanged", handleMenuClicked);

        //prefill the current document if there is one
        generator.evaluateJSXString("app.activeDocument.id").then(function(id){
            handleActiveDocumentChanged(id);

            //useful for testing a file that's open
            logger.info("RUNNING SPRITEKIT EXPORT");
            lastMenuClicked = "spritekit";
            handleExport();
        });
    }
    
    function handleActiveDocumentChanged(id) 
    {
        activeDocumentId = id;
    };

    
    function handleMenuClicked(event)
    {
        var menu = event.generatorMenuChanged;
        if (!menu) 
        {
            return;
        }

        if (activeDocumentId === null) 
        {
            logger.warn("Ignoring menu click without a current document.");
            return;
        }
        
        // Ignore changes to other menus
        if (menu.name == SK_MENU_ID) 
        {
            lastMenuClicked = "spritekit";
        }else if(menu.name == NATIVE_MENU_ID){
            lastMenuClicked = "native_ui"; 
        }else if(menu.name == EXPORT_ALL_ID){
            lastMenuClicked = "export_all";
        }else if(menu.name == CROP_ALL_ID){
            lastMenuClicked = "crop_all";
        }else{
          return;
        }

        handleExport();
    }

    function handleExport()
    {
        logger.info("STARTING " + lastMenuClicked + " FOR " + activeDocumentId);
        
        generator.getDocumentInfo(activeDocumentId).then(function(document) {
            //console.log(document);
            var path = document.file;
            var folder = document.file.replace(".psd","");

            activeDocumentRoot = folder;
            prepExportDirectory();
        });
    }

    function prepExportDirectory()
    {
        if (fs.existsSync(activeDocumentRoot)) 
        {
            try 
            { 
                var files = fs.readdirSync(activeDocumentRoot); 
            }catch(e) {
                console.warn("UNABLE TO GET FILES IN " + activeDocumentRoot);
                return; 
            }
            for (var i = 0; i < files.length; i++) 
            {
                var filePath = activeDocumentRoot + '/' + files[i];
                if (fs.statSync(filePath).isFile())
                {
                    fs.unlinkSync(filePath);    
                }
            }
        }else{
            fs.mkdirSync(activeDocumentRoot);
        }
    }

    function initializeMenus()
    {
        //export all layers/containers for spritekit
        var SK_MENU_LABEL = "DA -> Export SpriteKit";

        //export all layers/containers for native UI
        var NATIVE_MENU_LABEL = "DA -> Export Native UI";

        //export all layers with no metadata and no cropping
        var EXPORT_ALL_LABEL = "DA -> Export Full Sized"

        //export all layers with no metadata and no cropping
        var CROP_ALL_LABEL = "DA -> Export Cropped"

        //name, displayName, enabled, checked
        generator.addMenuItem(SK_MENU_ID, SK_MENU_LABEL, true, false);
        generator.addMenuItem(NATIVE_MENU_ID, NATIVE_MENU_LABEL, true, false);
        generator.addMenuItem(EXPORT_ALL_ID, EXPORT_ALL_LABEL, true, false);
        generator.addMenuItem(CROP_ALL_ID, CROP_ALL_LABEL, true, false);
    }

    exports.init = init;
}());

   