import{describe,expect,it}from'vitest';
import{adjustWeights,normalizeWeights,toPoints}from'../weight-service';
import type{ValueKey,ValueWeights,WeightLocks}from'../models';

const W=(s:number,g:number,f:number,m:number):ValueWeights=>({stability:s,growth:g,freedom:f,money:m});
const L=(s:boolean,g:boolean,f:boolean,m:boolean):WeightLocks=>({stability:s,growth:g,freedom:f,money:m});

describe('normalizeWeights',()=>{
  it('整数百分点归一化为恒等映射，显示值即计算值',()=>{
    expect(normalizeWeights(W(30,35,20,15))).toEqual(W(30,35,20,15));
  });
  it('全部为零时抛出错误',()=>{
    expect(()=>normalizeWeights(W(0,0,0,0))).toThrow('请至少关注一个价值维度');
  });
  it('未归一化原始值按比例归一并保留一位小数',()=>{
    expect(normalizeWeights(W(1,1,1,0))).toEqual(W(33.3,33.3,33.3,0));
  });
});

describe('toPoints',()=>{
  it('最大余数法配成整数且和恒为 100',()=>{
    const p=toPoints(W(1,1,1,1));
    expect(p).toEqual(W(25,25,25,25));
    expect(Object.values(p).reduce((a,b)=>a+b,0)).toBe(100);
  });
  it('除不尽时余数按小数部分逐点分发',()=>{
    const p=toPoints(W(1,1,1,0)); // 各 33.33…，三个非零
    expect(Object.values(p).reduce((a,b)=>a+b,0)).toBe(100);
    expect(p).toEqual(W(34,33,33,0));
  });
  it('全零安全处理为全零',()=>{
    expect(toPoints(W(0,0,0,0))).toEqual(W(0,0,0,0));
  });
});

describe('adjustWeights',()=>{
  it('上调一个维度，其余可调维度按当前权重比例让出，和仍为 100',()=>{
    const r=adjustWeights(W(30,35,20,15),L(false,false,false,false),'growth',45);
    expect(r.weights).toEqual(W(25,45,17,13));
    expect(r.notice).toBeUndefined();
    expect(Object.values(r.weights).reduce((a,b)=>a+b,0)).toBe(100);
  });
  it('下调一个维度，其余维度按可增余量（100-当前值）承接',()=>{
    // 25/25/25/25 → stability 降到 15：余量均为 75，各承接 3.33…；余数 1 给排序最前者
    const r=adjustWeights(W(25,25,25,25),L(false,false,false,false),'stability',15);
    expect(r.weights).toEqual(W(15,29,28,28));
    expect(Object.values(r.weights).reduce((a,b)=>a+b,0)).toBe(100);
  });
  it('锁定维度保持原值且不参与分摊',()=>{
    const r=adjustWeights(W(30,35,20,15),L(true,false,false,false),'growth',45);
    expect(r.weights.stability).toBe(30);
    expect(r.weights.growth).toBe(45);
    expect(Object.values(r.weights).reduce((a,b)=>a+b,0)).toBe(100);
  });
  it('零权重的可调维度无需让出（不会被算成负数）',()=>{
    // money=0，growth 上调时只能从 stability/freedom 让出
    const r=adjustWeights(W(30,50,20,0),L(false,false,false,false),'growth',60);
    expect(r.weights.money).toBe(0);
    expect(r.weights.stability).toBe(24);
    expect(r.weights.freedom).toBe(16);
  });
  it('接近上限时下调，承接量主要给到余量更大的低权重维度',()=>{
    // growth=99, stability=1：freedom/money 的可增余量(100)大于 stability(99)，
    // 且 stability 已承接过一部分；按余量比例，余数分给排序靠前的 freedom
    const r=adjustWeights(W(1,99,0,0),L(false,false,false,false),'growth',98);
    expect(r.weights.growth).toBe(98);
    expect(Object.values(r.weights).reduce((a,b)=>a+b,0)).toBe(100);
    expect(r.weights.freedom).toBe(1);
  });
  it('可让出余量受锁定项挤压不足时，截断到可达位置并提示原因',()=>{
    // 锁定 stability(20) 与 money(20)，growth 想从 60 到 100（需 40），
    // 但可调的 stability? 已锁——仅剩 freedom(0)…改为仅锁 money：
    // 可调 others 为 stability(20)+freedom(0)，最多让出 20，growth 只能到 80
    const r=adjustWeights(W(20,60,0,20),L(false,false,false,true),'growth',100);
    expect(r.weights).toEqual(W(0,80,0,20));
    expect(r.notice).toContain('最多只能让出');
  });
  it('其余可调维度都已是 0% 时无法让出，原样弹回并说明',()=>{
    const r=adjustWeights(W(20,60,0,20),L(true,false,false,true),'growth',100);
    expect(r.weights).toEqual(W(20,60,0,20));
    expect(r.notice).toContain('已是 0%');
  });
  it('全部锁定时拒绝任意拖动',()=>{
    const r=adjustWeights(W(25,25,25,25),L(true,true,true,true),'freedom',30);
    expect(r.weights).toEqual(W(25,25,25,25));
    expect(r.notice).toContain('占满');
  });
  it('仅一项可调时拒绝拖动并说明被锁定项钉死',()=>{
    const r=adjustWeights(W(30,35,20,15),L(true,true,false,true),'freedom',30);
    expect(r.weights).toEqual(W(30,35,20,15));
    expect(r.notice).toContain('只剩一个可调维度');
  });
  it('锁定部分已占满 100% 时拒绝拖动',()=>{
    const r=adjustWeights(W(60,40,0,0),L(true,true,false,false),'freedom',10);
    expect(r.weights).toEqual(W(60,40,0,0));
    expect(r.notice).toContain('占满');
  });
  it('拖动被锁定的目标维度时拒绝',()=>{
    const r=adjustWeights(W(30,35,20,15),L(false,true,false,false),'growth',50);
    expect(r.weights).toEqual(W(30,35,20,15));
    expect(r.notice).toContain('已锁定');
  });
  it('反复连续微调不积累误差：100 次往返后仍是规范整数分配',()=>{
    let w=W(25,25,25,25);
    const locks=L(false,false,false,false);
    for(let i=0;i<100;i++){
      w=adjustWeights(w,locks,'growth',30).weights;
      w=adjustWeights(w,locks,'growth',25).weights;
    }
    expect(Object.values(w).reduce((a,b)=>a+b,0)).toBe(100);
    expect(Object.values(w).every(v=>Number.isInteger(v))).toBe(true);
  });
  it('非整数输入被四舍五入，结果始终为整数点',()=>{
    const r=adjustWeights(W(25,25,25,25),L(false,false,false,false),'growth',30.6);
    expect(Object.values(r.weights).every(v=>Number.isInteger(v))).toBe(true);
  });
});
