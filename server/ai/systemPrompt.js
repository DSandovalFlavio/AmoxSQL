/**
 * AmoxSQL AI — System Prompt Builder (entry point)
 *
 * Delegates to the modular prompt builders in ./prompt/.
 * This file is kept as a thin re-export so all existing require('./systemPrompt')
 * calls continue to work without changes.
 */

'use strict';

module.exports = require('./prompt/index');
