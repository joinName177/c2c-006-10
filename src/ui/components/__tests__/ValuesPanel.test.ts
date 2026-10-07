import{describe,expect,it,vi}from'vitest';
import{mount}from'@vue/test-utils';
import ValuesPanel from'../ValuesPanel.vue';
import type{ValueWeights,WeightLocks}from'../../../core/models';

const W:ValueWeights={stability:30,growth:35,freedom:20,money:15};
const L:WeightLocks={stability:false,growth:false,freedom:false,money:false};

function mountPanel(props={}){
  return mount(ValuesPanel,{
    props:{weights:{...W},locks:{...L},editing:false,...props}
  });
}

describe('ValuesPanel',()=>{
  it('非编辑态：滑块与锁定按钮禁用，显示当前百分比且合计 100%',()=>{
    const w=mountPanel();
    expect(w.findAll('input[type=range]')[0].attributes('disabled')).toBeDefined();
    expect(w.findAll('.lock-btn')[0].attributes('disabled')).toBeDefined();
    expect(w.text()).toContain('35%');
    expect(w.text()).toContain('100%');
    expect(w.find('button.edit-btn').exists()).toBe(true);
  });
  it('点击“调整权重”发出 start',async()=>{
    const w=mountPanel();
    await w.find('button.edit-btn').trigger('click');
    expect(w.emitted('start')).toBeTruthy();
  });
  it('编辑态：拖动滑块发出 adjust(key,value)',async()=>{
    const w=mountPanel({editing:true});
    const growthInput=w.findAll('input[type=range]')[1];
    (growthInput.element as HTMLInputElement).value='45';
    await growthInput.trigger('input');
    const emitted=w.emitted('adjust')!;
    expect(emitted[0]).toEqual(['growth',45]);
  });
  it('锁定维度：滑块禁用，点击锁定按钮发出 toggle',async()=>{
    const w=mountPanel({editing:true,locks:{...L,growth:true}});
    expect(w.findAll('input[type=range]')[1].attributes('disabled')).toBeDefined();
    await w.findAll('.lock-btn')[1].trigger('click');
    expect(w.emitted('toggle')![0]).toEqual(['growth']);
  });
  it('确认/取消分别发出 confirm/cancel',async()=>{
    const w=mountPanel({editing:true});
    const buttons=w.findAll('.weight-actions button');
    await buttons[0].trigger('click');
    await buttons[1].trigger('click');
    expect(w.emitted('cancel')).toBeTruthy();
    expect(w.emitted('confirm')).toBeTruthy();
  });
  it('预设按钮发出 preset 与对应权重',async()=>{
    const w=mountPanel({editing:true});
    await w.findAll('.preset-list button')[0].trigger('click');
    const emitted=w.emitted('preset')![0][0] as ValueWeights;
    expect(Object.values(emitted).reduce((a,b)=>a+b,0)).toBe(100);
  });
  it('显示与上次分析的差异方向',()=>{
    const basis:ValueWeights={stability:25,growth:40,freedom:20,money:15};
    const w=mountPanel({basis});
    const text=w.text();
    expect(text).toContain('▲ 5');
    expect(text).toContain('▼ 5');
  });
  it('显示被拒绝拖动的原因提示',()=>{
    const w=mountPanel({editing:true,notice:'只剩一个可调维度时，其份额被锁定维度钉死，无法拖动。请先解锁一个维度。'});
    expect(w.find('.weight-notice').text()).toContain('只剩一个可调维度');
  });
});
