/* Web-Based-VR-Tutorial Project Template
* Author: Evan Suma Rosenberg <suma@umn.edu> and Blair MacIntyre <blair@cc.gatech.edu>
* License: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
*/

// Extended by David J. Zielinski

import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Angle, Vector2 } from "@babylonjs/core/Maths/math";
import { Vector3 } from "@babylonjs/core/Maths/math";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Color3 } from "@babylonjs/core/Maths/math";
import { Color4 } from "@babylonjs/core/Maths/math";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { ActionManager, IShadowLight,  MeshBuilder, Scalar, TransformNode } from "@babylonjs/core";
import { ExecuteCodeAction } from "@babylonjs/core";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Button } from "@babylonjs/gui/2D/controls/button";
import { Control } from "@babylonjs/gui/2D/controls";
import { StackPanel } from "@babylonjs/gui/2D/controls";
import { SceneLoader } from "@babylonjs/core";
import { ISceneLoaderAsyncResult } from "@babylonjs/core";
import { BoundingInfo } from "@babylonjs/core";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { InstancedMesh } from "@babylonjs/core";

import "@babylonjs/core/Materials/standardMaterial"
import "@babylonjs/inspector";


import TileSet from "babylonjs-mapping";
import PropertyGUI from "./propertyGUI";
import { ProjectionType } from "babylonjs-mapping/lib/TileMath";
import BuildingsCustom from "babylonjs-mapping/lib/BuildingsCustom";

export interface propertiesCharlotte {
    "Shape_Leng": number;
    "Shape_Area": number;
    "Block_numb": string;
    "Drawing_nu": string;
    "Plot_numbe": string;
    "Land_type": string;
    "Housing_co": string;
    "Additional": string;
    "Street": string;
    "Address": string;
    "Story": string;
}

export interface CustomBuildings {
    "id": string;
    "filename": string;
    "rotation": number;
    "photo": string;
}

export interface AllCustomBuildings {
    "buildings": CustomBuildings[];
}

export class Game {
    private canvas: HTMLCanvasElement;
    private engine: Engine;
    public scene: Scene;

    private ourTS: TileSet;

    private lastSelectedBuildingIndex: number = -1;
    private lastSelectedBuilding: Mesh;
    private previousButton: Button;

    public allBuildings: Mesh[] = [];

    public advancedTexture: AdvancedDynamicTexture;

    public propertyGUIs: PropertyGUI[] = [];
    public ourCustomBuildings: AllCustomBuildings;

    public customBuildingGenerator: BuildingsCustom;

    private ourMaterialHighlight: StandardMaterial;
    private ourBlackMaterial: StandardMaterial;


    private dirLight: IShadowLight;
    private camera: UniversalCamera;

    constructor() {
        // Get the canvas element 
        this.canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;

        // Generate the BABYLON 3D engine
        this.engine = new Engine(this.canvas, true);

        // Creates a basic Babylon Scene object
        this.scene = new Scene(this.engine);
    }

    start(): void {
        // Create the scene and then execute this function afterwards
        this.createScene().then(() => {

           // Register a render loop to repeatedly render the scene
           this.engine.runRenderLoop(() => { 
               this.update();
               this.scene.render();
           });

           // Watch for browser/canvas resize events
           window.addEventListener("resize", () => { 
               this.engine.resize();
           });
       });
    }

    private async loadCustomBuildingsJSON() {
        const url = window.location.href + "custom_buildings.json";

        var res = await fetch(url); //then((res) => {
        //console.log("  fetch returned: " + res.status);

        if (res.status == 200) {
            var text = await res.text();

            //console.log("about to json parse for tile: " + tile.tileCoords);
            if (text.length == 0) {
                //console.log("no buildings in this tile!");
                return;
            }
            this.ourCustomBuildings = JSON.parse(text);
        }
    }

