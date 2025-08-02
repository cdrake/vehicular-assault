// src/components/MapLoader.tsx

import { Scene } from '@babylonjs/core/scene'
import { Vector3 } from '@babylonjs/core/Maths/math'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { PhysicsAggregate, PhysicsShapeType } from '@babylonjs/core/Physics'
import type { IPhysicsEngine } from '@babylonjs/core/Physics/IPhysicsEngine'
import type { AbstractMesh } from '@babylonjs/core'

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

export interface PylonJSON {
  position: { x: number; y: number; z: number }
  interval?: number
}

export interface CheckpointJSON {
  id: string
  name: string
  description: string
  position: { x: number; y: number; z: number }
}

export interface SecretCrateJSON {
  id: string
  name: string
  description: string
  position: { x: number; y: number; z: number }
}

export interface MapData {
  name: string
  description?: string
  timeLimit?:   number
  primitives: MapPrimitive[]
  objectives?: string[]
  pylons?: PylonJSON[]
  checkpoints?: CheckpointJSON[]
  secretCrate?: SecretCrateJSON
}

// Runtime definitions
export interface PylonDefinition {
  position: Vector3
  interval: number
}
export interface CheckpointDefinition {
  id: string
  name: string
  description: string
  position: Vector3
}
export interface SecretCrateDefinition {
  id: string
  name: string
  description: string
  position: Vector3
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
 * Creates meshes from JSON map definition, with optional physics,
 * and extracts pylon, checkpoint, and secret crate definitions.
 */
export function createMapFromJson(
  scene: Scene,
  mapData: MapData,
  materials: Record<string, StandardMaterial>,
  physicsEngine?: IPhysicsEngine | null
): {
  pylons: PylonDefinition[]
  objectives: string[]
  checkpoints: CheckpointDefinition[]
  secretCrate: SecretCrateDefinition | null
} {
  if (!mapData?.primitives) {
    console.warn('No primitives in map data')
    return { pylons: [], objectives: [], checkpoints: [], secretCrate: null }
  }

  // Instantiate primitives
  mapData.primitives.forEach((item) => {
    let mesh: AbstractMesh
    const opts = item.size ?? {}

    switch (item.type) {
      case 'box':
        mesh = MeshBuilder.CreateBox(item.name, { width: opts.width, height: opts.height, depth: opts.depth }, scene)
        break
      case 'cylinder':
        mesh = MeshBuilder.CreateCylinder(item.name, { diameterTop: opts.diameterTop, diameterBottom: opts.diameterBottom, height: opts.height }, scene)
        break
      case 'sphere':
        mesh = MeshBuilder.CreateSphere(item.name, { diameter: opts.diameter }, scene)
        break
      case 'plane':
        mesh = MeshBuilder.CreatePlane(item.name, { width: opts.width, height: opts.height }, scene)
        break
      case 'ground':
        mesh = MeshBuilder.CreateGround(item.name, { width: opts.width, height: opts.height, subdivisions: opts.subdivisions ?? 1 }, scene)
        break
      default:
        console.warn(`Unknown primitive type: ${item.type}`)
        return
    }

    if (item.position) {
      mesh.position = new Vector3(item.position.x, item.position.y, item.position.z)
    }
    if (item.rotation) {
      mesh.rotation = new Vector3(item.rotation.x, item.rotation.y, item.rotation.z)
    }
    if (item.material && materials[item.material]) {
      mesh.material = materials[item.material]
    }
    if (item.metadata) {
      mesh.metadata = item.metadata
    }

    if (physicsEngine && item.physics?.collision) {
      const mass = item.physics.mass ?? 0
      const shape = getShape(item.type)
      new PhysicsAggregate(mesh, shape, { mass, friction: 0.8, restitution: 0.1 }, scene)
    }

    console.log(`Created mesh: ${mesh.name}`)
  })

  // Extract pylons
  const pylons: PylonDefinition[] = []
  mapData.pylons?.forEach((p) => {
    pylons.push({ position: new Vector3(p.position.x, p.position.y, p.position.z), interval: p.interval ?? 2000 })
  })

  // Objectives
  const objectives = mapData.objectives ? [...mapData.objectives] : []

  // Extract checkpoints
  const checkpoints: CheckpointDefinition[] = []
  mapData.checkpoints?.forEach((cp) => {
    checkpoints.push({
      id: cp.id,
      name: cp.name,
      description: cp.description,
      position: new Vector3(cp.position.x, cp.position.y, cp.position.z)
    })
  })

  // Extract secret crate
  const secretCrate: SecretCrateDefinition | null = mapData.secretCrate
    ? {
        id: mapData.secretCrate.id,
        name: mapData.secretCrate.name,
        description: mapData.secretCrate.description,
        position: new Vector3(mapData.secretCrate.position.x, mapData.secretCrate.position.y, mapData.secretCrate.position.z)
      }
    : null

  return { pylons, objectives, checkpoints, secretCrate }
}
