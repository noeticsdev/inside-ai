export default [
 {step:'kit',actions:[{do:'click',selector:'[data-ia-predict] .ia-option'}]},
 {step:'chunk',actions:[{do:'answer',value:4,expect:'overlap'},{do:'answer',value:5,solves:true}]},
 {step:'embed',actions:[{do:'answer',value:384,expect:'4 bytes'},{do:'answer',value:1536,solves:true}]},
 {step:'retrieve',actions:[{do:'choose',text:'hybrid#1',expect:'shares only'},{do:'choose',text:'leave#1',solves:true}]},
 {step:'fix',actions:[{do:'slide',label:'chunk size',value:12,solves:false},{do:'slide',label:'top-k',value:2,solves:false},{do:'slide',label:'chunk size',value:24,solves:true}]},
 {step:'pack',actions:[{do:'answer',value:4,expect:'reserve'},{do:'answer',value:3,solves:true}]},
 {step:'cite',actions:[{do:'choose',text:'expenses#1',expect:'receipts'},{do:'choose',text:'leave#1',solves:true}]},
 {step:'python',actions:[{do:'python',code:'def retrieve(q_vec, store, k):\n    def score(row):\n        v = row["vec"]\n        dot = sum(a*b for a,b in zip(q_vec,v))\n        norm = (sum(a*a for a in q_vec)*sum(b*b for b in v)) ** 0.5\n        return dot / norm if norm else 0\n    return [r["id"] for r in sorted(store, key=lambda r: (-score(r), r["id"]))[:k]]\n',solves:true}]},
 {step:'refuse',actions:[{do:'choose',text:'Guess a pay amount',expect:'No chunk'},{do:'choose',text:'Say the documents do not provide the answer',solves:true}]},
 {step:'cost',actions:[{do:'answer',value:520,expect:'1,000,000'},{do:'answer',value:0.00052,solves:true}]}
];
