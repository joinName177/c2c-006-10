import{reactive,ref}from'vue';
import{analyzeDecision}from'../core/analysis-service';
import{migrateSavedCase}from'../core/migration';
import{createSampleDraft}from'../core/sample-data';
import{validateDraft}from'../core/validation';
import{adjustWeights,normalizeWeights,toggleLock}from'../core/weight-service';
import type{DecisionAnalysis,DecisionDraft,DecisionOption,SavedCase,ValueKey,ValueWeights,WeightLocks}from'../core/models';
import type{CaseRepository}from'../ports/case-repository.port';
import type{PrintPort}from'../ports/print.port';

export function useDecisionStudio(repository:CaseRepository,printer:PrintPort){
  const draft=reactive<DecisionDraft>(createSampleDraft());
  const analysis=ref<DecisionAnalysis>();
  const errors=ref<string[]>([]);
  const stale=ref(false);
  const cases=ref<SavedCase[]>(repository.list());

  // 上次分析实际使用的权重，作为“与上次分析差异”的对比基线
  const basisWeights=ref<ValueWeights>();
  // 权重编辑会话：确认前只动会话副本，取消即回到原分配
  const editingWeights=ref(false);
  const editWeights=ref<ValueWeights>();
  const editLocks=ref<WeightLocks>();
  const weightNotice=ref<string>();

  const touch=()=>{stale.value=Boolean(analysis.value);draft.updatedAt=new Date().toISOString()};

  function startWeightEdit(){
    editWeights.value={...draft.weights};
    editLocks.value={...draft.weightLocks};
    weightNotice.value=undefined;
    editingWeights.value=true;
  }
  function cancelWeightEdit(){
    editingWeights.value=false;
    editWeights.value=undefined;
    editLocks.value=undefined;
    weightNotice.value=undefined;
  }
  function confirmWeightEdit(){
    if(!editWeights.value||!editLocks.value)return;
    draft.weights={...editWeights.value};
    draft.weightLocks={...editLocks.value};
    cancelWeightEdit();
    touch();
  }
  function adjustWeight(key:ValueKey,value:number){
    if(!editWeights.value||!editLocks.value)return;
    const result=adjustWeights(editWeights.value,editLocks.value,key,value);
    // 被拒绝的拖动：会话权重保持原值，滑块绑定随之弹回
    editWeights.value=result.weights;
    weightNotice.value=result.notice;
  }
  function toggleWeightLock(key:ValueKey){
    if(!editWeights.value||!editLocks.value)return;
    const result=toggleLock(editWeights.value,editLocks.value,key);
    editWeights.value=result.weights;
    editLocks.value=result.locks;
    weightNotice.value=undefined;
  }
  function applyPreset(weights:ValueWeights){
    if(!editWeights.value||!editLocks.value)return;
    // 预设是一整套新分配，原有锁定不再适用：统一解锁后可继续锁定、微调
    editWeights.value={...weights};
    editLocks.value={stability:false,growth:false,freedom:false,money:false};
    weightNotice.value='已载入预设并解除全部锁定，可在此基础上继续调整。';
  }

  function addOption(){if(draft.options.length>=4)return;draft.options.push({id:`option-${Date.now()}`,name:'新选项',description:'',impacts:{stability:0,growth:0,freedom:0,money:0},reversibility:70});touch()}
  function removeOption(id:string){if(draft.options.length<=2)return;draft.options=draft.options.filter(o=>o.id!==id);touch()}
  function updateOption(id:string,patch:Partial<DecisionOption>){const target=draft.options.find(o=>o.id===id);if(target)Object.assign(target,patch);touch()}

  function analyze(){
    errors.value=validateDraft(draft);
    if(errors.value.length)return;
    analysis.value=analyzeDecision(draft);
    basisWeights.value=normalizeWeights(draft.weights);
    stale.value=false;
  }
  function save(){
    repository.save({draft:JSON.parse(JSON.stringify(draft)),analysis:analysis.value,basis:basisWeights.value});
    cases.value=repository.list();
  }
  function load(item:SavedCase){
    const migrated=migrateSavedCase(item)??item;
    cancelWeightEdit();
    Object.assign(draft,JSON.parse(JSON.stringify(migrated.draft)));
    analysis.value=migrated.analysis;
    basisWeights.value=migrated.basis??(migrated.analysis?normalizeWeights(migrated.draft.weights):undefined);
    stale.value=false;
  }
  function remove(id:string){repository.delete(id);cases.value=repository.list()}

  return{
    draft,analysis,errors,stale,cases,
    basisWeights,editingWeights,editWeights,editLocks,weightNotice,
    touch,
    startWeightEdit,cancelWeightEdit,confirmWeightEdit,adjustWeight,toggleWeightLock,applyPreset,
    addOption,removeOption,updateOption,
    analyze,save,load,remove,
    print:()=>printer.print()
  };
}
