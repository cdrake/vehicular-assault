import React, { useEffect, useRef } from "react"
import { useScene, Model } from "react-babylonjs"
import {
  Vector3,
  TransformNode,
  ActionManager,
  ExecuteCodeAction,
  Space,
} from "@babylonjs/core"
import type { ILoadedModel } from "react-babylonjs"

interface PlayerCarProps {
  position: Vector3
  scale: Vector3
  onPositionUpdate?: (pos: Vector3) => void
}

const PlayerCar: React.FC<PlayerCarProps> = ({
  position,
  scale,
  onPositionUpdate,
}) => {
  const scene = useScene()
  const carRootRef = useRef<TransformNode | null>(null)
  const pivotFIRef = useRef<TransformNode | null>(null)
  const pivotFORef = useRef<TransformNode | null>(null)
  const inputMap = useRef<{ [key: string]: boolean }>({})

  // Register keyboard controls
  useEffect(() => {
    if (!scene) return

    scene.actionManager ??= new ActionManager(scene)
    scene.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnKeyDownTrigger, (evt) => {
        inputMap.current[evt.sourceEvent.key.toLowerCase()] = true
      })
    )
    scene.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnKeyUpTrigger, (evt) => {
        inputMap.current[evt.sourceEvent.key.toLowerCase()] = false
      })
    )
  }, [scene])

  const onModelLoaded = (model: ILoadedModel) => {
    if (!scene) return
    if (!model.meshes) {
      console.warn("❌ PlayerCar: Model loaded but no meshes found!")
      return
    }

    console.log(
      "✅ Loaded meshes:",
      model.meshes.map((m) => m.name)
    )

    const meshes = model.meshes
    const chassis = meshes.find((m) => m.name.toLowerCase().includes("chassis"))
    const wheels = meshes.filter((m) => m.name.toLowerCase().includes("wheel"))

    if (!chassis || wheels.length < 4) {
      console.error("❌ Car model missing chassis or wheels")
      return
    }

    // Use root mesh from GLB
    const carRoot = model.rootMesh
    if (!carRoot) {
      console.error("❌ No root mesh in model!")
      return
    }
    carRoot.position = position.clone()
    carRoot.scaling = scale.clone()
    carRootRef.current = carRoot

    // Find front left/right wheels
    const frontLeft = wheels.find((w) => w.name.toLowerCase().includes("lf"))
    const frontRight = wheels.find((w) => w.name.toLowerCase().includes("rf"))

    // Create pivots
    const pivotFI = new TransformNode("pivotFI", scene)
    const pivotFO = new TransformNode("pivotFO", scene)

    // Get world positions
    const pivotPosFI = frontLeft?.getAbsolutePosition() ?? Vector3.Zero()
    const pivotPosFO = frontRight?.getAbsolutePosition() ?? Vector3.Zero()

    // Convert to carRoot local space
    const localPivotFI = pivotPosFI.subtract(carRoot.getAbsolutePosition())
    const localPivotFO = pivotPosFO.subtract(carRoot.getAbsolutePosition())

    // Parent pivots to carRoot and set local position
    pivotFI.parent = carRoot
    pivotFO.parent = carRoot
    pivotFI.position = localPivotFI
    pivotFO.position = localPivotFO

    // Parent wheels to pivots
    if (frontLeft) {
      frontLeft.parent = pivotFI
      frontLeft.position = Vector3.Zero()
    }
    if (frontRight) {
      frontRight.parent = pivotFO
      frontRight.position = Vector3.Zero()
    }

    // Movement loop
    scene.onBeforeRenderObservable.add(() => {
      if (!carRootRef.current) return
      const car = carRootRef.current

      const moveSpeed = 0.5
      const steerAmount = 0.02

      // Movement
      if (inputMap.current["w"]) {
        car.translate(Vector3.Forward(), moveSpeed, Space.LOCAL)
      }
      if (inputMap.current["s"]) {
        car.translate(Vector3.Backward(), moveSpeed, Space.LOCAL)
      }

      // Steering
      if (inputMap.current["a"]) {
        pivotFIRef.current?.rotate(Vector3.Up(), steerAmount, Space.LOCAL)
        pivotFORef.current?.rotate(Vector3.Up(), steerAmount, Space.LOCAL)
        car.rotation.y += steerAmount * 0.5
      }
      if (inputMap.current["d"]) {
        pivotFIRef.current?.rotate(Vector3.Up(), -steerAmount, Space.LOCAL)
        pivotFORef.current?.rotate(Vector3.Up(), -steerAmount, Space.LOCAL)
        car.rotation.y -= steerAmount * 0.5
      }

      onPositionUpdate?.(car.position)
    })
  }

  return (
    <Model
      name="player-car"
      rootUrl="/vehicular-assault/assets/models/"
      sceneFilename="steerable_car.glb"
      position={position}
      scaling={scale}
      onModelLoaded={onModelLoaded}
    />
  )
}

export default PlayerCar
