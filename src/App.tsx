import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArcRotateCamera,
  Color3,
  Color4,
  Scene,
  TransformNode,
  Vector3
} from '@babylonjs/core'
import PlayerCar from './components/PlayerCar'
import { Engine, Scene as SceneJSX } from 'react-babylonjs'

const App: React.FC = () => {
  const [scene, setScene] = useState<Scene | null>(null)
  const [carRoot, setCarRoot] = useState<TransformNode | null>(null)
  const cameraRef = useRef<ArcRotateCamera | null>(null)

  // Set up scene when created
  const onSceneReady = useCallback((sceneInstance: Scene) => {
    console.log('✅ Scene initialized.')
    setScene(sceneInstance)
    sceneInstance.clearColor = new Color4(0.05, 0.05, 0.05, 1)
  }, [])

  // Smooth follow camera
  useEffect(() => {
    if (!scene || !carRoot) return

    console.log('✅ Setting up follow camera')

    const camera = new ArcRotateCamera(
      'FollowCamera',
      Math.PI / 2,
      Math.PI / 3,
      30,
      carRoot.position.clone(),
      scene
    )
    camera.attachControl(true)
    camera.lowerBetaLimit = 0.1
    camera.upperBetaLimit = Math.PI / 2
    camera.wheelPrecision = 50
    scene.activeCamera = camera
    cameraRef.current = camera

    scene.onBeforeRenderObservable.add(() => {
      if (!cameraRef.current || !carRoot) return
      cameraRef.current.target = Vector3.Lerp(cameraRef.current.target, carRoot.position, 0.05)
    })

    return () => {
      camera.dispose()
    }
  }, [scene, carRoot])

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <Link to="/customize" style={{
        position: 'absolute', top: 10, left: 10,
        backgroundColor: '#222', color: '#fff',
        padding: '10px 20px', textDecoration: 'none',
        borderRadius: '5px', zIndex: 999
      }}>
        Customize
      </Link>
      <Link to="/vfx" style={{
        position: 'absolute', top: 70, left: 10,
        backgroundColor: '#222', color: '#fff',
        padding: '10px 20px', textDecoration: 'none',
        borderRadius: '5px', zIndex: 999
      }}>
        VFX
      </Link>

      <Engine antialias adaptToDeviceRatio canvasId="babylon-canvas">
        <SceneJSX onCreated={onSceneReady}>
          <hemisphericLight
            name="AmbientLight"
            intensity={0.3}
            direction={Vector3.Up()}
            groundColor={new Color3(0.1, 0.1, 0.1)}
            diffuse={new Color3(0.9, 0.9, 0.9)}
            specular={new Color3(0, 0, 0)}
          />
          <directionalLight
            name="DirectionalLight"
            direction={new Vector3(-1, -2, -1)}
            intensity={0.7}
          />

          <ground
            name="Ground"
            width={400}
            height={400}
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

          <PlayerCar onCarRootReady={setCarRoot} />
        </SceneJSX>
      </Engine>
    </div>
  )
}

export default App
