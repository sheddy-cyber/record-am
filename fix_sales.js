const fs = require('fs');
let content = fs.readFileSync('app/(app)/(tabs)/sales.tsx', 'utf8');

content = content.replace(/fontWeight:\s*['"]600['"]/g, 'fontFamily: FONT.medium');
content = content.replace(/fontWeight:\s*['"]700['"]/g, 'fontFamily: FONT.bold');
content = content.replace(/fontWeight:\s*['"]800['"]/g, 'fontFamily: FONT.bold');

fs.writeFileSync('app/(app)/(tabs)/sales.tsx', content);