    //bringing models from sketchup to blender to GLB, seems to have a bunch of instanced parts, which if we want a single mesh, we need to collapse;
    public mergeBuildingMeshes(rawMeshes: AbstractMesh[]): Mesh
    {
        console.log("trying to do merge now!");

        const realMeshes: Mesh[] = [];

            for (let m of rawMeshes) {
                if (m.getClassName() == "Mesh") {
                    //console.log("found regular mesh: " + m.name);
                    const pureMesh = m as Mesh;

                    //console.log("  verticies: " + pureMesh.getTotalVertices());
                    if (pureMesh.getTotalVertices() > 0) {
                        //console.log("  adding mesh to merge list");
                        realMeshes.push(pureMesh);
                    }
                } else if (m.getClassName() == "InstancedMesh") {
                    //console.log("found instanced mesh: " + m.name);
                    //per https://forum.babylonjs.com/t/how-to-replace-instancedmesh-with-a-mesh/6185
                    const instanceMesh = m as InstancedMesh;
                    const newMesh = instanceMesh.sourceMesh.clone(instanceMesh.name + "non_instance", instanceMesh.parent)
                    newMesh.position = instanceMesh.position.clone();
                    if (instanceMesh.rotationQuaternion)
                        newMesh.rotationQuaternion = instanceMesh.rotationQuaternion.clone();
                    newMesh.scaling = instanceMesh.scaling.clone();

                    //console.log("  verticies: " + newMesh.getTotalVertices());
                    if (newMesh.getTotalVertices() > 0) {
                        //console.log("  adding mesh to merge list");
                        realMeshes.push(newMesh);
                    }
                } else{
                    console.error("unknown classtype: " + m.getClassName());
                }
            }

            console.log("trying to merge now. meshes: " + realMeshes.length);
            const merged = Mesh.MergeMeshes(realMeshes,false,true); 
            if (merged) {
                console.log("succesfully merged building pieces");
                merged.name = "merged_building_pieces";
            } else {
                console.error("unable to merge all building meshes!");
                return new Mesh("failed merge");
            }            

            return merged;
    }    

    private fixScale(originalMesh: Mesh, importedMesh: Mesh) {
        const bbounds: BoundingInfo = originalMesh.getBoundingInfo();
        const bmax = bbounds.boundingBox.maximumWorld.clone();
        const bmin = bbounds.boundingBox.minimumWorld.clone();
        bmax.y = 0;
        bmin.y = 0;
        const bboundsNoY: BoundingInfo = new BoundingInfo(bmin, bmax);
        //console.log("adjusted bbounds: " + bboundsNoY.maximum + " " + bboundsNoY.minimum);

        const ibounds: BoundingInfo = importedMesh.getBoundingInfo();
        const imax = ibounds.boundingBox.maximumWorld.clone();
        const imin = ibounds.boundingBox.minimumWorld.clone();
        imax.y = 0;
        imin.y = 0;
        const iboundsNoY: BoundingInfo = new BoundingInfo(imin, imax);
        //console.log("adjusted ibounds: " + iboundsNoY.maximum + " " + iboundsNoY.minimum);

        const correctRadius = bboundsNoY.boundingSphere.radiusWorld;
        const importRadius = iboundsNoY.boundingSphere.radiusWorld;
        const scaleCorrection = correctRadius / importRadius;
        
        console.log("original radius: " + correctRadius);
        console.log("import radius: " + importRadius);
       
        importedMesh.scaling = importedMesh.scaling.multiplyByFloats(scaleCorrection, scaleCorrection, scaleCorrection);

        //let's check to see 
        importedMesh.computeWorldMatrix(true);
        const checkBounds: BoundingInfo = importedMesh.getBoundingInfo();  
        const cmax = checkBounds.boundingBox.maximumWorld.clone();
        const cmin = checkBounds.boundingBox.minimumWorld.clone();
        cmax.y = 0;
        cmin.y = 0;
        
        const checkBoundsNoY: BoundingInfo = new BoundingInfo(cmin, cmax);
        //console.log("adjusted cbounds: " + checkBoundsNoY.maximum + " " + checkBoundsNoY.minimum);

        console.log("post radius: " + checkBoundsNoY.boundingSphere.radiusWorld);
    }

