import{VALUE_KEYS,type ValueKey,type ValueWeights,type WeightLocks}from'./models';

export const PRESETS:Record<string,ValueWeights>={
  均衡考虑:{stability:25,growth:25,freedom:25,money:25},
  稳健优先:{stability:45,growth:15,freedom:15,money:25},
  成长优先:{stability:15,growth:50,freedom:20,money:15},
  自由优先:{stability:15,growth:20,freedom:50,money:15}
};

/**
 * 归一化到百分比，保留一位小数。分析引擎的入口。
 * 对“整数百分点”（编辑态的唯一内部表示）是恒等映射，因此界面显示、
 * 草稿存储与评分计算永远使用同一份数。
 */
export function normalizeWeights(weights:ValueWeights):ValueWeights{
  const sum=VALUE_KEYS.reduce((n,k)=>n+Math.max(0,weights[k]),0);
  if(!sum)throw new Error('请至少关注一个价值维度');
  return Object.fromEntries(VALUE_KEYS.map(k=>
    [k,Math.round(Math.max(0,weights[k])/sum*1000)/10]
  ))as ValueWeights;
}

/**
 * 最大余数法：把份额按权重比例配成整数点，余数逐点发给小数部分最大者。
 * 每次拖动都从规范状态（整数、和为 100）重新配算，连续微调不会累积误差。
 */
export function toPoints(raw:ValueWeights):ValueWeights{
  const positive=VALUE_KEYS.filter(k=>raw[k]>0);
  if(!positive.length)return Object.fromEntries(VALUE_KEYS.map(k=>[k,0]))as ValueWeights;
  const total=positive.reduce((n,k)=>n+raw[k],0);
  const shares=new Map<ValueKey,number>();
  positive.forEach(k=>shares.set(k,raw[k]/total*100));
  const floors=Object.fromEntries(VALUE_KEYS.map(k=>[k,0])) as ValueWeights;
  const fractions=new Map<ValueKey,number>();
  positive.forEach(k=>{
    const s=shares.get(k)!;
    floors[k]=Math.floor(s);
    fractions.set(k,s-Math.floor(s));
  });
  let remainder=100-VALUE_KEYS.reduce((n,k)=>n+floors[k],0);
  for(const k of[...fractions.entries()].sort((a,b)=>b[1]-a[1]||VALUE_KEYS.indexOf(a[0])-VALUE_KEYS.indexOf(b[0])).map(([k])=>k)){
    if(remainder<=0)break;
    floors[k]+=1;
    remainder-=1;
  }
  return floors;
}

export interface WeightAdjustment{weights:ValueWeights;notice?:string}

/**
 * 锁定某一维度后拖动另一个维度的联动重算。
 *
 * 分摊策略（与“按原比例分摊”比较后的选择）：
 * - 向上拖 target：其余可调维度让出权重，按“当前权重”比例分摊——当前权重
 *   恰好就是各自的“可减余量”，所以零权重维度可让出量为 0，不会被算成负数；
 *   接近 100 的维度承担越多，也越早到顶。
 * - 向下拖 target：其余可调维度吸收权重，按“100−当前权重”比例分摊——这是
 *   各自的“可增余量”，零权重维度吸收能力最强，接近上限的维度不会被分到超限。
 * 若改用统一的“按原始固定比例分摊”，零权重维度永远分不到让出量（滑块看似拖不动），
 * 接近 100 的维度会被分到超出上限的值，只能再钳制抹平，反而制造误差。
 *
 * 边界：
 * - 全部锁定 / 仅剩一个可调维度：没有联动空间，唯一可调维度的份额被锁定项钉死，
 *   拖动一律拒绝（滑块弹回）并说明原因。
 * - 锁定部分已占满（锁定之和为 100）：等价于没有可调空间，拒绝。
 * - 可分摊余量不足（其余维度已到 0 或 100）：拖动被截断到可达位置，并给出提示。
 */
