import React, { useEffect, useRef } from 'react'
import '@babylonjs/loaders'
import { Engine, Color3 } from '@babylonjs/core'
import {
  Scene,
  Vector3,
  Color4,
  HemisphericLight,
  DirectionalLight,
  FollowCamera,
  MeshBuilder,
  StandardMaterial,
  PhysicsAggregate,
  PhysicsShapeType,
  HavokPlugin,
  Physics6DoFConstraint,
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
} from '@babylonjs/core'
import HavokPhysics from '@babylonjs/havok'

export const HavokSamplePage: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const engine = new Engine(canvasRef.current, true)
    const scene = new Scene(engine)
    scene.clearColor = new Color4(0.05, 0.05, 0.05, 1)

    // initialize Havok
    HavokPhysics().then(hk => {
      const havok = new HavokPlugin(false, hk)
      scene.enablePhysics(new Vector3(0, -9.81, 0), havok)
      scene.getPhysicsEngine()!.setTimeStep(1 / 60)

      // lights
      new HemisphericLight('hemi', new Vector3(1, 1, 0), scene)
      const dir = new DirectionalLight('dir', new Vector3(-1, -2, -1), scene)
      dir.position = new Vector3(20, 40, 20)

      // camera
      const camera = new FollowCamera('cam', new Vector3(0, 5, -15), scene)
      camera.radius = 15
      camera.heightOffset = 5
      camera.rotationOffset = 180
      camera.cameraAcceleration = 0.05
      camera.maxCameraSpeed = 10
      camera.lockedTarget = null // will set after chassis is created
      camera.attachControl(true)

      // ground
      const ground = MeshBuilder.CreateGround('ground', { width: 50, height: 50 }, scene)
      const groundMat = new StandardMaterial('groundMat', scene)
      groundMat.diffuseColor = new Color3(0.7, 0.7, 0.7)
      ground.material = groundMat
      new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0, friction: 0.9 }, scene)

      // chassis
      const chassis = MeshBuilder.CreateBox('chassis', { width: 4, height: 1, depth: 6 }, scene)
      const chassisMat = new StandardMaterial('chassisMat', scene)
      chassisMat.diffuseColor = new Color3(0.2, 0.4, 0.9)
      chassis.material = chassisMat
      chassis.position.y = 1.2
      const chassisPhy = new PhysicsAggregate(chassis, PhysicsShapeType.BOX, { mass: 800, restitution: 0.1, friction: 0.8 }, scene)

      // wheels
      const wheelPos = [
        new Vector3(2, 0.4,  3),
        new Vector3(-2, 0.4, 3),
        new Vector3(2, 0.4, -3),
        new Vector3(-2, 0.4,-3),
      ]
      wheelPos.forEach((pos, i) => {
        const wheel = MeshBuilder.CreateCylinder(`wheel${i}`, { diameter: 1, height: 0.5 }, scene)
        const mat = new StandardMaterial(`wheelMat${i}`, scene)
        mat.diffuseColor = new Color3(0.1, 0.1, 0.1)
        wheel.material = mat
        wheel.rotation.x = Math.PI / 2
        wheel.position = pos.clone()
        const wp = new PhysicsAggregate(wheel, PhysicsShapeType.CYLINDER, { mass: 50, restitution: 0.1, friction: 1 }, scene)
        const constraint = new Physics6DoFConstraint(
          { pivotA: pos.clone(), pivotB: Vector3.Zero() },
          [
            { axis: PhysicsConstraintAxis.LINEAR_Y, minLimit: -0.2, maxLimit: 0.2, stiffness: 50000, damping: 2000 },
            { axis: PhysicsConstraintAxis.LINEAR_X, minLimit: 0, maxLimit: 0 },
            { axis: PhysicsConstraintAxis.LINEAR_Z, minLimit: 0, maxLimit: 0 },
            { axis: PhysicsConstraintAxis.ANGULAR_X, minLimit: 0, maxLimit: 0 },
            { axis: PhysicsConstraintAxis.ANGULAR_Y, minLimit: 0, maxLimit: 0 },
            { axis: PhysicsConstraintAxis.ANGULAR_Z, minLimit: 0, maxLimit: 0 },
          ],
          scene
        )
        chassisPhy.body.addConstraint(wp.body, constraint)
      })

      // now lock camera
      camera.lockedTarget = chassis
      engine.runRenderLoop(() => scene.render())
    })

    return () => engine.dispose()
  }, [])

  return <canvas ref={canvasRef} style={{ width: '100vw', height: '100vh' }} />
}
