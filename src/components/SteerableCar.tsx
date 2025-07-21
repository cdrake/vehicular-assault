import React, { useEffect, useRef } from 'react'
import '@babylonjs/loaders'
import {
  LoadAssetContainerAsync,
  AssetContainer,
  TransformNode,
  AbstractMesh,
  Scene,
  Vector3,
} from '@babylonjs/core'

interface SteerableCarProps {
  scene: Scene
  onCarRootReady?: (node: TransformNode) => void
  mobileInput?: Record<string, boolean>
}

/**
 * SteerableCar loads a steerable car from a GLB file, sets up wheel pivots,
 * and exposes the car's root TransformNode via onCarRootReady.
 */
const SteerableCar: React.FC<SteerableCarProps> = ({ scene, onCarRootReady }) => {
  const carRootRef = useRef<TransformNode | null>(null)
  const pivotRefs = useRef<TransformNode[]>([])
  const wheelsRef = useRef<AbstractMesh[]>([])

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

        // Find the first TransformNode as the car root
        const rootNode = container.rootNodes.find(
          n => n instanceof TransformNode
        ) as TransformNode | undefined
        if (!rootNode) {
          console.error('SteerableCar: root TransformNode not found')
          return
        }

        // Lift the car slightly to avoid ground intersection
        rootNode.position.y += 0.5
        carRootRef.current = rootNode
        onCarRootReady?.(rootNode)

        // Gather wheels (meshes with "wheel" in name)
        const allMeshes = container.meshes.filter(
          m => m instanceof AbstractMesh
        ) as AbstractMesh[]
        const wheels = allMeshes.filter(w => /wheel/i.test(w.name))
        wheelsRef.current = wheels

        // Position each wheel using its world coordinate before re-parenting
        wheels.forEach(w => {
          const worldPos = w.getAbsolutePosition()
          const pivot = new TransformNode(`${w.name}_pivot`, scene)
          pivot.parent = rootNode
          pivot.position.copyFrom(worldPos)

          w.parent = pivot
          w.position.setAll(0)

          // Mark front wheels for steering
          if (/front|fl|fr/i.test(w.name)) {
            pivotRefs.current.push(pivot)
          }
        })
      })
      .catch(err => console.error('SteerableCar load error', err))

    return () => {
      if (container) {
        container.removeAllFromScene()
      }
    }
  }, [scene, onCarRootReady])

  return null
}

export default SteerableCar
