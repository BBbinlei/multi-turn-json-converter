import test from "node:test";
import assert from "node:assert/strict";
import {
  convertEvaluationRows,
  convertTrainingRows,
  parseEvaluationTranscript,
  toJsonl,
} from "../src/converter.js";

const prompt = "你是一名女性虚拟女友。";

function trainingRows(turnCount) {
  const header = ["样本ID", "核心维度", "用户轮数"];
  const data = ["GF-TEST", "会被剔除", String(turnCount)];
  for (let turn = 1; turn <= 4; turn += 1) {
    header.push(`第${turn}轮用户`, `第${turn}轮AI回答`);
    data.push(turn <= turnCount ? `用户 ${turn}` : "", turn <= turnCount ? `回答 ${turn}` : "");
  }
  return [["标题"], [], header, data];
}

function volcanoUserOrSystemContent(record) {
  return record.messages.every((message) => {
    if (message.role === "assistant") {
      return typeof message.content === "string";
    }

    return Array.isArray(message.content) && message.content[0].type === "text";
  });
}

for (const turnCount of [2, 3, 4]) {
  test(`训练集正确转换 ${turnCount} 轮对话`, () => {
    const result = convertTrainingRows(trainingRows(turnCount), prompt);
    assert.deepEqual(result.errors, []);

    const bailian = result.records.bailian;
    const volcano = result.records.volcano;
    const qianfan = result.records.qianfan;
    const tencent = result.records.tencent;
    const modelarts = result.records.modelarts;
    assert.equal(Object.values(result.records).every((records) => records.length === 1), true);
    assert.equal(bailian[0].messages.length, 1 + turnCount * 2);
    assert.equal(volcano[0].messages.length, 1 + turnCount * 2);

    assert.deepEqual(Object.keys(bailian[0]), ["messages"]);
    assert.deepEqual(Object.keys(volcano[0]).sort(), ["messages", "thinking"].sort());
    assert.equal(volcano[0].thinking.type, "disabled");
    assert.equal(volcanoUserOrSystemContent(volcano[0]), true);
    assert.equal(typeof volcano[0].messages.find(({ role }) => role === "assistant").content, "string");

    assert.equal(bailian[0].messages.every(({ content }) => typeof content === "string"), true);
    assert.equal(
      volcano[0].messages.some((message) => message.role === "assistant" && message.loss_weight === 1.0),
      true,
    );

    assert.equal(qianfan[0].length, turnCount);
    assert.deepEqual(Object.keys(qianfan[0][0]), ["system", "prompt", "response"]);
    assert.deepEqual(Object.keys(qianfan[0][1]), ["prompt", "response"]);
    assert.equal(JSON.stringify(qianfan[0]).includes("weight"), false);
    assert.deepEqual(tencent[0], bailian[0]);
    assert.deepEqual(Object.keys(modelarts[0]), ["system_prompt", "conversations"]);
    assert.equal(modelarts[0].conversations.length, turnCount * 2);
    assert.deepEqual(modelarts[0].conversations[0], { from: "human", value: "用户 1" });
    assert.deepEqual(modelarts[0].conversations[1], { from: "gpt", value: "回答 1" });

    const text = JSON.stringify(result.records);
    assert.equal(text.includes("核心维度"), false);
    assert.equal(text.includes("GF-TEST"), false);
  });
}

test("评测集解析角色、续行并追加参考答案", () => {
  const rows = [
    ["标题"],
    [],
    ["样本ID", "用户轮数", "待测多轮输入", "参考答案（评测后查看）", "主评分维度"],
    ["GF-EVAL", "2", "用户：第一问\n女友：第一答\n续行内容\n用户：第二问", "最终参考回答", "会被剔除"],
  ];
  const result = convertEvaluationRows(rows, prompt);
  assert.deepEqual(result.errors, []);

  const record = result.records.bailian[0];
  const recordVolcano = result.records.volcano[0];
  assert.equal(record.messages[2].content, "第一答\n续行内容");
  assert.equal(record.messages.at(-1).content, "最终参考回答");
  assert.equal(record.messages.every(({ content }) => typeof content === "string"), true);

  assert.equal(recordVolcano.messages[2].content, "第一答\n续行内容");
  assert.equal(recordVolcano.messages.at(-1).content, "最终参考回答");
  assert.equal(recordVolcano.messages[0].role, "system");
  assert.equal(JSON.stringify(recordVolcano).includes("主评分维度"), false);

  assert.equal(result.records.qianfan[0].at(-1).response, "最终参考回答");
  assert.deepEqual(result.records.tencent[0], record);
  assert.equal(result.records.modelarts[0].conversations.at(-1).value, "最终参考回答");
});

test("轮数不一致时阻止训练集输出", () => {
  const rows = trainingRows(2);
  rows[3][2] = "3";
  const result = convertTrainingRows(rows, prompt);
  assert.equal(result.errors.length, 1);
  assert.equal(Object.values(result.records).every((records) => records.length === 0), true);
  assert.match(result.errors[0].message, /声明 3 轮/);
});

test("评测角色不交替时给出错误", () => {
  assert.throws(
    () => parseEvaluationTranscript("用户：第一问\n用户：第二问"),
    /角色必须交替/,
  );
});

test("JSONL 每条记录独占一行并保留结尾换行", () => {
  const formats = convertTrainingRows(trainingRows(2), prompt).records;
  for (const records of Object.values(formats)) {
    const jsonl = toJsonl([...records, ...records]);
    const lines = jsonl.trimEnd().split("\n");
    assert.equal(lines.length, 2);
    assert.doesNotThrow(() => lines.forEach(JSON.parse));
    assert.equal(jsonl.endsWith("\n"), true);
  }
});
