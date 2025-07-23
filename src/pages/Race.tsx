import React, { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams, Link } from "react-router-dom"
import { Engine, Scene as SceneJSX } from "react-babylonjs"
import {
  ArcRotateCamera,
  Color3,
  Color4,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core"
import { HavokPlugin, PhysicsAggregate, PhysicsShapeType } from "@babylonjs/core/Physics"
import HavokPhysics from "@babylonjs/havok"
import PlayerCar from "../components/PlayerCar"
import { createMapFromJson } from "../components/MapLoader"
import turboTechTakedownMap from "../assets/maps/turbo‑tech‑takedown.json"
import streetJusticeMap from "../assets/maps/street‑justice.json"
import deliveryDashMap from "../assets/maps/delivery‑dash.json"

const STORYLINES = [
  "turbo‑tech‑takedown",
  "street‑justice",
  "delivery‑dash",
] as const

type RaceSlug = (typeof STORYLINES)[number]
const DEFAULT_RACE: RaceSlug = "turbo‑tech‑takedown"

const isMobileDevice = (): boolean => {
  return /Mobi|Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

const createMaterials = (scene: Scene) => {
  const materials: Record<string, StandardMaterial> = {}
  const concrete = new StandardMaterial("concrete", scene)
  concrete.diffuseColor = new Color3(0.5, 0.5, 0.5)
  materials.concrete = concrete

  const wall = new StandardMaterial("wall", scene)
  wall.diffuseColor = new Color3(0.8, 0.3, 0.3)
  materials.wall = wall

  const metal = new StandardMaterial("metal", scene)
  metal.diffuseColor = new Color3(0.6, 0.6, 0.7)
  materials.metal = metal

  const building = new StandardMaterial("building", scene)
  building.diffuseColor = new Color3(0.4, 0.4, 0.6)
  materials.building = building

  return materials
}

const Race: React.FC = () => {
  const [searchParams] = useSearchParams()
  const raw = (searchParams.get("race") ?? "").toLowerCase()
  const selectedRace: RaceSlug = STORYLINES.includes(raw as RaceSlug)
    ? (raw as RaceSlug)
    : DEFAULT_RACE

  const mapJson =
    selectedRace === "street‑justice"
      ? streetJusticeMap
      : selectedRace === "delivery‑dash"
      ? deliveryDashMap
      : turboTechTakedownMap

  const [scene, setScene] = useState<Scene | null>(null)
  const [carRoot, setCarRoot] = useState<TransformNode | null>(null)
  const cameraRef = useRef<ArcRotateCamera | null>(null)
  const [physicsEnabled, setPhysicsEnabled] = useState(false)
  const isMobile = useRef(isMobileDevice())
  const [mobileInput, setMobileInput] = useState<Record<string, boolean>>({})

  const handleMobileInput = (key: string, isPressed: boolean) => {
    setMobileInput((prev) => ({ ...prev, [key]: isPressed }))
  }

  // initialize scene + physics
  const onSceneReady = useCallback(async (sceneInstance: Scene) => {
    console.log("✅ Scene initialized.")
    setScene(sceneInstance)
    sceneInstance.clearColor = new Color4(0.05, 0.05, 0.05, 1)

    const havok = await HavokPhysics()
    sceneInstance.enablePhysics(
      new Vector3(0, -9.81, 0),
      new HavokPlugin(true, havok)
    )
    console.log("✅ Physics enabled.")

    // give Ground a static collider
    const ground = sceneInstance.getMeshByName("Ground")
    if (ground) {
      new PhysicsAggregate(
        ground,
        PhysicsShapeType.BOX,
        { mass: 0, friction: 0.8, restitution: 0.1 },
        sceneInstance
      )
    }

    setPhysicsEnabled(true)
  }, [])

  // load map
  useEffect(() => {
    if (!scene || !physicsEnabled) return
    const mats = createMaterials(scene)
    createMapFromJson(scene, mapJson, mats, scene.getPhysicsEngine()!)
  }, [scene, physicsEnabled, mapJson])

  // follow camera
  useEffect(() => {
    if (!scene || !carRoot) return
    console.log("✅ Camera follow set up.")
    const cam = new ArcRotateCamera(
      "FollowCam",
      Math.PI / 2,
      Math.PI / 3,
      20,
      carRoot.position.clone(),
      scene
    )
    cam.attachControl(true)
    scene.activeCamera = cam
    cameraRef.current = cam

    const obs = scene.onBeforeRenderObservable.add(() => {
      cam.target = Vector3.Lerp(cam.target, carRoot.position, 0.25)
    })
    return () => {
      cam.dispose()
      scene.onBeforeRenderObservable.remove(obs)
    }
  }, [scene, carRoot])

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <Link to='/' style={{ position: 'absolute', top: 10, left: 10, zIndex: 999 }}>
        Back
      </Link>

      <Engine antialias adaptToDeviceRatio canvasId='babylon-canvas'>
        <SceneJSX onCreated={onSceneReady}>
          <hemisphericLight name='ambient' intensity={0.3} direction={Vector3.Up()} />
          <directionalLight name='dir' intensity={0.7} direction={new Vector3(-1, -2, -1)} />

          <ground name='Ground' width={400} height={400} subdivisions={2} position={Vector3.Zero()} receiveShadows>
            <standardMaterial name='groundMat' diffuseColor={new Color3(0.5,0.5,0.5)} specularColor={new Color3(0,0,0)} />
          </ground>

          {physicsEnabled && (
            <PlayerCar onCarRootReady={setCarRoot} mobileInput={mobileInput} />
          )}
        </SceneJSX>
      </Engine>

      {isMobile.current && (
        /* mobile controls */
        <div style={{ position: 'absolute', bottom: 20, width: '100%', display: 'flex', justifyContent: 'center', gap: 10 }}>
          <button onTouchStart={() => handleMobileInput('w', true)} onTouchEnd={() => handleMobileInput('w', false)}>↑</button>
          <button onTouchStart={() => handleMobileInput('s', true)} onTouchEnd={() => handleMobileInput('s', false)}>↓</button>
          <button onTouchStart={() => handleMobileInput('a', true)} onTouchEnd={() => handleMobileInput('a', false)}>←</button>
          <button onTouchStart={() => handleMobileInput('d', true)} onTouchEnd={() => handleMobileInput('d', false)}>→</button>
        </div>
      )}
    </div>
  )
}

export default Race
