import { Engine, Scene } from 'react-babylonjs'
import { Vector3, ArcRotateCamera } from '@babylonjs/core'
import { useEffect, useRef } from 'react'

export default function App() {
  const cameraRef = useRef<ArcRotateCamera | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (cameraRef.current && canvasRef.current) {
      cameraRef.current.attachControl(canvasRef.current, true)
    }
  }, [])

  return (
    <Engine antialias adaptToDeviceRatio canvasId="babylon-canvas">
      <Scene>
        <arcRotateCamera
          ref={cameraRef}
          name="camera"
          target={new Vector3(0, 0, 0)}
          alpha={-Math.PI / 2}
          beta={Math.PI / 3}
          radius={10}
          minZ={0.1}
          wheelPrecision={50}
        />
        <hemisphericLight
          name="light"
          direction={new Vector3(0, 1, 0)}
          intensity={0.7}
        />
        <box name="box" size={2} />
      </Scene>
    </Engine>
  )
}
