// src/pages/Race.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
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
  GlowLayer,
  Mesh,
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
import type { MapData, PylonDefinition } from "../components/MapLoader";
import { TextRenderer, FontAsset } from '@babylonjs/addons/msdfText';
import { PointerEventTypes } from "@babylonjs/core";
import { Scalar } from "@babylonjs/core/Maths/math.scalar";

import turboTechTakedownMap from "../assets/maps/turbo-tech-takedown.json";
import streetJusticeMap from "../assets/maps/street-justice.json";
import deliveryDashMap from "../assets/maps/delivery-dash.json";

const ROBOTO_JSON = 'https://assets.babylonjs.com/fonts/roboto-regular.json';
const ROBOTO_PNG  = 'https://assets.babylonjs.com/fonts/roboto-regular.png';

const MUSIC_URL = "/vehicular-assault/assets/sounds/joyride_melodies.mp3";
const START_URL = "/vehicular-assault/assets/sounds/car_start_sound.mp3";

const STORYLINES = ["turbo-tech-takedown", "street-justice", "delivery-dash"] as const;
type RaceSlug = (typeof STORYLINES)[number];
const DEFAULT_RACE: RaceSlug = "turbo-tech-takedown";
const STORAGE_KEY = 'vehicularAssaultSave';
const DEFAULT_RADIUS = 10;
const DEFAULT_HEIGHT_OFFSET = 5;
const DEFAULT_ROTATION_OFFSET = 0;
const AUTO_RETURN_DELAY = 3000;


const isMobileDevice = () =>
  /Mobi|Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

interface Checkpoint {
  id:   string;
  pos:  Vector3;
  name: string;
  desc: string;
  visited: boolean;
}

interface SaveData {
  mapSlug:      RaceSlug;
  timeLeft?:     number;   // “clock” remaining
  timeElapsed?:  number;   // how many seconds since the start

  car: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
    velocity: { x: number; y: number; z: number };
  };

  playerHP:      number;
  checkpoints:   Array<{ id: string; visited: boolean }>;
  secretVisited: boolean;
}


