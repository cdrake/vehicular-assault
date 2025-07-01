import React, { useCallback, useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { Engine, Scene } from "react-babylonjs"

// Babylon core
import { Scene as BabylonScene } from "@babylonjs/core/scene"
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
  const [sceneReady, setSceneReady] = useState(false)
  const sceneRef = useRef<BabylonScene | null>(null)

  const [materials, setMaterials] = useState<Record<string, StandardMaterial>>(
    {}
  )

  const [physicsEngine, setPhysicsEngine] = useState<IPhysicsEngine | null>(
    null
  )

  useEffect(() => {
    if (!sceneRef.current) return

    const scene = sceneRef.current
    scene.clearColor = new Color4(0.05, 0.05, 0.05, 1)

    // Ground: dark, unlit
    const concreteMat = new StandardMaterial("concrete", scene)
    concreteMat.diffuseColor = new Color3(0, 0, 0)
    concreteMat.emissiveColor = new Color3(0.08, 0.08, 0.08)
    concreteMat.specularColor = new Color3(0, 0, 0)
    concreteMat.ambientColor = new Color3(0, 0, 0)

    // Walls: medium gray, unlit
    const wallMat = new StandardMaterial("wall", scene)
    wallMat.diffuseColor = new Color3(0, 0, 0)
    wallMat.emissiveColor = new Color3(0.4, 0.4, 0.4)
    wallMat.specularColor = new Color3(0, 0, 0)
    wallMat.ambientColor = new Color3(0, 0, 0)

    // Metal pillar: still lit for shine
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
  }, [sceneReady])

  const onSceneReady = useCallback((scene: BabylonScene) => {
    console.log("✅ Scene initialized.")
    scene.clearColor = new Color4(0.05, 0.05, 0.05, 1)
    sceneRef.current = scene
    setSceneReady(true)

    const plugin = new CannonJSPlugin(true, 10, CANNON)
    scene.enablePhysics(new Vector3(0, -9.81, 0), plugin)
    setPhysicsEngine(scene.getPhysicsEngine())
  }, [])

  useEffect(() => {
    if (!sceneRef.current || !sceneReady) return
    if (!materials || Object.keys(materials).length === 0) return

    console.log("✅ Loading map with materials:", Object.keys(materials))
    createMapFromJson(
      sceneRef.current,
      defaultMapData as unknown as MapData,
      materials,
      physicsEngine
    )
  }, [sceneReady, materials, physicsEngine])

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
      <Engine antialias adaptToDeviceRatio canvasId="babylon-canvas">
        <Scene onCreated={onSceneReady}>
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
    camera.attachControl(true)
    camera.setTarget(new Vector3(0, 0, 0))
    camera.fov = 0.8
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
            position={new Vector3(20, 0.8, 0)}
            scale={new Vector3(1, 1, 1)}
          />
        </Scene>
      </Engine>
    </div>
  )
}

export default App
