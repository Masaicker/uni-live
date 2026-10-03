const { isAacFillOnly } = require("./aac-fill-only.cjs");

// Both pinned bundles count every AAC raw packet as a 1024-sample audio frame.
// Inline the predicate inside the demuxer so serialized worker code contains it.
module.exports = function patchFlvAac(source) {
  this.cacheable?.();
  this.addDependency?.(require.resolve("./aac-fill-only.cjs"));
  const branch = /else\s+if\s*\(\s*(?:1\s*===\s*([\w$]+)\.packetType|([\w$]+)\.packetType\s*===\s*1)\s*\)\s*\{/g;
  let matches = 0;
  const patched = source.replace(branch, (match, minifiedName, name) => {
    matches++;
    return `${match}\nif ((${isAacFillOnly.toString()})(${minifiedName || name}.data)) return;\n`;
  });
  if (matches !== 1) {
    throw new Error(`AAC fill-only patch expected one demux branch in ${this.resourcePath}, found ${matches}. Check the pinned playback dependency.`);
  }
  return patched;
};
