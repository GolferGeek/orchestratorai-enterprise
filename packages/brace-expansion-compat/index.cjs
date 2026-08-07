'use strict';

/**
 * The maintained brace-expansion 2.x security backport exports a CommonJS
 * function, while newer consumers expect a named `expand` export. Expose both
 * shapes so old and new minimatch releases use the same patched implementation.
 */
const expand = require('brace-expansion-v2');

module.exports = expand;
module.exports.expand = expand;
