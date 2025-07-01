import React, { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { Engine, Scene } from "react-babylonjs"
import {
  Color3,
  Color4,
  Vector3,
  MeshBuilder,
  Texture,
  ParticleSystem,
  Scene as BabylonScene,
  CreateAudioEngineAsync,
  CreateSoundAsync,
} from "@babylonjs/core"
import type { AudioEngineV2, Mesh, StaticSound } from "@babylonjs/core"

const VFX: React.FC = () => {
  const particleSystemRef = useRef<ParticleSystem | null>(null)
  const emitterRef = useRef<Mesh | null>(null)
  const audioEngineRef = useRef<AudioEngineV2 | null>(null)
  const soundRef = useRef<StaticSound | null>(null)
  const sceneRef = useRef<BabylonScene | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)

  // 📌 Scene Setup
  const handleSceneReady = async (scene: BabylonScene) => {
    console.log("✅ Scene ready")
    sceneRef.current = scene
    scene.audioEnabled = true

    // Create emitter
    if (!emitterRef.current) {
      emitterRef.current = MeshBuilder.CreateSphere(
        "emitter",
        { diameter: 0.5 },
        scene
      )
      emitterRef.current.position = new Vector3(0, 0, 0)
    }

    // Create particle system but don't start
    const particleSystem = new ParticleSystem("particles", 2000, scene)
    particleSystem.particleTexture = new Texture(
      "https://playground.babylonjs.com/textures/flare.png",
      scene
    )
    particleSystem.emitter = emitterRef.current
    particleSystem.minEmitBox = new Vector3(-0.1, -0.1, -0.1)
    particleSystem.maxEmitBox = new Vector3(0.1, 0.1, 0.1)
    particleSystem.color1 = new Color4(1, 0.5, 0, 1)
    particleSystem.color2 = new Color4(1, 1, 0, 1)
    particleSystem.colorDead = new Color4(0, 0, 0, 0.0)
    particleSystem.minSize = 0.1
    particleSystem.maxSize = 0.3
    particleSystem.minLifeTime = 0.3
    particleSystem.maxLifeTime = 1.2
    particleSystem.emitRate = 500
    particleSystem.direction1 = new Vector3(-1, 4, 1)
    particleSystem.direction2 = new Vector3(1, 4, -1)
    particleSystem.minEmitPower = 1
    particleSystem.maxEmitPower = 3
    particleSystem.updateSpeed = 0.01
    particleSystemRef.current = particleSystem

    console.log("✅ Particle system created (but not started)")

    // Create AudioEngine
    const audioEngine = await CreateAudioEngineAsync()
    audioEngineRef.current = audioEngine
    console.log("✅ AudioEngine created")

    // Load sound (but don't play)
    const sparksSound = await CreateSoundAsync(
      "sparksSound",
      import.meta.env.BASE_URL + "assets/sounds/sparks.wav",
      {
        loop: true,
        volume: 2.0,
      }
    )
    soundRef.current = sparksSound
    console.log("✅ Sound loaded (but not playing)")

    setIsReady(true)
  }

  // 📌 Cleanup
  useEffect(() => {
    return () => {
      particleSystemRef.current?.dispose()
      emitterRef.current?.dispose()
      if (soundRef.current) {
        soundRef.current.stop()
        soundRef.current.dispose()
      }
      audioEngineRef.current?.dispose()
    }
  }, [])

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        margin: 0,
        padding: 0,
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

      <h2
        style={{
          position: "absolute",
          top: "10px",
          left: "50%",
          transform: "translateX(-50%)",
          color: "#fff",
          zIndex: 999,
          backgroundColor: "#222",
          padding: "6px 12px",
          borderRadius: "4px",
        }}
      >
        VFX Preview - Particle System
      </h2>

      <button
        style={{
          position: "absolute",
          top: "60px",
          left: "10px",
          backgroundColor: "#222",
          color: "#fff",
          padding: "10px 20px",
          textDecoration: "none",
          borderRadius: "5px",
          zIndex: 999,
        }}
        disabled={!isReady}
        onClick={async () => {
          if (
            !audioEngineRef.current ||
            !soundRef.current ||
            !particleSystemRef.current
          ) {
            console.log("⚠️ Not ready yet")
            return
          }

          try {
            if (!isPlaying) {
              // 🔓 Unlock AudioEngine (browser policy)
              await audioEngineRef.current.unlockAsync()
              console.log("✅ AudioEngine unlocked")

              soundRef.current.play()
              console.log("✅ Sound playing")

              particleSystemRef.current.start()
              console.log("✅ Particle system started")

              setIsPlaying(true)
            } else {
              soundRef.current.stop()
              console.log("🛑 Sound stopped")

              particleSystemRef.current.stop()
              console.log("🛑 Particle system stopped")

              setIsPlaying(false)
            }
          } catch (err) {
            console.error("❌ Error toggling VFX and sound", err)
          }
        }}
      >
        {isPlaying ? "Stop VFX and Sound" : "Start VFX and Sound"}
      </button>

      <Engine antialias adaptToDeviceRatio canvasId="babylon-vfx-canvas">
        <Scene
          clearColor={new Color4(0.05, 0.05, 0.05, 1)}
          onCreated={handleSceneReady}
        >
          <arcRotateCamera
            name="vfxCamera"
            target={Vector3.Zero()}
            alpha={0}
            beta={0}
            radius={8}
            minZ={0.1}
            wheelPrecision={50}
            onCreated={(camera) => camera.attachControl(true)}
          />
          <hemisphericLight
            name="light"
            direction={new Vector3(0, -1, 0)}
            intensity={0.9}
            groundColor={new Color3(0.1, 0.1, 0.1)}
            diffuse={new Color3(1, 1, 1)}
            specular={new Color3(0, 0, 0)}
          />
        </Scene>
      </Engine>
    </div>
  )
}

export default VFX
