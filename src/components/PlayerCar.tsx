import React, { useEffect, useRef } from 'react'
import { useScene } from 'react-babylonjs'
import {
  LoadAssetContainerAsync,
  TransformNode,
  AbstractMesh,
  ActionManager,
  ExecuteCodeAction,
  Axis,
  Space,
  Vector3
} from '@babylonjs/core'

interface PlayerCarProps {
  onCarRootReady?: (node: TransformNode) => void
}

const PlayerCar: React.FC<PlayerCarProps> = ({ onCarRootReady }) => {
  const scene = useScene()

  const inputMap = useRef<Record<string, boolean>>({})
  const carRootRef = useRef<TransformNode | null>(null)
  const frontPivotsRef = useRef<TransformNode[]>([])
  const wheelsRef = useRef<AbstractMesh[]>([])
  const speedRef = useRef(0)
  const steeringRef = useRef(0)

  useEffect(() => {
    if (!scene) return

    // Input setup
    scene.actionManager ??= new ActionManager(scene)
    scene.actionManager.actions?.forEach(action => scene.actionManager?.unregisterAction(action))

    const downAction = new ExecuteCodeAction(ActionManager.OnKeyDownTrigger, evt => {
      inputMap.current[evt.sourceEvent.key.toLowerCase()] = true
    })
    const upAction = new ExecuteCodeAction(ActionManager.OnKeyUpTrigger, evt => {
      inputMap.current[evt.sourceEvent.key.toLowerCase()] = false
    })

    scene.actionManager.registerAction(downAction)
    scene.actionManager.registerAction(upAction)

    // Load GLB model
    console.log('🚀 Loading car model...')
    LoadAssetContainerAsync('/vehicular-assault/assets/models/steerable_car4.glb', scene)
      .then(container => {
        console.log('✅ Model loaded')
        scene.onBeforeRenderObservable.clear()

        // Add all to scene
        container.addAllToScene()

        // Find root node
        const carRoot = container.meshes.find(m => m instanceof TransformNode) as TransformNode
        if (!carRoot) {
          console.error('❌ No root node found in GLB')
          return
        }

        // Optionally rename for clarity
        carRoot.name = 'carRoot'
        carRootRef.current = carRoot
        onCarRootReady?.(carRoot)

        // Lift car above ground if needed
        carRoot.position.y += 1

        // Identify all wheels
        const allMeshes = container.meshes.filter(m => m instanceof AbstractMesh) as AbstractMesh[]
        const wheels = allMeshes.filter(m => m.name.toLowerCase().includes('wheel'))
        wheelsRef.current = wheels

        // --- Create steering pivots for front wheels ---
        // Identify front wheels (by z position)
        const frontWheels = wheels.filter(w => w.position.z < 0)
        const rearWheels = wheels.filter(w => w.position.z >= 0)

        frontPivotsRef.current = []

        frontWheels.forEach(wheel => {
          const pivot = new TransformNode(`${wheel.name}_pivot`, scene)
          pivot.parent = carRoot
          pivot.position = wheel.position.clone()

          wheel.parent = pivot
          wheel.position = Vector3.Zero()

          frontPivotsRef.current.push(pivot)

          console.log(`✅ Created steering pivot for ${wheel.name}`)
        })

        // Attach rear wheels directly
        rearWheels.forEach(wheel => {
          wheel.parent = carRoot
          // Maintain position relative to root
          wheel.position = wheel.position.clone()
        })

        // --- Animation Loop ---
        scene.onBeforeRenderObservable.add(() => {
          if (!carRootRef.current) return
          const dt = scene.getEngine().getDeltaTime() / 1000

          // Steering input
          if (inputMap.current['d']) {
            steeringRef.current += 0.5 * dt
          } else if (inputMap.current['a']) {
            steeringRef.current -= 0.5 * dt
          } else {
            steeringRef.current *= 0.9
          }
          steeringRef.current = Math.max(-Math.PI / 6, Math.min(Math.PI / 6, steeringRef.current))

          // Apply steering rotation to pivots
          frontPivotsRef.current.forEach(pivot => {
            pivot.rotation.y = -steeringRef.current
          })          

          // Throttle/brake/reverse
          if (inputMap.current['w']) {
            speedRef.current += 10 * dt
          }
          if (inputMap.current['s']) {
            speedRef.current -= 10 * dt
          }
          if (!inputMap.current['w'] && !inputMap.current['s']) {
            speedRef.current *= 0.98
          }
          speedRef.current = Math.max(-10, Math.min(20, speedRef.current))

          // Move carRoot forward in local Z, with turning
          const distance = speedRef.current * dt
          if (Math.abs(distance) > 0.001) {
            carRootRef.current.translate(Axis.Z, -distance, Space.LOCAL)
            carRootRef.current.rotate(Axis.Y, steeringRef.current * distance * 0.1, Space.LOCAL)
          }

          // Roll wheels along local X
          const rollDelta = speedRef.current * dt / 2
          wheelsRef.current.forEach(wheel => {
            wheel.rotate(Axis.X, rollDelta, Space.LOCAL)
          })
        })
      })
      .catch(err => {
        console.error('❌ Failed to load car model:', err)
      })

    return () => {
      scene?.onBeforeRenderObservable.clear()
    }
  }, [scene, onCarRootReady])

  return null
}

export default PlayerCar
