// src/pages/Race.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Engine, Scene as SceneJSX } from "react-babylonjs";
import {
  Color4,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
  Axis,
  Space,
  Matrix,
  AbstractMesh,
  ActionManager,
  ExecuteCodeAction,
  Viewport,
  // Vector2,
} from "@babylonjs/core";
import {
  FreeCamera,
  FollowCamera,
  Camera
} from "@babylonjs/core/Cameras";        // ← import both cameras
import { MeshBuilder, LoadAssetContainerAsync } from "@babylonjs/core";
import {
  HavokPlugin,
  PhysicsAggregate,
  PhysicsShapeType,
} from "@babylonjs/core/Physics";
import HavokPhysics from "@babylonjs/havok";

import { Pylon } from "../components/Pylon";
import { createMapFromJson } from "../components/MapLoader";
import type { PylonDefinition } from "../components/MapLoader";
import { TextRenderer, FontAsset } from '@babylonjs/addons/msdfText';

import turboTechTakedownMap from "../assets/maps/turbo‑tech‑takedown.json";
import streetJusticeMap from "../assets/maps/street‑justice.json";
import deliveryDashMap from "../assets/maps/delivery‑dash.json";

const ROBOTO_JSON = 'https://assets.babylonjs.com/fonts/roboto-regular.json';
const ROBOTO_PNG  = 'https://assets.babylonjs.com/fonts/roboto-regular.png';

const STORYLINES = ["turbo‑tech‑takedown", "street‑justice", "delivery‑dash"] as const;
type RaceSlug = (typeof STORYLINES)[number];
const DEFAULT_RACE: RaceSlug = "turbo‑tech‑takedown";

const isMobileDevice = () =>
  /Mobi|Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

