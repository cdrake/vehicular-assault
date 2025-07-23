// App.tsx
import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Engine, Scene as SceneJSX } from 'react-babylonjs'
import {
  ArcRotateCamera,
  Color4,
  Vector3,
  Vector2,
  Matrix,
  Scene,
} from '@babylonjs/core'
import { TextRenderer, FontAsset } from '@babylonjs/addons/msdfText'
import * as GUI from '@babylonjs/gui'

const ROBOTO_JSON = 'https://assets.babylonjs.com/fonts/roboto-regular.json'
const ROBOTO_PNG  = 'https://assets.babylonjs.com/fonts/roboto-regular.png'

const STORY = `
ACT I – TURBO TECH TAKEDOWN
Neon‑lit streets. Rogue AI pylons spark EMPs.
Race through rain‑slick avenues to reclaim the stolen data crate.

ACT II – STREET JUSTICE
The Dino Crew’s prank vans swarm Southside.
Banana slicks and confetti cannons block every turn—outwit them or be outpaced.

ACT III – DELIVERY DASH
A critical medical crate awaits rescue in the corporate zone.
Dodge roadblocks, ram downed drones, and outrun the clock to save a life.
`
const STORYLINES = [
  'turbo-tech-takedown',
  'street-justice',
  'delivery-dash',
] as const
type RaceSlug = typeof STORYLINES[number]

const Home: React.FC = () => {
  const navigate = useNavigate()
  const onSceneReady = async (scene: Scene) => {
    const engine = scene.getEngine()
    scene.clearColor = new Color4(0, 0, 0, 1)

    // Star‑Wars crawl camera setup
    const camera = new ArcRotateCamera(
      'camera',
     -1.5739, 3.0559, 5,
      Vector3.Zero(),
      scene
    )
    camera.attachControl(true)
    camera.minZ = 0.1
    scene.activeCamera = camera

    // Load MSDF Roboto font
    const sdfDef = await (await fetch(ROBOTO_JSON)).text()
    const fontAsset = new FontAsset(sdfDef, ROBOTO_PNG)

    // Create TextRenderer (2 args only)
    const textRenderer = await TextRenderer.CreateTextRendererAsync(
      fontAsset,
      engine
    )

    // Tint crawl text golden
    textRenderer.color = new Color4(1, 0.8, 0.2, 1)

    // Add the crawl paragraph; use world matrix to position it
    textRenderer.addParagraph(
      STORY,
      {
        maxWidth:     1500,
        lineHeight:   1.2,
        letterSpacing:2,
        tabSize:      2,
        textAlign:    'center',
        translate:    new Vector2(0,  0),
      },
      // start close and centered
      Matrix.Translation(-10, 15, 10)
    )

    // Scroll the camera back each frame
    scene.onAfterRenderObservable.add(() => {
      textRenderer.render(
        camera.getViewMatrix(),
        camera.getProjectionMatrix()
      )
      camera.radius += 0.05  // zoom out
      if (camera.radius > 40) {
            camera.radius = 5
      }
    })

    // GUI overlay: show character count
    const ui = GUI.AdvancedDynamicTexture.CreateFullscreenUI('UI', true, scene)
    const textBlock = new GUI.TextBlock()
    textBlock.text ='Vehical Assault'
    textBlock.color = 'white'
    textBlock.fontSize = 60
    textBlock.height = '60px'
    textBlock.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP
    ui.addControl(textBlock)

    // user clicked a storyline button
  
  }
  const handleSelect = (slug: RaceSlug) => {
      navigate(`/race?race=${slug}`)
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <Engine antialias adaptToDeviceRatio canvasId="msdf-canvas">
        <SceneJSX onCreated={onSceneReady}>{null}</SceneJSX>
      </Engine>

      {/* overlay race buttons */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          width: '100%',
          textAlign: 'center',
          zIndex: 10,
        }}
      >
        {STORYLINES.map((slug) => (
          <button
            key={slug}
            onClick={() => handleSelect(slug)}
            style={{
              margin: '0 8px',
              padding: '8px 16px',
              fontSize: '1rem',
              cursor: 'pointer',
            }}
          >
            {slug
              .split('-')
              .map(w => w[0].toUpperCase() + w.slice(1))
              .join(' ')
            }
          </button>
        ))}
      </div>
    </div>
  )
}

export default Home
