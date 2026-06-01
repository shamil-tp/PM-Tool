const fs = require('fs');
let code = fs.readFileSync('cp_raw.txt', 'utf8');

// We need to insert import { searchService } from '../../services/searchService'; at the top
code = code.replace(`import { CANONICAL_ROUTES, renderRouteIcon } from '../../app/routeRegistry';`, `import { CANONICAL_ROUTES, renderRouteIcon } from '../../app/routeRegistry';\nimport { searchService } from '../../services/searchService';`);

// Inside CommandPalette component, right before const allResults = useMemo
const searchStateCode = `
  const [dbResults, setDbResults] = useState<CmdResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    let active = true;
    const { groupFilter, cleanQuery } = parseSlashFilter(debouncedQuery.trim());
    if (!cleanQuery || groupFilter) {
      setDbResults([]);
      setIsSearching(false);
      return;
    }
    
    setIsSearching(true);
    searchService.searchWorkspace(cleanQuery, 30).then(results => {
      if (!active) return;
      const mapped: CmdResult[] = [];
      const groups = ['project', 'task', 'file', 'user', 'comment', 'decision'];
      groups.forEach(type => {
        const groupItems = results.filter(r => r.entity_type === type);
        if (groupItems.length > 0) {
          mapped.push({ id: \`_\${type}_header\`, group: type.toUpperCase(), label: type.toUpperCase() === 'USER' ? 'PEOPLE' : type.toUpperCase() + 'S', onSelect: () => {} });
          groupItems.forEach(item => {
             mapped.push({
               id: \`db:\${type}:\${item.entity_id}\`,
               group: type.toUpperCase(),
               label: item.title,
               description: item.context + (item.last_updated ? \` · \${new Date(item.last_updated).toLocaleDateString()}\` : ''),
               icon: type === 'task' ? <Check className="w-3.5 h-3.5 text-signal-warning" /> :
                     type === 'project' ? <BarChart3 className="w-3.5 h-3.5 text-emerald-400" /> :
                     type === 'file' ? <FileText className="w-3.5 h-3.5 text-blue-400" /> :
                     type === 'user' ? <Users className="w-3.5 h-3.5 text-purple-400" /> :
                     type === 'comment' ? <Activity className="w-3.5 h-3.5 text-orange-400" /> :
                     <Zap className="w-3.5 h-3.5 text-accent-secondary" />,
               onSelect: () => {
                  addRecent({ 
                     id: \`recent:\${item.entity_type}:\${item.entity_id}\`, 
                     group: 'RECENT', 
                     label: item.title, 
                     icon: <Clock className="w-3.5 h-3.5 text-text-quaternary" />, 
                     onSelect: () => {} 
                  });
                  if (item.entity_type === 'project') onNavigate(\`/projects/\${item.entity_id}/board\`);
                  else if (item.entity_type === 'task') onNavigate(\`/execution?task=\${item.entity_id}\`);
                  else if (item.entity_type === 'comment') onNavigate(\`/workspace?comment=\${item.entity_id}\`);
                  else if (item.entity_type === 'file') onNavigate(\`/workspace?file=\${item.entity_id}\`);
                  else if (item.entity_type === 'user') onNavigate(\`/resources/teams?user=\${item.entity_id}\`);
                  else if (item.entity_type === 'decision') onNavigate(\`/workspace/decisions?decision=\${item.entity_id}\`);
                  onClose();
               }
             });
          });
        }
      });
      setDbResults(mapped);
      setIsSearching(false);
    });
    return () => { active = false; };
  }, [debouncedQuery]);

  const allResults = useMemo((): CmdResult[] => {
`;

code = code.replace(`  const allResults = useMemo((): CmdResult[] => {`, searchStateCode);

// Remove the local PROJECTS and TASKS filtering
code = code.replace(/    \/\/ --- PROJECTS ---[\s\S]*?    \/\/ --- TASKS ---/m, "    // --- TASKS ---");
code = code.replace(/    \/\/ --- TASKS ---[\s\S]*?    \/\/ --- ACTIONS ---/m, "    // --- ACTIONS ---");

// Add dbResults to the output array of useMemo at the end
code = code.replace(/    return out;\n  \}, \[debouncedQuery, projects, tasks, role, disclosureActive, disclosureLevel\]\);/m, 
    "    if (dbResults.length > 0) {\n      out.push(...dbResults);\n    }\n    return out;\n  }, [debouncedQuery, projects, tasks, role, disclosureActive, disclosureLevel, dbResults]);");

// Add spinner logic to UI
code = code.replace(/<div className="px-4 py-8 text-center text-\[11px\] font-mono text-text-quaternary uppercase">\s*\{debouncedQuery \? 'No results found' : 'Type to search\.\.\.'\}\s*<\/div>/m, 
    `{isSearching ? (
                  <div className="px-4 py-8 flex flex-col items-center justify-center gap-2 text-[11px] font-mono text-text-quaternary uppercase">
                    <Loader className="w-4 h-4 animate-spin text-text-tertiary" />
                    Searching workspace...
                  </div>
                ) : (
                  <div className="px-4 py-8 text-center text-[11px] font-mono text-text-quaternary uppercase">
                    {debouncedQuery && allResults.length === 0 ? 'No matching results. Try searching tasks, files, or projects.' : 'Type to search...'}
                  </div>
                )}`);

fs.writeFileSync('cp_new.tsx', code);
console.log('Done');
