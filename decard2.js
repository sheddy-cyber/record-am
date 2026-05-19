const fs = require('fs');
const path = require('path');

const files = [
  'app/(app)/customers/index.tsx',
  'app/(app)/suppliers/index.tsx',
  'app/(app)/purchases/index.tsx',
  'app/(app)/stock-history/index.tsx',
];

for (const relPath of files) {
  const fullPath = path.join(__dirname, relPath);
  if (!fs.existsSync(fullPath)) continue;

  let content = fs.readFileSync(fullPath, 'utf8');

  // 1. Remove gap from FlatList contentContainerStyle
  content = content.replace(
    /contentContainerStyle=\{\{([^}]*?)gap:\s*\d+([^}]*?)\}\}/g,
    'contentContainerStyle={{$1$2}}'
  );
  
  // Also clean up double commas or trailing commas left behind
  content = content.replace(/,\s*,/g, ',');
  content = content.replace(/,\s*\}/g, ' }');

  // 2. Replace <Card> directly inside renderItem
  // renderItem={({ item, index }) => ( or similar
  content = content.replace(
    /(renderItem=\{\([^)]+\)\s*=>\s*\(?\s*)<Card(?:[^>]*?)>/g,
    `$1<View style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>`
  );
  
  content = content.replace(
    /(renderItem=\{\([^)]+\)\s*=>\s*\{\s*(?:const[^;]*;\s*)*return\s*\(\s*)<Card(?:[^>]*?)>/g,
    `$1<View style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>`
  );
  
  // 3. Replace the corresponding </Card> 
  // It's dangerous to do a global replace, but inside these specific list screens, 
  // the main list items are the ONLY cards that appear inside the FlatList. 
  // Wait, stock-history uses Card for empty state? No, that's EmptyState.
  // Actually, let's just do a manual replace for the secondary screens to be safe.
}