    private fixPosition(originalMesh: Mesh, importedMesh: Mesh) {
        const bbounds: BoundingInfo = originalMesh.getBoundingInfo();     
        const ibounds: BoundingInfo = importedMesh.getBoundingInfo();
     
        const correctPosition = bbounds.boundingSphere.centerWorld;
        const importPosition = ibounds.boundingSphere.centerWorld;       
        const positionCorrection = correctPosition.subtract(importPosition);
        positionCorrection.y=0; //don't adjust y

        console.log("original position: " + correctPosition);
        console.log("import position: " + importPosition);

        importedMesh.position=importedMesh.position.add(positionCorrection);
        importedMesh.computeWorldMatrix(true);

        const cbounds: BoundingInfo = importedMesh.getBoundingInfo();
        console.log("post position: " + cbounds.boundingSphere.centerWorld);
    }

    /*private computeDifferenceCost(originalMesh: Mesh, importedMesh: Mesh): number{
        const originalPosRaw: FloatArray = originalMesh.getVerticesData(VertexBuffer.PositionKind);
        const originalPosVec3: Vector3[]=[];

        for(let i=0;i<originalPosRaw.length;i+=3){
            const vec3=new Vector3(originalPosRaw[i],originalPosRaw[i+1],originalPosRaw[i+2]);
            const worldVec3=Vector3.TransformCoordinates(vec3, originalMesh.getWorldMatrix());
            originalPosVec3.push(worldVec3);
        }

        const importedPosRaw: FloatArray = importedMesh.getVerticesData(VertexBuffer.PositionKind);
        const importedPosVec3: Vector3[]=[];

        for(let i=0;i<importedPosRaw.length;i+=3){
            const vec3=new Vector3(importedPosRaw[i],importedPosRaw[i+1],importedPosRaw[i+2]);
            const worldVec3=Vector3.TransformCoordinates(vec3, importedMesh.getWorldMatrix());
            importedPosVec3.push(worldVec3);
        }

        let totalCost=0;
        for(let i=0;i<importedPosVec3.length;i++){
            let lowestCost=Number.POSITIVE_INFINITY;
            for(let e=0;e<originalPosVec3.length;e++){
                const cost=Vector3.Distance(importedPosVec3[i],originalPosVec3[e]);
                if(cost<lowestCost){
                    lowestCost=cost;
                }
            }
            totalCost+=lowestCost;
        }
        const costPerVertex=totalCost/importedPosVec3.length;
        
        return costPerVertex;
    }
    */
    /*private applyYaw(importedMesh: Mesh, originalRot: Quaternion, yaw: number){
        const rotAdjustment: Quaternion = Quaternion.FromEulerAngles(0, yaw, 0);
        importedMesh.rotationQuaternion = originalRot.multiply(rotAdjustment);
        importedMesh.computeWorldMatrix(true);
    }*/

