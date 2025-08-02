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
  TransformNode, LoadAssetContainerAsync, MeshBuilder, StandardMaterial, Color3,
  HemisphericLight, PointLight 
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
    // const camera = new ArcRotateCamera(
    //   'camera',
    //   Math.PI,           // orbit angle (face -Z)
    //   Math.PI / 4,       // tilt down 45°
    //   30,                // radius (distance from target)
    //   new Vector3(0, 5, 10), // look at world origin
    //   scene
    // );
    camera.attachControl(true)
    camera.minZ = 0.1
    camera.upperBetaLimit = Math.PI / 2 - 0.1; // don’t flip under horizon
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

    const hemi = new HemisphericLight('hemiLight', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.7;
    // user clicked a storyline button
    // Load the car model and animate driving + shooting
  LoadAssetContainerAsync('/vehicular-assault/assets/models/steerable_car4.glb', scene)
    .then(container => {
      container.addAllToScene();

      // Grab the root transform
      const car = (container.rootNodes[0] ?? container.meshes[0]) as TransformNode;
      car.scaling.scaleInPlace(0.5);
      car.position.set(0, -5, 20);
      car.rotation = new Vector3(0, Math.PI, 0);

      // **new**: attach a point-light “headlight” to the car
      const headlight = new PointLight('carHeadlight', new Vector3(0, 2, 0), scene);
      headlight.parent    = car;              // so it moves with the car
      headlight.intensity = 2;                // brightness
      headlight.range     = 20;               // how far it shines

      // 1) Create a reticle parented to the car
      const reticle = new TransformNode("reticleRoot", scene);
      reticle.parent   = car;               
      reticle.position = new Vector3(0, 1, 4);  // 1 unit up, 4 forward
      reticle.rotation.x = -Math.PI / 2;        // face the camera

      // 2) Outer ring
      const ringMat = new StandardMaterial("reticleRingMat", scene);
      ringMat.emissiveColor = new Color3(1, 1, 1);
      const ring = MeshBuilder.CreateTorus(
        "reticleRing",
        { diameter: 2, thickness: 0.05, tessellation: 64 },
        scene
      );
      ring.parent   = reticle;
      ring.material = ringMat;

      // 3) Vertical line
      const lineMat = new StandardMaterial("reticleLineMat", scene);
      lineMat.emissiveColor = new Color3(1, 1, 1);
      const vLine = MeshBuilder.CreateBox(
        "reticleV",
        { width: 0.02, height: 0.5, depth: 0.02 },
        scene
      );
      vLine.parent   = reticle;
      vLine.material = lineMat;

      // 4) Horizontal line
      const hLine = MeshBuilder.CreateBox(
        "reticleH",
        { width: 0.5, height: 0.02, depth: 0.02 },
        scene
      );
      hLine.parent   = reticle;
      hLine.material = lineMat;


      let shootTimer = 0;
      const driveSpeed = 0.05;

      scene.onBeforeRenderObservable.add(() => {
        const dt = scene.getEngine().getDeltaTime();

        // drive forward and loop
        car.position.z -= driveSpeed;
        if (car.position.z < -10) {
          car.position.z = 20;
        }

        // fire every 1s
        shootTimer += dt;
        if (shootTimer > 1000) {
          shootTimer = 0;

          // compute the car’s forward direction
          const forward = car.getDirection(Vector3.Forward()).normalize();

          // spawn the sphere just in front of the bumper, slightly up
          const origin = car.position.add(forward.scale(1)).add(new Vector3(0, 0.5, 0));
          const proj = MeshBuilder.CreateSphere('proj', { diameter: 0.5 }, scene);
          proj.position.copyFrom(origin);

          const mat = new StandardMaterial('projMat', scene);
          mat.emissiveColor = new Color3(1, 0, 0);
          proj.material = mat;

          // move along that forward vector each frame
          const speed = 0.2;
          const velocity = forward.scale(speed);
          const mover = scene.onBeforeRenderObservable.add(() => {
            proj.position.addInPlace(velocity);
          });

          setTimeout(() => {
            scene.onBeforeRenderObservable.remove(mover);
            proj.dispose();
          }, 3000);
        }
      });
    })
    .catch(console.error);
  
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
