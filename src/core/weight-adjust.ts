import{VALUE_KEYS,VALUE_LABELS,type ValueKey,type ValueWeights}from'./models';
export const MAX_WEIGHT=100;
export type AdjustRejection='locked'|'no-peer'|'locked-full';
export type AdjustResult={ok:true;weights:ValueWeights;clamped:boolean}|{ok:false;reason:AdjustRejection;message:string};
/*
 * 联动分摊策略：按原比例分摊（选择），而非按可调余量分摊（弃用）。
 *
 * 拖动某维度时，其余未锁定维度需要吸收反向的变化量，比较了两种策略：
 * A. 按原比例分摊：每个可调维度按自身当前占比分担变化量。
 * B. 按可调余量分摊：吸收增加量时按“距上限的余量”分摊，吸收减少量时按当前值分摊。
 * 选择 A，理由：
 * - 减少方向上两者等价（可降余量就是当前值），差异只在增加方向；
 * - B 在增加方向上会把余量最大的维度（通常是用户刻意设为 0 的维度）最先拉高，
 *   违背“零权重是用户的明确表态”；且有维度接近上限时需要多轮截断再分配，
 *   每轮取整都会积累误差；
 * - A 在数学上自限：other' = other × (S'/S) ≤ S' = 上限 − 目标值，
 *   任何维度都不会越过上限或跌破 0，无需迭代截断，单次取整即可精确凑满 100。
 *
 * 边界处理：
 * - 零权重：吸收减少量时比例分配天然保持 0（不会变负）；吸收增加量时同样保持 0，
 *   除非所有可调维度都是 0（彼此无从区分），此时均分。
 * - 接近上限：每个维度的上限 = 100 − 已锁定合计；拖过上限时钳制到上限并提示，
 *   其余维度仍按钳制后的真实变化量分摊，显示值与计算值始终是同一份整数。
 *
 * 防误差积累：所有权重都是和恰好为 100 的整数（最大余数法取整，按 VALUE_KEYS
 * 顺序决胜，结果确定）；组件在一次拖动中始终以拖动起点的快照为基准计算，
 * 连续的微小调整不会把取整误差叠加进结果。
 */
function largestRemainder(entries:{key:ValueKey;share:number}[],total:number):ValueWeights{
  const floors=entries.map(e=>Math.floor(e.share));
  let rest=total-floors.reduce((n,v)=>n+v,0);
  const order=entries.map((_,i)=>i).sort((a,b)=>(entries[b].share-floors[b])-(entries[a].share-floors[a])||VALUE_KEYS.indexOf(entries[a].key)-VALUE_KEYS.indexOf(entries[b].key));
  const result={}as ValueWeights;
  entries.forEach((e,i)=>{result[e.key]=floors[i]});
  for(const i of order){if(rest<=0)break;result[entries[i].key]+=1;rest-=1}
  return result;
}
export function normalizeToHundred(weights:ValueWeights):ValueWeights{
  const sum=VALUE_KEYS.reduce((n,k)=>n+Math.max(0,weights[k]||0),0);
  if(!sum)return largestRemainder(VALUE_KEYS.map(key=>({key,share:MAX_WEIGHT/VALUE_KEYS.length})),MAX_WEIGHT);
  return largestRemainder(VALUE_KEYS.map(key=>({key,share:Math.max(0,weights[key]||0)/sum*MAX_WEIGHT})),MAX_WEIGHT);
}
export function lockedTotal(weights:ValueWeights,locks:readonly ValueKey[]):number{
  return VALUE_KEYS.filter(k=>locks.includes(k)).reduce((n,k)=>n+weights[k],0);
}
export function applyWeightChange(base:ValueWeights,locks:readonly ValueKey[],key:ValueKey,rawTarget:number):AdjustResult{
  if(locks.includes(key))return{ok:false,reason:'locked',message:`「${VALUE_LABELS[key]}」已锁定，解锁后才能调整。`};
  const lockedSum=lockedTotal(base,locks);
  const peers=VALUE_KEYS.filter(k=>k!==key&&!locks.includes(k));
  const wanted=Math.round(rawTarget);
  if(lockedSum>=MAX_WEIGHT){
    if(wanted>base[key])return{ok:false,reason:'locked-full',message:`锁定维度合计已占满 ${MAX_WEIGHT}%，没有可分配的余量。`};
    return{ok:true,weights:{...base},clamped:false};
  }
  if(!peers.length){
    if(wanted!==base[key])return{ok:false,reason:'no-peer',message:'其余维度都已锁定，没有可联动分担的维度。'};
    return{ok:true,weights:{...base},clamped:false};
  }
  const max=MAX_WEIGHT-lockedSum;
  const target=Math.max(0,Math.min(max,wanted));
  if(target===base[key])return{ok:true,weights:{...base},clamped:wanted!==target};
  const delta=target-base[key];
  const peerSum=peers.reduce((n,k)=>n+base[k],0);
  const nextPeerSum=peerSum-delta;
  const shares=peers.map(k=>({key:k,share:peerSum>0?base[k]/peerSum*nextPeerSum:nextPeerSum/peers.length}));
  const distributed=largestRemainder(shares,nextPeerSum);
  const weights={...base,[key]:target};
  for(const k of peers)weights[k]=distributed[k];
  return{ok:true,weights,clamped:wanted!==target};
}
