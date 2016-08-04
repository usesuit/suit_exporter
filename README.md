Bring Your Own Scene Graph
===============================================
This plugin for Adobe generator is meant as a UI placement tool for game development. We're currently using it to build games in SpriteKit and Unity (with Futile), but theoretically this data could be used in any engine with a node-based scene graph.

Install
===============================================
download the zip file and drop it into your generators folder

Mac: /Applications/Adobe\ Photoshop\ CC\ 2015/Plug-ins/Generator
Windows: TODO

Usage
===============================================
Unlike the default image exporter plugin where you must name each layer with .png (or .jpg or whatever) to export it, we assume that you want every LAYER in the PSD to be exported as an individual image. We work with PNGs, so I've removed all other options to simplify naming. 

To prevent a layer from being exported (or the contents of a group), simply start the name of the layer/group with "guide".

By default, Photoshop groups are purely organizational for your artists in photoshop. If you want a group to be exported as a container node, it must have a specific name format:

Supported Containers (Photoshop Groups)
-------------
* **container** (e.g. "container_header") - a node which contains other nodes, but no content of its own
* **progress** (e.g. "progress_health") - an alias for container (see runtime notes)
* **scale9** (e.g. "scale9_popup_bg") - an alias for container (see runtime notes)
* **btn** (e.g. "btn_start") - an alias for container (see runtime notes)
* **scalebtn** (e.g. "scalebtn_start") - an alias for container (see runtime notes)
* **tab** (e.g. "tab_options") - an alias for container (see runtime notes)
* **guide** (e.g. "guide_stuff") - a photoshop group which will have its contents ignored by the exporter

Supported Nodes (Photoshop Layers)
------------------------------------
* **image** (e.g. "my_image" or "thingy" or "health_bg") -- any photoshop layer which does not conform to one of the "special" layer types will simply be exported as an image (cropped to the bounds of the layer)
* **text** (e.g. "text_points") -- any type layer prefixed with "text_" will be exported as pure metadata. i've only tested this with single-line text, and only the following properties are exported:
  - font
  - fontSize (in points)
  - text (contents of the text field)
  - justification ( left | center | right )
  - color (hex, no alpha)
* **guide** (e.g. "guide_somelayer") -- any layer you dont want exported
* **placeholder** (e.g. "placeholder_thumbnail") -- exports simply the center and size of the layer in metadata (no image). see runtime notes
* **pivot** (e.g. "pivot_somecontainer") -- when placed inside of an exported container, a pivot layer sets the parent container's pivot to the center of the pivot (we usually use a 4x4 pink box). see runtime notes, this is useful for scale buttons


Runtime Notes
===============================================
The data that comes out of this plugin is meant to be framework and engine-independent, which means YOU the programmer are responsible for providing a scene graph.

In our own implementations, we've found it convenient to have some "magic" extra UI objects that get automagically wired up. You are NOT REQUIRED to use these naming conventions (you can simply use "container_", "text_", and the default to export only containers/labels/images.

The "extras" that we implement in our own games are:

* **btn** (container) -- a button container. the "up" state of the button will be any child of this container that ends with "_up" and the "down" state will be any child that ends with "_down." We mostly target mobile, but you could conceivably do the same thing with "_hover". You can mix and match images and labels, but be aware that you need to update ALL the textfields associated with a button if it has dynamic text.
* **scalebtn** (container) -- the exact same as a btn container, but with only one set of content. "up" is the contents scaled to 100%, "down" is the contents scaled to 90%. "hover" is the contents scaled to 105%. like btn, you can mix and match images/text.
* **scalebtn** (image) -- if you name an image "scalebtn_NAME", it will do the same as the container-based scale button, but you don't need to explicitly provide the surrounding container. quick & easy!
* **progress** (container) -- given "progress_NAME", looks for two children named "NAME_fill" and "NAME_bkg" and turns it into a progress bar
* **tab** (container) -- kind of like a button container but with a lot more states. for each container within the tab, parse out the LAST segment and associate all of the contents of that container/object with that tab state. for example a tab group might have subcontainers called:
  * btn_purchase_off   (i.e. a purchase button where you don't have enough coins)
  * btn_purchase_on (i.e. an active button)
  * btn_purchase_locked (i.e. a button where you haven't unlocked the option to buy yet)
* **scale9** (container) -- given "scale9_NAME", looks for "NAME_1" through "NAME_9" (going across horizontally) to create a scale9 shape. "NAME_5" is optional (you can use scale9 to make just a frame)
* **flipX** (image) -- we often have symmetrical assets. to save space in our texture atlases, we reuse the same image but prefix one of them with flipX. when added to the scene graph these items will have xScale = -1



Implementations
===============================================
TODO: implement this stuff

