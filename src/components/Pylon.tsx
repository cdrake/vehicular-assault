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
import { PhysicsAggregate, PhysicsShapeType } from '@babylonjs/core/Physics';
import { useScene, useBeforeRender } from 'react-babylonjs';

export interface PylonProps {
  /** Where to place the pylon in world space */
  position: Vector3;
  /** A ref to the player’s transform node so we know where to aim */
  targetRef: React.RefObject<TransformNode>;
  /** Mean interval between strikes (ms) */
  interval?: number;
}

export const Pylon: React.FC<PylonProps> = ({ position, targetRef, interval = 2000 }) => {
  const scene = useScene()!;
  const pylonRef = useRef<Mesh>(null!);
  const glowRef = useRef<GlowLayer>(null!);
  const timeoutRef = useRef<number>(0);

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
    mat.emissiveColor = new Color3(0.2, 0.2, 1);
    cyl.material = mat;
    pylonRef.current = cyl;

    // Add physics collider
    new PhysicsAggregate(
      cyl,
      PhysicsShapeType.CYLINDER,
      { mass: 0, friction: 0.8, restitution: 0.1 },
      scene
    );

    // Glow for the pylon
    const glow = new GlowLayer('glow', scene);
    glow.intensity = 0.6;
    glowRef.current = glow;

    return () => {
      cyl.dispose();
      glow.dispose();
      clearTimeout(timeoutRef.current);
    };
  }, [scene, position]);

  // Strike function: create a solid bolt using a tube
  const strike = () => {
    const start = pylonRef.current.position.clone();
    const end = targetRef.current!.position.clone();
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
