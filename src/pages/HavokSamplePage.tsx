import React, { useEffect, useRef } from 'react'
import '@babylonjs/loaders'
import {
  Engine,
  Scene,
  Vector3,
  Color3,
  Color4,
  Vector4,
  HemisphericLight,
  FollowCamera,
  MeshBuilder,
  StandardMaterial,
  Texture,
  PhysicsAggregate,
  PhysicsShapeType,
  HavokPlugin,
  Physics6DoFConstraint,
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
  PhysicsMotionType,
  PhysicsBody,
} from '@babylonjs/core'
import HavokPhysics from '@babylonjs/havok'

// Globals
let tyreMaterial: StandardMaterial
const debugColours: Color4[] = [
  new Color4(1, 0, 1, 1),
  new Color4(1, 0, 0, 1),
  new Color4(0, 1, 0, 1),
  new Color4(1, 1, 0, 1),
  new Color4(0, 1, 1, 1),
  new Color4(0, 0, 1, 1),
]
const FILTERS = { CarParts: 1, Environment: 2 }

// Initialize tyre material
function InitTyreMaterial(scene: Scene) {
  tyreMaterial = new StandardMaterial('Tyre', scene)
  const upTexture = new Texture('textures/up.png', scene)
  upTexture.wAng = -Math.PI / 2
  upTexture.vScale = 0.4
  tyreMaterial.diffuseTexture = upTexture
}

// Create ground and walls
function CreateGroundAndWalls(scene: Scene) {
  const groundMaterial = new StandardMaterial('GroundMaterial', scene)
  const checkerboard = new Texture('textures/amiga.jpg', scene)
  checkerboard.uScale = 20
  checkerboard.vScale = 20
  groundMaterial.diffuseTexture = checkerboard

  const ground = MeshBuilder.CreateGround('ground', { width: 50, height: 50 }, scene)
  ground.material = groundMaterial

  const groundAgg = new PhysicsAggregate(
    ground,
    PhysicsShapeType.BOX,
    { mass: 0, restitution: 0.2, friction: 0.9 },
    scene
  )
  // collision filters so car parts collide with ground
  ;(groundAgg.body.shape as any).filterMembershipMask = FILTERS.Environment
  ;(groundAgg.body.shape as any).filterCollideMask = FILTERS.CarParts
}
 

