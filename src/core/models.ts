export const VALUE_KEYS=['stability','growth','freedom','money'] as const;
export type ValueKey=typeof VALUE_KEYS[number];
export type ValueWeights=Record<ValueKey,number>;
// 锁定状态：true 表示该维度已被用户认可，联动调整时不参与分摊
export type WeightLocks=Record<ValueKey,boolean>;
export interface DecisionOption{id:string;name:string;description:string;impacts:ValueWeights;reversibility:number}
export interface DecisionDraft{id:string;title:string;background:string;options:DecisionOption[];weights:ValueWeights;weightLocks:WeightLocks;updatedAt:string}
export type Horizon=1|5|10;
export interface RegretPoint{horizon:Horizon;score:number;breakdown:ValueWeights}
export interface RehearsalCard{horizon:Horizon;regret:string;trigger:string;reversibility:string;action:string}
export interface OptionAnalysis{option:DecisionOption;points:RegretPoint[];cards:RehearsalCard[];total:number}
export interface DecisionAnalysis{options:OptionAnalysis[];recommendation:string;winnerId?:string;notices:string[]}
// basis：本次分析实际使用的权重，作为界面“与上次分析差异”的对比基线
export interface SavedCase{draft:DecisionDraft;analysis?:DecisionAnalysis;basis?:ValueWeights}
export const VALUE_LABELS:Record<ValueKey,string>={stability:'稳定',growth:'成长',freedom:'自由',money:'金钱'};
