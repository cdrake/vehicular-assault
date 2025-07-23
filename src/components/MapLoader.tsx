import { Scene } from '@babylonjs/core/scene'
import { Vector3 } from '@babylonjs/core/Maths/math'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { PhysicsAggregate, PhysicsShapeType } from '@babylonjs/core/Physics'
import type { IPhysicsEngine } from '@babylonjs/core/Physics/IPhysicsEngine'

export interface MapPrimitive {
  type: string
  name: string
  size?: {
    width?: number
    height?: number
    depth?: number
    diameter?: number
    diameterTop?: number
    diameterBottom?: number
    subdivisions?: number
  }
  position?: { x: number; y: number; z: number }
  rotation?: { x: number; y: number; z: number }
  material?: string
  physics?: {
    mass?: number
    collision?: boolean
  }
  metadata?: Record<string, unknown>
}

export interface MapData {
  name: string
  description?: string
  primitives: MapPrimitive[]
}

function getShape(type: string): PhysicsShapeType {
  switch (type) {
    case 'box':
    case 'ground':
    case 'plane':
      return PhysicsShapeType.BOX
    case 'cylinder':
      return PhysicsShapeType.CYLINDER
    case 'sphere':
      return PhysicsShapeType.SPHERE
    default:
      return PhysicsShapeType.MESH
  }
}

/**
 * Creates meshes from JSON map definition, with optional physics.
 */
export function createMapFromJson(
  scene: Scene,
  mapData: MapData,
  materials: Record<string, StandardMaterial>,
  physicsEngine?: IPhysicsEngine | null
): void {
  if (!mapData?.primitives) {
    console.warn('No primitives in map data')
    return
  }

  mapData.primitives.forEach((item) => {
    let mesh
    const opts = item.size ?? {}

    // Create primitive
    switch (item.type) {
      case 'box':
        mesh = MeshBuilder.CreateBox(item.name, {
          width: opts.width,
          height: opts.height,
          depth: opts.depth
        }, scene)
        break
      case 'cylinder':
        mesh = MeshBuilder.CreateCylinder(item.name, {
          diameterTop: opts.diameterTop,
          diameterBottom: opts.diameterBottom,
          height: opts.height
        }, scene)
        break
      case 'sphere':
        mesh = MeshBuilder.CreateSphere(item.name, {
          diameter: opts.diameter
        }, scene)
        break
      case 'plane':
        mesh = MeshBuilder.CreatePlane(item.name, {
          width: opts.width,
          height: opts.height
        }, scene)
        break
      case 'ground':
        mesh = MeshBuilder.CreateGround(item.name, {
          width: opts.width,
          height: opts.height,
          subdivisions: opts.subdivisions ?? 1
        }, scene)
        break
      default:
        console.warn(`Unknown primitive type: ${item.type}`)
        return
    }

    // Position & rotation
    if (item.position) {
      mesh.position = new Vector3(
        item.position.x || 0,
        item.position.y || 0,
        item.position.z || 0
      )
    }
    if (item.rotation) {
      mesh.rotation = new Vector3(
        item.rotation.x || 0,
        item.rotation.y || 0,
        item.rotation.z || 0
      )
    }

    // Material
    if (item.material && materials[item.material]) {
      mesh.material = materials[item.material]
    }

    // Physics: use PhysicsAggregate when collision flag is true
    if (physicsEngine && item.physics?.collision) {
      const mass = item.physics.mass ?? 0
      const shape = getShape(item.type)
      new PhysicsAggregate(
        mesh,
        shape,
        { mass, friction: 0.8, restitution: 0.1 },
        scene
      )
    }

    // Metadata
    if (item.metadata) {
      mesh.metadata = item.metadata
    }

    console.log(`Created mesh: ${mesh.name}`)
  })
}
