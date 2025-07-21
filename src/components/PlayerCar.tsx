import React, { useEffect, useRef } from 'react'
import '@babylonjs/loaders'
import {
  LoadAssetContainerAsync,
  TransformNode,
  AbstractMesh,
  Vector3,
  MeshBuilder,
  Axis,
  Space,
  Scene,
  Mesh,
  Observer,
  
  PhysicsBody,
  PhysicsMotionType,
  Physics6DoFConstraint,
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
  PhysicsAggregate,
  PhysicsShapeType,
} from '@babylonjs/core'

interface PlayerCarProps {
  scene: Scene
  onCarRootReady?: (node: TransformNode) => void
  mobileInput?: Record<string, boolean>
}

const FILTERS = {
  CarParts: 1,
  Environment: 2,
}

const PlayerCar: React.FC<PlayerCarProps> = ({ scene, onCarRootReady, mobileInput = {} }) => {
  const inputMap = useRef<Record<string, boolean>>({})
  const mobileInputRef = useRef<Record<string, boolean>>(mobileInput)
  const carRootRef = useRef<TransformNode | null>(null)
  const pivotRefs = useRef<TransformNode[]>([])
  const wheelsRef = useRef<AbstractMesh[]>([])
  const steerRefs = useRef<Physics6DoFConstraint[]>([])
  const motorRefs = useRef<Physics6DoFConstraint[]>([])
  const physicsBoxRef = useRef<Mesh | null>(null)

  useEffect(() => {
    mobileInputRef.current = mobileInput
  }, [mobileInput])

  useEffect(() => {
    if (!scene) return

    const onKeyDown = (e: KeyboardEvent) => { inputMap.current[e.key.toLowerCase()] = true }
    const onKeyUp   = (e: KeyboardEvent) => { inputMap.current[e.key.toLowerCase()] = false }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    let onBefore: Observer<Scene> | null = null

    const init = async () => {
      // Physics plugin already configured in App.tsx
      const phys = scene.getPhysicsEngine()
      if (phys) {
        phys.setTimeStep(1 / 500)
        phys.setSubTimeStep(4.5)
      }

      // *** Add ground and walls for collisions ***
      const ground = MeshBuilder.CreateGround('ground', { width: 500, height: 500 }, scene)
      ground.position.y = 0
      const groundAgg = new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0, restitution: 0.1, friction: 1 }, scene)
      if (groundAgg.body.shape) {
        groundAgg.body.shape.filterMembershipMask = FILTERS.Environment
        groundAgg.body.shape.filterCollideMask    = FILTERS.CarParts
      }

      const wallA = MeshBuilder.CreateBox('wallA', { height: 20, width: 500, depth: 1 }, scene)
      wallA.position = new Vector3(0, 10, 250)
      const wallAAgg = new PhysicsAggregate(wallA, PhysicsShapeType.BOX, { mass: 0, restitution: 0.1, friction: 1 }, scene)
      if (wallAAgg.body.shape) {
        wallAAgg.body.shape.filterMembershipMask = FILTERS.Environment
        wallAAgg.body.shape.filterCollideMask    = FILTERS.CarParts
      }

      const wallB = MeshBuilder.CreateBox('wallB', { height: 20, width: 500, depth: 1 }, scene)
      wallB.position = new Vector3(0, 10, -250)
      const wallBAgg = new PhysicsAggregate(wallB, PhysicsShapeType.BOX, { mass: 0, restitution: 0.1, friction: 1 }, scene)
      if (wallBAgg.body.shape) {
        wallBAgg.body.shape.filterMembershipMask = FILTERS.Environment
        wallBAgg.body.shape.filterCollideMask    = FILTERS.CarParts
      }

      const wallC = MeshBuilder.CreateBox('wallC', { height: 20, width: 1, depth: 500 }, scene)
      wallC.position = new Vector3(250, 10, 0)
      const wallCAgg = new PhysicsAggregate(wallC, PhysicsShapeType.BOX, { mass: 0, restitution: 0.1, friction: 1 }, scene)
      if (wallCAgg.body.shape) {
        wallCAgg.body.shape.filterMembershipMask = FILTERS.Environment
        wallCAgg.body.shape.filterCollideMask    = FILTERS.CarParts
      }

      const wallD = MeshBuilder.CreateBox('wallD', { height: 20, width: 1, depth: 500 }, scene)
      wallD.position = new Vector3(-250, 10, 0)
      const wallDAgg = new PhysicsAggregate(wallD, PhysicsShapeType.BOX, { mass: 0, restitution: 0.1, friction: 1 }, scene)
      if (wallDAgg.body.shape) {
        wallDAgg.body.shape.filterMembershipMask = FILTERS.Environment
        wallDAgg.body.shape.filterCollideMask    = FILTERS.CarParts
      }

      // Load GLB model
      const container = await LoadAssetContainerAsync(
        '/vehicular-assault/assets/models/steerable_car4.glb',
        scene
      )
      container.addAllToScene()
            // find the car's root TransformNode
      const rootTransforms = container.rootNodes.filter((n): n is TransformNode => n instanceof TransformNode)
      const carRoot = rootTransforms.length > 0 ? rootTransforms[0] : null

            if (!carRoot) {
        console.error('PlayerCar: no car root found in GLB rootNodes')
        return
      }
      carRoot.name = 'carRoot'
      carRootRef.current = carRoot
      onCarRootReady?.(carRoot)

      // Identify wheels and create pivots
      const allMeshes = container.meshes.filter(
        (m): m is AbstractMesh => m instanceof AbstractMesh
      )
      const wheels = allMeshes.filter((w) => /wheel/i.test(w.name))
      wheelsRef.current = wheels

      wheels.filter((w) => w.position.z < 0).forEach((w) => {
        const pivot = new TransformNode(`${w.name}_pivot`, scene)
        pivot.parent = carRoot
        pivot.position.copyFrom(w.position)
        w.parent = pivot
        w.position.setAll(0)
        pivotRefs.current.push(pivot)
      })

      wheels.filter((w) => w.position.z >= 0).forEach((w) => {
        w.parent = carRoot
        w.position = w.position.clone()
      })

      // Setup invisible physics root box
      const physicsBox = MeshBuilder.CreateBox(
        'carPhysicsBox',
        { width: 4, height: 1.5, depth: 6 },
        scene
      )
      physicsBox.isVisible = false
      physicsBox.position = new Vector3(0, 0.5, 0) // lower the physics box to avoid initial ground intersection
      physicsBoxRef.current = physicsBox
      // parent the visual car model under the physics box
      if (carRootRef.current) {
        carRootRef.current.parent = physicsBox
      }

      const rootBody = new PhysicsBody(
        physicsBox,
        PhysicsMotionType.DYNAMIC,
        false,
        scene
      )
      rootBody.setMassProperties({ mass: 800 })
      // add damping to stabilize
      rootBody.setLinearDamping(0.3)
      rootBody.setAngularDamping(0.3)
      if (rootBody.shape) {
        rootBody.shape.filterMembershipMask = FILTERS.CarParts
        rootBody.shape.filterCollideMask    = FILTERS.Environment
      }


      // Create axles, wheels, and constraints
      wheels.forEach((wheel, i) => {
        // Axle
        const axle = MeshBuilder.CreateBox(
          `axle_${i}`,
          { width: 2.5, height: 1, depth: 1 },
          scene
        )
        axle.isVisible = false
        axle.position = wheel.getAbsolutePosition()
        const axleBody = new PhysicsBody(
          axle,
          PhysicsMotionType.DYNAMIC,
          false,
          scene
        )
        axleBody.setMassProperties({ mass: 100 })
        if (axleBody.shape) {
          axleBody.shape.filterMembershipMask = FILTERS.CarParts
          axleBody.shape.filterCollideMask    = FILTERS.Environment
        }

        // Wheel body
        const wheelBody = new PhysicsBody(
          wheel,
          PhysicsMotionType.DYNAMIC,
          false,
          scene
        )
        wheelBody.setMassProperties({ mass: 100 })
        if (wheelBody.shape) {
          wheelBody.shape.filterMembershipMask = FILTERS.CarParts
          wheelBody.shape.filterCollideMask    = FILTERS.Environment
        }

        // Suspension + steering constraint
        const suspension = new Physics6DoFConstraint(
          { pivotA: new Vector3(0, 0, 0), pivotB: axle.position.clone() },
          [
            { axis: PhysicsConstraintAxis.LINEAR_X, minLimit: 0, maxLimit: 0 },
            { axis: PhysicsConstraintAxis.LINEAR_Y, minLimit: -0.15, maxLimit: 0.15, stiffness: 100000, damping: 5000 },
            { axis: PhysicsConstraintAxis.LINEAR_Z, minLimit: 0, maxLimit: 0 },
            { axis: PhysicsConstraintAxis.ANGULAR_X, minLimit: -0.25, maxLimit: 0.25 },
            { axis: PhysicsConstraintAxis.ANGULAR_Y, minLimit: i < 2 ? undefined : 0, maxLimit: i < 2 ? undefined : 0 },
            { axis: PhysicsConstraintAxis.ANGULAR_Z, minLimit: -0.05, maxLimit: 0.05 },
          ],
          scene
        )
        rootBody.addConstraint(axleBody, suspension)

        if (i < 2) {
          suspension.setAxisMotorType(
            PhysicsConstraintAxis.ANGULAR_Y,
            PhysicsConstraintMotorType.POSITION
          )
          suspension.setAxisMotorMaxForce(
            PhysicsConstraintAxis.ANGULAR_Y,
            3e7
          )
          suspension.setAxisMotorTarget(
            PhysicsConstraintAxis.ANGULAR_Y,
            0
          )
          steerRefs.current[i] = suspension
        }

        // Wheel joint
        const wheelJoint = new Physics6DoFConstraint(
          {},
          [
            { axis: PhysicsConstraintAxis.LINEAR_DISTANCE, minLimit: 0, maxLimit: 0 },
            { axis: PhysicsConstraintAxis.ANGULAR_Y, minLimit: 0, maxLimit: 0 },
            { axis: PhysicsConstraintAxis.ANGULAR_Z, minLimit: 0, maxLimit: 0 },
          ],
          scene
        )
        axleBody.addConstraint(wheelBody, wheelJoint)

        if (i < 2) {
          wheelJoint.setAxisMotorType(
            PhysicsConstraintAxis.ANGULAR_X,
            PhysicsConstraintMotorType.VELOCITY
          )
          wheelJoint.setAxisMotorMaxForce(
            PhysicsConstraintAxis.ANGULAR_X,
            180000
          )
          wheelJoint.setAxisMotorTarget(
            PhysicsConstraintAxis.ANGULAR_X,
            0
          )
          motorRefs.current[i] = wheelJoint
        }
      })

      // Per-frame input → motors & visuals
      onBefore = scene.onBeforeRenderObservable.add(() => {
        const dt = scene.getEngine().getDeltaTime() / 1000
        const inp = { ...inputMap.current, ...mobileInputRef.current }
        const carRoot = carRootRef.current
        const box = physicsBoxRef.current
        if (!carRoot || !box) return

        let steer = 0
        if (inp['a']) steer -= 0.5 * dt
        else if (inp['d']) steer += 0.5 * dt
        else steer *= 0.9
        steer = Math.max(-Math.PI / 6, Math.min(Math.PI / 6, steer))
        pivotRefs.current.forEach((p) => (p.rotation.y = -steer))
        steerRefs.current.forEach((j) => j && j.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_Y, steer))

        let speed = 0
        if (inp['w']) speed += 10 * dt
        else if (inp['s']) speed -= 10 * dt
        else speed *= 0.98
        speed = Math.max(-10, Math.min(20, speed))
        motorRefs.current.forEach((j) => j && j.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, speed))

        carRoot.position.copyFrom(box.position)
        if (box.rotationQuaternion) {
          carRoot.rotationQuaternion = box.rotationQuaternion.clone()
        }

        const rollDelta = (speed * dt) / 2
        wheelsRef.current.forEach((w) => w.rotate(Axis.X, rollDelta, Space.LOCAL))
      })
    }

    init()

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      if (onBefore) scene.onBeforeRenderObservable.remove(onBefore)
    }
  }, [scene, onCarRootReady])

  return null
}

export default PlayerCar
