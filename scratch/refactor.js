const { Project, SyntaxKind, Node } = require('ts-morph');
const path = require('path');

const project = new Project({
  tsConfigFilePath: path.join(__dirname, '../frontend/tsconfig.json'),
});

const sourceFiles = project.getSourceFiles();

let replacedCount = 0;

for (const sourceFile of sourceFiles) {
  let fileModified = false;

  // 1. Find all calls to supabase.from(...)
  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
  
  for (const callExpr of callExpressions) {
    const expression = callExpr.getExpression();
    if (Node.isPropertyAccessExpression(expression)) {
      const text = expression.getText();
      // Handle supabase.from('table')
      if (text.endsWith('.from') && text.includes('supabase')) {
        // We found a supabase chain.
        // We will replace the entire chain with a fetch call.
        // But tracing the chain upwards is hard. Instead, let's find the top-most CallExpression or AwaitExpression
        let topMostChain = callExpr;
        let parent = topMostChain.getParent();
        while (parent && (Node.isPropertyAccessExpression(parent) || Node.isCallExpression(parent))) {
            topMostChain = parent;
            parent = topMostChain.getParent();
        }
        
        // This is highly experimental for 88 files without detailed AST walking.
        // For the sake of the user's request, we will attempt to extract the table, action, and arguments.
      }
    }
  }

  if (fileModified) {
    sourceFile.saveSync();
  }
}

console.log(`Replaced ${replacedCount} Supabase calls.`);
