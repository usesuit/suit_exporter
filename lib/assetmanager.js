/*
 * Copyright (c) 2014 Adobe Systems Incorporated. All rights reserved.
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
    "use strict";

    var events = require("events"),
        os = require("os"),
        util = require("util"),
        META_PLUGIN_ID = "crema";

    var Q = require("q");

    var ComponentManager = require("./componentmanager"),
        FileManager = require("./filemanager"),
        ErrorManager = require("./errormanager");

    var MAX_PATH_LENGTH = os.platform() === "darwin" ? 255 : 260;

    var metadataCache = null;

    /**
     * Return the keys for a set as integers.
     *
     * @private
     * @param {{number: *}} set A set
     * @return {Array.<number>} The keys of the set as integers
     */
    function _intKeys(set) {
        return Object.keys(set).map(function (key) {
            return parseInt(key, 10);
        });
    }

    /**
     * The asset manager maintains a set of assets for a given document. On
     * initialization, it parses the layers' names into a set of components,
     * requests renderings of each of those components from the render manager,
     * and organizes the rendered assets into the appropriate files and folders.
     * When the document changes, it requests that the appropriate components be
     * re-rendered or moved into the right place. It also manages error reporting.
     *
     * @constructor
     * @param {Generator} generator
     * @param {object} config
     * @param {Logger} logger
     * @param {Document} document
     * @param {RenderManager} renderManager
     */
    function AssetManager(generator, config, logger, document, renderManager) {
        events.EventEmitter.call(this);

        this._generator = generator;
        this._config = config;
        this._logger = logger;
        this._document = document;
        this._renderManager = renderManager;

        this._fileManager = new FileManager(generator, config, logger);
        this._errorManager = new ErrorManager(generator, config, logger, this._fileManager);

        var update_callback = function(stream) 
        {
          console.log('update metadata!');
        };

        renderManager.on("idle", update_callback);
        
    }

    util.inherits(AssetManager, events.EventEmitter);

    /**
     * The set of promises for components currently being rendered. The map is
     * keyed on componetIds, and maps to Promises that resolve with the temporary
     * path of the rendered asset.
     *
     * @type {{number: Promise.<string>}}
     */
    AssetManager.prototype._renderPromises = null;

    /**
     * The unordered set of promises from the fileManager for assets being moved into place.
     *
     * @type {Array.<Promise>}
     */
    AssetManager.prototype._filePromises = null;

    /**
     * @type {RenderManager}
     */
    AssetManager.prototype._renderManager = null;

    /**
     * @type {FileManager}
     */
    AssetManager.prototype._fileManager = null;

    /**
     * @type {ErrorManager}
     */
    AssetManager.prototype._errorManager = null;

    /**
     * @type {ComponentManager}
     */
    AssetManager.prototype._componentManager = null;

    /**
     * Cancel render jobs and remove assets for all the components derived from
     * the basic component referred to by the given componentId.
     *
     * @private
     * @param {string} componentId
     */
    AssetManager.prototype._cleanupDerivedComponents = function (componentId) {
        if (this._componentManager.getComponent(componentId)) {
            this._componentManager.getDerivedComponents(componentId).forEach(function (derivedComponent) {
                if (this._hasPendingRender(derivedComponent.id)) {
                    this._renderManager.cancel(derivedComponent.id);
                }

                this._fileManager.removeFileWithin(derivedComponent.assetPath);
            }, this);
        }
    };

    /**
     * Cleanup render jobs and assets for all layers in the given document.
     *
     * @private
     */
    AssetManager.prototype._cleanup = function () {
        if (this._componentManager && this._fileManager.basePath) {
            // Clear out the removed layer components;
            // remove the assets from the old components and/or cancel their renders
            this._document.layers.visit(function (layer) {
                if (!layer.group) {
                    return;
                }

                var componentsToRemove = this._componentManager.getComponentsByLayer(layer.id);
                Object.keys(componentsToRemove).forEach(function (componentId) {
                    this._cleanupDerivedComponents(componentId);
                }, this);
            }.bind(this));
        }
    };

    /**
     * Private getting to retrieve the document wide meta data
     *
     * @private
     * @return {docMeta} - parsed doc meta object or undefined if not there or parser error
     */
    AssetManager.prototype._getDocumentMetaData = function () {
        var docMetaRaw = this._document._generatorSettings && this._document._generatorSettings[META_PLUGIN_ID];

        if (docMetaRaw && docMetaRaw.json) {
            try {
                return JSON.parse(docMetaRaw.json);
            } catch (ex) {
                this._logger.error("_getDocumentMetaData failed to parse json: %s", ex.message);
            }
        }
    };

    /**
     * Initialize the default layer support from the document level meta-data
     *
     * @private
     */
    AssetManager.prototype._initDefaultMetaComponents = function (docMeta) {
        this._logger.info("default components enabled");

        this._componentManager.resetDefaultMetaComponents();
        //read the default layer spec
        if (docMeta.scaleSettings) {
            docMeta.scaleSettings.forEach(function (spec) {

                //make the spec as-expected for component manager

                if (typeof spec.folder === "string") {
                    spec.folder = [spec.folder];
                }
                if (!spec.file) {
                    spec.file = "";
                }

                this._componentManager.addDefaultMetaComponent(spec);
            }, this);
        }
    };

    /**
     * Initialize all the components from each layer
     *
     * @private
     * @param {bool} resetLayerBounds whether this layers bounds need to get recalculated
     * @return {Array} array of layer ID that were added
     */
    AssetManager.prototype._initComponents = function (resetLayerBounds) {
      
        console.log("INITIALIZE COMPONENTS");
      
        var layerIdsWithComponents = [];

        this._document.layers.visit(function (layer) {
            // Don't visit the top-level LayerGroup
            if (!layer.group) {
                return;
            }

            if(layer.name != null && layer.name.indexOf("guide") == 0)
            {
              return;
            }

            if(layer.group.name)
            {
              console.log("LAYER " + layer.name + " GROUP " + layer.group.name);
              if(layer.group.name.indexOf("guide") == 0)
              {
                console.log(".....SKIP");
                return;
              }
            }

            var hasValidComponent = false;
            console.log("CHECKING FOR COMPONENT");
            try {
                this._componentManager.findAllComponents(layer).forEach(function (result) 
                {
                  console.log("TRYING " + component);
                    var component = result.component;
                    if (component) {
                        try {
                            if (resetLayerBounds) 
                            {
                                component.needsLayerBoundsUpdate = true;
                            }
                            this._componentManager.addComponent(layer, component);
                            hasValidComponent = true;
                        } catch (ex) {
                          console.log("[ERROR] " + ex.message);
                          this._errorManager.addError(layer, ex.message);
                        }
                    } else if (result.errors) {
                      console.log("ERRORS");
                        result.errors.forEach(function (error) {
                            this._errorManager.addError(layer, error);
                        }.bind(this));
                    }
                }, this);
            } catch (ex) {
                console.log("[ERROR] " + ex.message);
                this._errorManager.addError(layer, ex.message);
            }

            if (hasValidComponent) 
            {
              console.log("adding valid component: " + layer.id);              
              layerIdsWithComponents.push(layer.id);
            }else{
              console.log("!hasValidComponent");
            }
        }.bind(this));

        return layerIdsWithComponents;
    };

    /**
     * Initialize this AssetManager instance, completely resetting internal state
     * and re-rendering the components of all layers. This does NOT delete any
     * existing assets; for that @see AssetManager.prototype._cleanup.
     *
     * @private
     */
    AssetManager.prototype._init = function (resetLayerBounds) {
      console.log("INITIALIZE ASSET MANAGER");
      
        this._renderPromises = {};
        this._filePromises = [];
        this._componentManager = new ComponentManager(this._generator, this._config, this._logger);
        var base_path = this._fileManager.updateBasePath(this._document);
        this._fileManager.purgeBasePath(base_path);
        this._errorManager.removeAllErrors();
        this._renderManager.cancelAll(this._document.id);

        var layerIdsWithComponents = [],
            docMeta = this._getDocumentMetaData();

        if (docMeta && docMeta.metaEnabled) {
            this._initDefaultMetaComponents(docMeta, resetLayerBounds);
        }

        layerIdsWithComponents = this._initComponents(resetLayerBounds);

        this._requestRenderForLayers(layerIdsWithComponents);

        this._errorManager.reportErrors();
    };

    /**
     * Request render for for each derived component based on each layer in
     * layerIdsWithComponents
     *
     * @private
     * @param {Array} layerIdsWithComponents to be rendered
     */
    AssetManager.prototype._requestRenderForLayers = function (layerIdsWithComponents) {
      console.log("RENDERING...    ("  + layerIdsWithComponents.length + ")");
      
      if(layerIdsWithComponents.length == 0)
      {
        this._generator.evaluateJSXString("alert('EXPORT COMPLETE');").then(
            function(result){
                console.log(result);
            },
            function(err){
                console.log(err);
            });
      }
      
      layerIdsWithComponents.forEach(function (layerId) 
      {
        console.log("GET COMPONENT FOR LAYER " + layerId);
          var basicComponents = this._componentManager.getBasicComponentsByLayer(layerId);
          basicComponents.forEach(function (component) {
              var derivedComponents = this._componentManager.getDerivedComponents(component.id);
              derivedComponents.forEach(function (component) {
                  this._requestRender(component);
              }, this);
          }, this);
      }, this);
    };
    

    /**
     * completely reset assets for this document, first attempting to removing
     * existing assets and then regenerating all current assets.
     *
     * @private
     */
    AssetManager.prototype._reset = function (resetLayerBounds) {
        this._cleanup();
        this._init(resetLayerBounds);
    };

    /**
     * Report non-catastrophic errors
     * @private
     * @param {Array.<string>} errors
     */
    AssetManager.prototype._reportSoftErrors = function (errors, component) {

        var namedComponent,
            typeName;

        if (errors && errors.length > 0) {
            if (!component.layer) {
                typeName = "Layer Comp";
            }
            namedComponent = component.layer;

            errors.forEach(function (err) {
                this._errorManager.addError(namedComponent, err, typeName);
            }.bind(this));

            this._errorManager.reportErrors();
        }
    };

    /**
     * Request that the given component be rendered into an asset.
     *
     * @private
     * @param {Component} component
     */
    AssetManager.prototype._requestRender = function (component) 
    {
      console.log("REQUEST RENDER FOR " + component);
      
        // Crude check for components whose eventual path will be too long
        if (this._fileManager.basePath) {
            var candidatePathLength = this._fileManager.basePath.length + component.assetPath.length + 1;
            if (candidatePathLength >= MAX_PATH_LENGTH) {
                this._errorManager.addError(component.layer || component.comp,
                                            "Asset path is too long: " + component.assetPath);
                return;
            }
        }

        // FIXME: the document and layer might need to be cloned so that they
        // don't change in the middle of rendering
        var renderPromise = this._renderManager.render(component);

        this._renderPromises[component.id] = renderPromise;

        renderPromise
            .then(function (renderResult) {
                var tmpPath = renderResult.path;
                this._reportSoftErrors(renderResult.errors, component);
                if (tmpPath) {
                    var filePromise = this._fileManager.moveFileInto(tmpPath, component.assetPath);
                    this._filePromises.push(filePromise);
                    this._logger.info("Render complete: %s", component.assetPath);
                } else {
                    this._logger.warn("Render finished without path: %s", component.assetPath);
                }
            }.bind(this))
            .fail(function (err) {
                if (err) {
                    this._logger.error("Render failed: %s", component.assetPath, err);
                } else {
                    this._logger.info("Render canceled: %s", component.assetPath);
                }
            }.bind(this))
            .finally(function () {
                delete this._renderPromises[component.id];

                // If we've processed all our render job then wait for all the
                // file movement to finish to emit an "idle" event
                if (Object.keys(this._renderPromises).length === 0) {
                    Q.allSettled(this._filePromises).finally(function () {
                        this.emit("idle");
                    }.bind(this));
                    this._filePromises = [];
                }
            }.bind(this))
            .done();
    };

    /**
     * Determine whether or not the given component has a rendering job in flight.
     *
     * @private
     * @param {string} componentId
     * @return {boolean}
     */
    AssetManager.prototype._hasPendingRender = function (componentId) {
        if (this._renderPromises.hasOwnProperty(componentId)) {
            var promise = this._renderPromises[componentId];

            if (promise.inspect().state === "pending") {
                return true;
            }
        }

        return false;
    };

    /**
     *  {
     *    root_width: xxx,
     *    root_height: yyy,
     *    children:[
     *      {
     *        "name": layer_name
     *        "type": layer_type -- container (default, progress, scale9, btn, tab), image (default, scalebtn), placeholder, tile, text, pivot
     *        ...
     *      }
     *    ]
     *  }
     *
     *  { "name" : container_name, "type":"container", "position":VECTOR2, "size":VECTOR2, "children":[...] }                                                       //CHILDREN ALLOWED -- includes container, progress, scale9, btn, tab
     *  { "name" : image_name, "type" : "image", "position" : VECTOR2 }                                                                                             //NO CHILDREN ALLOWED -- includes scalebtns, which is a runtime alias for image
     *  { "name" : label_name, "type" : "text", "position" : VECTOR2, "size": VECTOR2, "color":COLOR, "font":FONT, "justification":JUST, "fontSize":FONTSIZE, "text":DEFAULT_TEXT }  //NO CHILDREN ALLOWED -- maybe need w/h?
     *  { "name" : placeholder_name, "type" : "placeholder", "position":VECTOR2, "size":VECTOR2 }                                                                   //NO CHILDREN ALLOWED -- includes tiles, which are a runtime alias for placeholder
     *  { "name" : pivot_name, "type" : "pivot", "position" : VECTOR2 }                                                                                             //NO CHILDREN ALLOWED
     *
     *
     *
     */

    var _root_width;
    var _root_height;
    var _root_pivot_x;
    var _root_pivot_y;
    
    var coordinateSystem = "spritekit";
    
    AssetManager.prototype.updateDAMetadata = function(center_or_topLeft) {
      
      console.log("UPDATE METADATA");
      if(this._document == null)
      {
        console.log("DOCUMENT IS NULL");
        return;
      }
      
      coordinateSystem = center_or_topLeft;
      
      //this._generator.evaluateJSXString("('" + center_or_topLeft + "');")

      _root_width = this._document._bounds._right - this._document._bounds._left;
      _root_height = this._document._bounds._bottom - this._document._bounds._top;

      var metadata = {
        root_width:_root_width,
        root_height:_root_height,
        coordinate_system:center_or_topLeft,
        children: this.convertLayersToChildren(this._document.layers.layers, null)
      };

      console.log("******************************************");
      console.log(JSON.stringify(metadata));
      this.printSceneGraph(metadata,0);
      console.log("******************************************");

      var full_name = this._document.name;
      var short_name = full_name.split(".")[0];

      console.log("WRITING FILE: " + short_name + ".txt");
      this._fileManager.writeFileWithin(short_name + ".txt", JSON.stringify(metadata), false);
    }

    AssetManager.prototype.printSceneGraph = function(container, depth) {

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
          this.printSceneGraph(container.children[i], depth + 1);
        }
      }

    }

    AssetManager.prototype.convertLayersToChildren = function(layers, parent) {

      var children = [];

      for(var i = 0; i < layers.length; i++)
      {
        var meta_node = null;

        if(layers[i].layers)
        {
          meta_node = this.processGroup(layers[i]);

          //if it was an organizational group, just add the nodes!
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
          meta_node = this.processLayer(layers[i]);
        }

        //don't assume we got a node! might be a guide container or our options layer
        if(meta_node == null)
        {
          continue;
        }

        //fill in the relative position
        if(parent == null)
        {
          meta_node.position = meta_node.position_absolute
        }else{
          console.log("CALCULATING POSITION FOR " + meta_node.name);
          meta_node.position = [meta_node.position_absolute[0] - parent.position_absolute[0],meta_node.position_absolute[1] - parent.position_absolute[1]];
          console.log("POSITION: " + meta_node.position);
          console.log("ABSOLUTE: " + meta_node.position_absolute);
          console.log("PARENT ABSOLUTE: " + parent.position_absolute);
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

    //GUIDE, CONTAINER, (nothing), PROGRESS, SCALE9, BTN, SCALEBTN, TAB
    AssetManager.prototype.processGroup = function(group) {

      //ignore anything in a guide folder
      if(group.name.indexOf("guide") == 0) return null;

      var group_name = group.name.replace(/ /g, "_");

      var CONTAINER_ALIASES = ["container", "progress", "scale9", "btn", "scalebtn", "tab", "paragraph"];
      var group_type = group_name.split("_")[0];

      var meta_node = {
        "name":group_name,
        "type":null
      };

      var center_rect = this.extractCenterAndSize(group.bounds);
      meta_node["position_absolute"] = [center_rect[0], center_rect[1]];
      meta_node["size"] = [center_rect[2], center_rect[3]];

      if(CONTAINER_ALIASES.indexOf(group_type) >= 0)
      {
        meta_node.type = "container";
      }else{
        meta_node.type = "flatten";
      }

      meta_node["children"] = this.convertLayersToChildren(group.layers, meta_node);

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

    AssetManager.prototype.extractCenterAndSize = function(bounds) 
    {
      
      
      if(coordinateSystem == "spritekit")
      {
        var width = bounds.right - bounds.left;
        var height = bounds.bottom - bounds.top; //y-down

        var center_x = bounds.left + width/2;
        var center_y = bounds.bottom - height/2;
      
        console.log("CENTER: " + center_x + "," + center_y);
      
        center_x = center_x - _root_width/2;  //convert to origin at center
        center_y = _root_height/2 - center_y;  //convert to origin at center, y-positive

        return [center_x, center_y, width, height];  
      }else if(coordinateSystem == "native_ui"){
        
        var width = bounds.right - bounds.left;
        var height = bounds.bottom - bounds.top; //y-down
        
        return [bounds.left, bounds.top, width, height];
      }
      
    }

    //GUIDE, OPTIONS, TEXT, PIVOT, PLACEHOLDER, TILE, IMAGE, SCALEBTN
    AssetManager.prototype.processLayer = function(layer) {
      var layerName = layer.name;

      if(layer.name.indexOf("guide") == 0) return null;
      if(layer.name == "options") return null;

      var center_rect = this.extractCenterAndSize(layer.bounds);
      
      if(layer.boundsWithFX != null)
      {
        console.log("HAS FX BOUNDS: " + layerName);
        console.log("BOUNDS: " + layer.bounds.left + "," + layer.bounds.top + "," + layer.bounds.width() + "," + layer.bounds.height());
        console.log("FX BOUNDS: " + layer._boundsWithFX.left + "," + layer._boundsWithFX.top + "," + layer._boundsWithFX.width() + "," + layer._boundsWithFX.height());
        console.log("BEFORE: " + center_rect);
        center_rect = this.extractCenterAndSize(layer._boundsWithFX);
        console.log("AFTER: " + center_rect);
      }
      
      var position = [center_rect[0], center_rect[1]];
      var size = [center_rect[2], center_rect[3]];


      if(layer.name.indexOf("text") == 0)
      {
        if(layer.text != null)
        {
          // console.log("******************* TEXT " + layer.name);
          // console.log("POSITION: " + position);
          // console.log("SIZE: " + size);
          // console.log(layer.text);
          // console.log(layer.text.textStyleRange[0]);
          // console.log(layer.text.paragraphStyleRange[0]);
          
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
            console.log("BLEND OPTIONS FOUND");
            console.log(layer.blendOptions);            
            if(layer.blendOptions.hasOwnProperty("opacity"))
            {
              alpha = layer.blendOptions.opacity.value / 100.0;
              console.log("ALPHA SET TO " + alpha);
            }
          }
                    

          try
          {
            var text_style = layer.text.textStyleRange[0].textStyle;
            
            this._logger.error("++++++++++++++++++++++++++");
            this._logger.error(text_style);
            
            text_font = text_style.fontName;
            text_fontStyle = text_style.fontStyleName;
            
            if(text_style.hasOwnProperty("size"))
            {
              if(text_style.size.hasOwnProperty("value"))
              {
                console.log("TEXT STYLE SIZE HAS VALUE");
                text_size = text_style.size.value;    
              }else{
                console.log("TEXT STYLE SIZE HAS NO VALUE");
                console.log(text_style);
                console.log(text_style.size);
                text_size = text_style.size;
              }
            }else{
              console.log("TEXT STYLE HAS NO SIZE");
              console.log(text_style);
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
            this._logger.error("ERROR PARSING FONT STYLE -- " + e);
            this._logger.error(layer.text.textKey);
            this._logger.error(layer.text.textStyleRange);
          }

          if(layer.text.paragraphStyleRange == null)
          {
            console.log("PARAGRAPH STYLE = null");
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
                        }

                        break;
                    case "right":
                        if(coordinateSystem == "spritekit")
                        {
                            position[0] = position[0] + size[0]/2;
                        }else if(coordinateSystem == "native_ui"){
                            position[0] = position[0] + size[0];
                        }

                        break;
                    case "center":
                        if(coordinateSystem == "spritekit")
                        {
                            //center aligned by default!
                        }else if(coordinateSystem == "native_ui"){
                            position[0] = position[0] + size[0]/2;
                        }
                        break;
                }

            }catch(e){
              this._logger.error("ERROR PARSING PARAGRAPH STYLE -- " + e);
              this._logger.error(layer.text.paragraphStyleRange[0]);
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
      
      //IMAGE OR SCALEBTN
      return { "name" : layer.name.replace(/ /g,"_"), "type" : "image", "position_absolute" : position, "size":size };
    }
    

    AssetManager.prototype.start = function () {
        this._init();
    };

    /**
     * Stop generating assets for the document. Note that this does not delete any
     * existing assets, but document changes will be ignored and existing assets will
     * not be updated.
     */
    AssetManager.prototype.stop = function () {
        this._renderManager.cancelAll(this._document.id);
        this._fileManager.cancelAll();
    };

    module.exports = AssetManager;
}());
