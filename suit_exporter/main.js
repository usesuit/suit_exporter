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

    var exec = require('child_process').exec;
    var resolve = require("path").resolve;


    var fs = require('fs');
    var path = require('path');

    var generator = null;
    var config = null;
    var logger = null;

    var PLUGIN_ID = require("./package.json").name;

    var TEST_ID = PLUGIN_ID + "_test";
    var SK_MENU_ID = PLUGIN_ID;
    var UNITY_MENU_ID = PLUGIN_ID + "_unity";
    var NATIVE_MENU_ID = PLUGIN_ID + "_native";
    var EXPORT_ALL_ID = PLUGIN_ID + "_full";
    var CROP_ALL_ID = PLUGIN_ID + "_cropped";

    var lastMenuClicked = "spritekit";
    var coordinateSystem = "spritekit";
    var exportMetadata = true;
    var cropToLayer = true;

    var activeDocumentId = null;
    var activeDocumentName = null;
    var activeDocumentPath = null;
    var activeDocumentRoot = null;

    var layersToExport = [];
    var renderQueue = 0;

    var rootWidth;
    var rootHeight;

    var pixmapSettings = {
        "clipToDocumentBounds":true
    };
    var pixmapRenderSettings = {
        quality:32,
        format:"png"
    };

    var oldFiles = {};
    var execDelay = 0;

    function init(_generator, _config, _logger) {
    
        generator = _generator;
        config = _config;
        logger = _logger;
        console.log("REALLY intializing DA-Export with config %j", _config);

        initializeMenus();

        generator.onPhotoshopEvent("currentDocumentChanged", handleActiveDocumentChanged);
        generator.onPhotoshopEvent("generatorMenuChanged", handleMenuClicked);

        generator.evaluateJSXString("app.activeDocument.id").then(function(id){
            handleActiveDocumentChanged(id);
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

        if(renderQueue > 0)
        {
            generator.alert("ALREADY PROCESSING: " + lastMenuClicked);
            return;
        }
        
        // Ignore changes to other menus
        if (menu.name == SK_MENU_ID) 
        {
            lastMenuClicked = "SpriteKit"
            coordinateSystem = "spritekit";
            exportMetadata = true;
            cropToLayer = true;
        }else if(menu.name == UNITY_MENU_ID){
            lastMenuClicked = "Unity"
            coordinateSystem = "spritekit";
            exportMetadata = true;
            cropToLayer = true;
        }else if(menu.name == NATIVE_MENU_ID){
            lastMenuClicked = "UIKit"
            coordinateSystem = "native_ui";
            exportMetadata = true;
            cropToLayer = true;
        }else if(menu.name == EXPORT_ALL_ID){
            lastMenuClicked = "Uncropped Images Only"
            coordinateSystem = "spritekit";
            exportMetadata = false;
            cropToLayer = false;
        }else if(menu.name == CROP_ALL_ID){
            lastMenuClicked = "Cropped Images Only"
            coordinateSystem = "spritekit";
            exportMetadata = false;
            cropToLayer = true;
        }else if(menu.name == TEST_ID){

            runTestCode();
            return;

        }else{
            console.log("UNRECOGNIZED MENU ACTION: " + menu.name);
            return;
        }

        handleExport();
    }

    //put in anything that we're tinkering with here...
    function runTestCode()
    {

        

    }

    function handleExport()
    {
        console.log("STARTING EXPORT");
        console.log("   lastMenuClicked:" + lastMenuClicked);
        console.log("   exportMetadata:" + exportMetadata);
        console.log("   cropToLayer:" + cropToLayer);
        
        generator.getDocumentInfo(activeDocumentId).then(function(document) {
            
            //console.log(document);
            pixmapRenderSettings.ppi = document.resolution;

            var document_path = resolve(document.file);
            var folder = document_path.replace(".psd","");           
            var name = path.basename(document_path);
            
            activeDocumentName = name.replace(".psd","");
            activeDocumentRoot = folder;

            layersToExport = [];
            oldFiles = {};
            execDelay = 0;

            prepExportDirectory();
            updateMetadata(document);
            render();
        });
    }

    function render()
    {
        renderQueue = layersToExport.length;

        for(var i = 0; i < layersToExport.length; i++)
        {
            renderLayer(layersToExport[i][0], layersToExport[i][1]);
        }
        layersToExport = [];
    }

    function renderLayer(layer_name, layer_id)
    {
        generator.getPixmap(activeDocumentId, layer_id, pixmapSettings).then(function (pixmap) {
            
            console.log("RENDERING " + activeDocumentRoot + "/" + layer_name + ".png");
    
            var local_settings = pixmapRenderSettings;
            if(!cropToLayer)
            {
                local_settings = {};
                Object.keys(pixmapRenderSettings).forEach(function(key) {
                    local_settings[key] = pixmapRenderSettings[key];
                });

                local_settings.padding = {
                    top: pixmap.bounds.top,
                    left: pixmap.bounds.left,
                    right: rootWidth - pixmap.bounds.right,
                    bottom: rootHeight - pixmap.bounds.bottom
                };
            }

            var file_name = layer_name + ".png"
            var old_path = oldFiles[file_name];
            if(old_path == null)
            {
                //not found! just save the new file
                generator.savePixmap(pixmap, activeDocumentRoot + "/" + file_name, local_settings).then(function(new_file_name){
                    renderComplete();
                });
            }else{
                //write a temp file and compare it to our old one
                delete oldFiles[file_name];
                
                var temp_path = activeDocumentRoot + "/" + file_name.replace(".png", "__TEMP.png");

                generator.savePixmap(pixmap, temp_path, local_settings).then(function(new_file_name){
                    //get the path for the bundled convert app
                    var convert_path = generator._paths.convert.replace("convert.exe","");
                    var command = "convert.exe " + temp_path + " " + old_path + ' -metric AE -compare -format "%[distortion]" info:';

                    if(process.platform == "darwin")
                    {
                        convert_path = generator._paths.convert.replace("convert","");
                        var command = "convert " + temp_path + " " + old_path + ' -metric AE -compare -format "%[distortion]" info:';
                    }

                    //UNTESTED
                    if(process.platform == "linux")
                    {
                        convert_path = "/usr/bin";
                        var command = "convert " + temp_path + " " + old_path + ' -metric AE -compare -format "%[distortion]" info:';
                    }


                    exec(command, {
                            'cwd':convert_path
                        },
                        function(error, stdout, stderr) {
                            if(error)
                            {
                                logger.error("exec error: " + error);
                                //on error, overwrite with the new image
                                fs.unlinkSync(old_path);
                                fs.rename(temp_path, old_path, function(err) {
                                    if (err)
                                    {
                                        throw err;  
                                    } 
                                });
                            }else{
                                //the stdout should be the number of pixel difference, or '0' for no change
                                if(stdout == '0')
                                {
                                    //delete the new image!
                                    fs.unlinkSync(temp_path);
                                }else{
                                    //delete the old image and replace with the new one!
                                    fs.unlinkSync(old_path);
                                    fs.rename(temp_path, old_path, function(err) {
                                        if (err)
                                        {
                                            throw err;  
                                        } 
                                    });
                                }
                            
                            }
                        }
                    );

                    renderComplete();

                });
            };  

            
        });
    }

    function renderComplete()
    {
        renderQueue -= 1;
        if(renderQueue == 0)
        {
            finalCleanup();
        }
    }

    function finalCleanup()
    {
        for (var key in oldFiles) 
        {
            //make sure we only kill files that end with .png
            //so we don't squash .png.meta files in Unity
            if(key.indexOf(".png") == key.length - 4)
            {
                fs.unlinkSync(oldFiles[key]);
            }
        }
        oldFiles = {};        

        generator.alert("EXPORT COMPLETE: " + lastMenuClicked);
    }

    function prepExportDirectory()
    {
        if (fs.existsSync(activeDocumentRoot)) 
        {
            console.log("SYNC " + activeDocumentRoot);
            var files = [];
            try 
            { 
                files = fs.readdirSync(activeDocumentRoot); 
            }catch(e) {
                console.log("UNABLE TO GET FILES IN " + activeDocumentRoot);
                return; 
            }
            console.log()
            for (var i = 0; i < files.length; i++) 
            {
                var file_path = activeDocumentRoot + '/' + files[i];
                if (fs.statSync(file_path).isFile())
                {
                    oldFiles[files[i]] = file_path;
                    console.log("OLD FILE: " + file_path);

                    //prep no longer empties out the old folder -- instead we catalogue what's there
                    //so we can diff the new exports against them and not confuse git in case there
                    //are no actual pixel changes
                }
            }
        }else{
            console.log("CREATE " + activeDocumentRoot);
            fs.mkdirSync(activeDocumentRoot);
        }
    }

    //update our metadata, but also collect all Layer IDs needed for rendering
    function updateMetadata(document)
    {
        rootWidth = document.bounds.right - document.bounds.left;
        rootHeight = document.bounds.bottom - document.bounds.top;

        var metadata = {
            root_width: rootWidth,
            root_height: rootHeight,
            coordinate_system: coordinateSystem,
            children: convertLayersToChildren(document.layers, null)
        }

        //we only write the metadata for spritekit & native_ui, but
        //this process also collects all images that need rendering for
        //the other two!
        if(exportMetadata)
        {
            // console.log("******************************************");
            // console.log(JSON.stringify(metadata));
            // printSceneGraph(metadata,0);
            // console.log("******************************************");

            var metadata_path = activeDocumentRoot + "/" + activeDocumentName + ".txt";

            console.log("WRITING FILE: " + activeDocumentName + ".txt");
            fs.writeFile(metadata_path, JSON.stringify(metadata));    
        }        
    }

    function printSceneGraph(container, depth) 
    {

        var indent = "--";
        for(var i = 0; i < depth; i++)
        {
            indent = indent + "--";
        }

        if(depth == 0)
        {
            console.log("root");
        }

        for(var i = 0; i < container.children.length; i++)
        {
            console.log(indent + container.children[i].name + "(" + container.children[i].type + ")");

            if(container.children[i].type == "container")
            {
                printSceneGraph(container.children[i], depth + 1);
            }
        }
    }

    function convertLayersToChildren(layers, parent)
    {
        var children = [];

        //process back to front so that we can simply work through 
        //the list and add children as we go on the front-end side
        for(var i = layers.length-1; i >= 0; i--)
        {
            var meta_node = null;

            if(layers[i].layers)
            {
                meta_node = processGroup(layers[i]);

                //leaving legacy support for flattened nodes in for now, but
                //the idea is that the runtimes should handle this now and not 
                //the exporter
                if(meta_node != null && meta_node.type == "flatten")
                {
                    for(var j = 0; j < meta_node.children.length; j++)
                    {
                        children.push(meta_node.children[j]);

                        //fill in the position relative to the parent
                        if(parent == null)
                        {
                            meta_node.children[j].position = meta_node.children[j].position_absolute
                        }else{
                            meta_node.children[j].position = [meta_node.children[j].position_absolute[0] - parent.position_absolute[0], meta_node.children[j].position_absolute[1] - parent.position_absolute[1]]
                        }

                    }

                    meta_node = null;
                }

            }else{
                meta_node = processLayer(layers[i]);
            }

            //don't assume we got a node! might be a guide container
            if(meta_node == null)
            {
                continue;
            }

            //fill in the relative position
            if(parent == null)
            {
                meta_node.position = meta_node.position_absolute
            }else{
                meta_node.position = [meta_node.position_absolute[0] - parent.position_absolute[0],meta_node.position_absolute[1] - parent.position_absolute[1]];
            }

            if(meta_node.pivot_absolute != null)
            {
                var pivot_relative;
                if(parent == null)
                {
                    pivot_relative = meta_node.pivot_absolute;
                }else{
                    pivot_relative = [meta_node.pivot_absolute[0] - parent.position_absolute[0],meta_node.pivot_absolute[1] - parent.position_absolute[1]]
                }

                //our pivot should ACTUALLY be our position, but record the delta in the pivot variable
                var old_position = meta_node.position; //swap
                meta_node.position = pivot_relative;
                meta_node.pivot = [old_position[0] - pivot_relative[0], old_position[1] - pivot_relative[1]];
            }


            children.push(meta_node);
        }

        return children;
    }

    //GUIDE, CONTAINER
    function processGroup(group) 
    {
        //ignore anything in a guide folder
        if(group.name.indexOf("guide") == 0) return null;

        var group_name = group.name.replace(/ /g, "_");
        var group_type = group_name.split("_")[0];

        var meta_node = {
            "name":group_name,
            "type":null
        };


        //having image layers toggled visible/invisible can alter the container bounds...
        //we don't want visibility to affect metadata, so for containers we always grab deep bounds
        var center_rect = extractCenterAndSize(generator.getDeepBounds(group));
        meta_node["position_absolute"] = [center_rect[0], center_rect[1]];
        meta_node["size"] = [center_rect[2], center_rect[3]];            
        meta_node["type"] = "container";


        meta_node["children"] = convertLayersToChildren(group.layers, meta_node);

        //see if we have a pivot node!
        for(var i = 0; i < meta_node["children"].length; i++)
        {
            if(meta_node["children"][i]["type"] == "pivot")
            {
                //copy that node's position as my pivot
                meta_node["pivot_absolute"] = meta_node["children"][i]["position_absolute"]

                //delete the pivot node
                meta_node["children"].splice(i,1);

                //only one pivot allowed, so we can bail here
                break;
            }
        }

        return meta_node;
    }

    function extractCenterAndSize(bounds) 
    {     
        if(coordinateSystem == "spritekit")
        {
            var width = bounds.right - bounds.left;
            var height = bounds.bottom - bounds.top; //y-down

            var center_x = bounds.left + width/2;
            var center_y = bounds.bottom - height/2;
      
            center_x = center_x - rootWidth/2;  //convert to origin at center
            center_y = rootHeight/2 - center_y;  //convert to origin at center, y-positive

            return [center_x, center_y, width, height];  
        }else if(coordinateSystem == "native_ui"){
        
            var width = bounds.right - bounds.left;
            var height = bounds.bottom - bounds.top; //y-down
        
            return [bounds.left, bounds.top, width, height];
        }
    }

    //GUIDE, TEXT, PIVOT, PLACEHOLDER, IMAGE
    function processLayer(layer) {
        var layerName = layer.name;

        if(layer.name.indexOf("guide") == 0) return null;

        var center_rect = extractCenterAndSize(layer.bounds);
      
        if(layer.boundsWithFX != null)
        {
            center_rect = extractCenterAndSize(layer.boundsWithFX);
        }
      
        var position = [center_rect[0], center_rect[1]];
        var size = [center_rect[2], center_rect[3]];


        if(layer.name.indexOf("text") == 0)
        {
            if(layer.text != null)
            {
                //splitting these out just in case I need to debug
                var default_text = layer.text.textKey;

                //DEFAULT VALUES
                var text_color = "000000";
                var text_font = "Arial";
                var text_fontStyle = "Black";
                var text_justification = "left"
                var text_size = 24;
                var alpha = 1.0;
          

                if(layer.blendOptions != null)
                {
                    if(layer.blendOptions.hasOwnProperty("opacity"))
                    {
                        alpha = layer.blendOptions.opacity.value / 100.0;
                    }
                }
                    

                try
                {
                    var text_style = layer.text.textStyleRange[0].textStyle;            
                    text_font = text_style.fontName;
                    text_fontStyle = text_style.fontStyleName;
            
                    if(text_style.hasOwnProperty("size"))
                    {
                        if(text_style.size.hasOwnProperty("value"))
                        {
                            text_size = text_style.size.value;    
                        }else{
                            text_size = text_style.size;
                        }
                    }else{
                        logger.warn("TEXT STYLE HAS NO SIZE");
                        logger.warn(text_style);
                    }
            
                    var red_value = 0;
                    var green_value = 0;
                    var blue_value = 0;
            
                    if(text_style.color.red != undefined) red_value = text_style.color.red;
                    if(text_style.color.green != undefined) green_value = text_style.color.green;
                    if(text_style.color.blue != undefined) blue_value = text_style.color.blue;
            
                    var red = Math.round(red_value).toString(16);
                    var green = Math.round(green_value).toString(16);
                    var blue = Math.round(blue_value).toString(16);
            
                    if(red.length < 2) red = "0" + red;
                    if(green.length < 2) green = "0" + green;
                    if(blue.length < 2) blue = "0" + blue;

                    text_color = red + green + blue;
            
                }catch(e){
                    logger.error("ERROR PARSING FONT STYLE -- " + e);
                    logger.error(layer.text.textKey);
                    logger.error(layer.text.textStyleRange);
                }

                if(layer.text.paragraphStyleRange == null)
                {
                    logger.warn("PARAGRAPH STYLE = null");
                }else{
                    try
                    {
                        var par_style = layer.text.paragraphStyleRange[0].paragraphStyle;
                        text_justification = par_style.align;

                        switch(text_justification)
                        {
                            case "left":
                                //adjust position for left align
                                if(coordinateSystem == "spritekit")
                                {
                                    position[0] = position[0] - size[0]/2;    
                                }else if(coordinateSystem == "native_ui"){
                                    //already left aligned by default!
                                }else{
                                    logger.warn("ERROR: DONT KNOW HOW TO PROCESS coordinateSystem " + coordinateSystem);
                                }

                                break;
                            case "right":
                                if(coordinateSystem == "spritekit")
                                {
                                    position[0] = position[0] + size[0]/2;
                                }else if(coordinateSystem == "native_ui"){
                                    position[0] = position[0] + size[0];
                                }else{
                                    logger.warn("ERROR: DONT KNOW HOW TO PROCESS coordinateSystem " + coordinateSystem);
                                }

                                break;
                            case "center":
                                if(coordinateSystem == "spritekit")
                                {
                                    //center aligned by default!
                                }else if(coordinateSystem == "native_ui"){
                                    position[0] = position[0] + size[0]/2;
                                }else{
                                    logger.warn("ERROR: DONT KNOW HOW TO PROCESS coordinateSystem " + coordinateSystem);
                                }
                                break;
                        }

                    }catch(e){
                        logger.error("ERROR PARSING PARAGRAPH STYLE -- " + e);
                        logger.error(layer.text.paragraphStyleRange[0]);
                    }
                }

                if(layer.text.transform)
                {
                    text_size = text_size * layer.text.transform.xx;
                }


                return {
                    "name" : layer.name.substr(5).replace(/ /g,"_"),
                    "type" : "text",
                    "position_absolute" : position,
                    "size": size,
                    "color":text_color,
                    "font":text_font + "-" + text_fontStyle,
                    "justification":text_justification,
                    "fontSize":text_size,
                    "text": default_text,
                    "alpha":alpha
                };
            }
        }

        if(layer.name.indexOf("pivot") == 0)
        {
            return { "name" : layer.name.substr(6).replace(/ /g,"_"), "type" : "pivot", "position_absolute" : position };
        }

        if(layer.name.indexOf("placeholder") == 0)
        {
            return { "name" : layer.name.substr(12).replace(/ /g,"_"), "type" : "placeholder", "position_absolute":position, "size":size }
        }

        //tile_NAMEOFTEXTURE is a special kind of placeholder where we look for an image named NAMEOFTEXTURE and tile it horizontally & vertically to fill the rect
        if(layer.name.indexOf("tile") == 0)
        {
            return { "name" : layer.name.replace(/ /g,"_"), "type" : "placeholder", "position_absolute":position, "size":size }
        }
      
        if(layer.name.indexOf("alias") == 0)
        {
            //trim off the "alias_" and the metadata points to a pre-existing image!
            return { "name" : layer.name.substr(6).replace(/ /g,"_"), "type" : "image", "position_absolute" : position };
        }
      
        //IMAGE
        //also need to mark this as a render layer!
        layersToExport.push([layer.name.replace(/ /g,"_"), layer.id]);
        return { "name" : layer.name.replace(/ /g,"_"), "type" : "image", "position_absolute" : position, "size":size };
    }


    function quietlyAddMenuItem(name, displayName)
    {
        var MENU_STATE_KEY_PREFIX = "GENERATOR-MENU-";

        //i always use the same settings for these...
        var enabled = true;
        var checked = false;

        generator._menuState[MENU_STATE_KEY_PREFIX + name] = {
            name: name,
            displayName: displayName,
            enabled: enabled,
            checked: checked
        };
    }

    //because generator.addMenuItem goes through and executes a JSX script, calling multiple
    //times in a row often caused later items to not get added to the menu... so instead we'll
    //just modify the state on the first batch of calls and only trigger the JSX menu update
    //on the very last menu item we add!
    function initializeMenus()
    {
        //exact same as SK, just removing menu ambiguity
        var UNITY_MENU_LABEL = "SUIT: Export for Unity";
        quietlyAddMenuItem(UNITY_MENU_ID, UNITY_MENU_LABEL);

        var SK_MENU_LABEL = "SUIT: Export for SpriteKit";
        quietlyAddMenuItem(SK_MENU_ID, SK_MENU_LABEL);

        //export all layers/containers for native UI
        var NATIVE_MENU_LABEL = "SUIT: Export Native UI";
        quietlyAddMenuItem(NATIVE_MENU_ID, NATIVE_MENU_LABEL);

        //export all layers with no metadata and no cropping
        var EXPORT_ALL_LABEL = "SUIT: Export Full Sized Images";
        quietlyAddMenuItem(EXPORT_ALL_ID, EXPORT_ALL_LABEL);

        //export all layers with no metadata and no cropping
        var CROP_ALL_LABEL = "SUIT: Export Cropped Images";
        generator.addMenuItem(CROP_ALL_ID, CROP_ALL_LABEL, true, false);

        console.log("MENUS INITIALIZED");
    }

    exports.init = init;
}());

   