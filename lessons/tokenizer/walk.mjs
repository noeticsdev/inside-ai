export default [
 {step:'kit',actions:[{do:'click',selector:'[data-ia-predict] .ia-option'}]},
 {step:'bytes',actions:[{do:'answer',value:6,expect:'code points'},{do:'answer',value:18,solves:true}]},
 {step:'split',actions:[{do:'answer',value:4,expect:'spaces'},{do:'answer',value:7,solves:true}]},
 {step:'pairs',actions:[{do:'choose',text:'h + e',expect:'space'},{do:'choose',text:'Ġ + t',solves:true}]},
 {step:'first',actions:[{do:'answer',value:468,expect:'removes'},{do:'answer',value:448,solves:true}]},
 {step:'learn',actions:[{do:'slide',label:'Merges',value:34,expect:'at most 20',solves:false},{do:'slide',label:'Merges',value:35,solves:true}]},
 {step:'order',actions:[{do:'tap',text:'2:',expect:'no n'},{do:'tap',text:'0:'},{do:'tap',text:'1:'},{do:'tap',text:'3:',solves:true}]},
 {step:'python',actions:[{do:'fallback',index:1,expect:'lower-ranked',solves:false},{do:'python',fallbackIndex:0,code:`def encode(word_bytes, merges):
    tokens = [(b,) for b in word_bytes]
    while True:
        choices = []
        for i in range(len(tokens) - 1):
            pair = (tokens[i], tokens[i + 1])
            if pair in merges:
                choices.append((merges.index(pair), i))
        if not choices:
            return tokens
        _, i = min(choices)
        tokens[i:i + 2] = [tokens[i] + tokens[i + 1]]
`,solves:true}]},
 {step:'decode',actions:[{do:'choose',text:'sorted',expect:'order'},{do:'choose',text:'inside a UTF-8',solves:true}]},
 {step:'cost',actions:[{do:'answer',value:6,expect:'Divide'},{do:'answer',value:18,solves:true}]}
];
