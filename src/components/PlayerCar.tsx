import React, { useEffect, useRef } from 'react'
import { useScene } from 'react-babylonjs'
import {
  LoadAssetContainerAsync,
  TransformNode,
  AbstractMesh,
  Axis,
  Space,
  Vector3,
  ActionManager,
  ExecuteCodeAction
} from '@babylonjs/core'

interface PlayerCarProps {
  onCarRootReady?: (node: TransformNode) => void
  mobileInput?: Record<string, boolean>
}

const PlayerCar: React.FC<PlayerCarProps> = ({ onCarRootReady, mobileInput = {} }) => {
  const scene = useScene()

  const inputMap = useRef<Record<string, boolean>>({})
  const mobileInputRef = useRef<Record<string, boolean>>(mobileInput)
  const carRootRef = useRef<TransformNode | null>(null)
  const frontPivotsRef = useRef<TransformNode[]>([])
  const wheelsRef = useRef<AbstractMesh[]>([])
  const speedRef = useRef(0)
  const steeringRef = useRef(0)

  // Keep mobile input in sync
  useEffect(() => {
    mobileInputRef.current = mobileInput
  }, [mobileInput])

  /**
   * ONE-TIME LOADER for car model
   */
  useEffect(() => {
    if (!scene) return
    if (carRootRef.current) return

    // Setup keyboard input manager
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

    // Load the GLB
    console.log('🚀 Loading car model...')
    LoadAssetContainerAsync('/vehicular-assault/assets/models/steerable_car4.glb', scene)
      .then(container => {
        container.addAllToScene()

        // Find carRoot node
        const carRoot = container.meshes.find(m => m instanceof TransformNode) as TransformNode
        if (!carRoot) {
          console.error('❌ No root node found in GLB')
          return
        }

        carRoot.name = 'carRoot'
        carRoot.position.y += 1
        carRootRef.current = carRoot
        onCarRootReady?.(carRoot)

        // --- Setup wheels and steering pivots ---
        const allMeshes = container.meshes.filter(m => m instanceof AbstractMesh) as AbstractMesh[]
        const wheels = allMeshes.filter(m => m.name.toLowerCase().includes('wheel'))
        wheelsRef.current = wheels

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
        })

        rearWheels.forEach(wheel => {
          wheel.parent = carRoot
          wheel.position = wheel.position.clone()
        })

        console.log('✅ Car model loaded and set up.')
      })
      .catch(err => {
        console.error('❌ Failed to load car model:', err)
      })

    return () => {
      console.log('🧹 Cleaning up PlayerCar effect')
      scene?.onBeforeRenderObservable.clear()
    }
  }, [scene, onCarRootReady])

  /**
   * SEPARATE EFFECT for animation and input
   */
  useEffect(() => {
    if (!scene) return

    const observer = scene.onBeforeRenderObservable.add(() => {
      if (!carRootRef.current) return
      const dt = scene.getEngine().getDeltaTime() / 1000

      // Merge input sources
      const activeInput: Record<string, boolean> = {
        ...inputMap.current,
        ...mobileInputRef.current
      }

      // Steering
      if (activeInput['d']) {
        steeringRef.current += 0.5 * dt
      } else if (activeInput['a']) {
        steeringRef.current -= 0.5 * dt
      } else {
        steeringRef.current *= 0.9
      }
      steeringRef.current = Math.max(-Math.PI / 6, Math.min(Math.PI / 6, steeringRef.current))

      frontPivotsRef.current.forEach(pivot => {
        pivot.rotation.y = -steeringRef.current
      })

      // Throttle/brake
      if (activeInput['w']) {
        speedRef.current += 10 * dt
      }
      if (activeInput['s']) {
        speedRef.current -= 10 * dt
      }
      if (!activeInput['w'] && !activeInput['s']) {
        speedRef.current *= 0.98
      }
      speedRef.current = Math.max(-10, Math.min(20, speedRef.current))

      // Move carRoot
      const distance = speedRef.current * dt
      if (Math.abs(distance) > 0.001) {
        carRootRef.current.translate(Axis.Z, -distance, Space.LOCAL)
        carRootRef.current.rotate(Axis.Y, steeringRef.current * distance * 0.1, Space.LOCAL)
      }

      // Roll wheels
      const rollDelta = speedRef.current * dt / 2
      wheelsRef.current.forEach(wheel => {
        wheel.rotate(Axis.X, rollDelta, Space.LOCAL)
      })
    })

    return () => {
      scene.onBeforeRenderObservable.remove(observer)
    }
  }, [scene])

  return null
}

export default PlayerCar
