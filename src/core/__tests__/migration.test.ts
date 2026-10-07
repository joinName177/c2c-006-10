import{describe,expect,it}from'vitest';
import{migrateSavedCase}from'../migration';

describe('migrateSavedCase',()=>{
  it('旧案例（无 weightLocks）补齐默认锁定状态',()=>{
    const old={draft:{id:'a',title:'t',background:'',options:[],weights:{stability:30,growth:35,freedom:20,money:15}}};
    const c=migrateSavedCase(old)!;
    expect(c.draft.weightLocks).toEqual({stability:false,growth:false,freedom:false,money:false});
    expect(c.draft.weights).toEqual({stability:30,growth:35,freedom:20,money:15});
  });
  it('旧的未归一化原始权重配算为整数点，和为 100，仍可按原方式编辑',()=>{
    const old={draft:{id:'a',title:'t',background:'',options:[],weights:{stability:1,growth:2,freedom:3,money:4}}};
    const c=migrateSavedCase(old)!;
    expect(Object.values(c.draft.weights).reduce((a,b)=>a+b,0)).toBe(100);
  });
  it('旧案例保存过分析结果时，以分析实际使用的归一化权重为差异基线',()=>{
    const old={draft:{id:'a',title:'t',background:'',options:[],weights:{stability:1,growth:1,freedom:1,money:0}},analysis:{options:[],recommendation:''}};
    const c=migrateSavedCase(old)!;
    expect(c.basis).toEqual({stability:33.3,growth:33.3,freedom:33.3,money:0});
  });
  it('损坏数据返回 undefined 而非抛错',()=>{
    expect(migrateSavedCase(null)).toBeUndefined();
    expect(migrateSavedCase({})).toBeUndefined();
    expect(migrateSavedCase('x')).toBeUndefined();
  });
  it('新案例（含 weightLocks、basis）原样保留',()=>{
    const fresh={draft:{id:'a',title:'t',background:'',options:[],weights:{stability:25,growth:25,freedom:25,money:25},weightLocks:{stability:true,growth:false,freedom:false,money:false}},basis:{stability:25,growth:25,freedom:25,money:25}};
    expect(migrateSavedCase(fresh)).toEqual(fresh);
  });
});
