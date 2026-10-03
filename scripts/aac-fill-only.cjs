// A raw_data_block containing only FIL elements and ID_END produces no PCM.
// Keep unknown, truncated and mixed blocks rather than risk dropping audio.
function isAacFillOnly(unit) {
  if (!unit.length || (unit[0] >> 5) !== 6) return false;
  let position = 0;
  let seenFill = false;
  const bitLength = unit.length * 8;
  const read = (count) => {
    if (position + count > bitLength) return null;
    let value = 0;
    for (let i = 0; i < count; i++) {
      value = value * 2 + ((unit[position >> 3] >> (7 - (position & 7))) & 1);
      position++;
    }
    return value;
  };

  while (position + 3 <= bitLength) {
    const id = read(3);
    if (id === 7) {
      if (!seenFill || bitLength - position > 7) return false;
      while (position < bitLength) if (read(1) !== 0) return false;
      return true;
    }
    if (id !== 6) return false;
    let count = read(4);
    if (count === null) return false;
    if (count === 15) {
      const extra = read(8);
      if (extra === null) return false;
      count += extra - 1;
    }
    if (position + count * 8 > bitLength) return false;
    position += count * 8;
    seenFill = true;
  }
  return false;
}

module.exports = { isAacFillOnly };
