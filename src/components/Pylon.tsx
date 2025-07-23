// src/components/Pylon.tsx
import React, { useEffect, useRef } from 'react';
import {
  MeshBuilder,
  Vector3,
  Color3,
  StandardMaterial,
  GlowLayer,
  LinesMesh,
  Mesh,
  TransformNode
} from '@babylonjs/core';
import { useScene, useBeforeRender } from 'react-babylonjs';

export interface PylonProps {
  /** Where to place the pylon in world space */
  position: Vector3;
  /** A ref to the player mesh so we know where to aim */
  targetRef: React.RefObject<TransformNode>
  /** Mean interval between strikes (ms) */
  interval?: number;
}

export const Pylon: React.FC<PylonProps> = ({
  position,
  targetRef,
  interval = 2000
}) => {
  const scene = useScene()!;
  const pylonRef = useRef<Mesh>(null!);
  const glowRef = useRef<GlowLayer>(null!);
  const timeoutRef = useRef<number>(0);

  // 1️⃣ Create the pylon + glow layer once
  useEffect(() => {
    // Cylinder for the pylon
    const cyl = MeshBuilder.CreateCylinder(
      'pylon',
      { diameter: 10, height: 30 },
      scene
    );
    cyl.position = position.clone();
    const mat = new StandardMaterial('pylonMat', scene);
    mat.emissiveColor = new Color3(0.2, 0.2, 1);
    cyl.material = mat;
    pylonRef.current = cyl;

    // Glow so our lightning looks epic
    const glow = new GlowLayer('glow', scene);
    glow.intensity = 0.6;
    glowRef.current = glow;

    return () => {
      cyl.dispose();
      glow.dispose();
      clearTimeout(timeoutRef.current);
    };
  }, [scene, position]);

  // 2️⃣ Function to spawn a single bolt
  const strike = () => {
    const start = pylonRef.current.position.clone();
    const end = targetRef.current!.position.clone();
    const segments = 8;
    const variance = 0.5;

    // build a jagged path
    const points: Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const p = Vector3.Lerp(start, end, t);
      p.x += (Math.random() - 0.5) * variance;
      p.y += (Math.random() - 0.5) * variance;
      p.z += (Math.random() - 0.5) * variance;
      points.push(p);
    }

    const bolt = MeshBuilder.CreateLines(
      'bolt',
      { points, updatable: false },
      scene
    ) as LinesMesh;
    bolt.color = new Color3(0.8, 0.8, 1);
    glowRef.current!.addExcludedMesh(bolt);

    // dispose after a brief flash
    setTimeout(() => bolt.dispose(), 100);

    // schedule next strike
    timeoutRef.current = window.setTimeout(
      strike,
      interval + (Math.random() - 0.5) * interval
    );
  };

  // 3️⃣ Kick off the first strike once per render loop
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
