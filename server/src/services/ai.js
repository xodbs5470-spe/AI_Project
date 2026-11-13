// AI 공급자 추상화: AI_PROVIDER로 메인을 고르고, 실패하면 키가 있는 다른 공급자로 자동 전환.
// - generateJson: 스키마에 맞는 JSON 생성 (이미지 입력 지원 → 영수증 인식)
// - runAgent:     Function Calling 에이전트 루프 (AI가 필요한 도구를 직접 호출하며 답변)
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';

const TIMEOUT_MS = 45_000;
const MAX_AGENT_STEPS = 6;
let openaiClient;
let geminiClient;

const openai = () =>
  (openaiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: TIMEOUT_MS }));
const gemini = () =>
  (geminiClient ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { timeout: TIMEOUT_MS } }));
const openaiModel = () => process.env.OPENAI_MODEL || 'gpt-4o-mini';
const geminiModel = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// ---------- JSON 생성 ----------
async function openaiJson({ system, user, schema, name, images = [] }) {
  const content = images.length
    ? [
        { type: 'text', text: user },
        ...images.map((img) => ({
          type: 'image_url',
          image_url: { url: `data:${img.mimeType};base64,${img.data}`, detail: 'high' },
        })),
      ]
    : user;
  const res = await openai().chat.completions.create({
    model: openaiModel(),
    temperature: 0.3,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content },
    ],
    // Structured Outputs: 스키마에 맞는 JSON만 반환하도록 강제
    response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } },
  });
  return JSON.parse(res.choices[0].message.content);
}

async function geminiJson({ system, user, schema, images = [] }) {
  const parts = [...images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } })), { text: user }];
  const res = await gemini().models.generateContent({
    model: geminiModel(),
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: system,
      temperature: 0.3,
      responseMimeType: 'application/json',
      responseJsonSchema: schema,
    },
  });
  return JSON.parse(res.text);
}

// ---------- Function Calling 에이전트 ----------
/**
 * tools: [{ name, description, parameters(JSON Schema) }]
 * execute(name, args) → 도구 실행 결과(객체)
 * history: [{ role: 'user'|'assistant', content }]
 */
async function openaiAgent({ system, history, message, tools, execute, trace }) {
  const messages = [
    { role: 'system', content: system },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ];
  const toolDefs = tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  for (let step = 0; step < MAX_AGENT_STEPS; step++) {
    const res = await openai().chat.completions.create({
      model: openaiModel(),
      temperature: 0.5,
      messages,
      tools: toolDefs,
    });
    const msg = res.choices[0].message;
    if (!msg.tool_calls?.length) return msg.content ?? '';
    messages.push(msg);
    for (const call of msg.tool_calls) {
      const args = safeJson(call.function.arguments);
      const result = await execute(call.function.name, args);
      trace.push({ name: call.function.name, args });
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  throw new Error('도구 호출 횟수 초과');
}

async function geminiAgent({ system, history, message, tools, execute, trace }) {
  const contents = [
    ...history.map((h) => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] })),
    { role: 'user', parts: [{ text: message }] },
  ];
  const config = {
    systemInstruction: system,
    temperature: 0.5,
    tools: [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parametersJsonSchema: t.parameters,
        })),
      },
    ],
  };

  for (let step = 0; step < MAX_AGENT_STEPS; step++) {
    const res = await gemini().models.generateContent({ model: geminiModel(), contents, config });
    const calls = res.functionCalls;
    if (!calls?.length) return res.text ?? '';
    contents.push(res.candidates[0].content);
    const parts = [];
    for (const call of calls) {
      const args = call.args ?? {};
      const result = await execute(call.name, args);
      trace.push({ name: call.name, args });
      parts.push({ functionResponse: { name: call.name, response: { result } } });
    }
    contents.push({ role: 'user', parts });
  }
  throw new Error('도구 호출 횟수 초과');
}

function safeJson(s) {
  try {
    return JSON.parse(s || '{}');
  } catch {
    return {};
  }
}

// ---------- 공급자 선택 / 자동 전환 ----------
const PROVIDERS = {
  openai: { json: openaiJson, agent: openaiAgent, key: 'OPENAI_API_KEY' },
  gemini: { json: geminiJson, agent: geminiAgent, key: 'GEMINI_API_KEY' },
};

export function configuredProviders() {
  return Object.keys(PROVIDERS).filter((p) => process.env[PROVIDERS[p].key]?.trim());
}

function providerOrder() {
  const primary = (process.env.AI_PROVIDER || 'openai').toLowerCase();
  const available = configuredProviders();
  return [primary, ...available.filter((p) => p !== primary)].filter((p) => available.includes(p));
}

/**
 * 스키마에 맞는 JSON을 생성한다. images: [{ mimeType, data(base64) }] (선택)
 * @returns {{data: object, provider: string} | null} 사용 가능한 공급자가 모두 실패하면 null
 */
export async function generateJson(request) {
  for (const provider of providerOrder()) {
    try {
      const data = await PROVIDERS[provider].json(request);
      return { data, provider };
    } catch (err) {
      console.warn(`[ai] ${provider} 호출 실패: ${err.message}`);
    }
  }
  return null;
}

/**
 * 도구를 쓰는 대화형 에이전트 실행
 * @returns {{reply: string, toolCalls: Array<{name, args}>, provider: string} | null}
 */
export async function runAgent(request) {
  for (const provider of providerOrder()) {
    const trace = [];
    try {
      const reply = await PROVIDERS[provider].agent({ ...request, trace });
      return { reply, toolCalls: trace, provider };
    } catch (err) {
      console.warn(`[ai] ${provider} 에이전트 실패: ${err.message}`);
    }
  }
  return null;
}
