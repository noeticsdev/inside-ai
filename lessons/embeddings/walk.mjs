export default [
{step:'kit',actions:[{do:'click',selector:'[data-ia-predict] .ia-option'}]},
{step:'embed',actions:[{do:'answer',value:2,expect:'Multiply'},{do:'answer',value:4,solves:true}]},
{step:'normalize',actions:[{do:'answer',value:25,expect:'square root'},{do:'answer',value:5,solves:true}]},
{step:'compare',actions:[{do:'choose',text:'dog',expect:'close'},{do:'choose',text:'puppy',solves:true}]},
{step:'store',actions:[{do:'answer',value:768000000,expect:'4 bytes'},{do:'answer',value:3072000000,solves:true}]},
{step:'search',actions:[{do:'answer',value:3072000000,expect:'byte count'},{do:'answer',value:768000000,solves:true}]},
{step:'keyword',actions:[{do:'choose',text:'young dog runs meadow',expect:'shares'},{do:'choose',text:'puppy chases ball park',solves:true}]},
{step:'python',actions:[{do:'python',code:"import math\ndef cosine(a,b):\n    d=sum(x*y for x,y in zip(a,b))\n    n=math.sqrt(sum(x*x for x in a)*sum(x*x for x in b))\n    return d/n if n else 0.0\ndef top_k(query,index,k):\n    return [key for key,vec in sorted(index.items(), key=lambda item: (-cosine(query,item[1]),item[0]))[:k]]\n",solves:true}]},
{step:'threshold',actions:[{do:'slide',label:'threshold',value:0.3,expect:'encyclopedia',solves:false},{do:'slide',label:'threshold',value:0.8,expect:'kitten',solves:false},{do:'slide',label:'threshold',value:0.6,solves:true}]},
{step:'scale',actions:[{do:'answer',value:3072000000,expect:'FP32'},{do:'answer',value:768000000,solves:true}]},
];
