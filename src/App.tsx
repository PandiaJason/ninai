import { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Sidebar } from './components/Sidebar';
import { NotesPanel } from './components/NotesPanel';
import { ToolView } from './components/ToolView';
import { TOOLS } from './data/tools';

import { Onboarding } from './components/Onboarding';

// --- Tools State ---
function App() {
  const [setupComplete, setSetupComplete] = useState(() => localStorage.getItem('ninai_setup_complete') === 'true');

  const [tools, setTools] = useState(() => {
    const saved = localStorage.getItem('ninai_tools');
    let loaded = saved ? JSON.parse(saved) : TOOLS;

    // Migration: Fix duplicate labels (G -> ✨, C -> Cl)
    loaded = loaded.map((t: any) => {
      if (t.id === 'gemini' && t.label === 'G') return { ...t, label: '✨' };
      if (t.id === 'claude' && t.label === 'C') return { ...t, label: 'Cl' };
      return t;
    });

    return loaded;
  });

  const [activeToolId, setActiveToolId] = useState(tools[0].id);
  const activeTool = tools.find((t: any) => t.id === activeToolId) || tools[0];

  useEffect(() => {
    localStorage.setItem('ninai_tools', JSON.stringify(tools));
  }, [tools]);

  const handleAddTool = (name: string, url: string) => {
    const newTool = {
      id: Date.now().toString(),
      name,
      label: name.substring(0, 1).toUpperCase(),
      color: '#86868b',
      url: url.startsWith('http') ? url : `https://${url}`,
      embeddable: true
    };
    setTools([...tools, newTool]);
    setActiveToolId(newTool.id);
  };

  const handleDeleteTool = (id: string) => {
    const newTools = tools.filter((t: any) => t.id !== id);
    setTools(newTools);
    if (activeToolId === id && newTools.length > 0) {
      setActiveToolId(newTools[0].id);
    }
  };

  // --- Zen Mode (Full Screen Notes) ---
  const [zenMode, setZenMode] = useState(() => {
    const saved = localStorage.getItem('ninai_zen_mode');
    return saved !== null ? saved === 'true' : true; // Default to TRUE for "only note making mode"
  });

  useEffect(() => {
    localStorage.setItem('ninai_zen_mode', zenMode.toString());
  }, [zenMode]);

  // --- Layout State (Hoisted for "Maximize Browser") ---
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isNotesOpen, setIsNotesOpen] = useState(true);

  // Helper to Maximize Browser (Hide Sidebar & Notes)
  const maximizeBrowser = () => {
    setIsSidebarOpen(false);
    setIsNotesOpen(false);
  };

  if (!setupComplete) {
    return <Onboarding onComplete={() => setSetupComplete(true)} />;
  }

  return (
    <Layout
      sidebar={
        <Sidebar
          tools={tools}
          activeToolId={activeTool.id}
          onSelectTool={(id) => {
            const tool = tools.find((t: any) => t.id === id);
            if (tool) setActiveToolId(tool.id);
          }}
          onAddTool={handleAddTool}
          onDeleteTool={handleDeleteTool}
        />
      }
      insightPanel={<NotesPanel zenMode={zenMode} onToggleZenMode={() => setZenMode(!zenMode)} />}
      zenMode={zenMode}
      // Pass hoisted state
      isSidebarOpen={isSidebarOpen}
      setSidebarOpen={setIsSidebarOpen}
      isNotesOpen={isNotesOpen}
      setNotesOpen={setIsNotesOpen}
    >
      {/* Keep-Alive System: Render ALL tools, toggle visibility */}
      {tools.map((tool: any) => (
        <div
          key={tool.id}
          style={{
            display: activeTool.id === tool.id ? 'block' : 'none',
            height: '100%',
            width: '100%'
          }}
        >
          <ToolView
            tool={tool}
            onMaximize={maximizeBrowser}
            isMaximized={!isSidebarOpen && !isNotesOpen} // Optional visual feedback
          />
        </div>
      ))}
    </Layout>
  );
}

export default App;
