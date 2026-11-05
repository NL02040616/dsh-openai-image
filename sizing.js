// Shared by the host and the generated browser client; no network or host APIs.
// Constraints: https://developers.openai.com/api/docs/guides/image-generation
export function createSizing() {
  const standard = ['1024x1024', '1536x1024', '1024x1536'];
  const presets = [...standard, '1536x864', '864x1536', '1152x864', '864x1152', '896x1120', '1120x896', '2048x1152', '3840x2160'];
  const normalize = size => String(size).trim().replace(/\s+/g, '').replace(/[X×*＊]/g, 'x');
  function validate(size, model) {
    size = normalize(size);
    const match = /^(\d{1,6})x(\d{1,6})$/.exec(size);
    if (!match) throw new Error('请使用宽×高像素尺寸，例如 1536×864。');
    const [width, height] = match.slice(1).map(Number);
    size = `${width}x${height}`;
    if (model === 'gpt-image-1-mini') {
      if (!standard.includes(size)) throw new Error('GPT Image 1 Mini 仅支持 1024×1024、1536×1024、1024×1536；其他尺寸请手动选择 GPT Image 2.5，不会自动切换模型。');
      return size;
    }
    if (!width || !height || width % 16 || height % 16) throw new Error(`${width}×${height} 无法原生输出：宽和高都必须是 16 的倍数。16:9 可选 1536×864 或 2048×1152；不会自动改成近似尺寸。`);
    if (Math.max(width, height) > 3840 || Math.max(width / height, height / width) > 3 || width * height < 655360 || width * height > 8294400) {
      throw new Error('尺寸超出支持范围：最长边 ≤3840，宽高比介于 1:3 与 3:1，总像素 655360–8294400。');
    }
    return size;
  }
  function forRatio(a, b, model) {
    if (!(a > 0 && b > 0) || Math.max(a / b, b / a) > 3) throw new Error('画面比例必须介于 1:3 与 3:1。');
    const preferred = { '1:1': standard[0], '3:2': standard[1], '2:3': standard[2], '16:9': '1536x864', '9:16': '864x1536', '4:3': '1152x864', '3:4': '864x1152', '4:5': '896x1120', '5:4': '1120x896' };
    const gcd = (x, y) => y ? gcd(y, x % y) : x;
    let x = Math.round(a * 100), y = Math.round(b * 100);
    const divisor = gcd(x, y); x /= divisor; y /= divisor;
    let size = preferred[`${x}:${y}`];
    if (!size) {
      const min = Math.ceil(Math.sqrt(655360 / (x * y)) / 16);
      const max = Math.floor(Math.min(3840 / Math.max(x, y), Math.sqrt(8294400 / (x * y))) / 16);
      if (min > max) throw new Error('无法在模型限制内精确实现这个比例，请选择更常见的比例或明确像素尺寸。');
      const scale = Math.max(min, Math.min(max, Math.round(Math.sqrt(1048576 / (x * y)) / 16)));
      size = `${x * scale * 16}x${y * scale * 16}`;
    }
    return validate(size, model);
  }
  function fromPrompt(prompt, model) {
    const pixels = [...prompt.matchAll(/(?<![\d.])(\d{2,6})\s*(?:px|像素)?\s*[xX×*＊]\s*(\d{2,6})(?![\d.])\s*(?:px|像素)?/gi)]
      .filter(match => !/^\s*(?:cm|mm|厘米|毫米|英寸)/i.test(prompt.slice(match.index + match[0].length)))
      .map(match => ({ index: match.index, size: `${Number(match[1])}x${Number(match[2])}` }));
    for (const match of prompt.matchAll(/宽(?:度)?\s*[:：为是]?\s*(\d{2,6})\s*(?:px|像素)?[，,\s]*高(?:度)?\s*[:：为是]?\s*(\d{2,6})/gi)) {
      pixels.push({ index: match.index, size: `${Number(match[1])}x${Number(match[2])}` });
    }
    // Prefer an explicitly named output over dimensions describing a reference.
    const output = pixels.filter(match => /(?:输出|生成|最终|目标|output|canvas)\D{0,12}$/i.test(prompt.slice(Math.max(0, match.index - 20), match.index)));
    const sizes = [...new Set((output.length ? output : pixels).map(match => match.size))];
    if (sizes.length > 1) throw new Error('描述包含多个像素尺寸，请只保留目标尺寸，或在画图栏手动指定尺寸。');
    if (sizes.length) return validate(sizes[0], model);
    const ratios = [];
    for (const match of prompt.matchAll(/(?<![\d.])(\d{1,3}(?:\.\d{1,2})?)\s*[:：/]\s*(\d{1,3}(?:\.\d{1,2})?)(?![\d.])/g)) {
      if (/^0\d/.test(match[1]) || /^0\d/.test(match[2])) continue;
      const common = /^(?:1:1|3:2|2:3|16:9|9:16|4:3|3:4|4:5|5:4|21:9|9:21|2:1|1:2|3:1|1:3)$/.test(`${match[1]}:${match[2]}`);
      const context = prompt.slice(Math.max(0, match.index - 12), match.index + match[0].length + 12);
      if (common || /比例|画幅|宽高|aspect|ratio/i.test(context)) ratios.push(forRatio(Number(match[1]), Number(match[2]), model));
    }
    const unique = [...new Set(ratios)];
    if (unique.length > 1) throw new Error('描述包含多个画面比例，请只保留目标比例，或在画图栏手动指定尺寸。');
    return unique[0];
  }
  function resolve({ prompt = '', model, size = standard[0], sizeMode = 'prompt' }) {
    if (!['prompt', 'manual'].includes(sizeMode)) throw new Error('尺寸选择方式无效。');
    const detected = sizeMode === 'prompt' ? fromPrompt(prompt, model) : undefined;
    const resolved = detected ?? validate(size, model);
    const [width, height] = resolved.split('x').map(Number);
    return { size: resolved, detected: Boolean(detected), experimental: width * height > 3686400 };
  }
  return { standard, presets, normalize, validate, fromPrompt, resolve };
}
