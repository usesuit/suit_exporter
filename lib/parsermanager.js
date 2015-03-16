/*
 * Loosely based on the ParserManager from Adobe's asset generator, but killed the parser
 *  and supplied our own, along with drastically reducing available options (we always
 *  want PNG32, etc)
 * 
 */

(function () {
    "use strict";

    /**
     * The ParserManager manages parsing, normalization and analysis of layer
     * names into asset specifications. The config parameter can be used to enable
     * svg and webp parsing if the "svg-enabled" and "webp-enabled" parameters are
     * set, resp.
     * 
     * @constructor
     * @param {object} config
     */
    function ParserManager(config) {
        this._config = config || {};

        this._supportedUnits = {
            "px": true
        };

        this._supportedExtensions = {
            "png": true
        };
    }

    /**
     * Set of supported units of measurement.
     * 
     * @type {{string: boolean}}
     */
    ParserManager.prototype._supportedUnits = null;

    /**
     * Set of supported units of file extensions.
     * 
     * @type {{string: boolean}}
     */
    ParserManager.prototype._supportedExtensions = null;

    /**
     * Parse a layer name into a non-empty array of file specification parts.
     * If a given layer specification part can be parsed into a file specification,
     * then the resulting object has at least "file" and "extension" properties,
     * and possibly also "quality", "width", "height", "widthUnit" and "heightUnit"
     * properties as well. Otherwise, if a given layer name part (or the entire
     * layer name) can't be parsed into a file specification, then the resulting
     * object just has a single "name" property, which is the same as the input
     * string.
     * 
     * @private
     * @param {string} layerName
     * @returns {Array.<{name: string} | {file: string, extension: string}>}
     */
    ParserManager.prototype._parseLayerName = function (layerName) {
          
      //do not include guide layers
      if(layerName.indexOf("guide") == 0)
      {
        return [{"name":layerName}];
      }
      
      //don't export our options text (TODO: make a panel for this instead of doing textfield hash thingy)
      if(layerName == "options")
      {
        return [{"name":layerName}];
      }
      
      //text layers get exported as raw metadata. as do pivots, placeholders, tiles, and containers
      if(layerName.indexOf("text") == 0 || layerName.indexOf("pivot") == 0 || layerName.indexOf("placeholder") == 0 || layerName.indexOf("tile") == 0 || layerName.indexOf("container") == 0)
      {
        return [{"name":layerName}];
      }
      
      //ok, we're not a metadata type... export as a PNG 32!
      
      //make a component for our options!
      var component = { widthUnit: "px", heightUnit: "px", quality: 32, file: layerName + ".png", extension: "png" };
      
      return [component];
    };

    /**
     * Normalize the properties of the given component. Updates the object in place.
     * 
     * @private
     * @param {Component} component
     */
    ParserManager.prototype._normalizeComponent = function (component) {
        if (component.hasOwnProperty("extension")) {
            var extension = component.extension.toLowerCase();

            if (extension === "jpeg") {
                extension = "jpg";
            }

            component.extension = extension;

            if (component.hasOwnProperty("quality")) {
                var quality = component.quality;
                if (quality[quality.length - 1] === "%") {
                    quality = parseInt(quality.substring(0, quality.length - 1), 10);
                } else if (extension === "png" && quality[quality.length - 1] === "a") {
                    // normalize png24a -> png32
                    quality = parseInt(quality.substring(0, quality.length - 1), 10);
                    quality += 8;
                } else {
                    quality = parseInt(quality, 10);

                    if (extension !== "png") {
                        quality *= 10;
                    }
                }

                component.quality = quality;
            }
        }

        if (component.hasOwnProperty("widthUnit")) {
            component.widthUnit = component.widthUnit.toLowerCase();
        }

        if (component.hasOwnProperty("heightUnit")) {
            component.heightUnit = component.heightUnit.toLowerCase();
        }
    };

    /**
     * Analyze the component, returning a list of errors.
     * 
     * @private
     * @param {Component} component
     * @return {Array.<string>} The possibly empty list of analysis errors. 
     */
    ParserManager.prototype._analyzeComponent = function (component) {
        var errors = [];

        if (component.scale === 0) {
            errors.push("Invalid scale: 0%");
        }

        if (component.width === 0) {
            errors.push("Invalid width: 0");
        }

        if (component.height === 0) {
            errors.push("Invalid height: 0");
        }

        if (component.widthUnit && !this._supportedUnits[component.widthUnit]) {
            errors.push("Invalid width unit: " + component.widthUnit);
        }
        
        if (component.heightUnit && !this._supportedUnits[component.heightUnit]) {
            errors.push("Invalid height unit: " + component.heightUnit);
        }

        if (component.extension && !this._supportedExtensions[component.extension]) {
            errors.push("Unsupported extension: " + component.extension);
        }

        if (component.hasOwnProperty("quality")) {
            var quality = component.quality,
                invalidQuality = false;

            switch (component.extension) {
            case "jpg":
            case "webp":
                if (quality < 1 || quality > 100) {
                    invalidQuality = true;
                }
                break;
            case "png":
                if (!(quality === 8 || quality === 24 || quality === 32)) {
                    invalidQuality = true;
                }
                break;
            default:
                invalidQuality = true;
            }

            if (invalidQuality) {
                errors.push("Invalid quality: " + quality);
            }
        }

        return errors;
    };

    /**
     * Parse a layer name, returning a list of objects that contain a parsed
     * component and a list of errors encountered while analyzing that component.
     * The component denotes a valid asset iff there are no analysis errors and
     * the component contains either a "file" property (if it is a "basic"
     * component that describes a single asset) or a "default" property (if it
     * is default component that is used to derive non-basic components.)
     *
     * @param {string} layerName
     * @return {Array.<{component: Component, errors: Array.<string>}>}
     */
    ParserManager.prototype.analyzeLayerName = function (layerName) {
        var components;

        try {
            components = this._parseLayerName(layerName);
        } catch (parseError) {
            return [{
                component: { name: layerName },
                errors: [parseError.message]
            }];
        }
        
        //since we only support one component (if that) per layer, we don't need to map here
        
        var component = components[0];
        this._normalizeComponent(component);
        
        return [{
          component: component,
          errors: this._analyzeComponent(component)
        }]
    };

    module.exports = ParserManager;
}());
