import{describe,expect,it}from'vitest';
import{applyWeightChange,lockedTotal,normalizeToHundred}from'../weight-adjust';
import{VALUE_KEYS,type ValueKey,type ValueWeights}from'../models';
const sum=(w:ValueWeights)=>VALUE_KEYS.reduce((n,k)=>n+w[k],0);
const base:ValueWeights={stability:40,growth:30,freedom:20,money:10};
describe('normalizeToHundred',()=>{
  it('keeps exact-100 weights untouched',()=>{expect(normalizeToHundred(base)).toEqual(base)});
  it('normalizes raw legacy slider values to integers summing exactly 100',()=>{
    const w=normalizeToHundred({stability:50,growth:50,freedom:50,money:50});
    expect(w).toEqual({stability:25,growth:25,freedom:25,money:25});
    expect(sum(w)).toBe(100);
  });
  it('falls back to equal shares for all-zero weights',()=>{expect(normalizeToHundred({stability:0,growth:0,freedom:0,money:0})).toEqual({stability:25,growth:25,freedom:25,money:25})});
  it('rounds deterministically by largest remainder',()=>{expect(normalizeToHundred({stability:1,growth:1,freedom:1,money:0})).toEqual({stability:34,growth:33,freedom:33,money:0})});
});
describe('applyWeightChange 联动分摊',()=>{
  it('increase is absorbed by unlocked peers proportionally to their current values',()=>{
    const r=applyWeightChange(base,[],'stability',60);
    expect(r).toMatchObject({ok:true});
    if(r.ok){expect(r.weights).toEqual({stability:60,growth:20,freedom:13,money:7});expect(sum(r.weights)).toBe(100)}
  });
  it('decrease is distributed to peers proportionally',()=>{
    const r=applyWeightChange(base,[],'stability',20);
    if(r.ok)expect(r.weights).toEqual({stability:20,growth:40,freedom:27,money:13});
  });
  it('zero-weight peers stay zero in both directions',()=>{
    const w:ValueWeights={stability:40,growth:30,freedom:30,money:0};
    const up=applyWeightChange(w,[],'stability',60);
    if(up.ok)expect(up.weights.money).toBe(0);
    const down=applyWeightChange(w,[],'stability',20);
    if(down.ok)expect(down.weights.money).toBe(0);
  });
  it('splits equally when every peer is zero',()=>{
    const r=applyWeightChange({stability:60,growth:0,freedom:0,money:0},[],'stability',20);
    if(r.ok)expect(r.weights).toEqual({stability:20,growth:14,freedom:13,money:13});
  });
  it('keeps locked dimensions untouched and shares only the remainder',()=>{
    const r=applyWeightChange(base,['money'],'stability',60);
    if(r.ok){expect(r.weights.money).toBe(10);expect(r.weights).toEqual({stability:60,growth:18,freedom:12,money:10})}
  });
  it('clamps the target to 100 minus the locked total',()=>{
    const r=applyWeightChange(base,['growth','freedom'],'stability',90);
    if(r.ok){expect(r.clamped).toBe(true);expect(r.weights).toEqual({stability:50,growth:30,freedom:20,money:0})}
  });
  it('never pushes a peer above the cap when absorbing an increase',()=>{
    const r=applyWeightChange({stability:50,growth:50,freedom:0,money:0},['freedom','money'],'stability',0);
    if(r.ok)expect(r.weights.growth).toBe(100);
  });
});
describe('applyWeightChange 拒绝无法实现的拖动',()=>{
  it('rejects dragging a locked dimension',()=>{
    const r=applyWeightChange(base,['stability'],'stability',60);
    expect(r).toMatchObject({ok:false,reason:'locked'});
    if(!r.ok)expect(r.message).toContain('锁定');
  });
  it('rejects when every other dimension is locked',()=>{
    const r=applyWeightChange(base,['growth','freedom','money'],'stability',60);
    expect(r).toMatchObject({ok:false,reason:'no-peer'});
  });
  it('rejects when locked dimensions already fill 100%',()=>{
    const w:ValueWeights={stability:60,growth:40,freedom:0,money:0};
    const r=applyWeightChange(w,['stability','growth'],'freedom',10);
    expect(r).toMatchObject({ok:false,reason:'locked-full'});
  });
  it('accepts a no-op drag even when adjustment is impossible',()=>{
    const w:ValueWeights={stability:60,growth:40,freedom:0,money:0};
    expect(applyWeightChange(w,['stability','growth'],'freedom',0)).toMatchObject({ok:true});
    expect(applyWeightChange(base,['growth','freedom','money'],'stability',40)).toMatchObject({ok:true});
  });
});
describe('applyWeightChange 不变量',()=>{
  it('always returns integers summing to exactly 100 within [0,100]',()=>{
    let seed=42;
    const rand=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648};
    for(let i=0;i<300;i++){
      const start=normalizeToHundred({stability:rand()*100,growth:rand()*100,freedom:rand()*100,money:rand()*100});
      const locks=VALUE_KEYS.filter(()=>rand()<.4);
      const key=VALUE_KEYS[Math.floor(rand()*4)];
      const r=applyWeightChange(start,locks,key,Math.floor(rand()*140-20));
      if(!r.ok)continue;
      expect(sum(r.weights)).toBe(100);
      for(const k of VALUE_KEYS){expect(Number.isInteger(r.weights[k])).toBe(true);expect(r.weights[k]).toBeGreaterThanOrEqual(0);expect(r.weights[k]).toBeLessThanOrEqual(100)}
      for(const k of locks)expect(r.weights[k]).toBe(start[k]);
      if(!locks.includes(key)&&locks.length<3&&lockedTotal(start,locks)<100)expect(r.weights[key]).toBe(Math.max(0,Math.min(100-lockedTotal(start,locks),r.weights[key])));
    }
  });
  it('a continuous drag recomputed from the drag-start snapshot accumulates no rounding error',()=>{
    const dragStart=base;
    let latest:ValueWeights=dragStart;
    for(let t=41;t<=70;t++){const r=applyWeightChange(dragStart,[],'stability',t);if(r.ok)latest=r.weights}
    const direct=applyWeightChange(dragStart,[],'stability',70);
    if(direct.ok)expect(latest).toEqual(direct.weights);
  });
  it('step-by-step application stays exact at every intermediate state',()=>{
    let current=base;
    for(let t=41;t<=70;t++){const r=applyWeightChange(current,[],'stability',t);if(r.ok){current=r.weights;expect(sum(current)).toBe(100)}}
  });
});
describe('lockedTotal',()=>{
  it('sums only locked dimensions',()=>{expect(lockedTotal(base,['stability','money'])).toBe(50);expect(lockedTotal(base,[])).toBe(0)});
});
