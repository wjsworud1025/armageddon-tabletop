import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {createPiece} from '../assets/pieces.mjs';
import {studioGroupFor} from '../assets/turntable.mjs';
import {createTable} from '../data/catalog.mjs';

const boy = createTable().pieces.find(piece => piece.id === 'boy-20');
const mesh = createPiece(THREE, boy).children[0];
mesh.updateMatrixWorld();
const geometry = mesh.geometry;

function visibleFace(x, y, side) {
  const origin = new THREE.Vector3(x, y, 3 * side);
  const direction = new THREE.Vector3(0, 0, -side);
  return new THREE.Raycaster(origin, direction).intersectObject(mesh, false)[0];
}

test('Boy 20 keeps the 32 mm base and the high, forward chopper measured in studio group 9', () => {
  assert.equal(studioGroupFor(boy), 9);
  assert.ok(Math.abs(boy.baseWidth * 25.4 - 32) < 0.001);
  assert.ok(Math.abs(boy.baseDepth - boy.baseWidth) < 0.001);
  const positions = geometry.getAttribute('position');
  const tip = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    if (positions.getY(i) > tip.y) tip.fromBufferAttribute(positions, i);
  }
  // Ten low, non-validation views put the blade tip near these inch coordinates.
  assert.ok(tip.distanceTo(new THREE.Vector3(-0.310, 1.975, 0.230)) < 0.10);
  assert.ok(Math.abs(geometry.boundingBox.min.y) < 0.001);
});

test('Boy 20 keeps the visible red squig, diagonally raised shoulder weapon and space between the boots', () => {
  const colors = geometry.getAttribute('color');
  for (const side of [-1, 1]) {
    // The exposed red patch is visible from both sides of the figure.
    const squig = visibleFace(-0.52, 0.55, side);
    assert.ok(squig, 'squig beside the leg');
    assert.ok(squig.point.z > -0.16 && squig.point.z < 0.26);
    const {r, g, b} = new THREE.Color().fromBufferAttribute(colors, squig.face.a);
    assert.ok(r > 1.35 * g && r > 1.35 * b, 'red-pigmented surface');
    const stock = visibleFace(0.66, 1.13, side);
    const muzzle = visibleFace(-0.035, 1.52, side);
    assert.ok(stock && muzzle, 'outer stock and the raised muzzle above the shoulder');
    assert.ok(muzzle.point.z - stock.point.z > 0.20);
    assert.ok(visibleFace(-0.39, 1.91, side), 'raised chopper');
    assert.equal(visibleFace(0.05, 0.42, side), undefined, 'gap between the boots');
  }
});
