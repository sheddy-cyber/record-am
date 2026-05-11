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
  
  // Replace old weights
  content = content.replace(/fontWeight:\s*['"]600['"]/g, 'fontFamily: FONT.medium');
  content = content.replace(/fontWeight:\s*['"]700['"]/g, 'fontFamily: FONT.bold');
  content = content.replace(/fontWeight:\s*['"]800['"]/g, 'fontFamily: FONT.bold');
  
  // Replace old colors
  content = content.replace(/COLORS\.primary/g, 'COLORS.accent');
  content = content.replace(/COLORS\.lime/g, 'COLORS.accent');
  
  // Update imports if needed
  if (!content.includes('FONT')) {
    content = content.replace(/import\s+\{([^}]*COLORS[^}]*)\}\s+from\s+['"]@\/constants['"]/, (match, p1) => {
      const parts = p1.split(',').map(s => s.trim()).filter(Boolean);
      const newImports = Array.from(new Set([...parts, 'FONT', 'RADIUS', 'SP', 'TYPE']));
      return 'import { ' + newImports.join(', ') + ' } from "@/constants"';
    });
  }
  
  fs.writeFileSync(filePath, content);
  console.log('Updated ' + dir);
}
