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
Unlike the default image exporter plugin where you must name each layer with .png (or .jpg or whatever) to export it, we assume that you want every LAYER in the PSD to be exported as an individual image/container/text. We work with PNGs, so I've removed all other options to simplify naming.

NODE TYPES
-------------
* container (Photoshop Group)
* image (Photoshop layer without text)
* text (Photoshop layer with text)

SPECIAL PREFIXES
-------------
* "guide_": any layer/group that begins with group will be skipped by the exporter (including children for groups)
* "alias_": any image layer that begins with "alias_" will export metadata only. this can be useful for duplicate sprites in a sprite atlas. for example, a sprite layer named "cloud" and "alias_cloud" would create two sprite in different positions at runtime, but only one PNG exported. most texture atlas systems will automatically de-dupe identical sprite anyway, but SpriteKit in particular suffers from performance degradation when an atlas contains many entries
* "placeholder_": an image layer that begins with "placeholder_" will not be exported. instead, we simply export the position and bounds (within the parent container). this is useful for giving yourself named "locations" in code for dynamic placement and sizing of objects later (for example, a user portrait where we want the portrait in a complex node hierarchy but don't know ahead of time what image will go there)
* "pivot_": an image layer that begins with "pivot_" will not be exported (typically we use a 2x2 or 4x4 pink rect). instead, the center of the pivot layer will be exported as the pivot of the surrounding container. this allows for some simple FK chains, but we most often use it for scale buttons that are anchored to one side of the screen (as they scale up/down, they can scale towards the outside edge instead of their center)


Runtime Notes
===============================================
The data that comes out of this plugin is meant to be framework and engine-independent, which means YOU the programmer are responsible for providing a scene graph. In our own implementations, we've found it convenient to have some "magic" extra UI objects that get automagically wired up. You are NOT REQUIRED to use these naming conventions. See each specific runtime for details about the naming conventions and child structure that are expected. The idea is that the provided controls are a good starting point and that your game/app can easily extend it for custom controls.

As an example, for SpriteKit (where there are no hover states) we might prefix all our assets in the following way:

* btn_start (photoshop group)
	* text_start_up (photoshop text layer)
	* start_bkg_up (photoshop art layer)
	* text_start_down (photoshop text layer)
	* start_bkg_down (photoshop art layer)

In Swifte, we can automatically turn any container layer that starts with "btn_" into a button object and use the postfixes on the children to determine which assets should be shown in which states.

Another example would be "flipX" -- for perfectly symmetrical or mirrored sprites, it can often save atlas space to render 1/2 of the item and flip the second piece. By convention in our runtimes, any sprite named "flipX_spritename" will be displayed as normal but with an x-scale set to -1.



Implementations
===============================================
* Unity + Canvas UI (in C#) - [https://github.com/usesuit/suit_unity](https://github.com/usesuit/suit_unity)
* iOS + SpriteKit (in Swift) - TODO [https://github.com/DragonArmy/DACore](https://github.com/DragonArmy/DACore)
* iOS + UIKit (in Swift) - TODO [https://github.com/DragonArmy/DACore](https://github.com/DragonArmy/DACore)
* HTML5 (via Pixi.js) - TODO
* Unity + Futile (in C#) - TODO (but also kind of deprecated)