    private async replaceSimpleBuildingsWithCustom() {
        console.log("trying to replace SimpleBuildings with Custom Model");

        const buildingMaterial = new StandardMaterial("merged buildingMaterial");
        buildingMaterial.diffuseColor = new Color3(0.8, 0.8, 0.8);

        console.log("number of custom buildings found: " + this.ourCustomBuildings.buildings.length);
        
        for (let c of this.ourCustomBuildings.buildings) {
            var loadResult: ISceneLoaderAsyncResult = await SceneLoader.ImportMeshAsync("", "./models/", c.filename, this.scene);
            console.log("number of meshes loaded: " + loadResult.meshes.length);
            /*for( let m of loadResult.meshes){
                console.log("mesh loaded: " + m.name);
            }*/

            
            const merged = this.mergeBuildingMeshes(loadResult.meshes);

            for (let m of loadResult.meshes)            { m.dispose(); }
            for (let t of loadResult.transformNodes)    { t.dispose(); }
            for (let l of loadResult.lights)            { l.dispose(); }
            for (let g of loadResult.geometries)        { g.dispose(); }

            console.log("custom building loaded for: " + c.id);
            
            let buildingToRemove: Mesh | null=null;

            for (let b of this.allBuildings) {

                if (b.name.includes(c.id)) { //DANGER: this is dangerous!, as 11 will be found in 1011
                    console.log("found site for custom building!");

                    // b.showBoundingBox = true;
                    //merged.showBoundingBox = true;
                    b.enableEdgesRendering();
                    b.edgesColor=new Color4(1,0,0,1);
                    b.edgesWidth=0.3;

                    merged.enableEdgesRendering();
                    merged.edgesColor=new Color4(0,0,0,1);
                    merged.edgesWidth=0.3;

                    /*let originalImportedRot: Quaternion = merged.rotationQuaternion;
                    if (originalImportedRot == null) {
                        console.log("quaternion not defined, will create from rotation euler angles");
                        originalImportedRot = Quaternion.FromEulerVector(merged.rotation);
                    }
                    
                    let lowestCost: number = Number.POSITIVE_INFINITY;
                    let lowestAngle: number = 0;

                    for (let a = 0; a < 360; a++) {
                        
                        this.applyYaw(merged, originalImportedRot, a);
                        this.fixScale(b, merged);
                        this.fixPosition(b, merged);

                        const cost = this.computeDifferenceCost(b, merged);
                        console.log("computed cost per vertex: " + cost);

                        if(cost<lowestCost){
                            lowestCost=cost;
                            lowestAngle=a;
                        }
                    }

                    console.log("Lowest Cost: " + lowestCost);
                    console.log("Lowest Cost Angle: " + lowestAngle);
                    */
                    //this.applyYaw(merged, originalImportedRot, lowestAngle);
                    console.log("trying to set rotation to: " + c.rotation);
                    const radians=Angle.FromDegrees(c.rotation);
                    merged.rotation=new Vector3(0,radians.radians(),0);//Quaternion.FromEulerAngles(0, c.rotation, 0);
                    merged.computeWorldMatrix(true);
                    this.fixScale(b, merged);
                    this.fixPosition(b, merged); 
                    
                    const props = b.metadata as Map<string, string>;
                    props.set("photo",c.photo);
                    console.log("adding photo: " + c.photo);

                    merged.metadata=props;
                    merged.name=b.name;
                    buildingToRemove=b;

                    break;
                }
             
            }

            if(buildingToRemove){
                const index=this.allBuildings.indexOf(buildingToRemove);    
                this.allBuildings.splice(index,1);
                buildingToRemove.dispose();

                this.allBuildings.push(merged);
            }           
        }
        console.log("finished loading all custom buildings");
    }

