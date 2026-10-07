import{describe,expect,it}from'vitest';
import{useDecisionStudio}from'../useDecisionStudio';
import type{SavedCase}from'../../core/models';
import type{CaseRepository}from'../../ports/case-repository.port';
import type{PrintPort}from'../../ports/print.port';

class MemoryRepository implements CaseRepository{
  private store:SavedCase[]=[];
  with(items:SavedCase[]){this.store=items;return this}
  list(){return this.store.map(s=>JSON.parse(JSON.stringify(s)))}
  save(value:SavedCase){this.store=[value,...this.store.filter(c=>c.draft.id!==value.draft.id)]}
  delete(id:string){this.store=this.store.filter(c=>c.draft.id!==id)}
}
const noPrint:PrintPort={print(){}};

describe('useDecisionStudio 权重会话',()=>{
  it('取消调整回到原分配，草稿不变',()=>{
    const s=useDecisionStudio(new MemoryRepository(),noPrint);
    const before={...s.draft.weights};
    s.startWeightEdit();
    s.adjustWeight('growth',45);
    s.cancelWeightEdit();
    expect(s.draft.weights).toEqual(before);
    expect(s.editingWeights.value).toBe(false);
  });
  it('确认后新分配落草稿，其余维度联动且和为 100',()=>{
    const s=useDecisionStudio(new MemoryRepository(),noPrint);
    s.startWeightEdit();
    s.adjustWeight('growth',45);
    s.confirmWeightEdit();
    expect(s.draft.weights.growth).toBe(45);
    expect(Object.values(s.draft.weights).reduce((a,b)=>a+b,0)).toBe(100);
    expect(s.editingWeights.value).toBe(false);
  });
  it('锁定的维度在联动中保持不变',()=>{
    const s=useDecisionStudio(new MemoryRepository(),noPrint);
    s.startWeightEdit();
    s.toggleWeightLock('stability');
    const locked=s.draft.weights.stability;
    s.adjustWeight('growth',50);
    s.confirmWeightEdit();
    expect(s.draft.weights.stability).toBe(locked);
  });
  it('无法实现的拖动弹回：锁定项占满时草稿副本不变并给出原因',()=>{
    const s=useDecisionStudio(new MemoryRepository(),noPrint);
    s.startWeightEdit();
    // 锁死 stability 与 growth（合计 65），再把 freedom 降到 0、money 降到 0 后锁定，
    // 使锁定项占满；这里直接构造：锁定三项后把份额全留给一项不可行，故锁住两个占大头并验证“仅一项可调”
    s.toggleWeightLock('stability');
    s.toggleWeightLock('growth');
    s.toggleWeightLock('money');
    const snapshot={...s.editWeights.value!};
    s.adjustWeight('freedom',50);
    expect(s.editWeights.value).toEqual(snapshot);
    expect(s.weightNotice.value).toContain('只剩一个可调维度');
  });
  it('保存与重新载入保留同一份权重与锁定状态',()=>{
    const repo=new MemoryRepository();
    const s1=useDecisionStudio(repo,noPrint);
    s1.startWeightEdit();
    s1.toggleWeightLock('stability');
    s1.adjustWeight('growth',45);
    s1.confirmWeightEdit();
    s1.save();
    const savedWeights={...s1.draft.weights};
    const savedLocks={...s1.draft.weightLocks};

    const s2=useDecisionStudio(repo,noPrint);
    const item=s2.cases.value[0];
    s2.load(item);
    expect(s2.draft.weights).toEqual(savedWeights);
    expect(s2.draft.weightLocks).toEqual(savedLocks);
  });
  it('载入旧案例（无锁定、原始权重）后可继续编辑与推演',()=>{
    const oldCase={draft:{id:'old',title:'旧案例',background:'',updatedAt:'',
      weights:{stability:1,growth:2,freedom:3,money:4},
      options:[
        {id:'o1',name:'甲',description:'',impacts:{stability:1,growth:1,freedom:1,money:1},reversibility:50},
        {id:'o2',name:'乙',description:'',impacts:{stability:-1,growth:0,freedom:0,money:0},reversibility:50}
      ]}} as unknown as SavedCase;
    const s=useDecisionStudio(new MemoryRepository().with([oldCase]),noPrint);
    s.load(s.cases.value[0]);
    expect(s.draft.weightLocks).toBeTruthy();
    expect(Object.values(s.draft.weights).reduce((a,b)=>a+b,0)).toBe(100);
    s.analyze();
    expect(s.errors.value).toHaveLength(0);
    expect(s.analysis.value).toBeTruthy();
  });
});
