// MapLoader.tsx

import { Scene } from '@babylonjs/core/scene'
import { Vector3 } from '@babylonjs/core/Maths/math'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { PhysicsImpostor } from '@babylonjs/core/Physics/physicsImpostor'
import type { IPhysicsEngine } from '@babylonjs/core/Physics/IPhysicsEngine'

/**
 * Types
 */
export interface MapPrimitive {
  type: string
  name: string
  size?: Record<string, number>
  position?: { x: number, y: number, z: number }
  rotation?: { x: number, y: number, z: number }
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

/**
 * Helper to map type to PhysicsImpostor type
 */
function getImpostorType(type: string): number {
  switch (type) {
    case 'box':
    case 'ground':
    case 'plane':
      return PhysicsImpostor.BoxImpostor
    case 'cylinder':
    case 'sphere':
      return PhysicsImpostor.SphereImpostor
    default:
      return PhysicsImpostor.MeshImpostor
  }
}

/**
 * Creates meshes from JSON map definition
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

  mapData.primitives.forEach((item: MapPrimitive) => {
    let mesh
    const opts = item.size ?? {}

    // Create correct primitive
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

    // Apply position
    if (item.position) {
      mesh.position = new Vector3(
        item.position.x ?? 0,
        item.position.y ?? 0,
        item.position.z ?? 0
      )
    }

    // Apply rotation
    if (item.rotation) {
      mesh.rotation = new Vector3(
        item.rotation.x ?? 0,
        item.rotation.y ?? 0,
        item.rotation.z ?? 0
      )
    }

    // Apply material
    if (item.material && materials[item.material]) {
      mesh.material = materials[item.material]
    }

    // Add physics impostor if needed
    if (physicsEngine && item.physics?.collision) {
      const mass = item.physics.mass ?? 0
      mesh.physicsImpostor = new PhysicsImpostor(
        mesh,
        getImpostorType(item.type),
        { mass },
        scene
      )
    }

    // Add metadata
    if (item.metadata) {
      mesh.metadata = item.metadata
    }

    console.log(`Created mesh: ${mesh.name}`)
  })
}
