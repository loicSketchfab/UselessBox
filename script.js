/*
Global variables
*/

var iframe  = document.getElementById('api-frame');
var API = null;
var NODES   = {};
var backgroundClickedTime = 0;
var actuactorNode = null, lidNode = null;

/*
Functions to show the loading spinner
*/

function showLoader(message){
    $("#loader_message").html(message);
}
function hideLoader(){
    $("#curtain").css("transition", "1s");
    $("#loader").css("transition", "0.5s");
    window.setTimeout(function(){
        document.getElementById("curtain").style.opacity = 0;
        window.setTimeout(function(){
            document.getElementById("curtain").style.display = "none";
        }, 500);
    }, 1000);
}

/*
External resources
*/

showLoader("Loading mp3 files");
var switchON  = new Audio('switchON.mp3');
var switchOFF = new Audio('switchOFF.mp3');

/*
API initialization
*/

showLoader("Setting up Sketchfab API");
var client  = new Sketchfab( iframe );
var viewerOptions = {
    success: onSuccess,
    error:   onError,
    autostart:         1,
    camera:            0,
    ui_stop:           0,
    transparent:       0,
    ui_controls:       0,
    ui_hint:           0,
    ui_infos:          0,
    ui_loading:        0,
    ui_watermark_link: 0,
    ui_watermark:      0,
    double_click:      0,
    ui_color:          '880000',
};
client.init( '8d0c2ad8281643f1b47dc509dc9036f1', viewerOptions );

function onSuccess(api){

    showLoader("Starting Sketchfab API");
    API=api;
    API.start();

    API.addEventListener('modelLoadProgress', function(info) {
        showLoader("Loading 3D model (" + Math.floor(100*info.progress)+ " %)")
    });

    API.addEventListener('textureLoadProgress', function(info) {
        if(info.progress == 1){
            document.getElementById("loader").style.opacity = 0;
            showLoader("Application ready");
            hideLoader();
        }
        else{
            showLoader("Loading textures (" + Math.floor(100*info.progress)+ " %)")
        }
    });

    API.addEventListener( 'viewerready', onViewerReady );
}

function onError() {
    console.log( 'Viewer error' );
}

/*
Parse the node tree
*/

function onNodeMap(err, nodes){

    function parseNodeTree(){
        var parentMatrixTransform;
        var parentGroup;
        for(var id in nodes){
            var node = nodes[id];
            if(node.type == "MatrixTransform"){
                parentMatrixTransform = node;
            }
            else if(node.type == "Group"){
                parentGroup = node;
            }
            else if(node.type == "Geometry"){
                NODES[node.instanceID] = {
                    id:         node.instanceID,
                    groupID:    parentGroup.instanceID,
                    matrixID:   parentMatrixTransform.instanceID,
                    materialID: node.materialID,
                    name:       parentGroup.name,
                    matrix:     nodes[parentMatrixTransform.instanceID].worldMatrix.slice(),
                    value:      0,
                };
                if(parentGroup.name == "box_lid"){
                    lidNode = NODES[node.instanceID];
                }
                else if(parentGroup.name == "actuactor"){
                    actuactorNode = NODES[node.instanceID];
                }
            }
        }
        
    }

    function setupControllers(){
        // Assign the controller types to the nodes and gather their order
        for(var id in NODES){

            n = NODES[id];

            n.onEnterCallback = null;
            n.onLeaveCallback = null;
            n.onClickCallback = null;
            n.proxy           = null;

            if(n.name.startsWith("button_knob")){
                n.onEnterCallback = function(_n){ translate(_n, [0, +0.025, 0], 0.1); }
                n.onLeaveCallback = function(_n){ translate(_n, [0, 0, 0], 0.2); }
                n.onClickCallback = function(_n){ toggleSwitch(_n); };
            }
        }
    }

    if (!err) {
        parseNodeTree();
        setupControllers();
    }
    else{
        console.log("Error while parsing node tree", err);
    }
};

/*
Helpers
*/

function translate(n, v=[0,0,0], d=0.1, callbacking=function(err, translateTo){}){
    API.translate(
        n.matrixID, 
        [
            n.matrix[12] + v[0],
            n.matrix[14] + v[1],
            -n.matrix[13] + v[2]
        ],
        {
            duration:d,
            easing: "easeLinear"
        },
        callbacking
    );
}

function rotate(n, angle, axis, d, callbacking=function(err, rotateTo){}){
    API.rotate(
        n,
        [angle, axis[0], axis[1], axis[2]],
        {
            duration:d, 
            easing: "easeLinear"
        },
        callbacking
    );
}

/*
Main Callbacks (viewerReady, mouseEnter, mouseLeave, click)
*/

