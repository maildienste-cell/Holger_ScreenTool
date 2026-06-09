const fs = require('fs');
const content = fs.readFileSync('main.js', 'utf8').split('\n');
// tools starts at line 753 (index 753 is '      let tools = [];')
// tools ends around index 920 ('      if (tools.length === 0) tools = undefined;')

let toolsStartIndex = content.findIndex(line => line.includes('let tools = [];'));
let toolsEndIndex = content.findIndex((line, idx) => idx > toolsStartIndex && line.includes('if (tools.length === 0) tools = undefined;'));

if (toolsStartIndex !== -1 && toolsEndIndex !== -1) {
  const toolsBlock = content.splice(toolsStartIndex, toolsEndIndex - toolsStartIndex + 1);
  let isLocalIndex = content.findIndex(line => line.includes('if (isLocal) {'));
  content.splice(isLocalIndex, 0, ...toolsBlock);
  fs.writeFileSync('main.js', content.join('\n'));
  console.log("Moved tools block!");
} else {
  console.log("Could not find bounds");
}
