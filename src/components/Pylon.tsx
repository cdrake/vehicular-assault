// src/components/Pylon.tsx

import React, { useEffect, useRef } from 'react';
import {
  MeshBuilder,
  Vector3,
  Color3,
  StandardMaterial,
  GlowLayer,
  Mesh,
  TransformNode
} from '@babylonjs/core';
import { HavokPlugin, PhysicsAggregate, PhysicsShapeType } from '@babylonjs/core/Physics';
import { useScene, useBeforeRender } from 'react-babylonjs';

export interface PylonProps {
  /** Where to place the pylon in world space */
  position: Vector3;
  /** A ref to the player’s transform node so we know where to aim */
  targetRef: React.RefObject<TransformNode>;
  /** Mean interval between strikes (ms) */
  interval?: number;
  havokPlugin: HavokPlugin;
}

export const Pylon: React.FC<PylonProps> = ({ position, targetRef, interval = 2000, havokPlugin }) => {
  const scene = useScene()!;
  const pylonRef = useRef<Mesh>(null!);
  const glowRef = useRef<GlowLayer>(null!);
  const timeoutRef = useRef<number>(0);

  // Maximum distance at which the pylon will aim at the player
  const MAX_RANGE = 50;

  // How much damage this pylon does per successful hit
  const strengthRef = useRef<number>(5);

  // How much health this pylon has before it’s destroyed
  const hitpointsRef = useRef<number>(100);

  // Create a larger, solid pylon + glow layer + physics
  useEffect(() => {
    // Solid cylinder for the pylon
    const cyl = MeshBuilder.CreateCylinder(
      'pylon',
      { diameter: 10, height: 30, tessellation: 16 },
      scene
    );
    cyl.position = position.clone();
    const mat = new StandardMaterial('pylonMat', scene);
    mat.diffuseColor   = new Color3(0.1, 0.1, 0.3);  
    mat.emissiveColor  = new Color3(0.2, 0.6, 1.0);    // bright electric blue
    cyl.material = mat;
    pylonRef.current = cyl;

    // Add physics collider
    const agg = new PhysicsAggregate(
      cyl,
      PhysicsShapeType.CYLINDER,
      { mass: 0, friction: 0.8, restitution: 0.1 },
      scene
    );

    agg.body.setCollisionCallbackEnabled(true);
    // and listen for collision started events (Havok-specific flag access)
    const observable = agg.body.getCollisionObservable();
    observable.add((collisionEvent) => {
      const otherNode = (
        collisionEvent.collider.transformNode === cyl
          ? collisionEvent.collidedAgainst.transformNode
          : collisionEvent.collider.transformNode
      );

      // only care about projectiles named "proj..."
      if (!otherNode || !otherNode.name.startsWith('proj')) {
        return;
      }

      // read damage from projectile metadata
      const dmg = otherNode.metadata?.strength ?? 10;
      hitpointsRef.current -= dmg;

      // flash material red briefly
      mat.emissiveColor = new Color3(1, 0, 0);
      setTimeout(() => {
        mat.emissiveColor = new Color3(0.2, 0.6, 1.0);
      }, 100);

      // destroy if out of HP
      if (hitpointsRef.current <= 0) {
        cyl.dispose();
        glowRef.current.dispose();
        clearTimeout(timeoutRef.current);
      }
    });

    // Glow for the pylon
    const glow = new GlowLayer('glow', scene);
    glow.intensity = 0.6;
    glowRef.current = glow;

    return () => {
      cyl.dispose();
      glow.dispose();
      clearTimeout(timeoutRef.current);
    };
  }, [scene, position, havokPlugin]);

  // Strike function: create a solid bolt using a tube
  const strike = () => {
    const targetNode = targetRef.current;
    // ── GUARD: bail out if we don’t yet have a target or its metadata
    if (!targetNode || !targetNode.metadata) {
      // schedule next attempt and exit
      timeoutRef.current = window.setTimeout(strike, interval);
      return;
    }
    
    const start = pylonRef.current.position.clone();
    let end: Vector3;

    // If target within range → lock on; otherwise pick a random arc
    const targetPos = targetRef.current!.position.clone();
    const dist = Vector3.Distance(start, targetPos);

    if (dist <= MAX_RANGE) {
      const md = targetRef.current!.metadata!;
      md.hitpoints = Math.max(0, md.hitpoints - strengthRef.current);
      end = targetPos;
    } else {
      // random direction vector scaled to some arbitrary length (e.g. 10)
      const randomDir = Vector3.Random().subtract(new Vector3(0.5, 0.5, 0.5)).normalize();
      end = start.add(randomDir.scale(10));
    }
    const segments = 12;
    const variance = 0.3;

    // Build jagged path
    const points: Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const p = Vector3.Lerp(start, end, t);
      p.x += (Math.random() - 0.5) * variance;
      p.y += (Math.random() - 0.5) * variance;
      p.z += (Math.random() - 0.5) * variance;
      points.push(p);
    }

    // Create a tube mesh along the lightning path for a solid bolt
    const bolt = MeshBuilder.CreateTube(
      'bolt',
      { path: points, radius: 0.05, sideOrientation: Mesh.DOUBLESIDE },
      scene
    );
    const boltMat = new StandardMaterial('boltMat', scene);
    boltMat.emissiveColor = new Color3(0.8, 0.8, 1);
    bolt.material = boltMat;
    glowRef.current.addExcludedMesh(bolt);

    // Dispose after a brief flash
    setTimeout(() => bolt.dispose(), 100);

    // Schedule next strike
    timeoutRef.current = window.setTimeout(
      strike,
      interval + (Math.random() - 0.5) * interval
    );
  };

  // Kick off first strike
  useBeforeRender(() => {
    if (!timeoutRef.current) {
      timeoutRef.current = window.setTimeout(
        strike,
        interval + (Math.random() - 0.5) * interval
      );
    }
  });

  return null;
};
