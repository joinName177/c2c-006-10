import{describe,expect,it}from'vitest';
import{mount}from'@vue/test-utils';
import ValuesPanel from'../components/ValuesPanel.vue';
import type{ValueKey,ValueWeights}from'../../core/models';
const weights:ValueWeights={stability:40,growth:30,freedom:20,money:10};
function mountPanel(props?:{locks?:ValueKey[];analyzed?:ValueWeights;weights?:ValueWeights}){
  return mount(ValuesPanel,{props:{weights:props?.weights??weights,locks:props?.locks??[],analyzed:props?.analyzed}});
}
async function enterEdit(wrapper:ReturnType<typeof mountPanel>){await wrapper.find('.edit-toggle').trigger('click')}
describe('ValuesPanel 查看模式',()=>{
  it('shows normalized percentages and lock markers without sliders',()=>{
    const wrapper=mountPanel({locks:['growth'],weights:{stability:80,growth:80,freedom:40,money:0}});
    expect(wrapper.findAll('input[type=range]')).toHaveLength(0);
    expect(wrapper.text()).toContain('40%');
    expect(wrapper.find('.lock-marker').exists()).toBe(true);
  });
  it('shows diff badges against the last analysis weights',()=>{
    const wrapper=mountPanel({analyzed:{stability:30,growth:35,freedom:20,money:15}});
    const diffs=wrapper.findAll('.diff');
    expect(diffs.length).toBeGreaterThan(0);
    expect(wrapper.text()).toContain('+10');
    expect(wrapper.text()).toContain('-5');
  });
});
describe('ValuesPanel 调整会话',()=>{
  it('links unlocked dimensions while keeping the sum at exactly 100',async()=>{
    const wrapper=mountPanel();await enterEdit(wrapper);
    const sliders=wrapper.findAll('input[type=range]');
    await sliders[0].setValue(60);
    expect(wrapper.emitted('update')).toBeUndefined();
    const text=wrapper.text();
    expect(text).toContain('60%');expect(text).toContain('20%');expect(text).toContain('13%');expect(text).toContain('7%');
  });
  it('recomputes from the drag-start snapshot during one continuous drag',async()=>{
    const wrapper=mountPanel();await enterEdit(wrapper);
    const slider=wrapper.findAll('input[type=range]')[0];
    const el=slider.element as HTMLInputElement;
    await slider.trigger('pointerdown');
    for(const v of[45,55,60]){el.value=String(v);await slider.trigger('input')}
    await slider.trigger('change');
    expect(wrapper.text()).toContain('60%');expect(wrapper.text()).toContain('20%');expect(wrapper.text()).toContain('13%');expect(wrapper.text()).toContain('7%');
  });
  it('keeps locked dimensions untouched',async()=>{
    const wrapper=mountPanel();await enterEdit(wrapper);
    await wrapper.findAll('.lock')[3].trigger('click');
    await wrapper.findAll('input[type=range]')[0].setValue(60);
    expect(wrapper.text()).toContain('10%');
    const head=wrapper.findAll('.weight-row')[3].text();
    expect(head).toContain('10%');
  });
  it('rejects the drag with a reason when no peer can absorb the change',async()=>{
    const wrapper=mountPanel();await enterEdit(wrapper);
    for(const i of[1,2,3])await wrapper.findAll('.lock')[i].trigger('click');
    const slider=wrapper.findAll('input[type=range]')[0];
    await slider.setValue(60);
    expect(wrapper.find('.adjust-hint').text()).toContain('没有可联动分担的维度');
    expect(wrapper.findAll('.weight-row')[0].text()).toContain('40%');
    expect((slider.element as HTMLInputElement).value).toBe('40');
  });
  it('rejects the drag when locked dimensions already fill 100%',async()=>{
    const wrapper=mountPanel({weights:{stability:60,growth:40,freedom:0,money:0},locks:['stability','growth']});
    await enterEdit(wrapper);
    await wrapper.findAll('input[type=range]')[2].setValue(20);
    expect(wrapper.find('.adjust-hint').text()).toContain('占满');
    expect(wrapper.findAll('.weight-row')[2].text()).toContain('0%');
  });
  it('rejects dragging a locked dimension and explains why',async()=>{
    const wrapper=mountPanel();await enterEdit(wrapper);
    await wrapper.findAll('.lock')[0].trigger('click');
    await wrapper.findAll('input[type=range]')[0].setValue(60);
    expect(wrapper.find('.adjust-hint').text()).toContain('已锁定');
    expect(wrapper.findAll('.weight-row')[0].text()).toContain('40%');
  });
  it('confirm commits weights and locks together',async()=>{
    const wrapper=mountPanel();await enterEdit(wrapper);
    await wrapper.findAll('.lock')[1].trigger('click');
    await wrapper.findAll('input[type=range]')[0].setValue(60);
    await wrapper.find('.adjust-actions .primary').trigger('click');
    const events=wrapper.emitted('update');
    expect(events).toHaveLength(1);
    expect(events![0][0]).toEqual({stability:60,growth:30,freedom:7,money:3});
    expect(events![0][1]).toEqual(['growth']);
  });
  it('cancel discards the session and returns to the original allocation',async()=>{
    const wrapper=mountPanel();await enterEdit(wrapper);
    await wrapper.findAll('input[type=range]')[0].setValue(90);
    await wrapper.findAll('.adjust-actions button')[0].trigger('click');
    expect(wrapper.emitted('update')).toBeUndefined();
    expect(wrapper.text()).toContain('40%');
  });
});