    private setupClickableBuilding(b: Mesh, index: number) {
        b.isPickable = true;
        //console.log("setting up building: " + b.name);
        b.actionManager = new ActionManager(this.scene);
        b.actionManager.registerAction(
            new ExecuteCodeAction(
                {
                    trigger: ActionManager.OnPickTrigger //OnPointerOverTrigger
                },
                () => {
                    console.log("user clicked on building: " + b.name);

                    for(const n of b.getChildren()){
                        if(n.name.includes("gui")){
                            console.log("object is already selected!");
                            return; 
                        }
                    }                  

                    //const originalMaterial = b.material;
                    //b.material = this.ourMaterialHighlight;

                    
                    const props = b.metadata as Map<string, string>;

                    let popupText: string = "";
                    popupText += "id: " + b.name + "\n";
                    props.forEach((value: string, key: string) => {
                        popupText += key + ": " + value + "\n";
                    });

                    const bbounds: BoundingInfo = b.getBoundingInfo();             
                    const bpos = bbounds.boundingSphere.centerWorld;                  

                    var stick = MeshBuilder.CreatePlane("gui_stick", {height: 0.5, width: 0.1});
                    stick.position=bpos.add(new Vector3(0,0.25,0));   
                    //stick.setParent(b);
                    stick.billboardMode=TransformNode.BILLBOARDMODE_Y;
                    stick.material=this.ourBlackMaterial;

                    var plane = MeshBuilder.CreatePlane("gui_plane", {height: 1, width: 1});                
                    plane.position=bpos.add(new Vector3(0,1.0,0));   
                    //plane.setParent(b);
                    plane.billboardMode=TransformNode.BILLBOARDMODE_Y;                 
                
                    const floatingAdvancedTexture = AdvancedDynamicTexture.CreateForMesh(plane);

                    let button: Button = null;

                    if (props.has("photo")) {
                        plane.scaling.x=1.3; //make a little wider
                        button = Button.CreateImageOnlyButton("building photo", "photos/"+props.get("photo"));
                        button.width = "100%";
                        button.height = "100%";

                    } else {
                        button = Button.CreateSimpleButton("but", popupText);
                        button.width = "100%";
                        button.height = "100%";
                        button.color = "white";
                        button.textBlock.fontSize = "60px";
                        button.textBlock.paddingLeft = "10px";
                        button.textBlock.paddingTop = "10px";
                        button.textBlock.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;

                        button.background = "black";
                        button.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
                        button.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;

                        if (button.textBlock) {
                            button.textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
                        }
                    }
                    floatingAdvancedTexture.addControl(button);

                    button.onPointerClickObservable.add(() => {
                        console.log("user clicked on button");
                        //b.material = originalMaterial;
                        this.lastSelectedBuildingIndex = -1;
                        floatingAdvancedTexture.removeControl(button);
                        button.dispose();
                        floatingAdvancedTexture.dispose();
                        plane.dispose();           
                        stick.dispose();             
                    });

                    this.lastSelectedBuildingIndex = index;
                    this.lastSelectedBuilding = b;
                    this.previousButton = button;

                }
            )
        );
    }

