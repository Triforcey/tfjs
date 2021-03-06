/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */
import {util} from '@tensorflow/tfjs-core';

import {getCoordsDataType} from '../shader_preprocessor';
import {computeDispatch, flatDispatchLayout} from '../webgpu_util';

import {WebGPUProgram} from './webgpu_program';

export class SelectProgram implements WebGPUProgram {
  variableNames = ['c', 'a', 'b'];
  outputShape: number[];
  shaderKey: string;
  userCode: string;
  dispatchLayout: {x: number[]};
  dispatch: [number, number, number];
  workPerThread = 4;
  workGroupSize: [number, number, number] = [16, 1, 1];

  constructor(cRank: number, shape: number[], rank: number) {
    this.outputShape = shape;
    const size = util.sizeFromShape(this.outputShape);
    this.dispatchLayout = flatDispatchLayout(this.outputShape);
    this.dispatch = computeDispatch(
        this.dispatchLayout, this.outputShape, this.workGroupSize,
        [this.workPerThread, 1, 1]);

    let cCoords;
    let abCoords;
    if (rank > 4) {
      throw Error(`Where for rank ${rank} is not yet supported`);
    }

    if (rank === 1) {
      abCoords = `resRC`;
      cCoords = `resRC`;
    } else {
      const currentCoords = ['resRC.x', 'resRC.y', 'resRC.z', 'resRC.w'];
      const cCoordVars = [];
      const abCoordVars = [];
      for (let i = 0; i < shape.length; i++) {
        abCoordVars.push(`${currentCoords[i]}`);
        if (i < cRank) {
          cCoordVars.push(`${currentCoords[i]}`);
        }
      }
      cCoords = cCoordVars.join();
      abCoords = abCoordVars.join();
    }

    const dtype = getCoordsDataType(rank);

    this.userCode = `
      void main() {
        int index = int(gl_GlobalInvocationID.x);

        for (int i = 0; i < ${this.workPerThread}; i++) {
          int flatIndex = index * ${this.workPerThread} + i;

          if (flatIndex < ${size}) {
            ${dtype} resRC = getOutputCoords();
            float cVal = getC(${cCoords});
            if (cVal >= 1.0) {
              setOutput(flatIndex,getA(${abCoords}));
            } else {
              setOutput(flatIndex,getB(${abCoords}));
            }
          }
        }
      }
    `;
    this.shaderKey = `select${size}${rank}`;
  }
}
