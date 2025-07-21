import React, { useEffect, useRef } from 'react'
import '@babylonjs/loaders'
import {
  LoadAssetContainerAsync,
  AssetContainer,
  TransformNode,
  AbstractMesh,
  Scene,
  MeshBuilder,
  Vector3,
  PhysicsAggregate,
  PhysicsShapeType,
  Physics6DoFConstraint,
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
} from '@babylonjs/core'

interface SteerableCarProps {
  scene: Scene
  onCarRootReady?: (node: TransformNode) => void
  mobileInput?: Record<string, boolean>
}

/**
 * SteerableCar loads a steerable car from a GLB, sets up wheel pivots,
 * adds Havok physics bodies and 6DoF joints for suspension & steering,
 * and exposes the car's root TransformNode via onCarRootReady.
 */
const SteerableCar: React.FC<SteerableCarProps> = ({ scene, onCarRootReady }) => {
  const carRootRef = useRef<TransformNode | null>(null)
  const pivotRefs = useRef<TransformNode[]>([])
  const wheelAggRefs = useRef<PhysicsAggregate[]>([])

  useEffect(() => {
    if (!scene) return
    let container: AssetContainer

    LoadAssetContainerAsync(
      '/vehicular-assault/assets/models/steerable_car4.glb',
      scene
    )
      .then(c => {
        container = c
        container.addAllToScene()

        

        // Find root and raise it
        const rootNode = container.rootNodes.find(
          n => n instanceof TransformNode
        ) as TransformNode | undefined
        if (!rootNode) {
          console.error('SteerableCar: root TransformNode not found')
          return
        }
        rootNode.position.y += 0.3  // adjust overall car height closer to ground  // lower the whole car slightly  // lift chassis a bit more
        carRootRef.current = rootNode
        onCarRootReady?.(rootNode)

        // Physics: create invisible box collider for car root
        const rootBox = MeshBuilder.CreateBox(
          'carRootCollider',
          { width: 4, height: 1.5, depth: 6 },
          scene
        )
        rootBox.isVisible = false
        // position rootBox at the car's world position
        const rootWP = rootNode.getAbsolutePosition()
        rootBox.position.copyFrom(rootWP)
        // parent car model under the box and reset its local position
        rootNode.parent = rootBox
        rootNode.position.setAll(0)
        const carAgg = new PhysicsAggregate(
          rootBox,
          PhysicsShapeType.BOX,
          { mass: 800, restitution: 0.1, friction: 0.8 },
          scene
        )
        carAgg.body.setLinearDamping(0.2)
        carAgg.body.setAngularDamping(0.2)

        // Gather wheel meshes and create wheel physics bodies
        const meshes = container.meshes.filter(m => m instanceof AbstractMesh) as AbstractMesh[]
        const wheels = meshes.filter(w => /wheel/i.test(w.name))

        wheels.forEach(w => {
          // world position before parenting
          const wp = w.getAbsolutePosition()
          // compute local pivot position relative to rootBox
          const localWP = wp.subtract(rootBox.position)

          const pivot = new TransformNode(`${w.name}_pivot`, scene)
          pivot.parent = rootBox
          // set pivot local to localWP and adjust for car lift
          pivot.position.copyFrom(localWP)
          pivot.position.y += 0.18  // adjust wheel height closer to ground  // raise wheels up under chassis  // raise chassis further from wheels

          // reparent wheel under pivot at its origin
          w.parent = pivot
          w.position.setAll(0)

          // physics body for wheel
          const wheelAgg = new PhysicsAggregate(
            w,
            PhysicsShapeType.CYLINDER,
            { mass: 50, restitution: 0.1, friction: 1 },
            scene
          )
          wheelAggRefs.current.push(wheelAgg)

          // constraint between root and wheel for suspension
          const constraint = new Physics6DoFConstraint(
            { pivotA: pivot.position.clone(), pivotB: Vector3.Zero() },
            [
              { axis: PhysicsConstraintAxis.LINEAR_Y, minLimit: -0.15, maxLimit: 0.15, stiffness: 100000, damping: 5000 },
              { axis: PhysicsConstraintAxis.LINEAR_X, minLimit: 0, maxLimit: 0 },
              { axis: PhysicsConstraintAxis.LINEAR_Z, minLimit: 0, maxLimit: 0 },
              { axis: PhysicsConstraintAxis.ANGULAR_X, minLimit: -0.25, maxLimit: 0.25 },
              { axis: PhysicsConstraintAxis.ANGULAR_Y, minLimit: /fr|fl/.test(w.name) ? -0.5 : 0, maxLimit: /fr|fl/.test(w.name) ? 0.5 : 0 },
              { axis: PhysicsConstraintAxis.ANGULAR_Z, minLimit: -0.05, maxLimit: 0.05 },
            ],
            scene
          )
          carAgg.body.addConstraint(wheelAgg.body, constraint)

          // front wheels: enable steering motor
          if (/front|fl|fr/i.test(w.name)) {
            pivotRefs.current.push(pivot)
            constraint.setAxisMotorType(
              PhysicsConstraintAxis.ANGULAR_Y,
              PhysicsConstraintMotorType.POSITION
            )
            constraint.setAxisMotorMaxForce(
              PhysicsConstraintAxis.ANGULAR_Y,
              2e7
            )
            constraint.setAxisMotorTarget(
              PhysicsConstraintAxis.ANGULAR_Y,
              0
            )

            // also store for speed motor
            constraint.setAxisMotorType(
              PhysicsConstraintAxis.ANGULAR_X,
              PhysicsConstraintMotorType.VELOCITY
            )
            constraint.setAxisMotorMaxForce(
              PhysicsConstraintAxis.ANGULAR_X,
              1.8e5
            )
            constraint.setAxisMotorTarget(
              PhysicsConstraintAxis.ANGULAR_X,
              0
            )
          }
        })

        // all pivots and constraints ready
      })
      .catch(err => console.error('SteerableCar load error', err))

    return () => {
      if (container) container.removeAllFromScene()
    }
  }, [scene, onCarRootReady])

  return null
}

export default SteerableCar
