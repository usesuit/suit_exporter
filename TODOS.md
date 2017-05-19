make sure new image write/compare works on macs


BUG: if an image layer is toggled invisible, its bounds are not used to compute it's parent container bounds
	this can lead to containers at 0,0 with 0,0 w/h and might cause weird interactions
	(metadata should be the same regardless of layer visibility)