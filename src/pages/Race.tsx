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
  Color3,
  PointerInfo,
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
import { PointerEventTypes } from "@babylonjs/core";

import turboTechTakedownMap from "../assets/maps/turbo‑tech‑takedown.json";
import streetJusticeMap from "../assets/maps/street‑justice.json";
import deliveryDashMap from "../assets/maps/delivery‑dash.json";

const ROBOTO_JSON = 'https://assets.babylonjs.com/fonts/roboto-regular.json';
const ROBOTO_PNG  = 'https://assets.babylonjs.com/fonts/roboto-regular.png';

const MUSIC_URL = "/vehicular-assault/assets/sounds/joyride_melodies.mp3";
const START_URL = "/vehicular-assault/assets/sounds/car_start_sound.mp3";

const STORYLINES = ["turbo‑tech‑takedown", "street‑justice", "delivery‑dash"] as const;
type RaceSlug = (typeof STORYLINES)[number];
const DEFAULT_RACE: RaceSlug = "turbo‑tech‑takedown";

const isMobileDevice = () =>
  /Mobi|Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

function fireThroughReticle(scene: Scene, reticle: TransformNode) {
  const origin  = reticle.getAbsolutePosition();
  const forward = reticle.getDirection(Vector3.Forward());
  const offs    = [
    reticle.getDirection(Vector3.Right()).scale(-0.1),
    reticle.getDirection(Vector3.Right()).scale( 0.1),
  ];

  offs.forEach((offset, i) => {
    const sphere = MeshBuilder.CreateSphere(`proj${i}`, { diameter: 0.1 }, scene);
    sphere.position.copyFrom(origin.add(offset));

    // attach Havok‐powered physics
    const agg = new PhysicsAggregate(
      sphere,
      PhysicsShapeType.SPHERE,
      { mass: 1, friction: 0.2, restitution: 0.5 },
      scene
    );

    // shoot it
    agg.body.setLinearVelocity(forward.scale(60));

    // auto‑remove mesh after a few seconds
    setTimeout(() => sphere.dispose(), 4000);
  });
}


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

  // start
  const [started, setStarted]    = useState(false);

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

  // player
  const [playerHP,    setPlayerHP]    = useState(100);
  const [playerMaxHP] = useState(100);

  // HUD
  const reticleRef = useRef<TransformNode | null>(null);

  // cameras
  // replace your old single camRef…
  const mainCamRef = useRef<FollowCamera | null>(null);
  const miniCamRef = useRef<FreeCamera | null>(null);

  // telemetry
  const speedTextRef = useRef<TextRenderer | null>(null);
  const [speedKmh, setSpeedKmh] = useState(0);

  // music
  const musicRef                  = useRef<HTMLAudioElement | null>(null);
  const startSfxRef               = useRef<HTMLAudioElement | null>(null);

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


  // === handle the “Start” button click ===
  const handleStart = () => {
    // 1) Ensure we have a start‐SFX audio element
    if (!startSfxRef.current) {
      startSfxRef.current = new Audio(START_URL);
    }
    const sfx = startSfxRef.current;
    
    // 2) Define how to start the music once SFX ends
    const startMusic = () => {
      // create/lookup music element
      if (!musicRef.current) {
        const m = new Audio(MUSIC_URL);
        m.loop = true;
        m.volume = 0.5;
        musicRef.current = m;
      }
      musicRef.current.play();
      sfx.removeEventListener("ended", startMusic);
    };

    // 3) Wire the ended event
    sfx.addEventListener("ended", startMusic);

    // 4) Play the start SFX
    sfx.play();

    // 5) Flip the "started" flag so the scene shows
    setStarted(true);
  };


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
    const hk = new HavokPlugin(true, havok);
    s.enablePhysics(new Vector3(0, -9.81, 0), hk);

    // Listen for *all* Havok collisions
    hk.onCollisionObservable.add((collision) => {
      // collision.collider is the body that moved,
      // collision.collidee is the body it hit
      
      const a = collision.collider.transformNode;
      const b = collision.collidedAgainst.transformNode
      console.log(`💥 Collision: ${a?.name} ↔ ${b?.name}`);
    });

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
        // === initialize hitpoints on the player/car ===
        root.metadata = {
          hitpoints:    100,   // starting HP
          maxHitpoints: 100,   // for any UI bars or regen logic
        };
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

                // 1) Create a small reticle group parented to the car root:
        const reticle = new TransformNode("reticleRoot", scene);
        reticle.parent   = root;         // follow the car’s position & rotation
        reticle.position = new Vector3(0, 0.5, -6);  // tweak Y (height) & Z (forward offset)
        // ** Rotate 90° about X so the ring faces you head‑on **
        reticle.rotation.x = Math.PI / 2;  // lift the ring to face the camera

        // 2) A simple thin ring (circle) for the outer part
        const ringMat = new StandardMaterial("ringMat", scene);
        ringMat.emissiveColor = new Color3(1, 1, 1);
        const ring = MeshBuilder.CreateTorus(
          "reticleRing",
          { diameter: 2, thickness: 0.05, tessellation: 64 },
          scene
        );
        ring.material = ringMat;
        ring.parent   = reticle;

        // 3) Two thin lines (crosshair) along X and Y
        const lineMat = new StandardMaterial("lineMat", scene);
        lineMat.emissiveColor = new Color3(1, 1, 1);

        // vertical line
        const vLine = MeshBuilder.CreateBox(
          "reticleV",
          { width: 0.01, height: 0.3, depth: 0.01 },
          scene
        );
        vLine.material = lineMat;
        vLine.parent   = reticle;

        // horizontal line
        const hLine = MeshBuilder.CreateBox(
          "reticleH",
          { width: 0.3, height: 0.01, depth: 0.01 },
          scene
        );
        hLine.material = lineMat;
        hLine.parent   = reticle;
        reticleRef.current = reticle;

        
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

      if (root.metadata && typeof root.metadata.hitpoints === 'number') {
        setPlayerHP(root.metadata.hitpoints);
      }

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
      <div
        style={{
          position:    'absolute',
          top:         10,
          left:        '50%',
          transform:   'translateX(-50%)',
          width:       200,
          height:      16,
          background:  '#444',
          border:      '1px solid #222',
          borderRadius:'4px',
          overflow:    'hidden',
          zIndex:      999,
        }}
      >
        <div
          style={{
            width:       `${(playerHP / playerMaxHP) * 100}%`,
            height:      '100%',
            background:  'limegreen',
            transition:  'width 0.1s ease-out',
          }}
        />
      </div>
      <Link to="/" style={{position:"absolute",top:10,right:10,zIndex:999}}>Back</Link>
       {/* START OVERLAY */}
      {!started && (
        <div
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.7)",
            zIndex: 20,
          }}
        >
          <button
            onClick={handleStart}
            style={{
              padding: "1rem 2rem",
              fontSize: "1.5rem",
              cursor: "pointer",
            }}
          >
            Start
          </button>
        </div>
      )}
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
              [&nbsp;&nbsp;]&nbsp;{obj}
            </li>
          ))}
        </ul>
      </div>
    )}
      <Engine antialias adaptToDeviceRatio canvasId="babylon-canvas">
        <SceneJSX onCreated={onSceneReady} onPointerObservable={(pi: PointerInfo) => {
      if (pi.type === PointerEventTypes.POINTERDOWN) {
        const evt = pi.event as PointerEvent;
        if (evt.button === 2 && reticleRef.current && scene) {
          evt.preventDefault();
          fireThroughReticle(scene, reticleRef.current);
        }
      }
    }}>
          <hemisphericLight name="ambient" intensity={0.2} direction={Vector3.Up()} />
          {/* <directionalLight name="dir" intensity={0.2} direction={new Vector3(-1,-2,-1)} /> */}
          {physicsEnabled && carRootRef.current && pylons.map((p,i)=>(
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
