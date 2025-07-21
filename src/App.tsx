import React, { useCallback, useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import {
  ArcRotateCamera,
  Color3,
  Color4,
  GroundMesh,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core"
import PlayerCar from "./components/PlayerCar"
import { Engine, Scene as SceneJSX } from "react-babylonjs"
import { createMapFromJson } from "./components/MapLoader"
import defaultMap from "./assets/maps/defaultMap.json"
import { HavokPlugin } from "@babylonjs/core/Physics/v2"
import HavokPhysics from "@babylonjs/havok"
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder"
import { PhysicsAggregate, PhysicsShapeType } from "@babylonjs/core/Physics/v2"
import SteerableCar from "./components/SteerableCar"

// Material creation
const createMaterials = (scene: Scene) => {
  const materials: Record<string, StandardMaterial> = {}

  const concrete = new StandardMaterial("concrete", scene)
  concrete.diffuseColor = new Color3(0.5, 0.5, 0.5)
  materials["concrete"] = concrete

  const wall = new StandardMaterial("wall", scene)
  wall.diffuseColor = new Color3(0.8, 0.3, 0.3)
  materials["wall"] = wall

  const metal = new StandardMaterial("metal", scene)
  metal.diffuseColor = new Color3(0.6, 0.6, 0.7)
  materials["metal"] = metal

  const building = new StandardMaterial("building", scene)
  building.diffuseColor = new Color3(0.4, 0.4, 0.6)
  materials["building"] = building

  return materials
}

const App: React.FC = () => {
  const [scene, setScene] = useState<Scene | null>(null)
  const [carRoot, setCarRoot] = useState<TransformNode | null>(null)
  const cameraRef = useRef<ArcRotateCamera | null>(null)
  const [physicsReady, setPhysicsEnabled] = useState(false)
  const [mobileInput, setMobileInput] = useState<Record<string, boolean>>({})
  const [isMobile, setIsMobile] = useState<boolean>(false)

  const groundRef = useRef<GroundMesh | null>(null)

  // Detect mobile
  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent))
  }, [])

  // Handle button input
  const handleMobileInput = (key: string, isPressed: boolean) => {
    setMobileInput((prev) => {
      const updated = { ...prev, [key]: isPressed }
      if (isPressed) {
        if (key === "w") updated["s"] = false
        if (key === "s") updated["w"] = false
        if (key === "a") updated["d"] = false
        if (key === "d") updated["a"] = false
      }
      return updated
    })
  }

  // Scene ready
  const onSceneReady = useCallback(async (sceneInstance: Scene) => {
    console.log("✅ Scene initialized.")
    setScene(sceneInstance)
    sceneInstance.clearColor = new Color4(0.05, 0.05, 0.05, 1)

    const havok = await HavokPhysics()
    console.log("[Havok] Loaded:", havok)
    const havokPlugin = new HavokPlugin(true, havok)
    sceneInstance.enablePhysics(new Vector3(0, -9.81, 0), havokPlugin)
    console.log("✅ Physics enabled.")
    setPhysicsEnabled(true)
    if (groundRef.current) {
      new PhysicsAggregate(
        groundRef.current,
        PhysicsShapeType.BOX,
        { mass: 0, restitution: 0.2, friction: 0.9 },
        sceneInstance
      )
      console.log("✅ Ground physics added")
    } else {
      console.log('ground not set')
    }
  }, [])

  // Map load
  useEffect(() => {
    if (!scene || !physicsReady) return
    const materials = createMaterials(scene)
    createMapFromJson(scene, defaultMap, materials, scene.getPhysicsEngine())
    const testBox = MeshBuilder.CreateBox("TestBox", { size: 2 }, scene)
    testBox.position = new Vector3(100, 20, 0) // Place it above the ground

    new PhysicsAggregate(
      testBox,
      PhysicsShapeType.BOX,
      { mass: 1, restitution: 0.2, friction: 0.5 },
      scene
    )

    console.log("✅ Added physics test box at (0, 20, 0)")
  }, [scene, physicsReady])

  // Follow camera
  useEffect(() => {
    if (!scene || !carRoot) return
    console.log("✅ Setting up follow camera")

    const camera = new ArcRotateCamera(
      "FollowCamera",
      Math.PI / 2,
      Math.PI / 3,
      20,
      carRoot.position.clone(),
      scene
    )
    camera.attachControl(true)
    camera.lowerBetaLimit = 0.1
    camera.upperBetaLimit = Math.PI / 2
    camera.wheelPrecision = 50
    scene.activeCamera = camera
    cameraRef.current = camera

    const observer = scene.onBeforeRenderObservable.add(() => {
      if (!cameraRef.current || !carRoot) return
      cameraRef.current.target = Vector3.Lerp(
        cameraRef.current.target,
        carRoot.position,
        0.25
      )
    })

    return () => {
      camera.dispose()
      scene.onBeforeRenderObservable.remove(observer)
    }
  }, [scene, carRoot])

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <Link
        to="/customize"
        style={{
          position: "absolute",
          top: 10,
          left: 10,
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
        <SceneJSX onCreated={onSceneReady}>
          <hemisphericLight
            name="AmbientLight"
            intensity={0.3}
            direction={Vector3.Up()}
          />
          <directionalLight
            name="DirectionalLight"
            direction={new Vector3(-1, -2, -1)}
            intensity={0.7}
          />
          <ground
            ref={groundRef}
            name="Ground"
            width={400}
            height={400}
            subdivisions={2}
            position={new Vector3(0, 0, 0)}
            receiveShadows
          >
            <standardMaterial
              name="GroundMaterial"
              diffuseColor={new Color3(0.5, 0.5, 0.5)}
              specularColor={new Color3(0, 0, 0)}
            />
          </ground>
          {scene && physicsReady && (
            <SteerableCar
              scene={scene}
              onCarRootReady={setCarRoot}
              mobileInput={mobileInput}
            />
          )}
        </SceneJSX>
      </Engine>

      {isMobile && (
        <div
          style={{
            position: "absolute",
            bottom: 20,
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            zIndex: 999,
          }}
        >
          <div style={{ display: "flex", gap: 10 }}>
            <button
              style={buttonStyle("green")}
              onTouchStart={() => handleMobileInput("w", true)}
              onTouchEnd={() => handleMobileInput("w", false)}
              onContextMenu={(e) => e.preventDefault()}
            >
              Accelerate
            </button>
            <button
              style={buttonStyle("red")}
              onTouchStart={() => handleMobileInput("s", true)}
              onTouchEnd={() => handleMobileInput("s", false)}
              onContextMenu={(e) => e.preventDefault()}
            >
              Reverse
            </button>
          </div>
          <div style={{ display: "flex", gap: 40 }}>
            <button
              style={buttonStyle("blue")}
              onTouchStart={() => handleMobileInput("a", true)}
              onTouchEnd={() => handleMobileInput("a", false)}
              onContextMenu={(e) => e.preventDefault()}
            >
              Left
            </button>
            <button
              style={buttonStyle("blue")}
              onTouchStart={() => handleMobileInput("d", true)}
              onTouchEnd={() => handleMobileInput("d", false)}
              onContextMenu={(e) => e.preventDefault()}
            >
              Right
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Style helper
const buttonStyle = (color: string): React.CSSProperties => ({
  padding: "10px 20px",
  backgroundColor: color,
  color: "white",
  border: "none",
  borderRadius: "8px",
  fontSize: "16px",
  touchAction: "none",
})

export default App
