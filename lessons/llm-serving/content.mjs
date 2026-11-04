import { ANSWERS, MODEL, memory } from './model.mjs';
export default {
  slug: 'llm-serving', title: 'Build an LLM inference server', short: 'LLM inference server',
  subtitle: 'weights · KV cache · prefill · decode · batching', layout: 'guide',
  hook: 'Budget GPU memory, then serve a queue without missing latency targets.',
  level: 'advanced', minutes: 30, order: 8, track: 'systems',
  bigIdea: 'At small batches, decode is limited by memory bandwidth: each iteration reads the shared weights, and every active context keeps keys and values in GPU memory.',
  objectives: [
    'Compute weight storage, per-token KV storage and whole-block capacity for an 8B decoder.',
    'Distinguish prompt prefill from autoregressive decode using a compute and bandwidth model.',
    'Write a Python memory budget, then tune continuous batching against latency, throughput and memory limits.',
    'Export a vLLM-style command with the scheduler and KV precision you chose.',
  ],
  quiz: [
    { stage: 'pre', question: 'One decode iteration serves several sequences. What happens to the weight reads?', options: ['Each sequence needs its own full weight copy', 'The batch can share one pass over the weights', 'The weights vanish after the prompt is processed', 'Only the CPU reads weights during generation'], correct: 1, explanation: 'The bandwidth close-up shows one shared weight read per batch, plus KV reads for each active sequence.' },
    { stage: 'check', question: `Why does this grouped-query model cache ${ANSWERS.kv.toLocaleString('en-US')} bytes per token in FP16?`, options: ['It caches the query vectors for every head', 'It stores one hidden vector for the last layer', `It stores K and V across ${MODEL.layers} layers and ${MODEL.kvHeads} KV heads`, 'It keeps a fresh copy of all model weights'], correct: 2, explanation: 'The cache layout counted 2 × layers × KV heads × head dimension × bytes per element. Query heads share the smaller set of KV heads.' },
    { stage: 'check', question: 'What do the empty slots in the last KV block mean?', options: ['Reserved token slots in a partially filled page', 'A new copy of the weights for every request', 'Token text deleted by the detokenizer', 'Extra predictions already sent to the client'], correct: 0, explanation: 'The page table rounds up to whole blocks. Only the final page needs unused slots; logical pages can map to separate physical blocks.' },
    { stage: 'check', question: 'Which description matches the timing simulation?', options: ['Every prefill and decode operation costs the same', 'Prefill only reads weights and performs no arithmetic', 'Decode is always compute-bound at any batch size', 'Long prefill uses compute; small-batch decode mainly streams memory'], correct: 3, explanation: 'The close-up compares 2 × parameters × prompt tokens / FLOPs with weight bytes / bandwidth. More batching and longer contexts change the balance.' },
    { stage: 'post', question: 'Why did chunked prefill help the mixed traffic?', options: ['It stopped storing KV entries for long prompts', 'It let decode progress between prompt chunks', 'It doubled the physical GPU memory budget', 'It removed every waiting request from the queue'], correct: 1, explanation: 'The traffic trace interleaves decode with prompt chunks. A completed request releases its slot and pages so another request can enter.' },
    { stage: 'post', question: `FP16 KV fits ${memory().maxSeqs} full contexts. What changes with FP8 KV in this storage model?`, options: ['The FP16 weights also shrink by half', 'Every sequence generates twice as many tokens', `KV bytes halve and ${ANSWERS.fp8Seqs} full contexts fit`, 'The entire latency simulation becomes a benchmark'], correct: 2, explanation: 'You kept the weights fixed and halved bytes per KV element. Capacity changes; real accuracy, scaling metadata and kernel performance still need evaluation.' },
  ],
  sources: [
    { label: 'Meta Llama 3 8B model card', url: 'https://huggingface.co/meta-llama/Meta-Llama-3-8B' },
    { label: 'Meta Llama 3 implementation (GQA and KV cache)', url: 'https://github.com/meta-llama/llama3/blob/main/llama/model.py' },
    { label: 'Kwon et al. (2023): PagedAttention', url: 'https://arxiv.org/abs/2309.06180' },
    { label: 'vLLM engine arguments', url: 'https://docs.vllm.ai/en/latest/configuration/engine_args/' },
    { label: 'Pope et al. (2022): Efficiently Scaling Transformer Inference', url: 'https://arxiv.org/abs/2211.05102' },
  ],
  notes: 'This is a simulation. Times come from fixed example bandwidth and compute rates, not measurements. Decimal GB and TB are used throughout. The model has the Llama 3 8B shape; its parameter count is rounded to 8.03 billion. FP16 is a teaching choice (the original checkpoint uses BF16). Traffic is fixed token counts, not a real tokenizer or language model. The roofline estimate omits quadratic prefill attention, kernel overhead, sampling costs, prefix sharing, scaling metadata and preemption; mixed batches overlap compute and memory in an idealized way. The capacity guard reserves full contexts, while the allocator grows pages as tokens arrive. The command is a starting config, not a deployment or performance guarantee. Independent lesson; no affiliation with Meta, vLLM or a GPU vendor.',
};
