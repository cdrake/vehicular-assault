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
  DirectionalLight,
  ShadowGenerator,
} from "@babylonjs/core"
import { Engine, Scene as SceneJSX } from "react-babylonjs"
import { createMapFromJson } from "./components/MapLoader"
import defaultMap from "./assets/maps/defaultMap.json"
import HavokPhysics from "@babylonjs/havok"
import { HavokPlugin } from "@babylonjs/core/Physics/v2"
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
  const shadowGenRef = useRef<ShadowGenerator | null>(null)

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
    setScene(sceneInstance)
    sceneInstance.clearColor = new Color4(0.05, 0.05, 0.05, 1)

    // Physics
    const hk = await HavokPhysics()
    const havokPlugin = new HavokPlugin(true, hk)
    sceneInstance.enablePhysics(new Vector3(0, -9.81, 0), havokPlugin)
    setPhysicsEnabled(true)

    // Ground physics
    if (groundRef.current) {
      new PhysicsAggregate(
        groundRef.current,
        PhysicsShapeType.BOX,
        { mass: 0, restitution: 0.2, friction: 0.9 },
        sceneInstance
      )
    }

    // Shadows: directional light + generator
    const dirLight = new DirectionalLight(
      "dirLight",
      new Vector3(-1, -2, -1),
      sceneInstance
    )
    dirLight.position = new Vector3(20, 40, 20)
    const shadowGen = new ShadowGenerator(2048, dirLight)
    shadowGen.useBlurExponentialShadowMap = true
    shadowGen.blurKernel = 32
    shadowGenRef.current = shadowGen

    // Ground receives
    if (groundRef.current) groundRef.current.receiveShadows = true
  }, [])

  // Map load
  useEffect(() => {
    if (!scene || !physicsReady) return
    const materials = createMaterials(scene)
    createMapFromJson(scene, defaultMap, materials, scene.getPhysicsEngine())

    const testBox = MeshBuilder.CreateBox("TestBox", { size: 2 }, scene)
    testBox.position = new Vector3(100, 20, 0)
    new PhysicsAggregate(
      testBox,
      PhysicsShapeType.BOX,
      { mass: 1, restitution: 0.2, friction: 0.5 },
      scene
    )
  }, [scene, physicsReady])

  // Follow camera + shadows caster hookup
  useEffect(() => {
    if (!scene || !carRoot) return

    // Camera
    const canvas = scene.getEngine().getRenderingCanvas()
    const cam = new ArcRotateCamera(
      "FollowCam",
      Math.PI / 2,
      Math.PI / 3,
      20,
      carRoot!.position.clone(), // ← use the car’s position
      scene
    )
    cam.attachControl(canvas, true)
    cam.lowerBetaLimit = 0.1
    cam.upperBetaLimit = Math.PI / 2
    scene.activeCamera = cam
    cameraRef.current = cam

    // Shadows: add car mesh + wheels as casters
    const shadowGen = shadowGenRef.current
    if (shadowGen && carRoot) {
      // make every mesh under carRoot cast a shadow
      carRoot.getChildMeshes().forEach((m) => {
        shadowGen.addShadowCaster(m)
      })

      // (optional) if you still have standalone wheel meshes elsewhere:
      scene.meshes.forEach((m) => {
        if (m.name.toLowerCase().includes("wheel")) {
          shadowGen.addShadowCaster(m)
        }
      })
    }

    // Smooth follow
    const obs = scene.onBeforeRenderObservable.add(() => {
      cam.target = Vector3.Lerp(cam.target, carRoot.position, 0.2)
    })

    return () => {
      scene.onBeforeRenderObservable.remove(obs)
      cam.dispose()
    }
  }, [scene, carRoot])

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
      <Link
        to="/customize"
        style={{ position: "absolute", top: 10, left: 10, zIndex: 999 }}
      >
        Customize
      </Link>
      <Link
        to="/havok"
        style={{ position: "absolute", top: 10, left: 120, zIndex: 999 }}
      >
        Havok Sample
      </Link>
      <Engine antialias adaptToDeviceRatio canvasId="babylon-canvas">
        <SceneJSX onCreated={onSceneReady}>
          <hemisphericLight
            name="AmbientLight"
            intensity={0.3}
            direction={Vector3.Up()}
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
              onTouchStart={() => handleMobileInput("w", true)}
              onTouchEnd={() => handleMobileInput("w", false)}
            >
              Accelerate
            </button>
            <button
              onTouchStart={() => handleMobileInput("s", true)}
              onTouchEnd={() => handleMobileInput("s", false)}
            >
              Reverse
            </button>
          </div>
          <div style={{ display: "flex", gap: 40 }}>
            <button
              onTouchStart={() => handleMobileInput("a", true)}
              onTouchEnd={() => handleMobileInput("a", false)}
            >
              Left
            </button>
            <button
              onTouchStart={() => handleMobileInput("d", true)}
              onTouchEnd={() => handleMobileInput("d", false)}
            >
              Right
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
