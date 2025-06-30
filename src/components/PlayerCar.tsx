import React from 'react'
import { Vector3 } from '@babylonjs/core'
import { Model } from 'react-babylonjs'
import '@babylonjs/loaders/glTF/2.0/glTFLoader'  // important!

interface PlayerCarProps {
  position: Vector3
  scale: Vector3
}

const PlayerCar: React.FC<PlayerCarProps> = ({ position, scale }) => (
  <Model
    name='player-car'
    rootUrl='/vehicular-assault/assets/models/'
    sceneFilename='player_car.glb'
    position={position}
    scaling={scale}
  />
)

export default PlayerCar
