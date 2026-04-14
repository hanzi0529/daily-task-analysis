export function simpleSimilarity(left: string, right: string) {
  const a = normalizeText(left);
  const b = normalizeText(right);

  if (!a || !b) {
    return 0;
  }

  if (a === b) {
    return 1;
  }

  const setA = new Set(a.split(" "));
  const setB = new Set(b.split(" "));
  const intersection = [...setA].filter((token) => setB.has(token)).length;
  const union = new Set([...setA, ...setB]).size;

  return union === 0 ? 0 : intersection / union;
}

export function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasResultSignal(text: string) {
  return /(完成|输出|产出|解决|修复|提交|上线|关闭|同步|确认|交付|结果)/.test(
    text
  );
}
