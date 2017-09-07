SUIT Exporter
===============================================
This plugin for Adobe generator is meant as a UI placement tool for game/app development. The tool exports images and metadata from a PSD using as few naming conventions as possible. If your environment supports nodes/containers, images/sprites, and dynamic textfields of some kind, it's pretty straightforward to add support. In prior versions we maintained a whitelist of which Photoshop groups to export (container, progress, scale9, btn, scalebtn, etc), but we're in the process of moving away from that and more towards general purpose export. The runtime (Unity, SpriteKit, etc) should dictate what it wants to do with the metadata, while the exporter JUST barfs out images and metadata.

Install
===============================================
download the zip file and drop the suit_exporter folder into your generators folder
* **Mac**: /Applications/Adobe Photoshop CC 2015/Plug-ins/Generator
* **Windows**: C:\Program Files\Adobe\Adobe Photoshop CC 2017\Plug-ins\Generator

Usage
===============================================
Unlike the default image exporter plugin where you must name each layer with .png (or .jpg or whatever) to export it, we assume that you want every LAYER in the PSD to be exported as an individual image. We work with PNGs, so I've removed all other options to simplify naming.

To prevent a layer from being exported (or the contents of a group), simply start the name of the layer/group with "guide".

Though we no longer enforce specific container naming conventions at the PSD level, here are some handy naming conventions that play nice with most of our internal runtimes:

Recommended Container (Photoshop Group) Naming Conventions 
-------------
* **(no prefix)** - a node which doesn't match any of the whitelisted prefixes below is assumed to be for organizational purposes only and "flattened" -- its children are added to the parent as if the Group didn't exist
* **container** ("container_header") - a node which contains other nodes, but no content of its own
* **progress** ("progress_health") - a container that contains assets for building a progress bar
* **scale9** ("scale9_popup_bg") - a container that contains assets for a scale9 asset
* **btn** ("btn_start") - a container that contains assets for a button (though each runtime might expect different states)
* **scalebtn** ("scalebtn_start") - a container that contains assets for a scale button (a button whose down/up/over states are done programatically with scaling)
* **tab** ("tab_options") - a generic container with multiple states, where only one state is shown at a time
* **guide** ("guide_stuff") - a photoshop group which will have its contents ignored by the exporter

Recommended Node (Photoshop Layer) Naming Conventions
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
The data that comes out of this plugin is meant to be framework and engine-independent, which means YOU the programmer are responsible for providing a scene graph. In our own implementations, we've found it convenient to have some "magic" extra UI objects that get automagically wired up. You are NOT REQUIRED to use these naming conventions. See each specific runtime for details about the naming conventions and child structure that are expected. The idea is that the provided controls are a good starting point and that your game/app can easily extend it for custom controls.

As an example, for SpriteKit (where there are no hover states) we might prefix all our assets in the following way:

* btn_start (photoshop group)
	* text_start_up (photoshop text layer)
	* start_bkg_up (photoshop art layer)
	* text_start_down (photoshop text layer)
	* start_bkg_down (photoshop art layer)

In our SpriteKit button, we set it so any child postfixed with "_up" gets shown in the "up" state and any child postfixed with "_down" gets shown in the "down" state.

Another example would be "flipX" -- for perfectly symmetrical or mirrored sprites, it can often save atlas space to render 1/2 of the item and flip the second piece. By convention in our runtimes, any sprite named "flipX_spritename" will be displayed as normal but with an x-scale set to -1.



Implementations
===============================================
* SpriteKit/Native iOS (in Swift) - [https://github.com/DragonArmy/DACore](https://github.com/DragonArmy/DACore)
* Unity + Canvas UI (in C#) - [https://github.com/usesuit/suit_unity](https://github.com/usesuit/suit_unity)
* Unity + Futile (in C#) - TODO
* HTML5 (via Pixi.js) - TODO
