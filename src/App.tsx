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
import { AdvancedDynamicTexture, Button } from '@babylonjs/gui'
import PlayerCar from './components/PlayerCar'
import { Engine, Scene as SceneJSX } from 'react-babylonjs'

const App: React.FC = () => {
  const [scene, setScene] = useState<Scene | null>(null)
  const [carRoot, setCarRoot] = useState<TransformNode | null>(null)
  const cameraRef = useRef<ArcRotateCamera | null>(null)

  // Mobile inputs for controlling the car
  const [mobileInput, setMobileInput] = useState<Record<string, boolean>>({})

  // Scene setup
  const onSceneReady = useCallback((sceneInstance: Scene) => {
    console.log('✅ Scene initialized.')
    setScene(sceneInstance)
    sceneInstance.clearColor = new Color4(0.05, 0.05, 0.05, 1)
  }, [])

  // Follow camera
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

    const observer = scene.onBeforeRenderObservable.add(() => {
      if (!cameraRef.current || !carRoot) return
      cameraRef.current.target = Vector3.Lerp(cameraRef.current.target, carRoot.position, 0.05)
    })

    return () => {
      camera.dispose()
      scene.onBeforeRenderObservable.remove(observer)
    }
  }, [scene, carRoot])

  // Add GUI for mobile controls
  useEffect(() => {
    if (!scene) return

    const guiTexture = AdvancedDynamicTexture.CreateFullscreenUI('UI', true, scene)
    guiTexture.background = 'transparent'

    const buttonConfigs = [
      { name: 'Accelerate', inputKey: 'w', color: 'green', top: '-120px' },
      { name: 'Reverse', inputKey: 's', color: 'red', top: '-40px' },
      { name: 'Left', inputKey: 'a', color: 'blue', left: '-120px' },
      { name: 'Right', inputKey: 'd', color: 'blue', left: '120px' }
    ]

    buttonConfigs.forEach(cfg => {
      const btn = Button.CreateSimpleButton(cfg.name, cfg.name)
      btn.width = '150px'
      btn.height = '60px'
      btn.color = 'white'
      btn.background = cfg.color
      btn.cornerRadius = 10
      btn.thickness = 2
      btn.alpha = 0.8

      // Position on screen
      btn.verticalAlignment = Button.VERTICAL_ALIGNMENT_BOTTOM
      btn.horizontalAlignment = Button.HORIZONTAL_ALIGNMENT_CENTER
      if (cfg.top) btn.top = cfg.top
      if (cfg.left) btn.left = cfg.left

      // Touch events
      btn.onPointerDownObservable.add(() => {
        setMobileInput(prev => ({ ...prev, [cfg.inputKey]: true }))
      })
      btn.onPointerUpObservable.add(() => {
        setMobileInput(prev => ({ ...prev, [cfg.inputKey]: false }))
      })

      guiTexture.addControl(btn)
    })

    return () => {
      guiTexture.dispose()
    }
  }, [scene])

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <Link
        to="/customize"
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          backgroundColor: '#222',
          color: '#fff',
          padding: '10px 20px',
          textDecoration: 'none',
          borderRadius: '5px',
          zIndex: 999
        }}
      >
        Customize
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

          <PlayerCar onCarRootReady={setCarRoot} mobileInput={mobileInput} />
        </SceneJSX>
      </Engine>
    </div>
  )
}

export default App