const Race: React.FC = () => {
  // map selection
  const [searchParams] = useSearchParams();
  const raw = (searchParams.get("race") ?? "").toLowerCase();
  const selectedRace: RaceSlug = STORYLINES.includes(raw as RaceSlug)
    ? (raw as RaceSlug)
    : DEFAULT_RACE;
  const mapJson =
    selectedRace === "street‑justice"
      ? streetJusticeMap
      : selectedRace === "delivery‑dash"
      ? deliveryDashMap
      : turboTechTakedownMap;

  // scene & physics
  const [scene, setScene] = useState<Scene | null>(null);
  const [physicsEnabled, setPhysicsEnabled] = useState(false);

  // car refs
  const carRootRef = useRef<TransformNode>(null!);
  // const colliderRef = useRef<AbstractMesh>(null!);
  const [colliderMesh, setColliderMesh] = useState<AbstractMesh | null>(null);
  const carBodyRef = useRef<PhysicsAggregate>(null!);
  const frontPivotsRef = useRef<TransformNode[]>([]);
  const wheelsRef = useRef<AbstractMesh[]>([]);

  // cameras
  // replace your old single camRef…
  const mainCamRef = useRef<FollowCamera | null>(null);
  const miniCamRef = useRef<FreeCamera | null>(null);

  // telemetry
  const speedTextRef = useRef<TextRenderer | null>(null);
  const [speedKmh, setSpeedKmh] = useState(0);


  // input state
  const inputMap = useRef<Record<string, boolean>>({});
  const [mobileInput, setMobileInput] = useState<Record<string, boolean>>({});
  const mobileInputRef = useRef(mobileInput);
  useEffect(() => {
    mobileInputRef.current = mobileInput;
  }, [mobileInput]);

  // steering & speed refs
  const speedRef = useRef(0);
  const steeringRef = useRef(0);

  // pylons & objectives
  const [pylons, setPylons] = useState<PylonDefinition[]>([]);
  const [objectives, setObjectives] = useState<string[]>([]);

  // scene init: physics + ground + starter cam
  const onSceneReady = useCallback(async (s: Scene) => {
    setScene(s);
    s.clearColor = new Color4(0.05, 0.05, 0.05, 1);

    // load MSDF font & make a TextRenderer
    const sdfDef = await (await fetch(ROBOTO_JSON)).text();
    const font      = new FontAsset(sdfDef, ROBOTO_PNG);
    const textRend  = await TextRenderer.CreateTextRendererAsync(font, s.getEngine());
    textRend.color = new Color4(1, 1, 1, 1);    // white

    speedTextRef.current = textRend;

    const havok = await HavokPhysics();
    s.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, havok));

    // ground collider
    const ground = s.getMeshByName("Ground");
    if (ground) {
      new PhysicsAggregate(
        ground,
        PhysicsShapeType.BOX,
        { mass: 0, friction: 0.8, restitution: 0.1 },
        s
      );
    }

    // starter FreeCamera so you see the world immediately
    const freeCam = new FreeCamera("freeCam", new Vector3(0, 10, -10), s);
    freeCam.setTarget(Vector3.Zero());
    freeCam.attachControl(true);
    freeCam.keysUp = [38];
    freeCam.keysDown = [40];
    freeCam.keysLeft = [37];
    freeCam.keysRight = [39];
    s.activeCamera = freeCam;

    // now build the minimap camera  
    const miniCam = new FreeCamera("miniCam", new Vector3(0, 50, 0), s);
    miniCam.setTarget(Vector3.Zero());
    miniCam.mode = Camera.ORTHOGRAPHIC_CAMERA;
    // size of the ortho window (tweak half to fit your map size)
    const half = 30;
    miniCam.orthoLeft   = -half;
    miniCam.orthoRight  =  half;
    miniCam.orthoTop    =  half;
    miniCam.orthoBottom = -half;
    // place it in bottom‑right corner
    miniCam.viewport = new Viewport(0.75, 0, 0.25, 0.25);
    miniCam.attachControl(false);

    // now render both
    s.activeCameras = [freeCam, miniCam];
    miniCamRef.current = miniCam;

    setPhysicsEnabled(true);
  }, []);

  // load map + pylons
  useEffect(() => {
    if (!scene || !physicsEnabled) return;
    const mats: Record<string, StandardMaterial> = {};
    ["concrete","wall","metal","building"].forEach((name) => {
      const mat = new StandardMaterial(name, scene);
      // set diffuseColor per name...
      mats[name] = mat;
    });
    const { pylons: loadedPylons, objectives: loadedObjectives } = createMapFromJson(scene, mapJson, mats, scene.getPhysicsEngine()!);
    setPylons(loadedPylons);
    setObjectives(loadedObjectives)

  }, [scene, physicsEnabled, mapJson]);

  // load car + physics + input
  useEffect(() => {
    if (!scene || !physicsEnabled) return;
    if (carRootRef.current) return;

    scene.actionManager ??= new ActionManager(scene);
    scene.actionManager.actions?.forEach((a) => scene.actionManager?.unregisterAction(a));
    scene.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnKeyDownTrigger, (evt) => {
        inputMap.current[evt.sourceEvent.key.toLowerCase()] = true;
      })
    );
    scene.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnKeyUpTrigger, (evt) => {
        inputMap.current[evt.sourceEvent.key.toLowerCase()] = false;
      })
    );

    LoadAssetContainerAsync("/vehicular-assault/assets/models/steerable_car4.glb", scene)
      .then((container) => {
        container.addAllToScene();
        const root = (container.rootNodes[0] ?? container.meshes[0]) as TransformNode;
        root.name = "carRoot";
        root.position.y += 1;
        carRootRef.current = root;

        // collider box
        const {min,max} = root.getHierarchyBoundingVectors(true);
        const size = max.subtract(min);
        const center = min.add(max).scale(0.5);
        const rootPos = root.getAbsolutePosition();
        const box = MeshBuilder.CreateBox("carCollider",{width:size.x,height:size.y,depth:size.z},scene);
        box.position = rootPos.add(center.subtract(rootPos));
        box.isVisible = false;
        setColliderMesh(box);
        carBodyRef.current = new PhysicsAggregate(box, PhysicsShapeType.BOX,
          { mass:100, friction:0.5, restitution:0.1 }, scene
        );

        // wheels & pivots
        const all = container.meshes as AbstractMesh[];
        wheelsRef.current = all.filter(m=>m.name.toLowerCase().includes("wheel"));
        const front = wheelsRef.current.filter(w=>w.position.z<0);
        frontPivotsRef.current = front.map(w => {
          const p = new TransformNode(`${w.name}_pivot`, scene);
          p.parent = root;
          p.position = w.position.clone();
          w.parent = p;
          w.position = Vector3.Zero();
          return p;
        });
      })
      .catch(console.error);
  }, [scene, physicsEnabled]);

  

  // drive & sync
  useEffect(() => {
    if (!scene) return;
    const obs = scene.onBeforeRenderObservable.add(() => {
      const root = carRootRef.current;
      const agg = carBodyRef.current;
      const col = colliderMesh;
      if (!root || !agg || !col) return;

      const dt = scene.getEngine().getDeltaTime()/1000;
      const input = { ...inputMap.current, ...mobileInputRef.current };

      // steering
      let steer = steeringRef.current;
      if (input.d) steer += dt;
      else if (input.a) steer -= dt;
      else steer *= 0.9;
      steer = Math.max(-1,Math.min(1,steer));
      steeringRef.current = steer;
      frontPivotsRef.current.forEach(p=>p.rotation.y = -steer*Math.PI/6);

      // speed
      let spd = speedRef.current;
      if (input.w) spd += 20*dt;
      else if (input.s) spd -= 20*dt;
      else spd *= 0.98;
      spd = Math.max(-10,Math.min(30,spd));
      speedRef.current = spd;

      // forward
      const mat = Matrix.FromQuaternionToRef(col.rotationQuaternion!, new Matrix());
      const forward = Vector3.TransformCoordinates(new Vector3(0,0,1), mat);

      const body = agg.body;
      body.setLinearVelocity(forward.scale(spd));
      body.setAngularVelocity(new Vector3(0,steer*spd*0.5,0));

      root.position.copyFrom(col.position);
      root.rotationQuaternion = col.rotationQuaternion!;
      wheelsRef.current.forEach(w=>w.rotate(Axis.X, spd*dt/2, Space.LOCAL));

      // now update & draw the speed label:
  const textR = speedTextRef.current;
  if (textR) {
    // get speed in km/h (assuming speedRef.current is m/s)
    const kmh = Math.round(speedRef.current * 3.6);

    // place it just above the minimap in world‐space
    // Here I pick a point out in front of the minimap camera,
    // e.g. at world coords (x, y, z) that correspond to the
    // lower right corner of your map.  Tweak these so the text
    // floats nicely above your circular minimap.
    // const worldPos = new Vector3(
    //   colliderMesh.position.x + 10,  // offset in X
    //   2,                                     // slight height above ground
    //   colliderMesh.position.z + 10   // offset in Z
    // );
    setSpeedKmh(kmh);

    // clear any previous content and add this paragraph:
    // textR.addParagraph(
    //   `${kmh} km/h`,
    //   {
    //     maxWidth:      200,
    //     lineHeight:    1,
    //     letterSpacing: 1,
    //     textAlign:     'center',
    //     translate:     new Vector2(0, 0),
    //   },
    //   // world matrix to position the label
    //   Matrix.Translation(worldPos.x, worldPos.y, worldPos.z)
    // );
    // textR.addParagraph(
    //       `${kmh} km/h`,
    //       {
    //         maxWidth:     1500,
    //         lineHeight:   1.2,
    //         letterSpacing:2,
    //         tabSize:      2,
    //         textAlign:    'center',
    //         translate:    new Vector2(0,  0),
    //       },
    //       // start close and centered
    //       Matrix.Translation(-10, 15, 10)
    //     )

    // render it using your main (follow) camera:
    const cam = scene.activeCamera!;
    textR.render(cam.getViewMatrix(), cam.getProjectionMatrix());
  }
    });
    return ()=>{scene.onBeforeRenderObservable.remove(obs);}
  },[scene, colliderMesh]);

  // **FollowCamera** locking onto the carCollider
  useEffect(() => {
    if (!scene || !colliderMesh) return;

    const followCam = new FollowCamera("FollowCam", new Vector3(0, 5, -10), scene);
    followCam.lockedTarget = colliderMesh;   // now lockedTarget is always a real mesh
    followCam.radius = 10;
    followCam.heightOffset = 5;
    followCam.rotationOffset = 180;
    followCam.cameraAcceleration = 0.1;
    followCam.maxCameraSpeed = 20;
    followCam.attachControl(true);
    
    // replace the freeCam with followCam, keep miniCam
    scene.activeCameras = [followCam, miniCamRef.current!];
    mainCamRef.current = followCam;

    return () => followCam.dispose();
  }, [scene, colliderMesh]);

  // keep minimap centered on the car collider
  useEffect(() => {
    if (!scene || !colliderMesh|| !miniCamRef.current) return;

    const obs = scene.onBeforeRenderObservable.add(() => {
      const carPos = colliderMesh.position;
      // lock the ortho cam over the car (keep Y constant)
      miniCamRef.current!.position.x = carPos.x;
      miniCamRef.current!.position.z = carPos.z;
      // ensure it’s looking straight down at the car
      miniCamRef.current!.setTarget(carPos);
    });

    return () => {scene.onBeforeRenderObservable.remove(obs);}
  }, [scene, physicsEnabled, colliderMesh]);

  return (
    <div style={{width:"100vw",height:"100vh",position:"relative"}}>
      <Link to="/" style={{position:"absolute",top:10,left:10,zIndex:999}}>Back</Link>
      {/* Top‑left objectives list */}
      {objectives.length > 0 && (
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          color: "white",
          fontFamily: "sans-serif",
          textShadow: "0 0 5px rgba(0,0,0,0.7)",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "20px" }}>OBJECTIVES</h2>
        <ul
          style={{
            margin: "4px 0 0 0",
            padding: 0,
            listStyle: "none",        // remove default bullets
            fontSize: "16px",
          }}
        >
          {objectives.map((obj, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              [&nbsp;&nbsp;] {obj}
            </li>
          ))}
        </ul>
      </div>
    )}
      <Engine antialias adaptToDeviceRatio canvasId="babylon-canvas">
        <SceneJSX onCreated={onSceneReady}>
          <hemisphericLight name="ambient" intensity={0.2} direction={Vector3.Up()} />
          {/* <directionalLight name="dir" intensity={0.2} direction={new Vector3(-1,-2,-1)} /> */}
          {physicsEnabled && pylons.map((p,i)=>(
            <Pylon key={i} position={p.position} targetRef={carRootRef} interval={p.interval} />
          ))}
        </SceneJSX>
      </Engine>
      {/* 
        Translucent black overlay
        Matches the 25% × 25% viewport of your minimap camera
      */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          right: 0,
          width: "25%",
          height: "25%",
          backgroundColor: "rgba(0,0,0,0)",
          border: "2px solid rgba(0,0,0,0.5)",  // subtle frame
          pointerEvents: "none",
          zIndex: 1,
        }}
      />
      {/* speed readout above minimap */}
      <div
        style={{
          position: "absolute",
          bottom: "26%",     // just above the 25%‐high minimap
          right: "8%",
          padding: "4px 8px",
          background: "rgba(0,0,0,0)",
          color: "white",
          fontFamily: "sans-serif",
          fontSize: "24px",
          borderRadius: "4px",
          pointerEvents: "none",
          zIndex: 2,
        }}
      >
        {speedKmh} km/h
      </div>
      {isMobileDevice() && (
        <div style={{position:"absolute",bottom:20,width:"100%",display:"flex",justifyContent:"center",gap:10}}>
          {["w","s","a","d"].map(k=>(
            <button key={k} onTouchStart={()=>setMobileInput(mi=>({...mi,[k]:true}))} onTouchEnd={()=>setMobileInput(mi=>({...mi,[k]:false}))}>
              {k.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default Race;
