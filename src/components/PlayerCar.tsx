import React, { useEffect, useRef } from 'react'
import { useScene } from 'react-babylonjs'
import {
  ActionManager,
  Axis,
  Color3,
  ExecuteCodeAction,
  MeshBuilder,
  Space,
  StandardMaterial,
  TransformNode,
  Vector3
} from '@babylonjs/core'

interface PlayerCarProps {
  onCarRootReady?: (node: TransformNode) => void
}

const PlayerCar: React.FC<PlayerCarProps> = ({ onCarRootReady }) => {
  const scene = useScene()
  const inputMap = useRef<Record<string, boolean>>({})

  useEffect(() => {
    if (!scene) return

    console.log('✅ PlayerCar: Creating car meshes in scene.')

    // === PARAMETERS ===
    const chassisLength = 20
    const chassisWidth = 8
    const chassisHeight = 2
    const wheelRadius = 2
    const wheelWidth = 1
    const wheelXOffset = chassisWidth * 0.5 + 0.1
    const wheelZOffset = chassisLength * 0.3

    // === ROOT NODE ===
    const carRoot = new TransformNode('carRoot', scene)
    carRoot.position.y = wheelRadius + chassisHeight / 2 + 0.05
    onCarRootReady?.(carRoot)

    // === MATERIALS ===
    const bodyMat = new StandardMaterial('bodyMat', scene)
    bodyMat.diffuseColor = new Color3(0.1, 0.1, 0.8)

    const wheelMat = new StandardMaterial('wheelMat', scene)
    wheelMat.diffuseColor = new Color3(0, 0, 0)

    // === CHASSIS ===
    const chassis = MeshBuilder.CreateBox('chassis', {
      width: chassisWidth,
      height: chassisHeight,
      depth: chassisLength
    }, scene)
    chassis.material = bodyMat
    chassis.parent = carRoot

    // === HELPER FUNCTIONS ===
    const createSteeringWheel = (name: string, x: number, z: number) => {
      const pivot = new TransformNode(`${name}_pivot`, scene)
      pivot.parent = carRoot
      pivot.position = new Vector3(x, -chassisHeight / 2, z)

      const wheel = MeshBuilder.CreateCylinder(`${name}_mesh`, {
        diameter: wheelRadius * 2,
        height: wheelWidth,
        tessellation: 24
      }, scene)
      wheel.material = wheelMat

      wheel.rotate(Axis.Z, Math.PI / 2, Space.LOCAL)
      wheel.bakeCurrentTransformIntoVertices()
      wheel.parent = pivot
      return { pivot, wheel }
    }

    const createFixedWheel = (name: string, x: number, z: number) => {
      const wheel = MeshBuilder.CreateCylinder(name, {
        diameter: wheelRadius * 2,
        height: wheelWidth,
        tessellation: 24
      }, scene)
      wheel.material = wheelMat

      wheel.rotate(Axis.Z, Math.PI / 2, Space.LOCAL)
      wheel.bakeCurrentTransformIntoVertices()
      wheel.parent = carRoot
      wheel.position = new Vector3(x, -chassisHeight / 2, z)
      return wheel
    }

    // === FRONT WHEELS WITH PIVOTS ===
    const { pivot: pivotFL, wheel: wheelFL } = createSteeringWheel('wheelFL', -wheelXOffset, -wheelZOffset)
    const { pivot: pivotFR, wheel: wheelFR } = createSteeringWheel('wheelFR', wheelXOffset, -wheelZOffset)

    // === REAR WHEELS ===
    const wheelRL = createFixedWheel('wheelRL', -wheelXOffset, wheelZOffset)
    const wheelRR = createFixedWheel('wheelRR', wheelXOffset, wheelZOffset)

    // === INPUT ===
    scene.actionManager = new ActionManager(scene)
    scene.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnKeyDownTrigger, evt => {
      inputMap.current[evt.sourceEvent.key.toLowerCase()] = true
    }))
    scene.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnKeyUpTrigger, evt => {
      inputMap.current[evt.sourceEvent.key.toLowerCase()] = false
    }))

    // === ANIMATION STATE ===
    let steeringAngle = 0
    let speed = 0

    // === ANIMATION LOOP ===
    scene.onBeforeRenderObservable.add(() => {
      const deltaTime = scene.getEngine().getDeltaTime() / 1000

      // Steering control
      if (inputMap.current['d']) {
        steeringAngle += 0.5 * deltaTime
        steeringAngle = Math.min(steeringAngle, Math.PI / 6)
      } else if (inputMap.current['a']) {
        steeringAngle -= 0.5 * deltaTime
        steeringAngle = Math.max(steeringAngle, -Math.PI / 6)
      } else {
        // Auto-centering
        if (steeringAngle > 0) steeringAngle = Math.max(0, steeringAngle - 1.5 * deltaTime)
        else if (steeringAngle < 0) steeringAngle = Math.min(0, steeringAngle + 1.5 * deltaTime)
      }

      pivotFL.rotation.y = steeringAngle
      pivotFR.rotation.y = steeringAngle

      // Throttle/brake with reverse
      if (inputMap.current['w']) {
        speed += 10 * deltaTime
      } else if (inputMap.current['s']) {
        speed -= 10 * deltaTime
      } else {
        speed *= 0.98
      }

      // Clamp speed
      const MAX_SPEED = 20
      if (speed > MAX_SPEED) speed = MAX_SPEED
      if (speed < -MAX_SPEED / 2) speed = -MAX_SPEED / 2

      // Roll wheels
      const rollDelta = speed * deltaTime / wheelRadius
      wheelFL.rotate(Axis.X, rollDelta, Space.LOCAL)
      wheelFR.rotate(Axis.X, rollDelta, Space.LOCAL)
      wheelRL.rotate(Axis.X, rollDelta, Space.LOCAL)
      wheelRR.rotate(Axis.X, rollDelta, Space.LOCAL)

      // Move carRoot in local Z, rotate for arc turning
      const distance = speed * deltaTime
      carRoot.translate(Axis.Z, -distance, Space.LOCAL)
      carRoot.rotate(Axis.Y, steeringAngle * distance * 0.1, Space.LOCAL)
    })

    return () => {
      scene.onBeforeRenderObservable.clear()
      carRoot.dispose()
    }
  }, [scene, onCarRootReady])

  return null
}

export default PlayerCar
