<script setup lang="ts">
import{VALUE_KEYS,VALUE_LABELS,type ValueKey,type ValueWeights,type WeightLocks}from'../../core/models';
import{PRESETS}from'../../core/weight-service';

const props=defineProps<{
  weights:ValueWeights;
  locks:WeightLocks;
  editing:boolean;
  basis?:ValueWeights;
  notice?:string;
}>();
const emit=defineEmits<{
  start:[];confirm:[];cancel:[];
  adjust:[key:ValueKey,value:number];
  toggle:[key:ValueKey];
  preset:[w:ValueWeights];
}>();

function deltaText(key:ValueKey):string{
  if(!props.basis)return'';
  const d=props.weights[key]-props.basis[key];
  if(Math.abs(d)<0.05)return '—';
  return d>0?`▲ ${Math.round(d*10)/10}`:`▼ ${Math.round(-d*10)/10}`;
}
</script>

<template>
  <section class="paper-panel values">
    <div class="values-head">
      <span class="index">02 / VALUES</span>
      <button v-if="!editing" type="button" class="edit-btn" @click="emit('start')">调整权重</button>
    </div>
    <h2>什么对你更重要？</h2>
    <p>权重没有对错，它只决定模拟器从哪个角度理解“后悔”。锁定已认可的维度后，其余维度会联动分摊。</p>

    <div v-if="editing" class="preset-list">
      <button v-for="(weights,name) in PRESETS" :key="name" type="button" @click="emit('preset',{...weights})">{{name}}</button>
    </div>

    <div v-for="key in VALUE_KEYS" :key="key" class="weight-row" :class="{locked:locks[key]}">
      <div class="weight-line">
        <span class="weight-name">{{VALUE_LABELS[key]}}</span>
        <b class="weight-value">{{weights[key]}}%</b>
        <small v-if="basis" class="weight-delta" :class="{up:deltaText(key).startsWith('▲'),down:deltaText(key).startsWith('▼')}">
          较上次 {{deltaText(key)}}
        </small>
        <button
          type="button"
          class="lock-btn"
          :class="{on:locks[key]}"
          :disabled="!editing"
          :title="locks[key]?'已锁定，联动调整不会改变该维度':'锁定后调整其他维度时该项保持不变'"
          @click="emit('toggle',key)"
        >{{locks[key]?'🔒 已锁定':'🔓 锁定'}}</button>
      </div>
      <input
        type="range" min="0" max="100"
        :value="weights[key]"
        :disabled="!editing || locks[key]"
        @input="emit('adjust',key,Number(($event.target as HTMLInputElement).value))"
      >
    </div>

    <div class="weight-total">
      当前合计 <b>{{VALUE_KEYS.reduce((n,k)=>n+weights[k],0)}}%</b>
      <span>（整数百分点，界面显示与推演计算同一份数）</span>
    </div>

    <p v-if="notice" class="weight-notice" role="status">{{notice}}</p>
    <p class="weight-rule">
      分摊规则：上调某维度时，其余可调维度按各自当前权重（可减余量）比例让出；下调时按距 100% 的余量承接。
      零权重维度无需让出，接近 100% 的维度不会被分超出上限。全部锁定、仅剩一个可调维度或锁定项已占满 100% 时，拖动会被拒绝。
    </p>

    <div v-if="editing" class="weight-actions">
      <button type="button" @click="emit('cancel')">取消</button>
      <button type="button" class="primary" @click="emit('confirm')">确认新分配</button>
    </div>
  </section>
</template>
