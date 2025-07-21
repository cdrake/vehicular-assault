import React, { useEffect, useRef } from 'react'
import '@babylonjs/loaders'
import {
  Engine,
  Scene,
  Vector3,
  Color3,
  Color4,
  HemisphericLight,
  FollowCamera,
  MeshBuilder,
  StandardMaterial,
  PhysicsAggregate,
  PhysicsShapeType,
  HavokPlugin,
  Physics6DoFConstraint,
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
  Texture,
  PhysicsBody,
  PhysicsShapeMesh,
  Vector4,
  PhysicsMotionType,
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
  new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0, restitution: 0.2, friction: 0.9 }, scene)
}

// Create the car with physics and wheels
function CreateCar(scene: Scene) {
  // Frame
  const carFrame = MeshBuilder.CreateBox('Frame', { height: 1, width: 12, depth: 24, faceColors: debugColours }, scene)
  carFrame.position = new Vector3(0, 0.3, 0)
  carFrame.visibility = 0.5
  const framePhy = new PhysicsAggregate(carFrame, PhysicsShapeType.BOX, { mass: 1000, restitution: 0, friction: 0 }, scene)
  // collision filters
  ;(framePhy.body.shape as any).filterMembershipMask = FILTERS.CarParts
  ;(framePhy.body.shape as any).filterCollideMask = FILTERS.Environment

  // Helper to add wheel and axle
  const CreateAxle = (pos: Vector3) => {
    const axle = MeshBuilder.CreateBox('Axle', { width: 2.5, height: 1, depth: 1, faceColors: debugColours }, scene)
    axle.position = pos.clone()
    // use PhysicsAggregate to ensure a valid shape
    const phy = new PhysicsAggregate(axle, PhysicsShapeType.BOX, { mass: 100, restitution: 0, friction: 0 }, scene)
    ;(phy.body.shape as any).filterMembershipMask = FILTERS.CarParts
    ;(phy.body.shape as any).filterCollideMask = FILTERS.Environment
    return axle
  }

  const CreateWheel = (pos: Vector3) => {
    const faceUV = [new Vector4(0,0,0,0),new Vector4(0,1,1,0),new Vector4(0,0,0,0)]
    const wheel = MeshBuilder.CreateCylinder('Wheel', { diameter: 4, height: 1.6, faceUV }, scene)
    wheel.rotation = new Vector3(0,0,Math.PI/2)
    wheel.bakeCurrentTransformIntoVertices()
    wheel.position = pos.clone()
    wheel.material = tyreMaterial
    const phy = new PhysicsAggregate(wheel, PhysicsShapeType.CYLINDER, { mass: 100, restitution: 0.1, friction: 50 }, scene)
    ;(phy.body.shape as any).filterMembershipMask = FILTERS.CarParts
    ;(phy.body.shape as any).filterCollideMask = FILTERS.Environment
    return wheel
  }

  // Create wheels and axles
  const flWheel = CreateWheel(new Vector3(5,0,8))
  const flAxle = CreateAxle(new Vector3(5,0,8))
  const frWheel = CreateWheel(new Vector3(-5,0,8))
  const frAxle = CreateAxle(new Vector3(-5,0,8))
  const rlWheel = CreateWheel(new Vector3(5,0,-8))
  const rlAxle = CreateAxle(new Vector3(5,0,-8))
  const rrWheel = CreateWheel(new Vector3(-5,0,-8))
  const rrAxle = CreateAxle(new Vector3(-5,0,-8))

  const wheels = [flWheel,frWheel,rlWheel,rrWheel]
  const axles = [flAxle,frAxle,rlAxle,rrAxle]

  // Joints: powered front wheels
  const CreateWheelJoint = (axle: any, wheel: any, powered: boolean) => {
    const joint = new Physics6DoFConstraint({}, [
      { axis: PhysicsConstraintAxis.LINEAR_DISTANCE, minLimit:0, maxLimit:0 },
      { axis: PhysicsConstraintAxis.ANGULAR_Y, minLimit:0, maxLimit:0 },
      { axis: PhysicsConstraintAxis.ANGULAR_Z, minLimit:0, maxLimit:0 },
    ], scene)
    axle.physicsBody.addConstraint(wheel.physicsBody, joint)
    if(powered) {
      joint.setAxisMotorType(PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintMotorType.VELOCITY)
      joint.setAxisMotorMaxForce(PhysicsConstraintAxis.ANGULAR_X,180000)
      joint.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X,0)
    }
    return joint
  }

  axles.forEach(a=>carFrame.addChild(a))
  wheels.forEach(w=>carFrame.addChild(w))

  CreateWheelJoint(flAxle,flWheel,true)
  CreateWheelJoint(frAxle,frWheel,true)
  CreateWheelJoint(rlAxle,rlWheel,false)
  CreateWheelJoint(rrAxle,rrWheel,false)

  // Return the frame mesh to lock camera onto
  return carFrame
}

export const HavokSamplePage: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement|null>(null)

  useEffect(() => {
    if(!canvasRef.current) return
    const engine = new Engine(canvasRef.current,true)
    const scene = new Scene(engine)
    scene.clearColor = new Color4(0.05,0.05,0.05,1)

    HavokPhysics().then(hk=>{
      const havok = new HavokPlugin(false,hk)
      scene.enablePhysics(new Vector3(0,-240,0),havok)
      scene.getPhysicsEngine()!.setTimeStep(1/500)
      scene.getPhysicsEngine()!.setSubTimeStep(4.5)

      // Camera
      const camera = new FollowCamera('cam', new Vector3(0,10,-10), scene)
      camera.radius = 50
      camera.heightOffset = 20
      camera.rotationOffset = 180
      camera.cameraAcceleration = 0.035
      camera.maxCameraSpeed = 10

      // Light
      new HemisphericLight('hemi',new Vector3(1,1,0),scene).intensity=0.7

      InitTyreMaterial(scene)
      CreateGroundAndWalls(scene)
      const car = CreateCar(scene)
      camera.lockedTarget = car

      engine.runRenderLoop(()=>scene.render())
    })

    return ()=>engine.dispose()
  },[])

  return <canvas ref={canvasRef} style={{width:'100vw',height:'100vh'}}/>
}