// Create the car with physics and wheels
function CreateCar(scene: Scene) {
  // Frame
  const carFrame = MeshBuilder.CreateBox(
    'Frame',
    { height: 1, width: 12, depth: 24, faceColors: debugColours },
    scene
  )
  carFrame.position = new Vector3(0, 0.3, 0)
  carFrame.visibility = 0.5
  const frameAgg = new PhysicsAggregate(
    carFrame,
    PhysicsShapeType.BOX,
    { mass: 1000, restitution: 0, friction: 0 },
    scene
  )
  const frameBody = frameAgg.body
  // collision filters
  ;(frameBody.shape as any).filterMembershipMask = FILTERS.CarParts
  ;(frameBody.shape as any).filterCollideMask = FILTERS.Environment

  // Helper to add wheel and axle
  const CreateAxle = (pos: Vector3) => {
    const axle = MeshBuilder.CreateBox(
      'Axle',
      { width: 2.5, height: 1, depth: 1, faceColors: debugColours },
      scene
    )
    axle.position = pos.clone()
    const agg = new PhysicsAggregate(
      axle,
      PhysicsShapeType.BOX,
      { mass: 100, restitution: 0, friction: 0 },
      scene
    )
    agg.body.mass = 100
    ;(agg.body.shape as any).filterMembershipMask = FILTERS.CarParts
    ;(agg.body.shape as any).filterCollideMask = FILTERS.Environment
    ;(axle as any).physicsBody = agg.body
    return axle
  }

  const CreateWheel = (pos: Vector3) => {
    const faceUV = [new Vector4(0, 0, 0, 0), new Vector4(0, 1, 1, 0), new Vector4(0, 0, 0, 0)]
    const wheel = MeshBuilder.CreateCylinder('Wheel', { diameter: 4, height: 1.6, faceUV }, scene)
    wheel.rotation = new Vector3(0, 0, Math.PI / 2)
    wheel.bakeCurrentTransformIntoVertices()
    wheel.position = pos.clone()
    wheel.material = tyreMaterial
    const agg = new PhysicsAggregate(
      wheel,
      PhysicsShapeType.CYLINDER,
      { mass: 100, restitution: 0.1, friction: 50 },
      scene
    )
    ;(agg.body.shape as any).filterMembershipMask = FILTERS.CarParts
    ;(agg.body.shape as any).filterCollideMask = FILTERS.Environment
    ;(wheel as any).physicsBody = agg.body
    return wheel
  }

  // Create wheels and axles
  const flWheel = CreateWheel(new Vector3(5, 0, 8))
  const flAxle = CreateAxle(new Vector3(5, 0, 8))
  const frWheel = CreateWheel(new Vector3(-5, 0, 8))
  const frAxle = CreateAxle(new Vector3(-5, 0, 8))
  const rlWheel = CreateWheel(new Vector3(5, 0, -8))
  const rlAxle = CreateAxle(new Vector3(5, 0, -8))
  const rrWheel = CreateWheel(new Vector3(-5, 0, -8))
  const rrAxle = CreateAxle(new Vector3(-5, 0, -8))

  const wheels = [flWheel, frWheel, rlWheel, rrWheel]
  const axles = [flAxle, frAxle, rlAxle, rrAxle]

  // Attach suspension + steering constraints
  axles.forEach((axle, i) => {
    const axleBody = (axle as any).physicsBody as PhysicsBody
    const suspension = new Physics6DoFConstraint(
      { pivotA: new Vector3(0, 0, 0), pivotB: axle.position.clone() },
      [
        { axis: PhysicsConstraintAxis.LINEAR_X, minLimit: 0, maxLimit: 0 },
        { axis: PhysicsConstraintAxis.LINEAR_Y, minLimit: -0.15, maxLimit: 0.15, stiffness: 100000, damping: 5000 },
        { axis: PhysicsConstraintAxis.LINEAR_Z, minLimit: 0, maxLimit: 0 },
        { axis: PhysicsConstraintAxis.ANGULAR_X, minLimit: -0.25, maxLimit: 0.25 },
        { axis: PhysicsConstraintAxis.ANGULAR_Y, minLimit: i < 2 ? undefined : 0, maxLimit: i < 2 ? undefined : 0 },
        { axis: PhysicsConstraintAxis.ANGULAR_Z, minLimit: -0.05, maxLimit: 0.05 },
      ],
      scene
    )
    frameBody.addConstraint(axleBody, suspension)
    // steering only on front wheels
    if (i < 2) {
      suspension.setAxisMotorType(PhysicsConstraintAxis.ANGULAR_Y, PhysicsConstraintMotorType.POSITION)
      suspension.setAxisMotorMaxForce(PhysicsConstraintAxis.ANGULAR_Y, 3e7)
      suspension.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_Y, 0)
    }
  })

  // Wheel joints (powered front)
  const CreateWheelJoint = (axle: any, wheel: any, powered: boolean) => {
    const axleBody = axle.physicsBody as PhysicsBody
    const wheelBody = wheel.physicsBody as PhysicsBody
    const joint = new Physics6DoFConstraint(
      {},
      [
        { axis: PhysicsConstraintAxis.LINEAR_DISTANCE, minLimit: 0, maxLimit: 0 },
        { axis: PhysicsConstraintAxis.ANGULAR_Y, minLimit: 0, maxLimit: 0 },
        { axis: PhysicsConstraintAxis.ANGULAR_Z, minLimit: 0, maxLimit: 0 },
      ],
      scene
    )
    axleBody.addConstraint(wheelBody, joint)
    if (powered) {
      joint.setAxisMotorType(PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintMotorType.VELOCITY)
      joint.setAxisMotorMaxForce(PhysicsConstraintAxis.ANGULAR_X, 180000)
      joint.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, 0)
    }
    return joint
  }

  // Parent for rendering
  axles.forEach(a => carFrame.addChild(a))
  wheels.forEach(w => carFrame.addChild(w))

  // Create wheel joints
  CreateWheelJoint(flAxle, flWheel, true)
  CreateWheelJoint(frAxle, frWheel, true)
  CreateWheelJoint(rlAxle, rlWheel, false)
  CreateWheelJoint(rrAxle, rrWheel, false)

  // Return the frame mesh to lock camera onto
  return carFrame
}

export const HavokSamplePage: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const engine = new Engine(canvasRef.current, true)
    const scene = new Scene(engine)
    scene.clearColor = new Color4(0.05, 0.05, 0.05, 1)

    HavokPhysics().then(hk => {
      const havok = new HavokPlugin(false, hk)
      scene.enablePhysics(new Vector3(0, -240, 0), havok)
      scene.getPhysicsEngine()!.setTimeStep(1 / 500)
      scene.getPhysicsEngine()!.setSubTimeStep(4.5)

      // Camera
      const camera = new FollowCamera('cam', new Vector3(0, 10, -10), scene)
      camera.radius = 50
      camera.heightOffset = 20
      camera.rotationOffset = 180
      camera.cameraAcceleration = 0.035
      camera.maxCameraSpeed = 10
      camera.attachControl(true)

      // Light
      new HemisphericLight('hemi', new Vector3(1, 1, 0), scene).intensity = 0.7

      InitTyreMaterial(scene)
      CreateGroundAndWalls(scene)
      const car = CreateCar(scene)
      camera.lockedTarget = car

      engine.runRenderLoop(() => scene.render())
    })

    return () => engine.dispose()
  }, [])

  return <canvas ref={canvasRef} style={{ width: '100vw', height: '100vh' }} />
}
