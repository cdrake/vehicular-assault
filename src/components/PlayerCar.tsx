import React, { useRef, useEffect } from 'react'
import { Vector3, ActionManager, ExecuteCodeAction } from '@babylonjs/core'
import { Model, useBeforeRender, useScene } from 'react-babylonjs'
import { AbstractMesh } from '@babylonjs/core'
import '@babylonjs/loaders/glTF/2.0/glTFLoader'

interface PlayerCarProps {
  position: Vector3
  scale: Vector3
  onPositionUpdate?: (pos: Vector3) => void
}

const PlayerCar: React.FC<PlayerCarProps> = ({ position, scale, onPositionUpdate }) => {
  const carMeshRef = useRef<AbstractMesh | null>(null)
  const scene = useScene()
  const inputMap = useRef<{ [key: string]: boolean }>({})

  // Register key listeners on the scene
  useEffect(() => {
    if (!scene) return

    // Make sure there's an ActionManager
    if (!scene.actionManager) {
      scene.actionManager = new ActionManager(scene)
    }

    scene.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnKeyDownTrigger, evt => {
      inputMap.current[evt.sourceEvent.key.toLowerCase()] = true
    }))

    scene.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnKeyUpTrigger, evt => {
      inputMap.current[evt.sourceEvent.key.toLowerCase()] = false
    }))
  }, [scene])

  // Movement loop
  useBeforeRender(() => {
    const car = carMeshRef.current
    if (!car) return

    const speed = 0.4
    const rotationSpeed = 0.04

    // Rotate
    if (inputMap.current['a'] || inputMap.current['arrowleft']) {
      car.rotation.y -= rotationSpeed
    }
    if (inputMap.current['d'] || inputMap.current['arrowright']) {
      car.rotation.y += rotationSpeed
    }

    // Move forward/backward
    if (inputMap.current['w'] || inputMap.current['arrowup']) {
      car.position.x += Math.sin(car.rotation.y) * speed
      car.position.z += Math.cos(car.rotation.y) * speed
    }
    if (inputMap.current['s'] || inputMap.current['arrowdown']) {
      car.position.x -= Math.sin(car.rotation.y) * speed
      car.position.z -= Math.cos(car.rotation.y) * speed
    }

    // Keep on the ground plane
    car.position.y = position.y

    // Notify parent so orbit camera follows
    if (onPositionUpdate) {
      onPositionUpdate(car.position.clone())
    }
  })

  return (
    <Model
      name='player-car'
      rootUrl='/vehicular-assault/assets/models/'
      sceneFilename='player_car.glb'
      position={position}
      scaling={scale}
      onCreated={(rootMesh) => {
        carMeshRef.current = rootMesh
        // Optional: initialize rotation
        rootMesh.rotation = new Vector3(0, 0, 0)
      }}
    />
  )
}

export default PlayerCar