    private async createScene() {
        await this.loadCustomBuildingsJSON();

        this.scene.clearColor = new Color4(135/255,206/255,235/255, 1.0);

        this.camera = new UniversalCamera("camera1", new Vector3(10, 10, -50), this.scene);    
        this.camera.setTarget(new Vector3(15,-15,30));
        this.camera.attachControl(this.canvas, true);
        this.camera.speed=0.1;
        this.camera.minZ=0.1;
        this.camera.angularSensibility=8000;
        
        var light = new HemisphericLight("light", new Vector3(0, 1, 0), this.scene);
        light.intensity = 0.5;
        this.dirLight = new DirectionalLight("DirectionalLight", new Vector3(0, -1, 1), this.scene);
        this.dirLight.intensity=0.5;

        this.ourMaterialHighlight = new StandardMaterial("infoSpotMaterialHighlight", this.scene);
        this.ourMaterialHighlight.diffuseColor = new Color3(1, 1, 1);
        this.ourMaterialHighlight.freeze();

        this.ourBlackMaterial = new StandardMaterial("black_color", this.scene);
        this.ourBlackMaterial.diffuseColor = new Color3(0, 0, 0);
        this.ourBlackMaterial.freeze();

        this.ourTS = new TileSet(this.scene,this.engine);
        this.ourTS.createGeometry(new Vector2(4,4), 25, 2);
        this.ourTS.setRasterProvider("OSM");
        this.ourTS.updateRaster(35.2258461, -80.8400777, 16); //charlotte
        this.advancedTexture = this.ourTS.getAdvancedDynamicTexture();

        const blockMaterial = new StandardMaterial("blockMaterial", this.scene);
        blockMaterial.diffuseColor = new Color3(0.4, 0.4, 0.4);
        blockMaterial.freeze();

        const blockUrl = "https://virtualblackcharlotte.net/geoserver/Charlotte/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=Charlotte%3ABlocks&outputFormat=application%2Fjson";
        const customBlockGenerator = new BuildingsCustom("blocks", blockUrl, ProjectionType.EPSG_3857, this.ourTS);
        customBlockGenerator.doMerge = false;
        customBlockGenerator.defaultBuildingHeight = 0.1;
        customBlockGenerator.buildingMaterial = blockMaterial;
        customBlockGenerator.generateBuildings();

        const url="https://virtualblackcharlotte.net/geoserver/Charlotte/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=Charlotte%3ABuildings&outputFormat=application%2Fjson";
        this.customBuildingGenerator=new BuildingsCustom("buildings", url, ProjectionType.EPSG_3857, this.ourTS);
        this.customBuildingGenerator.doMerge=false;
        this.customBuildingGenerator.generateBuildings();

        
        this.customBuildingGenerator.onCaughtUpObservable.addOnce(() => {
           
            for (let t of this.ourTS.ourTiles) {
                //console.log("tile: " + t.mesh.name + " contains buildings: " + t.buildings.length);
                for (let b of t.buildings) {
                    if(b.name.includes("Building")){
                        this.allBuildings.push(b);
                    }
                }
            }
            console.log("buildings found: " + this.allBuildings.length);

            for (let i = 0; i < this.allBuildings.length; i++) {
                const b = this.allBuildings[i];
                const props = b.metadata as propertiesCharlotte;
                const ourMap: Map<string,string>=new Map<string,string>();          
                
                ourMap.set("Shape_Leng",props.Shape_Leng.toString());
                ourMap.set("Shape_Area",props.Shape_Area.toString());
                ourMap.set("Block_numb", props.Block_numb);
                ourMap.set("Drawing_nu", props.Drawing_nu);
                ourMap.set("Plot_numbe", props.Plot_numbe);
                ourMap.set("Land_type", props.Land_type);
                ourMap.set("Housing_co", props.Housing_co);
                ourMap.set("Additional", props.Additional ? props.Additional: "none");
                ourMap.set("Street", props.Street ? props.Street: "none");
                ourMap.set("Address", props.Address ? props.Address: "none");
                ourMap.set("Story", props.Story ? props.Story : "0");
                b.metadata=ourMap; //replace interface data with our new map!
            }

            var panel = new StackPanel();   
            panel.width = "200px";
            panel.height = 1.0;
            panel.isVertical = true;
            panel.background = "white";
            panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    
            this.advancedTexture.addControl(panel);

            const pgui=new PropertyGUI("Land_type", this);
            pgui.generateGUI(panel);
            this.propertyGUIs.push(pgui);

            /*const pgui1=new PropertyGUI("Housing_co", this);
            pgui1.generateGUI(panel);
            this.propertyGUIs.push(pgui1);

            const pgui2 = new PropertyGUI("Additional", this);
            pgui2.generateGUI(panel);
            this.propertyGUIs.push(pgui2);*/

            this.replaceSimpleBuildingsWithCustom().then(() => {
                console.log("setting up buildings to be clickable now");
                console.log("number of buildings: " + this.allBuildings.length);
                for (let i = 0; i < this.allBuildings.length; i++) {
                    const b = this.allBuildings[i];
                    this.setupClickableBuilding(b,i);
                }
            });
        });
        

        // Show the debug scene explorer and object inspector
        // You should comment this out when you build your final program 
        //this.scene.debugLayer.show();
    }

    // The main update loop will be executed once per frame before the scene is rendered
    // adjust fly speed based on height above ground
    private update(): void {
         const clampedY=Scalar.Clamp(this.camera.position.y,0.1,5);
        const percent=clampedY/5.0;
        const speed=0.02+percent*0.15;
        this.camera.speed=speed;       
    }

}
/******* End of the Game class ******/

// start the game
var game = new Game();
game.start();