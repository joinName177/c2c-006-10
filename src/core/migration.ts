import{VALUE_KEYS,type SavedCase,type ValueWeights,type WeightLocks}from'./models';
import{normalizeWeights,toPoints}from'./weight-service';

const emptyLocks=():WeightLocks=>({stability:false,growth:false,freedom:false,money:false});

/**
 * 旧案例（没有 weightLocks、权重为未归一化原始值）迁移：
 * - 补齐锁定状态（默认全部未锁定）；
 * - 权重配算为整数百分点。旧案例原本由 normalizeWeights 归一化后参与计算，
 *   这里按同一比例口径配成整数，显示与推演结果保持一致，仍可按原方式继续编辑；
 * - 若旧案例保存过分析结果，以“上次分析实际使用的归一化权重”作为差异基线。
 * 无法解析的输入返回 undefined，由仓储层保留当前编辑内容、不覆盖。
 */
export function migrateSavedCase(raw:unknown):SavedCase|undefined{
  if(!raw||typeof raw!=='object')return undefined;
  const value=raw as Partial<SavedCase>;
  const draft=value.draft as SavedCase['draft']|undefined;
  if(!draft||!Array.isArray(draft.options)||!draft.weights)return undefined;
  const rawWeights=VALUE_KEYS.every(k=>typeof draft.weights[k]==='number')
    ?draft.weights
    :({stability:25,growth:25,freedom:25,money:25}as ValueWeights);
  let basis:ValueWeights|undefined;
  if(value.analysis){
    try{basis=normalizeWeights(rawWeights)}catch{/* 全零权重：无可用基线 */}
  }
  return{
    draft:{...draft,weights:toPoints(rawWeights),weightLocks:draft.weightLocks??emptyLocks()},
    analysis:value.analysis,
    basis:value.basis??basis
  };
}
