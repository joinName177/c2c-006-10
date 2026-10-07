import{beforeEach,describe,expect,it}from'vitest';
import{useDecisionStudio}from'../useDecisionStudio';
import{LocalCaseRepository}from'../../adapters/local-case.repository';
import{VALUE_KEYS,type SavedCase,type ValueWeights}from'../../core/models';
const storage=()=>{const map=new Map<string,string>();return{getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>void map.set(k,v),removeItem:(k:string)=>void map.delete(k),clear:()=>map.clear(),key:()=>null,get length(){return map.size}}as Storage};
const printer={print:()=>{}};
const sum=(w:ValueWeights)=>VALUE_KEYS.reduce((n,k)=>n+w[k],0);
describe('useDecisionStudio 权重与锁定',()=>{
  let repo:LocalCaseRepository;
  beforeEach(()=>{repo=new LocalCaseRepository(storage())});
  it('commits weights and locks together and marks the analysis stale',()=>{
    const studio=useDecisionStudio(repo,printer);
    studio.analyze();
    studio.setWeights({stability:50,growth:20,freedom:20,money:10},['growth']);
    expect(studio.draft.weights.stability).toBe(50);
    expect(studio.draft.weightLocks).toEqual(['growth']);
    expect(studio.stale.value).toBe(true);
  });
  it('analysis records the exact weights it used',()=>{
    const studio=useDecisionStudio(repo,printer);
    studio.setWeights({stability:50,growth:20,freedom:20,money:10},[]);
    studio.analyze();
    expect(studio.analysis.value?.weights).toEqual({stability:50,growth:20,freedom:20,money:10});
    expect(sum(studio.analysis.value!.weights!)).toBe(100);
  });
  it('save and reload preserve the same weights and lock state',()=>{
    const studio=useDecisionStudio(repo,printer);
    studio.setWeights({stability:60,growth:20,freedom:13,money:7},['growth','money']);
    studio.analyze();
    studio.save();
    const restored=useDecisionStudio(repo,printer);
    restored.load(repo.list()[0]);
    expect(restored.draft.weights).toEqual({stability:60,growth:20,freedom:13,money:7});
    expect(restored.draft.weightLocks).toEqual(['growth','money']);
    expect(restored.analysis.value?.weights).toEqual({stability:60,growth:20,freedom:13,money:7});
  });
  it('loads legacy cases without lock state and keeps them editable the old way',()=>{
    const studio=useDecisionStudio(repo,printer);
    studio.setWeights({stability:10,growth:10,freedom:10,money:10},['money']);
    const legacy:SavedCase={draft:{id:'old',title:'旧案例',background:'',weights:{stability:80,growth:80,freedom:40,money:0},updatedAt:'2026-01-01',options:studio.draft.options}};
    studio.load(legacy);
    expect(studio.draft.weightLocks).toEqual([]);
    studio.analyze();
    expect(studio.errors.value).toEqual([]);
    expect(studio.analysis.value?.weights).toEqual({stability:40,growth:40,freedom:20,money:0});
  });
  it('legacy saved analyses without weights simply show no diff',()=>{
    const studio=useDecisionStudio(repo,printer);
    studio.analyze();
    const saved=repo.list;
    const legacyAnalysis={...studio.analysis.value!};
    delete legacyAnalysis.weights;
    const item:SavedCase={draft:JSON.parse(JSON.stringify(studio.draft)),analysis:legacyAnalysis};
    studio.load(item);
    expect(studio.analysis.value?.weights).toBeUndefined();
    expect(saved).toBeTypeOf('function');
  });
});
