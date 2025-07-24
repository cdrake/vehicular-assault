// src/pages/Race.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Engine, Scene as SceneJSX } from "react-babylonjs";
import {
  ArcRotateCamera,
  Color3,
  Color4,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { HavokPlugin, PhysicsAggregate, PhysicsShapeType } from "@babylonjs/core/Physics";
import HavokPhysics from "@babylonjs/havok";

import PlayerCar from "../components/PlayerCar";
import { Pylon } from "../components/Pylon";
import { createMapFromJson } from "../components/MapLoader";
import type { PylonDefinition } from "../components/MapLoader";

import turboTechTakedownMap from "../assets/maps/turbo‑tech‑takedown.json";
import streetJusticeMap from "../assets/maps/street‑justice.json";
import deliveryDashMap from "../assets/maps/delivery‑dash.json";

const STORYLINES = [
  "turbo‑tech‑takedown",
  "street‑justice",
  "delivery‑dash",
] as const;
type RaceSlug = (typeof STORYLINES)[number];
const DEFAULT_RACE: RaceSlug = "turbo‑tech‑takedown";

const isMobileDevice = (): boolean =>
  /Mobi|Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

const createMaterials = (scene: Scene) => {
  const materials: Record<string, StandardMaterial> = {};
  const concrete = new StandardMaterial("concrete", scene);
  concrete.diffuseColor = new Color3(0.5, 0.5, 0.5);
  materials.concrete = concrete;

  const wall = new StandardMaterial("wall", scene);
  wall.diffuseColor = new Color3(0.8, 0.3, 0.3);
  materials.wall = wall;

  const metal = new StandardMaterial("metal", scene);
  metal.diffuseColor = new Color3(0.6, 0.6, 0.7);
  materials.metal = metal;

  const building = new StandardMaterial("building", scene);
  building.diffuseColor = new Color3(0.4, 0.4, 0.6);
  materials.building = building;

  return materials;
};

const Race: React.FC = () => {
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

  const [scene, setScene] = useState<Scene | null>(null);
  const [physicsEnabled, setPhysicsEnabled] = useState(false);
  const [carRoot, setCarRoot] = useState<TransformNode | null>(null);
  const carRootRef = useRef<TransformNode>(null!);
  const [pylons, setPylons] = useState<PylonDefinition[]>([]);

  const isMobile = useRef(isMobileDevice());
  const [mobileInput, setMobileInput] = useState<Record<string, boolean>>({});
  const handleMobileInput = (k: string, down: boolean) =>
    setMobileInput((prev) => ({ ...prev, [k]: down }));

  const onSceneReady = useCallback(async (s: Scene) => {
    setScene(s);
    s.clearColor = new Color4(0.05, 0.05, 0.05, 1);
    const havok = await HavokPhysics();
    s.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, havok));
    const ground = s.getMeshByName("Ground");
    if (ground) {
      new PhysicsAggregate(
        ground,
        PhysicsShapeType.BOX,
        { mass: 0, friction: 0.8, restitution: 0.1 },
        s
      );
    }
    setPhysicsEnabled(true);
  }, []);

  useEffect(() => {
    if (!scene || !physicsEnabled) return;
    const mats = createMaterials(scene);
    const defs = createMapFromJson(scene, mapJson, mats, scene.getPhysicsEngine()!);
    setPylons(defs);
  }, [scene, physicsEnabled, mapJson]);

  useEffect(() => {
    if (!scene || !carRoot) return;
    // find the chassis
    const chassis = carRoot.getChildMeshes(false, (m) => m.name === 'chassis')[0] || carRoot;

    const canvas = scene.getEngine().getRenderingCanvas();
    const camera = new ArcRotateCamera(
      'followCam',
      0,
      Math.PI / 4,
      12,
      chassis.getAbsolutePosition(),
      scene
    );
    camera.attachControl(canvas!, true);
    scene.activeCamera = camera;

    // update position each frame
    const obs = scene.onBeforeRenderObservable.add(() => {
      const pos = chassis.getAbsolutePosition();
      const forward = chassis.getDirection(new Vector3(0, 0, 1));
      const alpha = Math.atan2(forward.x, forward.z) + Math.PI;
      camera.alpha = alpha;
      camera.beta = Math.PI / 4;
      camera.radius = 12;
      camera.target = pos;
    });

    return () => {
      scene.onBeforeRenderObservable.remove(obs);
      camera.dispose();
    };
  }, [scene, carRoot]);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <Link to='/' style={{ position: 'absolute', top: 10, left: 10, zIndex: 999 }}>
        Back
      </Link>
      <Engine antialias adaptToDeviceRatio canvasId='babylon-canvas'>
        <SceneJSX onCreated={onSceneReady}>
          <hemisphericLight name='ambient' intensity={0.3} direction={Vector3.Up()} />
          <directionalLight name='dir' intensity={0.7} direction={new Vector3(-1, -2, -1)} />
          {physicsEnabled && (
            <PlayerCar
              onCarRootReady={(node) => {
                setCarRoot(node);
                carRootRef.current = node;
              }}
              mobileInput={mobileInput}
            />
          )}
          {physicsEnabled && pylons.map((p, i) => (
            <Pylon key={i} position={p.position} targetRef={carRootRef} interval={p.interval} />
          ))}
        </SceneJSX>
      </Engine>
      {isMobile.current && (
        <div style={{ position: 'absolute', bottom: 20, width: '100%', display: 'flex', justifyContent: 'center', gap: 10 }}>
          {['w','s','a','d'].map((k) => (
            <button key={k} onTouchStart={() => handleMobileInput(k, true)} onTouchEnd={() => handleMobileInput(k, false)}>
              {k.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default Race;
