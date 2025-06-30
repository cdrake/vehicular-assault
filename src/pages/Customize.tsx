import { Engine, Model, Scene } from "react-babylonjs"
import { Vector3, ArcRotateCamera } from "@babylonjs/core"
import "@babylonjs/loaders"
import { useEffect, useRef } from "react"
import { Link } from "react-router-dom"

export default function Customize() {
  const cameraRef = useRef<ArcRotateCamera | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (cameraRef.current && canvasRef.current) {
      cameraRef.current.attachControl(canvasRef.current, true)
    }
  }, [])

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <Link
        to="/"
        style={{
          position: "absolute",
          top: "10px",
          left: "10px",
          backgroundColor: "#222",
          color: "#fff",
          padding: "10px 20px",
          textDecoration: "none",
          borderRadius: "5px",
          zIndex: 999,
        }}
      >
        Back to Game
      </Link>
      <Engine antialias adaptToDeviceRatio canvasId="customize-canvas">
        <Scene>
          <arcRotateCamera
            ref={cameraRef}
            name="camera"
            target={new Vector3(0, 0, 0)}
            alpha={-Math.PI / 2}
            beta={Math.PI / 3}
            radius={15}
            minZ={0.1}
            wheelPrecision={50}
            onCreated={(camera) => {
              camera.attachControl(true)
            }}
          />
          <hemisphericLight
            name="light"
            direction={new Vector3(0, 1, 0)}
            intensity={0.7}
          />
          <Model
            name="player_car"
            rootUrl="/vehicular-assault/assets/models/"
            sceneFilename="player_car.glb"
            position={new Vector3(0, 0, 0)}
            scaling={new Vector3(1, 1, 1)}
          />
        </Scene>
      </Engine>
    </div>
  )
}
