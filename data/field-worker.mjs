import {createFieldPixels} from './field-surface.mjs';

self.onmessage=({data:reverse})=>{
  const field=createFieldPixels(reverse);
  self.postMessage(field,[field.pixels.buffer]);
};
