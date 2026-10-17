import test from 'node:test';
import assert from 'node:assert/strict';
import {cropRegion,containRect} from '../ui/crop-math.js';

test('square crop keeps the subject centered for landscape and portrait images',()=>{
  assert.deepEqual(cropRegion(1200,600),{x:300,y:0,size:600});
  assert.deepEqual(cropRegion(600,1200),{x:0,y:300,size:600});
  assert.deepEqual(cropRegion(1200,600,2),{x:450,y:150,size:300});
});
test('zoomed crops stay inside the source at every drag boundary, including tiny images',()=>{
  for(const [width,height] of [[1200,600],[600,1200],[64,32],[1,1]]){
    for(const zoom of [1,2,4])for(const x of [-10,0,.5,1,10])for(const y of [-10,0,.5,1,10]){
      const rect=cropRegion(width,height,zoom,x,y);
      assert.ok(rect.x>=0&&rect.y>=0&&rect.size>0);
      assert.ok(rect.x+rect.size<=width&&rect.y+rect.size<=height);
      assert.equal(rect.size,Math.min(width,height)/zoom);
    }
  }
});
test('whole-image fitting preserves aspect ratio and centers transparent padding',()=>{
  assert.deepEqual(containRect(1200,600,1024),{x:0,y:256,width:1024,height:512});
  assert.deepEqual(containRect(100,200,512),{x:128,y:0,width:256,height:512});
  assert.deepEqual(containRect(64,64,1024),{x:0,y:0,width:1024,height:1024});
});
