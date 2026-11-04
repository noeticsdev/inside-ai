const code = `import math
def sample(logits, temperature, top_k, top_p, u):
    if temperature <= 0:
        return max(range(len(logits)), key=lambda i: logits[i])
    m = max(logits)
    weights = [math.exp((x-m)/temperature) for x in logits]
    ids = sorted(range(len(logits)), key=lambda i: (-weights[i], i))
    if top_k > 0:
        ids = ids[:top_k]
    total = sum(weights[i] for i in ids)
    keep = []
    mass = 0
    for i in ids:
        keep.append(i)
        mass += weights[i] / total
        if mass >= top_p - 1e-12:
            break
    total = sum(weights[i] for i in keep)
    mass = 0
    for i in keep:
        mass += weights[i] / total
        if u < mass:
            return i
    return keep[-1]
`;
export default [
 {step:'kit',actions:[{do:'click',selector:'[data-ia-predict] .ia-option'}]},
 {step:'softmax',actions:[{do:'answer',value:0.665,expect:'leaves out boy'}, {do:'answer',value:0.644,solves:true}]},
 {step:'temperature',actions:[{do:'answer',value:0.644,expect:'T = 1'}, {do:'answer',value:0.865,solves:true}]},
 {step:'topk',actions:[{do:'answer',value:0.644,expect:'before the cut'}, {do:'answer',value:0.665,solves:true}]},
 {step:'nucleus',actions:[{do:'answer',value:1,expect:'individually'}, {do:'answer',value:2,solves:true}]},
 {step:'draw',actions:[{do:'choose',text:'castle',expect:'renormalized'}, {do:'choose',text:'dragon',solves:true}]},
 {step:'loop',actions:[{do:'select',label:'temperature',value:1,expect:'3-gram'}, {do:'select',label:'repetition_penalty',value:1.5,solves:true}]},
 {step:'python',actions:[{do:'python',code,solves:true}]},
 {step:'stop',actions:[{do:'choose',text:'max_new_tokens',expect:'limit never fired'}, {do:'choose',text:'EOS token',solves:true}]},
 {step:'entropy',actions:[{do:'answer',value:1,expect:'log₂'}, {do:'answer',value:1.367,solves:true}]}
];
