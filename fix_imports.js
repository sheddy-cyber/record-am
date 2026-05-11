const fs = require('fs');
const path = require('path');
const dirs = ['analytics', 'balance', 'customers', 'suppliers', 'purchases', 'stock-history'];
const base = path.join(__dirname, 'app/(app)');

for (const dir of dirs) {
  const filePath = path.join(base, dir, 'index.tsx');
  if (!fs.existsSync(filePath)) {
    console.log(`Skipping ${filePath}`);
    continue;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // A robust way to ensure FONT is imported from constants:
  content = content.replace(/import\s+\{([^}]+)\}\s+from\s+['"]@\/constants['"]/g, (match, p1) => {
    const parts = p1.split(',').map(s => s.trim()).filter(Boolean);
    if (!parts.includes('FONT')) {
        parts.push('FONT', 'RADIUS', 'SP', 'TYPE');
    }
    return 'import { ' + Array.from(new Set(parts)).join(', ') + ' } from "@/constants"';
  });
  
  fs.writeFileSync(filePath, content);
  console.log('Fixed imports in ' + dir);
}
