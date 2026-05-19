const fs = require('fs');
const path = require('path');

const files = [
  'app/(app)/(tabs)/sales.tsx',
  'app/(app)/(tabs)/inventory.tsx',
  'app/(app)/(tabs)/debts.tsx',
  'app/(app)/customers/index.tsx',
  'app/(app)/suppliers/index.tsx',
  'app/(app)/purchases/index.tsx',
  'app/(app)/stock-history/index.tsx',
  'app/(app)/balance/index.tsx',
];

for (const relPath of files) {
  const fullPath = path.join(__dirname, relPath);
  if (!fs.existsSync(fullPath)) continue;

  let content = fs.readFileSync(fullPath, 'utf8');

  // Find FlatList components and modify contentContainerStyle to remove gap and horizontal padding
  // Usually looks like: contentContainerStyle={{ padding: SP.page, gap: 10, paddingBottom: insets.bottom + 92 }}
  // We want to remove gap, and set padding: 0, paddingBottom: ...
  content = content.replace(
    /contentContainerStyle=\{\{\s*padding:\s*SP\.page,\s*gap:\s*10,\s*paddingBottom:\s*(.*?)\s*\}\}/g,
    'contentContainerStyle={{ paddingBottom: $1 }}'
  );
  
  content = content.replace(
    /contentContainerStyle=\{\{\s*padding:\s*SP\.page,\s*gap:\s*12,\s*paddingBottom:\s*(.*?)\s*\}\}/g,
    'contentContainerStyle={{ paddingBottom: $1 }}'
  );

  // In renderItem, replace <Card> with our flat list view.
  // We use a basic regex. If <Card> has no props, or some style props, we replace it.
  content = content.replace(
    /renderItem=\{\(\{ item[^}]*\}\)\s*=>\s*\(\s*<Card[^>]*>/g,
    (match) => {
      // Return the match but with Card replaced
      return match.replace(/<Card[^>]*>/, `<View style={{ backgroundColor: COLORS.card, padding: SP.page, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>`);
    }
  );
  
  content = content.replace(
    /renderItem=\{\(\{ item[^}]*\}\)\s*=>\s*\{\s*.*?return\s*\(\s*<Card[^>]*>/gs,
    (match) => {
      return match.replace(/<Card[^>]*>$/, `<View style={{ backgroundColor: COLORS.card, padding: SP.page, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>`);
    }
  );

  // We also need to replace the closing </Card> that corresponds to this.
  // A simple hack is to just replace ALL </Card> that occur AFTER a renderItem
  // But a global replace of </Card> to </View> might break other cards.
  // Instead, let's just do a manual replace or simple regex if possible.
  
  fs.writeFileSync(fullPath, content);
}
console.log('Done script prep');