export function adjustWeights(current:ValueWeights,locks:WeightLocks,target:ValueKey,targetValue:number):WeightAdjustment{
  const next:ValueWeights={...current};
  const desired=Math.max(0,Math.min(100,Math.round(targetValue)));
  const locked=VALUE_KEYS.filter(k=>locks[k]);
  const lockedSum=locked.reduce((n,k)=>n+current[k],0);
  const others=VALUE_KEYS.filter(k=>k!==target&&!locks[k]);

  // 全部锁定 / 仅一项可调 / 锁定部分已占满：自由份额为 0，任何移动都不可能实现。
  // 此判断优先于“目标自身锁定”，确保全部锁定时给出的是“没有联动空间”而非含糊的单项提示。
  if(locked.length===VALUE_KEYS.length||others.length===0||lockedSum>=100){
    return{weights:current,notice:lockedSum>=100
      ?'锁定的维度已占满 100%，没有可联动调整的空间。请先解锁部分维度。'
      :'只剩一个可调维度时，其份额被锁定维度钉死，无法拖动。请先解锁一个维度。'};
  }
  // 目标维度自身被锁定时，滑块不应可用；防御性地原样返回。
  if(locks[target])return{weights:current,notice:'该维度已锁定，请先解锁再调整。'};

  const delta=desired-current[target];
  if(delta===0)return{weights:next};
  const capacityKey=delta>0
    ?(k:ValueKey)=>current[k]                                   // 可减余量
    :(k:ValueKey)=>100-current[k];                              // 可增余量
  const rawCapacities=others.map(k=>({k,cap:Math.max(0,capacityKey(k))}));
  const capacityTotal=rawCapacities.reduce((n,x)=>n+x.cap,0);
  let notice:string|undefined;
  if(capacityTotal===0){
    return{weights:current,notice:delta>0
      ?'其余可调维度都已是 0%，没有可让出的权重。'
      :'其余可调维度都已接近 100%，没有可承接的空间。'};
  }

  let amount=delta;
  if(Math.abs(delta)>capacityTotal){
    amount=delta>0?capacityTotal:-capacityTotal;
    notice=delta>0
      ?'其余可调维度最多只能让出这些权重，已到可达上限。'
      :'其余可调维度最多只能承接这些权重，已到可达下限。';
  }
  next[target]=current[target]+amount;

  // 按余量比例把整数点分摊给其余维度，最大余数法保证和不变。
  // amount>0：others 合计减少 amount；amount<0：合计增加 -amount。
  const need=Math.abs(amount);
  const raw=Object.fromEntries(VALUE_KEYS.map(k=>[k,0]))as ValueWeights;
  rawCapacities.forEach(({k,cap})=>{raw[k]=cap/capacityTotal*need;});
  const floored=Object.fromEntries(VALUE_KEYS.map(k=>[k,0]))as ValueWeights;
  const fracs=new Map<ValueKey,number>();
  others.forEach(k=>{
    floored[k]=Math.floor(raw[k]);
    fracs.set(k,raw[k]-Math.floor(raw[k]));
  });
  let leftover=need-others.reduce((n,k)=>n+floored[k],0);
  for(const k of[...fracs.entries()].sort((a,b)=>b[1]-a[1]||VALUE_KEYS.indexOf(a[0])-VALUE_KEYS.indexOf(b[0])).map(([k])=>k)){
    if(leftover<=0)break;
    floored[k]+=1;
    leftover-=1;
  }
  others.forEach(k=>{
    // 分摊方向与 delta 相反：delta>0 时 others 减少，delta<0 时 others 增加
    next[k]=delta>0?current[k]-floored[k]:current[k]+floored[k];
  });

  // 数值自检：显示值必须就是计算值（和为 100、各项在界内），不允许只把界面凑成 100%。
  const sum=VALUE_KEYS.reduce((n,k)=>n+next[k],0);
  if(sum!==100||VALUE_KEYS.some(k=>next[k]<0||next[k]>100)){
    return{weights:current,notice:'本次调整无法在 0–100% 范围内保持总和 100%，已还原。'};
  }
  return{weights:next,notice};
}

/** 切换某维度的锁定状态；锁定不改变当前权重，只影响后续联动分摊。 */
export function toggleLock(weights:ValueWeights,locks:WeightLocks,key:ValueKey):{weights:ValueWeights;locks:WeightLocks}{
  return{weights,locks:{...locks,[key]:!locks[key]}};
}
