import React, { useEffect, useRef } from "react"
import { useScene } from "react-babylonjs"
import {
  LoadAssetContainerAsync,
  TransformNode,
  AbstractMesh,
  Axis,
  Space,
  Vector3,
  ActionManager,
  ExecuteCodeAction,
  MeshBuilder,
  Matrix,
} from "@babylonjs/core"
import { PhysicsAggregate, PhysicsShapeType } from "@babylonjs/core/Physics"

interface PlayerCarProps {
  onCarRootReady?: (node: TransformNode) => void
  mobileInput?: Record<string, boolean>
}

const PlayerCar: React.FC<PlayerCarProps> = ({
  onCarRootReady,
  mobileInput = {},
}) => {
  const scene = useScene()
  const inputMap = useRef<Record<string, boolean>>({})
  const mobileInputRef = useRef<Record<string, boolean>>(mobileInput)
  const carRootRef = useRef<TransformNode | null>(null)
  const frontPivotsRef = useRef<TransformNode[]>([])
  const wheelsRef = useRef<AbstractMesh[]>([])
  const colliderRef = useRef<AbstractMesh | null>(null)
  const speedRef = useRef(0)
  const steeringRef = useRef(0)
  const carBodyRef = useRef<PhysicsAggregate | null>(null)

  // sync mobile input
  useEffect(() => {
    mobileInputRef.current = mobileInput
  }, [mobileInput])

  // load model + physics
  useEffect(() => {
    if (!scene || !scene.getPhysicsEngine()) return
    if (carRootRef.current) return

    scene.actionManager ??= new ActionManager(scene)
    scene.actionManager.actions?.forEach((a) => scene.actionManager?.unregisterAction(a))
    const down = new ExecuteCodeAction(
      ActionManager.OnKeyDownTrigger,
      (evt) => (inputMap.current[evt.sourceEvent.key.toLowerCase()] = true)
    )
    const up = new ExecuteCodeAction(
      ActionManager.OnKeyUpTrigger,
      (evt) => (inputMap.current[evt.sourceEvent.key.toLowerCase()] = false)
    )
    scene.actionManager.registerAction(down)
    scene.actionManager.registerAction(up)

    LoadAssetContainerAsync(
      "/vehicular-assault/assets/models/steerable_car4.glb",
      scene
    )
      .then((container) => {
        container.addAllToScene()
        const root =
          ((container.rootNodes && container.rootNodes[0]) ?? container.meshes[0]) as TransformNode
        if (!root) {
          console.error("No root node")
          return
        }
        root.name = "carRoot"
        root.position.y += 1
        carRootRef.current = root
        onCarRootReady?.(root)

        // physics collider
        const { min, max } = root.getHierarchyBoundingVectors(true)
        const size = max.subtract(min)
        const center = min.add(max).scale(0.5)
        const rootPos = root.getAbsolutePosition()
        const centerOffset = center.subtract(rootPos)
        const collider = MeshBuilder.CreateBox(
          "carCollider",
          { width: size.x, height: size.y, depth: size.z },
          scene
        )
        // position collider to match the root chassis location
        collider.position = rootPos.add(centerOffset)
        collider.isVisible = false
        colliderRef.current = collider
        const agg = new PhysicsAggregate(
          collider,
          PhysicsShapeType.BOX,
          { mass: 100, friction: 0.5, restitution: 0.1 },
          scene
        )
        carBodyRef.current = agg

        // wheels setup
        const all = container.meshes.filter(
          (m) => m instanceof AbstractMesh
        ) as AbstractMesh[]
        wheelsRef.current = all.filter((m) => m.name.toLowerCase().includes("wheel"))
        const front = wheelsRef.current.filter((w) => w.position.z < 0)
        frontPivotsRef.current = front.map((wheel) => {
          const p = new TransformNode(`${wheel.name}_pivot`, scene)
          p.parent = root
          p.position = wheel.position.clone()
          wheel.parent = p
          wheel.position = Vector3.Zero()
          return p
        })

        console.log("✅ Car and physics ready")
      })
      .catch((err) => console.error(err))
  }, [scene, onCarRootReady])

  // drive & sync
  useEffect(() => {
    if (!scene) return
    const obs = scene.onBeforeRenderObservable.add(() => {
      const root = carRootRef.current
      const agg = carBodyRef.current
      const collider = colliderRef.current
      if (!root || !agg || !collider) return
      const body = (agg as any).body
      const dt = scene.getEngine().getDeltaTime() / 1000

      const input = { ...inputMap.current, ...mobileInputRef.current }
      // steering
      if (input.d) steeringRef.current += dt
      else if (input.a) steeringRef.current -= dt
      else steeringRef.current *= 0.9
      steeringRef.current = Math.max(-1, Math.min(1, steeringRef.current))
      frontPivotsRef.current.forEach(
        (p) => (p.rotation.y = -steeringRef.current * Math.PI / 6)
      )

      // speed
      if (input.w) speedRef.current += 20 * dt
      if (input.s) speedRef.current -= 20 * dt
      if (!input.w && !input.s) speedRef.current *= 0.98
      speedRef.current = Math.max(-10, Math.min(30, speedRef.current))

      // compute forward
      const orientation = collider.rotationQuaternion!
      const mat = Matrix.FromQuaternionToRef(orientation, new Matrix())
      const forward = Vector3.TransformCoordinates(
        new Vector3(0, 0, 1),
        mat
      )

      body.setLinearVelocity(forward.scale(speedRef.current))
      body.setAngularVelocity(
        new Vector3(0, steeringRef.current * speedRef.current * 0.5, 0)
      )

      // sync visuals
      root.position.copyFrom(collider.position)
      root.rotationQuaternion = collider.rotationQuaternion

      // roll wheels
      wheelsRef.current.forEach((w) =>
        w.rotate(Axis.X, (speedRef.current * dt) / 2, Space.LOCAL)
      )
    })
    return () => {scene.onBeforeRenderObservable.remove(obs)}
  }, [scene])

  return null
}

export default PlayerCar
