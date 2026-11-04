import { PY_SOLUTION } from './model.mjs';
export default [
  {step:'kit',actions:[{do:'click',selector:'[data-ia-predict] .ia-option'}]},
  {step:'weights',actions:[{do:'answer',value:32.12,expect:'FP32',solves:false},{do:'answer',value:16.06,solves:true,expectStage:'16.06 GB'}]},
  {step:'kv',actions:[{do:'answer',value:65536,expect:'both',solves:false},{do:'answer',value:131072,solves:true,expectStage:'131,072'}]},
  {step:'capacity',actions:[{do:'answer',value:610351,expect:'all HBM',solves:false},{do:'answer',value:396270,solves:true}]},
  {step:'phase',actions:[{do:'choose',text:'Both phases: compute',expect:'bandwidth',solves:false},{do:'choose',text:'Prefill: compute',solves:true}]},
  {step:'pages',actions:[{do:'answer',value:62.5,expect:'whole block',solves:false},{do:'answer',value:63,solves:true,expectStage:'8 unused slots'}]},
  {step:'speed',actions:[{do:'answer',value:0.00803,expect:'seconds',solves:false},{do:'answer',value:8.03,solves:true}]},
  {step:'python',actions:[{do:'fallback',index:1,expect:'forgets',solves:false},{do:'python',code:PY_SOLUTION,solves:true}]},
  {step:'batch',actions:[{do:'select',label:'max-num-seqs',value:64,expect:'KV limit',solves:false},{do:'select',label:'max-num-seqs',value:4,expect:'TTFT limit',solves:false},{do:'select',label:'max-num-seqs',value:32,expect:'Streaming limit',solves:false},{do:'select',label:'chunked-prefill',value:'on',solves:true}]},
  {step:'quantize',actions:[{do:'answer',value:55,expect:'INT8 weights',solves:false},{do:'answer',value:96,solves:true}]},
];
