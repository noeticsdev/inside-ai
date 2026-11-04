import { PY_SOLUTION } from './model.mjs';
export default [
  { step:'kit',actions:[{do:'click',selector:'[data-ia-predict] .ia-option'}] },
  { step:'linear',actions:[{do:'answer',value:1,expect:'bias',solves:false},{do:'answer',value:1.25,solves:true,expectStage:'1.25'}] },
  { step:'relu',actions:[{do:'choose',text:'h = [1.25, 0.75',expect:'absolute value',solves:false},{do:'choose',text:'slopes = [1, 0, 0]',solves:true}] },
  { step:'output',actions:[{do:'answer',value:.625,expect:'bias',solves:false},{do:'answer',value:.725,solves:true}] },
  { step:'loss',actions:[{do:'answer',value:-.275,expect:'signed error',solves:false},{do:'answer',value:.075625,solves:true}] },
  { step:'slope',actions:[{do:'answer',value:.55,expect:'negative',solves:false},{do:'answer',value:-.55,solves:true}] },
  { step:'chain',actions:[{do:'answer',value:-.275,expect:'dh₁',solves:false},{do:'answer',value:-.6875,solves:true}] },
  { step:'update',actions:[{do:'answer',value:.43125,expect:'subtracts',solves:false},{do:'answer',value:.56875,solves:true,expectStage:'0.56875'}] },
  { step:'python',actions:[{do:'fallback',index:1,expect:'ReLU gate',solves:false},{do:'python',code:PY_SOLUTION,solves:true}] },
  { step:'rate',actions:[{do:'select',label:'learning rate',value:.0001,expect:'Too slow',solves:false},{do:'select',label:'learning rate',value:3,expect:'Diverged at step 6',solves:false},{do:'select',label:'learning rate',value:.1,solves:true,expectStage:'Target reached'}] },
  { step:'memory',actions:[{do:'answer',value:14,expect:'weights only',solves:false},{do:'answer',value:112,solves:true,expectStage:'112 GB'}] },
];
