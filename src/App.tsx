import React, { useCallback, useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { Engine, Scene } from "react-babylonjs"

// Babylon core
import {
  Scene as BabylonScene,
  ArcRotateCamera,
  UniversalCamera,
} from "@babylonjs/core"
import { Vector3, Color3, Color4 } from "@babylonjs/core/Maths/math"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { CannonJSPlugin } from "@babylonjs/core/Physics/Plugins/cannonJSPlugin"
import type { IPhysicsEngine } from "@babylonjs/core/Physics/IPhysicsEngine"

// CannonJS
import * as CANNON from "cannon"

// Components
import { createMapFromJson } from "./components/MapLoader"
import PlayerCar from "./components/PlayerCar"

// JSON Map
import defaultMapData from "./assets/maps/defaultMap.json"
import type { MapData } from "./components/MapLoader"

const App: React.FC = () => {
  // App state
  const [activeCamera, setActiveCamera] = useState<"orbit" | "free">("orbit")
  const [carPosition, setCarPosition] = useState(new Vector3(20, 0.8, 0))

  const [orbitCamera, setOrbitCamera] = useState<ArcRotateCamera | null>(null)
  const [freeCamera, setFreeCamera] = useState<UniversalCamera | null>(null)
  const [scene, setScene] = useState<BabylonScene | null>(null)

  const sceneRef = useRef<BabylonScene | null>(null)

  const [materials, setMaterials] = useState<Record<string, StandardMaterial>>(
    {}
  )
  const [physicsEngine, setPhysicsEngine] = useState<IPhysicsEngine | null>(
    null
  )

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "c" || e.key === "C") {
        setActiveCamera((prev) => (prev === "orbit" ? "free" : "orbit"))
        console.log("✅ Camera toggled with keyboard")
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  // Setup materials when scene is ready
  useEffect(() => {
    if (!sceneRef.current) return

    const scene = sceneRef.current
    scene.clearColor = new Color4(0.05, 0.05, 0.05, 1)

    const concreteMat = new StandardMaterial("concrete", scene)
    concreteMat.diffuseColor = new Color3(0, 0, 0)
    concreteMat.emissiveColor = new Color3(0.08, 0.08, 0.08)
    concreteMat.specularColor = new Color3(0, 0, 0)
    concreteMat.ambientColor = new Color3(0, 0, 0)

    const wallMat = new StandardMaterial("wall", scene)
    wallMat.diffuseColor = new Color3(0, 0, 0)
    wallMat.emissiveColor = new Color3(0.4, 0.4, 0.4)
    wallMat.specularColor = new Color3(0, 0, 0)
    wallMat.ambientColor = new Color3(0, 0, 0)

    const metalMat = new StandardMaterial("metal", scene)
    metalMat.diffuseColor = new Color3(0.8, 0.8, 0.9)
    metalMat.specularColor = new Color3(0.4, 0.4, 0.4)
    metalMat.emissiveColor = new Color3(0, 0, 0)
    metalMat.ambientColor = new Color3(0, 0, 0)

    setMaterials({
      concrete: concreteMat,
      wall: wallMat,
      metal: metalMat,
    })
  }, [scene])

  // Initialize scene
  const onSceneReady = useCallback((scene: BabylonScene) => {
    console.log("✅ Scene initialized.")
    sceneRef.current = scene
    setScene(scene)

    scene.clearColor = new Color4(0.05, 0.05, 0.05, 1)
    const plugin = new CannonJSPlugin(true, 10, CANNON)
    scene.enablePhysics(new Vector3(0, -9.81, 0), plugin)
    setPhysicsEngine(scene.getPhysicsEngine())
  }, [])

  // Load map once scene and materials are ready
  useEffect(() => {
    if (!scene || Object.keys(materials).length === 0) return

    console.log("✅ Loading map with materials:", Object.keys(materials))
    createMapFromJson(
      scene,
      defaultMapData as unknown as MapData,
      materials,
      physicsEngine
    )
  }, [scene, materials, physicsEngine])

  // Handle camera switching
  useEffect(() => {
    if (!scene) return
    if (activeCamera === "orbit" && orbitCamera) {
      console.log("🎯 Switching to ORBIT camera")
      scene.activeCamera = orbitCamera
      orbitCamera.attachControl(true)
      freeCamera?.detachControl()
      orbitCamera.setTarget(carPosition)
    }
    if (activeCamera === "free" && freeCamera) {
      console.log("🎯 Switching to FREE camera")
      scene.activeCamera = freeCamera
      freeCamera.attachControl(true)
      orbitCamera?.detachControl()
      freeCamera.setTarget(new Vector3(0, 0, 0))
    }
  }, [scene, activeCamera, orbitCamera, freeCamera, carPosition])

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        margin: 0,
        padding: 0,
        overflow: "hidden",
      }}
    >
      <Link
        to="/customize"
        style={{
          position: "absolute",
          top: "10px",
          left: "10px",
          backgroundColor: "#222",
          color: "#fff",
          padding: "10px 20px",
          textDecoration: "none",
          borderRadius: "5px",
          zIndex: 999,
        }}
      >
        Customize
      </Link>
      <Link
        to="/vfx"
        style={{
          position: "absolute",
          top: "70px",
          left: "10px",
          backgroundColor: "#222",
          color: "#fff",
          padding: "10px 20px",
          textDecoration: "none",
          borderRadius: "5px",
          zIndex: 999,
        }}
      >
        VFX
      </Link>
      <button
        style={{
          position: "absolute",
          top: "10px",
          right: "10px",
          zIndex: 999,
          padding: "10px 20px",
          backgroundColor: "#222",
          color: "#fff",
          border: "none",
          borderRadius: "5px",
          cursor: "pointer",
        }}
        onClick={() => {
          setActiveCamera((prev) => (prev === "orbit" ? "free" : "orbit"))
        }}
      >
        Switch Camera
      </button>

      <Engine antialias adaptToDeviceRatio canvasId="babylon-canvas">
        <Scene onCreated={onSceneReady}>
          <arcRotateCamera
            name="ArcCamera"
            alpha={Math.PI / 4}
            beta={Math.PI / 3}
            radius={40}
            lowerBetaLimit={0.01}
            upperBetaLimit={Math.PI / 2.1}
            target={carPosition}
            minZ={0.1}
            wheelPrecision={50}
            onCreated={(camera) => {
              setOrbitCamera(camera)
              if (scene && activeCamera === "orbit") {
                scene.activeCamera = camera
              }
            }}
          />

          <universalCamera
            name="UniversalCamera"
            position={new Vector3(49, 40, 49)}
            minZ={0.1}
            speed={3}
            keysUp={[87]}
            keysDown={[83]}
            keysLeft={[65]}
            keysRight={[68]}
            onCreated={(camera) => {
              setFreeCamera(camera)
              if (scene && activeCamera === "free") {
                scene.activeCamera = camera
              }
              camera.getScene().onBeforeRenderObservable.add(() => {
                if (camera.position.y < 0) {
                  camera.position.y = 0
                }
              })
            }}
          />

          <directionalLight
            name="DirectionalLight"
            direction={new Vector3(-1, -2, -1)}
            intensity={0.7}
          />
          <hemisphericLight
            name="AmbientLight"
            intensity={0.2}
            direction={Vector3.Up()}
            groundColor={new Color3(0.1, 0.1, 0.1)}
            diffuse={new Color3(0.9, 0.9, 0.9)}
            specular={new Color3(0, 0, 0)}
          />

          <PlayerCar
            position={carPosition}
            scale={new Vector3(1, 1, 1)}
            onPositionUpdate={setCarPosition}
          />
        </Scene>
      </Engine>
    </div>
  )
}

export default App