function fireThroughReticle(
  scene: Scene,
  carRoot: TransformNode,
  reticle: TransformNode
) {
  // 1) Compute “nose” point on the car:
  //    take the car’s forward vector and push out a bit so the shot
  //    originates just in front of the bumper
  const carPos   = carRoot.getAbsolutePosition();
  const forward  = carRoot.getDirection(Vector3.Forward());
  const origin   = carPos.add(forward.scale(2));  // 2 units ahead

  // 2) Compute aim direction so that you still go through the reticle:
  const targetPos  = reticle.getAbsolutePosition();
  const dirToRet = targetPos.subtract(origin).normalize();

  // 3) Fire two offset projectiles (like your spread)
  const offsets = [
    carRoot.getDirection(Vector3.Right()).scale(-0.1),
    carRoot.getDirection(Vector3.Right()).scale( 0.1),
  ];

  offsets.forEach((off, i) => {
    const sphere = MeshBuilder.CreateSphere(`proj${i}`, { diameter: 0.1 }, scene);
    sphere.position.copyFrom(origin.add(off));

    const projMat = new StandardMaterial(`projMat${i}`, scene);
    projMat.emissiveColor = new Color3(1, 0, 0);
    sphere.material = projMat;

    // tag with damage if you like
    sphere.metadata = { strength: 25 };

    const agg = new PhysicsAggregate(
      sphere,
      PhysicsShapeType.SPHERE,
      { mass: 1, friction: 0.2, restitution: 0.5 },
      scene
    );

    // 4) Send it flying *through* the reticle point
    agg.body.setLinearVelocity(dirToRet.scale(60));

    // clean up
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
  const rawParam = (searchParams.get("race") ?? "").toLowerCase() as RaceSlug;
const jsonSrc =
  rawParam === "street-justice"    ? streetJusticeMap :
  rawParam === "delivery-dash"     ? deliveryDashMap :
                                     turboTechTakedownMap;

// now TS knows what lives in mapJson
const mapJson = jsonSrc as MapData;

  // start
  const [started, setStarted]    = useState(false);

  // scene & physics
  const [scene, setScene] = useState<Scene | null>(null);
  const [physicsEnabled, setPhysicsEnabled] = useState(false);
  const [havokPlugin, setHavokPlugin] = useState<HavokPlugin | null>(null);

  // car refs
  const carRootRef = useRef<TransformNode>(null!);
  // const colliderRef = useRef<AbstractMesh>(null!);
  const [colliderMesh, setColliderMesh] = useState<AbstractMesh | null>(null);
  const carBodyRef = useRef<PhysicsAggregate>(null!);
  const frontPivotsRef = useRef<TransformNode[]>([]);
  const wheelsRef = useRef<AbstractMesh[]>([]);

  // game state
  const [isPaused, setIsPaused] = useState(false);

  // player
  const [playerHP,    setPlayerHP]    = useState(100);
  const [playerMaxHP] = useState(100);
  const [isDead,      setIsDead]      = useState(false);
  const [isWon,  setIsWon]    = useState(false);

  // HUD
  const reticleRef = useRef<TransformNode | null>(null);

  // cameras
  // replace your old single camRef…
  const mainCamRef = useRef<FollowCamera | null>(null);
  const miniCamRef = useRef<FreeCamera | null>(null);
  const isUserInteractingRef = useRef(false);
  const lastInteractionTimeRef = useRef<number>(0);
  // const resumeTimeoutRef      = useRef<number | null>(null);  

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
  // ─── hold the static objectives from the map JSON ───
  const [mapObjectives, setMapObjectives] = useState<string[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [secretCrate, setSecretCrate] = useState<Checkpoint| null>(null);
  const checkpointMarkersRef = useRef<Mesh[]>([]);
  const checkpointDiscsRef   = useRef<Mesh[]>([]);
  const timeLimit = mapJson.timeLimit ?? 0;
  const [timeLeft, setTimeLeft]     = useState<number>(timeLimit);

  const [spawnPosition, setSpawnPosition] = useState<Vector3 | null>(null);

  const navigate = useNavigate();
  // === handle the “Start” button click ===
  const handleStart = () => {
    // if we’re restarting after death, restore HP
    if (carRootRef.current?.metadata) {
      carRootRef.current.metadata.hitpoints = playerMaxHP;
      setPlayerHP(playerMaxHP);
    }
    setIsDead(false);

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

  useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && started) {
          setIsPaused(p => !p);
        }
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, [started]);

    const handleSave = (): void => {
  if (!carRootRef.current || !carBodyRef.current) {
    alert("Game not ready to save");
    return;
  }

  const pos = carRootRef.current.getAbsolutePosition();
  const rot = carRootRef.current.rotationQuaternion!;
  const vel = carBodyRef.current.body.getLinearVelocity();

  const state: SaveData = {
    mapSlug:     selectedRace,
    timeLeft,    
    timeElapsed: timeLimit - timeLeft,

    car: {
      position: { x: pos.x, y: pos.y, z: pos.z },
      rotation: { x: rot.x, y: rot.y, z: rot.z, w: rot.w },
      velocity: { x: vel.x, y: vel.y, z: vel.z },
    },

    playerHP,
    checkpoints:   checkpoints.map(cp => ({ id: cp.id, visited: cp.visited })),
    secretVisited: secretCrate?.visited ?? false,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  alert("Game saved");
};


  // 3) Load and reconstruct types
  const handleLoad = (): void => {
  const json = localStorage.getItem(STORAGE_KEY);
  if (!json) { alert("No save found"); return; }

  let state: SaveData;
  try {
    state = JSON.parse(json) as SaveData;
  } catch {
    alert("Save data corrupted");
    return;
  }

  // sanity check: same map?
  if (state.mapSlug !== selectedRace) {
    console.warn("Save is for a different map, ignoring mapSlug");
  }

  // restore timer
  setTimeLeft(state.timeLeft ?? timeLimit);

  // restore car transform & physics
  carRootRef.current.position.set(
    state.car.position.x,
    state.car.position.y,
    state.car.position.z
  );
  carRootRef.current.rotationQuaternion!.copyFromFloats(
    state.car.rotation.x,
    state.car.rotation.y,
    state.car.rotation.z,
    state.car.rotation.w
  );
  carBodyRef.current.body.setLinearVelocity(
    new Vector3(
      state.car.velocity.x,
      state.car.velocity.y,
      state.car.velocity.z
    )
  );

  // restore HP
  setPlayerHP(state.playerHP);
  if (carRootRef.current.metadata) {
    carRootRef.current.metadata.hitpoints = state.playerHP;
  }

  // restore checkpoints & secret crate
  setCheckpoints(prev =>
    prev.map(cp => ({
      ...cp,
      visited: state.checkpoints.some(s => s.id === cp.id && s.visited),
    }))
  );
  if (secretCrate) {
    setSecretCrate(prev =>
      prev ? { ...prev, visited: state.secretVisited } : prev
    );
  }

  alert("Game loaded");
};


  useEffect(() => {
  if (!scene) return;
  const obs = scene.onBeforeRenderObservable.add(() => {
    const cam = mainCamRef.current;
    if (!cam || isUserInteractingRef.current) return;

    // has the grace period passed?
    const now = performance.now();
    if (now - lastInteractionTimeRef.current < AUTO_RETURN_DELAY) {
      return; // still giving the user time to look around
    }

    // delta-time in seconds
    const dt = scene.getEngine().getDeltaTime() / 1000;
    // return speed factor (e.g. 2 → ~0.5s to return)
    const t = Scalar.Clamp(dt * 2, 0, 1);

    cam.radius         = Scalar.Lerp(cam.radius,         DEFAULT_RADIUS,         t);
    cam.heightOffset   = Scalar.Lerp(cam.heightOffset,   DEFAULT_HEIGHT_OFFSET,  t);
    cam.rotationOffset = Scalar.Lerp(cam.rotationOffset, DEFAULT_ROTATION_OFFSET, t);
  });

  return () => {
    scene.onBeforeRenderObservable.remove(obs);
  };
}, [scene]);



  // scene init: physics + ground + starter cam
  const onSceneReady = useCallback(async (s: Scene) => {
    setScene(s);
    s.clearColor = new Color4(0.05, 0.05, 0.05, 1);

    // load MSDF font & make a TextRenderer
    const sdfDef = await (await fetch(ROBOTO_JSON)).text();
    const font      = new FontAsset(sdfDef, ROBOTO_PNG);
    const textRend  = await TextRenderer.CreateTextRendererAsync(font, s.getEngine());
    textRend.color = new Color4(1, 1, 1, 1);    // white

    // add a glow layer for emissive meshes (pylons, projectiles, etc.)
    const glow = new GlowLayer('globalGlow', s);
    glow.intensity = 0.6;

    speedTextRef.current = textRend;

    const havok = await HavokPhysics();
    const hk = new HavokPlugin(true, havok);
    setHavokPlugin(hk);
    s.enablePhysics(new Vector3(0, -9.81, 0), hk);

    // Listen for *all* Havok collisions
    hk.onCollisionObservable.add((collision) => {
      // collision.collider is the body that moved,
      // collision.collidee is the body it hit
      
      const a = collision.collider.transformNode;
      const b = collision.collidedAgainst.transformNode
      console.log(`Collision: ${a?.name} ↔ ${b?.name}`);
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

  useEffect(() => {
  // only start/stop on status changes or a new limit
  if (!started || isPaused || timeLimit <= 0) return;

  // set up a single interval
  const id = window.setInterval(() => {
    setTimeLeft(prev => {
      if (prev <= 1) {
        // last tick: clear interval and end the race
        clearInterval(id);
        setStarted(false);
        setIsDead(true);
        return 0;
      }
      return prev - 1;
    });
  }, 1000);

  // clean up when you pause or finish
  return () => clearInterval(id);
}, [started, isPaused, timeLimit]);

  // load map + pylons
  useEffect(() => {
  if (!scene || !physicsEnabled) return;

  // 1) Prepare your materials
  const mats: Record<string, StandardMaterial> = {};

  const concreteMat = new StandardMaterial("concreteMat", scene);
  concreteMat.diffuseColor  = new Color3(0.6, 0.6, 0.6);
  mats["concrete"] = concreteMat;

  const wallMat = new StandardMaterial("wallMat", scene);
  wallMat.diffuseColor  = new Color3(0.9, 0.2, 0.2);
  mats["wall"] = wallMat;

  const metalMat = new StandardMaterial("metalMat", scene);
  metalMat.diffuseColor  = new Color3(0.2, 0.2, 0.8);
  mats["metal"] = metalMat;

  const buildingMat = new StandardMaterial("buildingMat", scene);
  buildingMat.diffuseColor  = new Color3(0.2, 0.8, 0.2);
  mats["building"] = buildingMat;

  // 2) Load everything from JSON
  const {
    timeLimit: tl,
    spawnPosition: sp,
    pylons: loadedPylons,
    objectives: staticObjectives,
    checkpoints: cpDefs,
    secretCrate: scDef
  } = createMapFromJson(
    scene,
    mapJson,
    mats,
    scene.getPhysicsEngine()!
  );

  setSpawnPosition(sp);
  setTimeLeft(tl);

  // Clear any old markers
  checkpointMarkersRef.current.forEach(m => m.dispose());
  checkpointDiscsRef.current.forEach(d => d.dispose());
  checkpointMarkersRef.current = [];
  checkpointDiscsRef.current   = [];

  // For each checkpoint, build a little ring on the ground
  cpDefs.forEach(cp => {
    // a flat torus (ring) 3 units across, 0.2 thick
    const ring = MeshBuilder.CreateTorus(
      `chk-marker-${cp.id}`,
      { diameter: 3, thickness: 0.2, tessellation: 32 },
      scene
    );
    // lift it just above ground
    ring.position = cp.position.add(new Vector3(0, 0.1, 0));
    // lie it flat
    ring.rotation.x = Math.PI / 2;

    // give it a bright emissive material
    const mat = new StandardMaterial(`chkMat-${cp.id}`, scene);
    mat.emissiveColor = new Color3(1, 0.8, 0);  // golden
    ring.material = mat;

    checkpointMarkersRef.current.push(ring);
    const discMat = new StandardMaterial(`chkDiscMat-${cp.id}`, scene);
    discMat.emissiveColor = new Color3(0, 0.8, 0); // same golden

    const disc = MeshBuilder.CreateCylinder(
      `chk-disc-${cp.id}`,
      { diameter: 5, height: 0.1, tessellation: 32 },
      scene
    );
    disc.position    = cp.position.clone();
    disc.material    = discMat;
    disc.rotation.x  = 0; //Math.PI / 2;   // lay flat
    checkpointDiscsRef.current.push(disc);
  });
  // save them for later tick‑off logic
  setMapObjectives(staticObjectives);

  // 3) Initialize checkpoint & secret‐crate visited flags
  setCheckpoints(
    cpDefs.map(cp => ({
      id:      cp.id,
      name:    cp.name,
      desc:    cp.description,  // map into your `desc`
      pos:     cp.position,     // map into your `pos`
      visited: false
    }))
  );

  // likewise, for secretCrate, if your SecretCrate state type is:
  // interface SecretCrate extends Checkpoint { }
  // you’d do:
  setSecretCrate(scDef ? {
    id:      scDef.id,
    name:    scDef.name,
    desc:    scDef.description,
    pos:     scDef.position,
    visited: false
  } : null);

  // 4) Build initial objectives array:
  //    - static map objectives (“Destroy AI pylons”, etc.)
  //    - one entry per checkpoint (“Drive to Checkpoint 1”, etc.)
  //    - one entry for the secret crate
  const initialObjectives = [
    ...staticObjectives,
    ...cpDefs.map(cp => cp.description || cp.name),
    scDef ? scDef.description || scDef.name : null
  ].filter(Boolean) as string[];

  setObjectives(initialObjectives);
  setPylons(loadedPylons);

  return () => {
    checkpointMarkersRef.current.forEach(r => r.dispose());
    checkpointMarkersRef.current = [];
  };

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
        
        if (spawnPosition) {
          root.position.copyFrom(spawnPosition);
        } else {
          root.position.y += 1;
        }

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
        const front = wheelsRef.current.filter(w=>w.position.z>0);
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
        reticle.position = new Vector3(0, 0.5, 6);  // tweak Y (height) & Z (forward offset)
        // ** Rotate 90° about X so the ring faces you head‑on **
        reticle.rotation.x = -Math.PI / 2;  // lift the ring to face the camera

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

        const flicker = scene.onBeforeRenderObservable.add(() => {
          checkpointDiscsRef.current.forEach((disc, i) => {
            const t = performance.now() * 0.005 + i;
            const s = 1 + 0.2 * Math.sin(t);
            disc.scaling.x = disc.scaling.z = s;
          });
        });

        return () => {
          // remove the flicker when the map unloads
          scene.onBeforeRenderObservable.remove(flicker);
          // dispose old markers & discs
          checkpointMarkersRef.current.forEach(m => m.dispose());
          checkpointDiscsRef.current.forEach(d => d.dispose());
          checkpointMarkersRef.current = [];
          checkpointDiscsRef.current   = [];
        };
        
      })
      .catch(console.error);
  }, [scene, physicsEnabled, spawnPosition]);

  

  // drive & sync
  useEffect(() => {
    if (!scene) return;
    const obs = scene.onBeforeRenderObservable.add(() => {
      if (!started || isPaused) return; // skip if paused

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
      const forward = Vector3.TransformCoordinates(new Vector3(0,0,-1), mat);

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

      // Objectives
      // 1) Get the car’s world position
      const carPos = carRootRef.current!.getAbsolutePosition();

      // 2) Check each checkpoint
      setCheckpoints(prev =>
        prev.map(cp => {
          if (!cp.visited && cp.pos.subtract(carPos).length() < 5) {
            // mark visited when within 5 units
            return { ...cp, visited: true };
          }
          return cp;
        })
      );

      // 3) Check the secret crate
      if (
        secretCrate &&
        !secretCrate.visited &&
        secretCrate.pos.subtract(carPos).length() < 5
      ) {
        setSecretCrate({ ...secretCrate, visited: true });
      }

    });
    return ()=>{scene.onBeforeRenderObservable.remove(obs);}
  },[scene, colliderMesh, secretCrate, isPaused, started]);

  useEffect(() => {
    const newObjs = [
      ...mapObjectives,                            // map’s built‑in goals
      ...checkpoints.map(cp => cp.visited
        ? `✓ ${cp.name}`
        : cp.desc
      ),
      secretCrate
        ? (secretCrate.visited
          ? `✓ ${secretCrate.name}`
          : secretCrate.desc
          )
        : null
    ].filter(Boolean) as string[];
    setObjectives(newObjs);
  }, [checkpoints, secretCrate, mapObjectives]);

  useEffect(() => {
    if (!started) return;                      // only win if the race is running
    // if every objective string begins with “✓ ”
    const allDone = objectives.length > 0
                && objectives.every(o => o.startsWith('✓ '));
    if (allDone) {
      setIsWon(true);
      setStarted(false);                       // stop the race (unpings pylons, input, etc.)
    }
  }, [objectives, started]);

  useEffect(() => {
  const newObjs = [
    ...mapObjectives,
    ...checkpoints.map(cp =>
      cp.visited ? `✓ ${cp.name}` : cp.desc
    ),
    secretCrate
      ? (secretCrate.visited 
          ? `✓ ${secretCrate.name}` 
          : secretCrate.desc)
      : null
  ].filter(Boolean) as string[];
  setObjectives(newObjs);
}, [mapObjectives, checkpoints, secretCrate]);

  // **FollowCamera** locking onto the carCollider
  useEffect(() => {
  if (!scene || !colliderMesh) return;

  const cam = new FollowCamera(
    "FollowCam",
    new Vector3(0, DEFAULT_HEIGHT_OFFSET, -DEFAULT_RADIUS),
    scene
  );
  cam.lockedTarget       = colliderMesh;
  cam.radius             = DEFAULT_RADIUS;
  cam.heightOffset       = DEFAULT_HEIGHT_OFFSET;
  cam.rotationOffset     = DEFAULT_ROTATION_OFFSET;
  cam.cameraAcceleration = 0.1;
  cam.maxCameraSpeed     = 20;
  cam.attachControl(true);

  scene.activeCameras = [cam, miniCamRef.current!];
  mainCamRef.current  = cam;

  const pointerObserver = scene.onPointerObservable.add(pi => {
  if (pi.type === PointerEventTypes.POINTERDOWN) {
    isUserInteractingRef.current = true;
  } else if (pi.type === PointerEventTypes.POINTERUP) {
    isUserInteractingRef.current = false;
    // mark the moment interaction ceased
    lastInteractionTimeRef.current = performance.now();
  }
});

  return () => {
    scene.onPointerObservable.remove(pointerObserver);
    cam.dispose();
  };
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

  useEffect(() => {
    if (started && playerHP <= 0) {
      setStarted(false);   // unmount pylons, stop damage
      setIsDead(true);     // show “You died” overlay
    }
  }, [playerHP, started]);

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
      {timeLimit > 0 && (
        <div
          style={{
            position:    'absolute',
            top:         10,
            right:       140,        // shift it over from the health bar
            padding:     '4px 8px',
            background:  'rgba(0,0,0,0.6)',
            color:       'white',
            fontFamily:  'sans-serif',
            fontSize:    '18px',
            borderRadius:'4px',
            zIndex:      999,
            whiteSpace:  'nowrap',
          }}
        >
          ⏱ {timeLeft}s
        </div>
      )}

      <Link to="/" style={{position:"absolute",top:10,right:10,zIndex:999}}>Back</Link>
      {isPaused && (
          <div
            style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.7)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 50,
              color: 'white',
              fontFamily: 'sans-serif',
            }}
          >
            <h1>Paused</h1>
            <button onClick={() => setIsPaused(false)} style={{ margin: '0.5em', padding: '1em 2em' }}>
              Resume
            </button>
            <button onClick={handleSave} style={{ margin: '0.5em', padding: '1em 2em' }}>
              Save Game
            </button>
            <button onClick={handleLoad} style={{ margin: '0.5em', padding: '1em 2em' }}>
              Load Game
            </button>
          </div>
        )}

       {/* START OVERLAY */}
      {!started && !isDead && !isWon && (
        <div
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.7)",
            zIndex: 20,
            color: "white",
            fontFamily: "sans-serif",
          }}
        >
          <h1>Vehicular Assault</h1>
          <p style={{ maxWidth: 400, textAlign: "center", marginBottom: "1rem" }}>
            <strong>Controls:</strong><br/>
            W / S: Accelerate / Brake<br/>
            A / D: Steer Left / Right<br/>
            Right-Click: Fire Projectile<br/>
            <strong>Esc:</strong> Pause / Resume
          </p>
          <p>
              Left click on the canvas to enable controls
            </p>
          <button
            onClick={handleStart}
            style={{
              padding: "1rem 2rem",
              fontSize: "1.5rem",
              cursor: "pointer",
            }}
          >
            Start Race
          </button>
        </div>
      )}
      {isDead && (
        <div
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.8)',
            color: 'white',
            fontFamily: 'sans-serif',
            zIndex: 20,
          }}
        >
          <h1>You died</h1>
          <button
            onClick={() => navigate('/')}
            style={{
              padding: '1rem 2rem',
              fontSize: '1.5rem',
              cursor: 'pointer',
            }}
          >
            Back to Main
          </button>
        </div>
      )}
      {/* — Victory overlay — */}
      {isWon && (
        <div
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.8)',
            color: 'white',
            fontFamily: 'sans-serif',
            zIndex: 20,
          }}
        >
          <h1>You Won!</h1>
          <button
            onClick={() => navigate('/')}
            style={{
              padding: '1rem 2rem',
              fontSize: '1.5rem',
              cursor: 'pointer',
            }}
          >
            Back to Main
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
      {objectives.map((obj, i) => {
        const done = obj.startsWith("✓ ");
        // the text after the checkmark (or full string if not done)
        const label = done ? obj.slice(2) : obj;
        return (
          <li key={i} style={{ marginBottom: 4, display: "flex", alignItems: "center" }}>
            <span
              style={{
                display:        "inline-block",
                width:          16,
                textAlign:      "center",
                marginRight:    6,
                color:          done ? "limegreen" : "#888",
                fontWeight:     "bold",
              }}
            >
              {done ? "✔" : "○"}
            </span>
            <span>{label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Engine antialias adaptToDeviceRatio canvasId="babylon-canvas">
        <SceneJSX onCreated={onSceneReady} onPointerObservable={(pi: PointerInfo) => {
      if (pi.type === PointerEventTypes.POINTERDOWN) {
        const evt = pi.event as PointerEvent;
        if (evt.button === 2 && reticleRef.current && scene) {
          evt.preventDefault();
          fireThroughReticle(scene, carRootRef.current, reticleRef.current);
        }
      }
    }}>
          <hemisphericLight name="ambient" intensity={0.2} direction={Vector3.Up()} />
          {/* <directionalLight name="dir" intensity={0.2} direction={new Vector3(-1,-2,-1)} /> */}
          {physicsEnabled && started && carRootRef.current && pylons.map((p,i)=>(
            <Pylon key={i} position={p.position} targetRef={carRootRef} interval={p.interval} havokPlugin={havokPlugin!} />
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
