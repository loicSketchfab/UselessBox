var potentiometerSketchfabApp = function(){
    // 
    // Global variables to be used throughout
    // 
    {
        

        var API = null;

        var nodes   = {};
        var materials = {};
        var EMITMAT = null;
        var screenTextMaterial = null;
        var screenTexture = null;

        var overlay = document.getElementById('overlay');

        var potentiometerValues = {}; // Group by groupID
    }

    var viewerOptions = {
        autostart:         1,
        camera:            0,
        ui_stop:           0,
        transparent:       1,
        ui_controls:       0,
        ui_hint:           0,
        ui_infos:          0,
        ui_loading:        0,
        ui_watermark_link: 0,
        ui_watermark:      0,
        double_click:      0,
        ui_color:          '880000',
    };
    sketchfabApp.init('api-frame', '6ef7257b860b4022ba22af9f35995cf3', viewerOptions, beforeViewerReady, customOnViewerReady, onNodesParsed, onMaterialsParsed);
    

    function beforeViewerReady(api){
        API = api;
    }
    
    function customOnViewerReady(){
    }

    function onNodesParsed(NODES){

        nodes = NODES;
        console.log("Nodes:", nodes);
    
        // Assign the controller types to the nodes and gather their order
        for(var id in nodes){

            n = nodes[id];

            n.onEnterCallback = null;
            n.onLeaveCallback = null;
            n.onClickCallback = null;
            n.proxy           = null;

            if(n.name.startsWith("r")){
                //n.onLeaveCallback = function(_n, _info){ console.log(_n); sketchfabApp.translate(_n, [0, 0, 0], 0.2); }
                //n.onEnterCallback = function(_n, _info){ sketchfabApp.translate(_n, [0, +0.1, 0], 0.) };
                n.onClickCallback = function(_n, _info){ actions.activatePotentiometer(_n, _info) };
            }
        }
    }

    function onMaterialsParsed(MATERIALS){
        materials = MATERIALS;
        console.log("Materials:", materials);
        EMITMAT            = sketchfabApp.getMaterialFromName("pad_translucent");
        screenTextMaterial = sketchfabApp.getMaterialFromName('carter_screen_text');
        screenTexture = screenTextMaterial.channels['AlphaMask'].texture;

        setupScreenTexture();
        updateScreenTexture("TURN ME");
    }

    actions = function(){
        
        // Variables for the potentiometer
        var tmp = {
            initialClick:    [0,0], // 2D position of the initial click
            objectCenter:    [0,0], // 2D position of the object center
            v1:              null,  // center to initial click
            v2:              null,  // center to current mouse position
            currentMatrixID: null,  // matrix ID of the selected potentiometer
            currentNodeID:   null,  // node ID of the potentionmeter
            currentAngle:    0,     // computed rotation angle
        }

        function activatePotentiometer(n, info){

            potentiometerFunctions = {
                r1: function(x){
                    // Do something with x
                }
            }
            potentiometerFunction = null;
    
            var tmp = {
                initialClick:    [0,0], // 2D position of the initial click
                objectCenter:    [0,0], // 2D position of the object center
                v1:              null,  // center to initial click
                v2:              null,  // center to current mouse position
                matrixID:        null,  // matrix ID of the selected potentiometer
                currentNodeID:   null,  // node ID of the potentionmeter
                currentGroupID:  null,  // group ID of the potentionmeter
                currentAngle:    0,     // computed rotation angle
            }
    
            function mouseMoveListener(event){
                
                var x = event.clientX;
                var y = event.clientY;

                // First click
                if(tmp.initialClick[0]==0 && tmp.initialClick[1]==0){
                    //console.log()
                    tmp.currentAngle = potentiometerValues[tmp.currentGroupID.toString()];
                    tmp.initialClick = [x,y];
                    tmp.v1 = [ tmp.initialClick[0] - tmp.objectCenter[0], tmp.initialClick[1] - tmp.objectCenter[1]];
                }
                
                // Current vector
                tmp.v2 = [ x - tmp.objectCenter[0], y - tmp.objectCenter[1]];
    
                // Angle
                var diff = Math.atan2(tmp.v2[1], tmp.v2[0]) - Math.atan2(tmp.v1[1], tmp.v1[0]);
                var newTmpAngle = potentiometerValues[tmp.currentGroupID.toString()] + diff;
                
                if(newTmpAngle>Math.PI){
                    newTmpAngle -= 2*Math.PI
                }
                else if(newTmpAngle<-Math.PI){
                    newTmpAngle+= 2*Math.PI
                }
                newTmpAngle = Math.max(Math.min(newTmpAngle, 2), -2);
    
                if(Math.abs(newTmpAngle - tmp.currentAngle) < 2){
                    tmp.currentAngle = newTmpAngle;
                    var v = tmp.currentAngle * 0.25 + 0.5;
                    if(potentiometerFunction){
                        potentiometerFunction(v);
                    }
                    sketchfabApp.rotate(tmp, tmp.currentAngle, [0,1,0], d=0);
                    updateScreenTexture(v.toFixed(5));

                    // Do something with the value (set color)
                    /*
                    var m = sketchfabApp.getMaterialFromName("potentiometer_top");
                    m.channels.Matcap.color = [v, v, v]
                    API.setMaterial(m);
                    API.getPostProcessing(function(settings) {
                        window.console.log(settings);
                    });
                    */
                    API.setPostProcessing({toneMappingSaturation: 2*v});
                    
                    
                }
            }
    
            function overlayClickListener(event){
                overlay.removeEventListener("mousemove", mouseMoveListener);
                overlay.classList.add('transparent');
                tmp.initialClick = [0,0]
                if( tmp.currentGroupID in potentiometerValues ){
                    delete potentiometerValues[tmp.currentGroupID.toString()];
                }
                potentiometerValues[tmp.currentGroupID.toString()] = tmp.currentAngle;
                sketchfabApp.translate(n, [0, 0, 0], 0.1);
            }

            sketchfabApp.translate(n, [0, 0.1, 0], 0.1);
    
            tmp.matrixID       = n.matrixID;
            tmp.currentNodeID  = n.id;
            tmp.currentGroupID = n.groupID;
            if(!(tmp.currentGroupID in potentiometerValues)){
                potentiometerValues[tmp.currentGroupID.toString()] = 0;
            }

            overlay.classList.remove('transparent');
            overlay.addEventListener("mousemove", mouseMoveListener);
            overlay.addEventListener("click",     overlayClickListener, {once: true});

            if(n.name in potentiometerFunctions)
                potentiometerFunction = potentiometerFunctions[n.name];

            // Get the screen space position of the object center, with the z of the click
            var c = [n.matrix[12], n.matrix[13], info.position3D[2] + 0.1];
            API.getWorldToScreenCoordinates([c[0], c[1], c[2]], function(coord) {
                tmp.objectCenter = coord.canvasCoord;
            });
        }

        var returnInterface = {
            activatePotentiometer : activatePotentiometer
        };

        return returnInterface;

    }();


    

    //
    // Setup a texture for the screen
    //

    var canvas;
    var context2d;

    function setupScreenTexture(txt){
        canvas = document.createElement('canvas');
        canvas.width = 84; // 10 * 8 + 2 + 2
        canvas.height = 34; // 10 * 3 + 2 + 2
        context2d = canvas.getContext('2d');
        context2d.fillStyle = 'black';
        context2d.font = 'bold 16px Courier, monospace';
        updateScreenTexture("");
    }

    function updateScreenTexture(txt){
        context2d.clearRect(0, 0, canvas.width, canvas.height);
        context2d.fillText("Value:", 6, 14);
        context2d.fillText(txt.toUpperCase(), 6, 28);
        var url = canvas.toDataURL('image/png', 1.0);
        API.addTexture(url, function (err, textureId) {
            screenTexture.uid = textureId;
            API.setMaterial(screenTextMaterial);
        });
    }


}(); // End of keyboardApp "namespace"