function onViewerReady(){

    // Disable some post-processing filters
    API.setPostProcessing({
        taaEnable: false,
        sharpenEnable: false,
        vignetteEnable: false,
        dofEnable: false
    });
    API.setBackground({transparent: false});

    API.getNodeMap(onNodeMap);
    console.log("Nodes:",     NODES);

    API.addEventListener( 'nodeMouseEnter', onNodeMouseEnter, { pick: 'fast' } );
    API.addEventListener( 'nodeMouseLeave', onNodeMouseLeave, { pick: 'fast' } );
    API.addEventListener( 'click',          onNodeClick,      { pick: 'fast' } );
}

function onNodeMouseEnter(node) { 
    SketchfabCallback(node.instanceID, "onEnterCallback");
}

function onNodeMouseLeave(node) {
    SketchfabCallback(node.instanceID, "onLeaveCallback");
}

function onNodeClick(node) {
    SketchfabCallback(node.instanceID, "onClickCallback");
}

function onClickCallbackBackground() {
    if( (backgroundClickedTime != 0) && (Date.now() - backgroundClickedTime < 500)){
        API.recenterCamera();
    }
    backgroundClickedTime = Date.now();
}

function SketchfabCallback(id, callbackName){
    if(id){
        var n = NODES[id];
        if(n){
            if(n.proxy){
                n = NODES[namesToId[n.proxy]];
            }
            if(n[callbackName]){
                n[callbackName](n);
            }
        }
        
    }
    else{
        if(window[callbackName+"Background"]){
            window[callbackName+"Background"]();
        }
    }
}

/*
Animation logic
*/

var nextKnobsToToggle = [];
function hasNextKnobToToggle(){
    return Array.isArray(nextKnobsToToggle) && nextKnobsToToggle.length;
}
function getNextKnobToToggle(currentKnobID){
    if(hasNextKnobToToggle()){
        return nextKnobsToToggle.shift();
    }
    return null;
}

var inProgress = false;
function openBox(callback){
    if(!inProgress && hasNextKnobToToggle()){
        inProgress = true;
        rotate(lidNode.matrixID, 0.45, [0,0,1], 0.5);
        rotate(actuactorNode.matrixID, -0.8, [0,0,1], 0.7, callback);
    }
    else{
        // Retry every 200ms
        setTimeout(function(){
            openBox(callback);
        },
        200);
    }
}
function closeBox(){
    rotate(actuactorNode.matrixID, 0, [0,0,1], 0.35);
    setTimeout(function(){rotate(lidNode.matrixID, 0., [0,0,1], 0.25, function(err, rotateTo){inProgress=false});}, 100);
}

function doTheAnimationLogic(){

    // Get the current target knob
    targetKnob = getNextKnobToToggle();

    API.getMatrix(targetKnob.matrixID, function(err, knobMatrix) {
        if (err) return;
        API.getMatrix(NODES[actuactorNode.id].matrixID, function(err, actuactorMatrix) {
            if (err) return;

            // Get the knob and actuactor positions
            knobLocation      = [knobMatrix.world[12], knobMatrix.world[13], knobMatrix.world[14]]
            actuactorLocation = [actuactorMatrix.world[12], actuactorMatrix.world[13], actuactorMatrix.world[14]]
            diff = [actuactorLocation[0] - knobLocation[0], actuactorLocation[1] - knobLocation[1], actuactorLocation[2] - knobLocation[2]]

            actuactorNode.matrix = actuactorMatrix.world;

            // Move the actuactor to the good knob
            translate(actuactorNode, [0, 0, diff[1]], 0.25, function(){

                // Toggle the knob
                setTimeout(function(){
                    switchOFF.play();
                    rotate(targetKnob.matrixID, -0.3, [0,0,1], 0.1);
                }, 100);

                // Rotate the actuactor to toggle the knob
                rotate(actuactorNode.matrixID, -1, [0,0,1], 0.25, function(){

                    targetKnob.value = 0;

                    // Wait a little bit before retracting to a neutral position
                    setTimeout(function(){
                        rotate(actuactorNode.matrixID, -0.8, [0,0,1], 0.15, function(){
                            
                            // Wait a bit before checking what's our next move
                            setTimeout(function(){
                                // Check if there is still a knob to go to
                                if(hasNextKnobToToggle()){
                                    doTheAnimationLogic();
                                }
                                else{
                                    closeBox();
                                }
                            }, 100);
                        });
                    }, 150);

                });

            });
        });
    });
}

function toggleSwitch(node){
    if(node.value === 0){
        nextKnobsToToggle.push(node);
        node.value = 1;
        openBox(doTheAnimationLogic);
        switchON.play();
        rotate(node.matrixID, 0.3, [0,0,1], 0.1);
    }
}
