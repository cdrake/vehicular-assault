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
} from "@babylonjs/core";
import {
  FreeCamera,
  FollowCamera,
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

import turboTechTakedownMap from "../assets/maps/turbo‑tech‑takedown.json";
import streetJusticeMap from "../assets/maps/street‑justice.json";
import deliveryDashMap from "../assets/maps/delivery‑dash.json";

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

  // pylons
  const [pylons, setPylons] = useState<PylonDefinition[]>([]);

  // scene init: physics + ground + starter cam
  const onSceneReady = useCallback(async (s: Scene) => {
    setScene(s);
    s.clearColor = new Color4(0.05, 0.05, 0.05, 1);

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
    const defs = createMapFromJson(scene, mapJson, mats, scene.getPhysicsEngine()!);
    setPylons(defs);
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
    scene.activeCamera = followCam;

    return () => followCam.dispose();
  }, [scene, colliderMesh]);

  return (
    <div style={{width:"100vw",height:"100vh",position:"relative"}}>
      <Link to="/" style={{position:"absolute",top:10,left:10,zIndex:999}}>Back</Link>
      <Engine antialias adaptToDeviceRatio canvasId="babylon-canvas">
        <SceneJSX onCreated={onSceneReady}>
          <hemisphericLight name="ambient" intensity={0.3} direction={Vector3.Up()} />
          <directionalLight name="dir" intensity={0.7} direction={new Vector3(-1,-2,-1)} />
          {physicsEnabled && pylons.map((p,i)=>(
            <Pylon key={i} position={p.position} targetRef={carRootRef} interval={p.interval} />
          ))}
        </SceneJSX>
      </Engine>

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
