<script setup lang="ts">
import{computed,ref}from'vue';
import{VALUE_KEYS,VALUE_LABELS,type ValueKey,type ValueWeights}from'../../core/models';
import{PRESETS}from'../../core/weight-service';
import{applyWeightChange,lockedTotal,normalizeToHundred}from'../../core/weight-adjust';
const props=defineProps<{weights:ValueWeights;locks:ValueKey[];analyzed?:ValueWeights}>();
const emit=defineEmits<{update:[weights:ValueWeights,locks:ValueKey[]]}>();
const editing=ref(false);
const working=ref<ValueWeights>({...props.weights});
const workingLocks=ref<ValueKey[]>([]);
const dragBase=ref<ValueWeights>();
const hint=ref('');
const shown=computed(()=>editing.value?working.value:normalizeToHundred(props.weights));
const lockedSum=computed(()=>lockedTotal(working.value,workingLocks.value));
function diff(key:ValueKey){if(!props.analyzed)return 0;return Math.round((shown.value[key]-props.analyzed[key])*10)/10}
function startEdit(){working.value=normalizeToHundred(props.weights);workingLocks.value=[...props.locks];hint.value='';editing.value=true}
function beginDrag(){dragBase.value={...working.value}}
function endDrag(){dragBase.value=undefined}
function onInput(key:ValueKey,event:Event){
  const el=event.target as HTMLInputElement;
  const result=applyWeightChange(dragBase.value??working.value,workingLocks.value,key,Number(el.value));
  if(!result.ok){hint.value=result.message;el.value=String(working.value[key]);return}
  working.value=result.weights;
  el.value=String(result.weights[key]);
  hint.value=result.clamped?`已触及可调边界：锁定维度合计 ${lockedSum.value}%，其余维度共享剩余的 ${100-lockedSum.value}%。`:'';
}
function toggleLock(key:ValueKey){workingLocks.value=workingLocks.value.includes(key)?workingLocks.value.filter(k=>k!==key):[...workingLocks.value,key];hint.value=''}
function confirm(){emit('update',{...working.value},[...workingLocks.value]);editing.value=false;hint.value=''}
function cancel(){editing.value=false;hint.value=''}
function preset(weights:ValueWeights){emit('update',{...weights},[...props.locks])}
</script>
<template>
<section class="paper-panel values">
  <span class="index">02 / VALUES</span>
  <h2>什么对你更重要？</h2>
  <p>权重没有对错，它只决定模拟器从哪个角度理解“后悔”。四项合计始终为 100%，显示值即推演所用值。</p>
  <div class="preset-list"><button v-for="(weights,name) in PRESETS" :key="name" @click="preset(weights)">{{name}}</button></div>
  <p v-if="analyzed" class="diff-note">徽标为与上次推演所用权重的差异。</p>
  <div v-for="key in VALUE_KEYS" :key="key" class="weight-row" :class="{locked:editing&&workingLocks.includes(key)}">
    <div class="weight-head">
      <button v-if="editing" type="button" class="lock" :aria-pressed="workingLocks.includes(key)" :title="workingLocks.includes(key)?'解锁该维度':'锁定该维度'" @click="toggleLock(key)">{{workingLocks.includes(key)?'🔒':'🔓'}}</button>
      <span v-else-if="locks.includes(key)" class="lock-marker" title="已锁定">🔒</span>
      <span class="weight-name">{{VALUE_LABELS[key]}}</span>
      <b>{{shown[key]}}%</b>
      <i v-if="diff(key)" class="diff" :class="diff(key)>0?'up':'down'">{{diff(key)>0?'+':''}}{{diff(key)}}</i>
    </div>
    <input v-if="editing" type="range" min="0" max="100" :value="working[key]" @pointerdown="beginDrag" @focus="beginDrag" @input="onInput(key,$event)" @change="endDrag" @blur="endDrag">
    <div v-else class="weight-bar"><i :style="{width:shown[key]+'%'}"></i></div>
  </div>
  <template v-if="editing">
    <p class="lock-status">已锁定 {{workingLocks.length}} 个维度，合计 {{lockedSum}}%；拖动某一维度时，其余未锁定维度按原比例联动分担。</p>
    <p v-if="hint" class="adjust-hint" role="alert">{{hint}}</p>
    <div class="adjust-actions"><button type="button" @click="cancel">取消</button><button type="button" class="primary" @click="confirm">确认调整</button></div>
  </template>
  <button v-else type="button" class="edit-toggle" @click="startEdit">调整权重（可锁定已认可的维度）</button>
</section>
</template>
