/*
BUGS / FEATURES:

    * setShadingStyle is not good for PBR in the viewer API doc
    * ce serait bien d'avoir un groundShadowShow
    * API setWireframe: pas mal d'avoir un delay ou temps d'animation
    * API setWireframe: bien d'avoir le wireframe factor
    * API getbACKGROUND On n'a pas
    * /edit?api_log=1 : fake news
    * factor is an object and contains progress
    * Would be cool to be able to set texture as closest in the API instead of trilinear interpolation
    * clicking on an annotation triggers the click of the object behind it
    * would be cool to have an option to cut listening on the iframe
    * Documentation of getTextureList matches getMaterialList
*/

var sketchfabApp = function(){
    
    var sketchfabApi = null;
    var NODES = {};
    var MATERIALS = {};
    var namesToId = {};

    var backgroundClickedTime = 0;
    
    var dOMHelpers = function(){

        var loader = document.getElementById("loader");
        var loader_message = document.getElementById("loader_message");
        var curtain = document.getElementById("curtain");
        
        function showLoader(message){
            loader_message.innerHTML = message;
        }
    
        function hideLoader(){
            //restore if it does not appear at th ebegginning
            //$("#curtain").css("transition", "1s");
            //$("#loader").css("transition", "0.5s");
            window.setTimeout(function(){
                curtain.style.opacity = 0;
                window.setTimeout(function(){
                    curtain.style.display = "none";
                }, 500);
            }, 1000);
        }
    
        function loadExternalScripts(scripts){
    
            showLoader("Loading external scripts");
    
            function loadScript(url, onload=null){
                var script = document.createElement('script');
                script.onload = onload;
                script.src = url;
                document.head.appendChild(script);
            }
    
            scripts.forEach(function(script){
                loadScript(script.url, script.callback);
            });
        }

        var returnInterface = {
            showLoader : showLoader,
            hideLoader : hideLoader,
            loadExternalScripts : loadExternalScripts
        };

        return returnInterface;
    }();

    
    var blurEffect = function(){

        var CameraPosition;
        var CameraTarget;
        var GroupID=0;

        var image = document.getElementById("image");
        var background = document.getElementById("background-image");

        function activate(){
            // Start showing a loading spinner
            // $("#spinner").show();

            // Save the current camera position and target to restore them later
            sketchfabApi.getCameraLookAt(function(err, camera) {
                if(err){return;}
                CameraPosition = camera.position;
                CameraTarget   = camera.target;
            });

            // Stop camera interactions the time to load everything
            sketchfabApi.setUserInteraction(false, function(err) {
                if(err){return;}
                    
                // Take a screenshot of the scene as it is to use as background
                //sketchfabApi.setBackground({transparent: true}, function(){
                    sketchfabApi.getScreenShot( 'image/png', function ( err, result ) {
                        if(err){return;}
            
                        // Show the screenshot as image and put it on front, then wait a bit
                        image.src = result;
                        setTimeout(function(){
                            image.style.display = "block";
                            image.style.zIndex = 3;
                            background.style.zIndex = 2;
                            image.classList.remove(["not-blurred"]);
                            image.classList.add(["blurred"]);
                
                            // Hide all annotations
                            sketchfabApi.removeAllAnnotations(function(err) {if(err){return;}});
                            
                            // Hide all objects and find objects to show (and related proxies)
                            idsToShow = [];
                            for(var id in NODES){
                                // Hide everyone
                                sketchfabApi.hide(id);
                                // Get objects in the currently active group
                                if((NODES[id].groupID == GroupID)){
                                    idsToShow.push(id);
                                    // Get objects pointed to by the currently active node
                                    if(NODES[id].proxy){
                                        idsToShow.push(NODES[id].proxy.id);
                                    }
                                }
                            }
                            // Get objects pointing towards the currently selected one
                            for(var id of idsToShow){
                                for(var id2 in NODES){
                                    if(NODES[id2].proxy && (NODES[id2].proxy.id == id)){
                                        idsToShow.push(id2);
                                    }
                                }
                            }

                            // Wait for objects to be hidden to take a screenshot
                            //sketchfabApi.setBackground({transparent: false}, function(){
                                //setTimeout(function(){
                                    //sketchfabApi.getScreenShot( 'image/png', function ( err, result ) {
                                        
                                        // Assign the background image
                                        //$("#background-image").attr("src", result);

                                        // Show objects to keep
                                        for(var id of idsToShow){
                                            sketchfabApi.show(id);
                                        }

                                        // Zoom on the selected object
                                        sketchfabApi.focusOnVisibleGeometries(function(err) {
                                            if(err){return;}
                                
                                            // Hide the spinner
                                            //$("#spinner").hide();
                            
                                            // Push screenshot images on the back
                                            background.style.zIndex = -2;
                                            image.style.zIndex = -1;
                            
                                            // Re-allow manipulation
                                            sketchfabApi.setUserInteraction(true, function(err) {
                                                if(err){return;}
                                            });
                            
                                            // Add a callback for escape button
                                            document.getElementById('help').onclick = deactivate;
                            
                                        });


                                    //});
                                //}, 50);
                            //});

                        }, 50);
                    });
                //});
                
            });
        }

        function deactivate(){

            // Hide all objects
            for(var id in NODES){
                sketchfabApi.hide(id);
            }

            // Push the images on top
            image.style.zIndex = 3;
            background.style.zIndex = 2;
            image.classList.add(["not-blurred"]);
            image.classList.remove(["blurred"]);

            // Restore original position after 100ms
            setTimeout(function(){

                sketchfabApi.setCameraLookAt(CameraPosition, CameraTarget, 0, function(err) { 
                    if(err){return;}

                    // Show all objects
                    for(var id in NODES){
                        sketchfabApi.show(id);
                    }

                    // Use a timeout before reshowing the scene to avoid any flickering
                    setTimeout(function(){
                        image.src = "";
                        image.style.zIndex = -1;
                        image.style.display = "none";
                        background.style.zIndex = -2;
                        sketchfabApi.setBackground({transparent: false});
                    }, 200);

                    // Restore the behaviour
                    document.getElementById( 'help' ).onclick = activate;
                });
            }, 100);        
        }

        function set(id){
            GroupID = id;
        }

        return {
            activate : activate,
            deactivate : deactivate,
            set : set
        };

    }();


    function init(iframeId, uid, viewerOptions, beforeViewerReady, customOnViewerReady, onNodesParsed, onMaterialsParsed){

        function onViewerReady() {

            function SketchfabCallback(info, callbackName){
                if(info.instanceID){
                    var n = NODES[info.instanceID];
                    if(n){
                        if(n.proxy){
                            n = n.proxy;
                        }
                        if(n[callbackName]){
                            n[callbackName](n, info);
                        }
                    }
                    
                }
                else{
                    onClickCallbackBackground();
                }
            }
    
            function onNodeMouseEnter(info) { 
                SketchfabCallback(info, "onEnterCallback");
            }
        
            function onNodeMouseLeave(info) {
                SketchfabCallback(info, "onLeaveCallback");
            }
        
            function onNodeClick(info) {
                
                if(info.instanceID){
                    if(NODES[info.instanceID].groupID){
                        blurEffect.set(NODES[info.instanceID].groupID);
                    }
                    SketchfabCallback(info, "onClickCallback");
                }
                else {
                    onClickCallbackBackground();
                }
            }

            function onClickCallbackBackground() {
                if( (backgroundClickedTime != 0) && (Date.now() - backgroundClickedTime < 500)){
                    sketchfabApi.recenterCamera();
                }
                backgroundClickedTime = Date.now();
            }

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
                            if(parentGroup.name){
                                namesToId[parentGroup.name] = node.instanceID;
                            }
                        }
                    }
                }
        
                if (!err) {
                    parseNodeTree();
                    onNodesParsed(NODES);
                }
                else{
                    console.log("Error while parsing node tree", err);
                }
            };

            function onMaterialList(err, materials) {

                function parseMaterials() {
                    materials.forEach(function(mat){
                        MATERIALS[mat.id] = mat;
                    });
                };
        
                if(!err){
                    parseMaterials();
                    onMaterialsParsed(MATERIALS);
                }
                else{
                    console.log("Error while parsing materials", err);
                }
            }

            sketchfabApi.getNodeMap(onNodeMap);
            sketchfabApi.getMaterialList(onMaterialList);
            sketchfabApi.addEventListener( 'nodeMouseEnter', onNodeMouseEnter, { pick: 'fast' } );
            sketchfabApi.addEventListener( 'nodeMouseLeave', onNodeMouseLeave, { pick: 'fast' } );
            sketchfabApi.addEventListener( 'click',          onNodeClick,      { pick: 'fast' } );

            customOnViewerReady();
        }

        function onSuccess(api) {
            sketchfabApi = api;
            
            dOMHelpers.showLoader("Starting Sketchfab API");
            api.start();
    
            api.addEventListener('modelLoadProgress', function(info) {
                dOMHelpers.showLoader("Starting Sketchfab API");
                dOMHelpers.showLoader("Loading 3D model (" + Math.floor(100*info.progress)+ " %)")
            });
    
            api.addEventListener('textureLoadProgress', function(info) {
                if(info.progress == 1){
                    document.getElementById("loader").style.opacity = 0;
                    dOMHelpers.showLoader("Application ready");
                    dOMHelpers.hideLoader();
                }
                else{
                    dOMHelpers.showLoader("Loading textures (" + Math.floor(100*info.progress)+ " %)")
                }
            });
    
            api.addEventListener( 'viewerready', onViewerReady );
            
            beforeViewerReady(api);
        }

        function onError() {
            console.log( 'Viewer error' );
        }

        viewerOptions.success = onSuccess;
        viewerOptions.error   = onError;

        dOMHelpers.showLoader("Setting up Sketchfab API");
        var client  = new Sketchfab(document.getElementById(iframeId));
        client.init( uid, viewerOptions );
    };

    function getNodeIdFromName(name){
        return namesToId[name];
    }

    function getMaterialFromName(materialName){
        for(var mID in MATERIALS){
            if(MATERIALS[mID].name == materialName){
                return MATERIALS[mID];
            }
        };
    };

    function translate(n, v=[0,0,0], d=0.1){
        sketchfabApi.translate(
            n.matrixID, 
            [
                n.matrix[12] + v[0],
                n.matrix[14] + v[1],
                -n.matrix[13] + v[2]
            ],
            {
                duration:d,
                easing: "easeLinear"
            }
        );
    }

    function rotate(n, angle, axis, d=0.1){
        sketchfabApi.rotate(
            n.matrixID,
            [angle, axis[0], axis[1], axis[2]],
            {
                duration:d, 
                easing: "easeLinear"
            }
        );
    }

    var appInterface = {
        api :                 sketchfabApi,
        showLoader :          dOMHelpers.showLoader,
        hideLoader :          dOMHelpers.hideLoader,
        loadExternalScripts : dOMHelpers.loadExternalScripts,
        blurEffect :          blurEffect,
        rotate:               rotate,
        translate :           translate,
        getNodeIdFromName :   getNodeIdFromName,
        getMaterialFromName : getMaterialFromName,
        init :                init
    };

    return appInterface;

}();