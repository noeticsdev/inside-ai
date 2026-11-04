import { PY_SOLUTION } from './model.mjs';
export default [
  {step:'kit',actions:[{do:'click',selector:'[data-ia-predict] .ia-option'}]},
  {step:'project',actions:[{do:'choose',text:'[8 × 4]',expect:'projection matrix'},{do:'choose',text:'[5 × 4]',solves:true}]},
  {step:'score',actions:[{do:'answer',value:2,expect:'Both the first and third'},{do:'answer',value:4,solves:true}]},
  {step:'scale',actions:[{do:'answer',value:1,expect:'square root'},{do:'answer',value:2,solves:true}]},
  {step:'mask',actions:[{do:'answer',value:12.5,expect:'diagonal'},{do:'answer',value:10,solves:true}]},
  {step:'softmax',actions:[{do:'answer',value:0.333,expect:'equal scores'},{do:'answer',value:0.6652,solves:true}]},
  {step:'mix',actions:[{do:'answer',value:0.2,expect:'smaller weights'},{do:'answer',value:0.239,solves:true}]},
  {step:'python',actions:[{do:'fallback',index:1,expect:'omits scaling'},{do:'python',code:PY_SOLUTION,solves:true}]},
  {step:'heads',actions:[{do:'answer',value:512,expect:'combined width'},{do:'answer',value:64,solves:true}]},
  {step:'memory',actions:[{do:'answer',value:67108864,expect:'two bytes'},{do:'answer',value:134217728,solves:true}]},
];
