// Kept for backwards compatibility — every embed uses the dark minimalist color.
const { COLOR } = require('./ui');

function getPrimaryEmbedColor() {
  return COLOR;
}

module.exports = { getPrimaryEmbedColor, PRIMARY_COLOR: COLOR };
