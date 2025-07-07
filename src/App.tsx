import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Engine, Scene } from 'react-babylonjs'
import {
  ArcRotateCamera,
  UniversalCamera,
  Vector3,
  Color3,
  Color4,
  Scene as BabylonScene,
  StandardMaterial
} from '@babylonjs/core'

import { HavokPlugin } from '@babylonjs/core/Physics/v2'
import HavokPhysics from '@babylonjs/havok'
import PlayerCar from './components/PlayerCar'

const App: React.FC = () => {
  const [scene, setScene] = useState<BabylonScene | null>(null)
  const [physicsReady, setPhysicsReady] = useState(false)
  const [activeCamera, setActiveCamera] = useState<'orbit' | 'free'>('orbit')
  const [carPosition, setCarPosition] = useState(new Vector3(0, 2, 0))
  const orbitCameraRef = useRef<ArcRotateCamera | null>(null)
  const freeCameraRef = useRef<UniversalCamera | null>(null)

  // Enable keyboard toggle for camera
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'c') {
        setActiveCamera(prev => (prev === 'orbit' ? 'free' : 'orbit'))
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const onSceneReady = useCallback(async (scene: BabylonScene) => {
    console.log('✅ Scene ready')
    setScene(scene)
    scene.clearColor = new Color4(0.05, 0.05, 0.05, 1)

    console.log('✅ Loading Havok WASM...')
    const havok = await HavokPhysics()
    const plugin = new HavokPlugin(true, havok)
    scene.enablePhysics(new Vector3(0, -9.81, 0), plugin)
    console.log('✅ Physics enabled with Havok')
    setPhysicsReady(true)
  }, [])

  // Camera switching
  useEffect(() => {
    if (!scene) return
    if (activeCamera === 'orbit' && orbitCameraRef.current) {
      scene.activeCamera = orbitCameraRef.current
      orbitCameraRef.current.attachControl(true)
      freeCameraRef.current?.detachControl()
      orbitCameraRef.current.setTarget(carPosition)
    }
    if (activeCamera === 'free' && freeCameraRef.current) {
      scene.activeCamera = freeCameraRef.current
      freeCameraRef.current.attachControl(true)
      orbitCameraRef.current?.detachControl()
      freeCameraRef.current.setTarget(new Vector3(0, 0, 0))
    }
  }, [scene, activeCamera, carPosition])

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <Link
        to="/customize"
        style={{
          position: 'absolute', top: 10, left: 10,
          backgroundColor: '#222', color: '#fff', padding: '10px 20px',
          textDecoration: 'none', borderRadius: '5px', zIndex: 999
        }}
      >
        Customize
      </Link>
      <Link
        to="/vfx"
        style={{
          position: 'absolute', top: 70, left: 10,
          backgroundColor: '#222', color: '#fff', padding: '10px 20px',
          textDecoration: 'none', borderRadius: '5px', zIndex: 999
        }}
      >
        VFX
      </Link>
      <button
        onClick={() => setActiveCamera(prev => (prev === 'orbit' ? 'free' : 'orbit'))}
        style={{
          position: 'absolute', top: 10, right: 10,
          zIndex: 999, padding: '10px 20px',
          backgroundColor: '#222', color: '#fff',
          border: 'none', borderRadius: '5px', cursor: 'pointer'
        }}
      >
        Switch Camera
      </button>
      <Engine antialias adaptToDeviceRatio canvasId="babylon-canvas">
        <Scene onCreated={onSceneReady}>
          <arcRotateCamera
            name="ArcCamera"
            alpha={Math.PI / 4}
            beta={Math.PI / 3}
            radius={40}
            lowerBetaLimit={0.01}
            upperBetaLimit={Math.PI / 2.1}
            target={carPosition}
            minZ={0.1}
            wheelPrecision={50}
            onCreated={camera => orbitCameraRef.current = camera}
          />
          <universalCamera
            name="UniversalCamera"
            position={new Vector3(49, 40, 49)}
            minZ={0.1}
            speed={3}
            onCreated={camera => freeCameraRef.current = camera}
          />
          <directionalLight
            name="DirectionalLight"
            direction={new Vector3(-1, -2, -1)}
            intensity={0.7}
          />
          <hemisphericLight
            name="AmbientLight"
            intensity={0.2}
            direction={Vector3.Up()}
            groundColor={new Color3(0.1, 0.1, 0.1)}
            diffuse={new Color3(0.9, 0.9, 0.9)}
            specular={new Color3(0, 0, 0)}
          />
          <ground
            name="Ground"
            width={200}
            height={200}
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
          {physicsReady && (
            <PlayerCar
              position={carPosition}
              scale={new Vector3(1, 1, 1)}
              onPositionUpdate={setCarPosition}
            />
          )}
        </Scene>
      </Engine>
    </div>
  )
}

export default App
