import React, { useState, useEffect } from 'react';
import { FileText, Download, ChevronDown } from 'lucide-react';
import { fetchDocumentTemplates, DocumentTemplate, TemplateType } from '../../services/documentTemplateService';
import { documentGenerator } from '../../services/documentGeneratorService';

interface DocumentGeneratorDropdownProps {
  workspaceId: string;
  type: TemplateType;
  data: Record<string, any>;
  fileName: string;
  buttonText?: string;
  companyName: string;
}

export function DocumentGeneratorDropdown({ workspaceId, type, data, fileName, buttonText, companyName }: DocumentGeneratorDropdownProps) {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    fetchDocumentTemplates(workspaceId).then(data => {
      setTemplates(data.filter(t => t.type === type));
    });
  }, [workspaceId, type]);

  const handleGenerate = async (template: DocumentTemplate) => {
    setIsGenerating(true);
    setIsOpen(false);
    try {
      const templateData = {
        ...data,
        company_name: companyName,
        date: new Date().toLocaleDateString(),
        signature: companyName
      };
      const blob = await documentGenerator(template, templateData);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('Failed to generate document');
    } finally {
      setIsGenerating(false);
    }
  };

  if (templates.length === 0) return null;

  if (templates.length === 1) {
    return (
      <button 
        onClick={() => handleGenerate(templates[0])}
        disabled={isGenerating}
        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 border border-blue-200 rounded transition-colors whitespace-nowrap"
      >
        <Download className="w-3 h-3" />
        {isGenerating ? 'Wait...' : buttonText || 'Download'}
      </button>
    );
  }

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        disabled={isGenerating}
        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 border border-blue-200 rounded transition-colors whitespace-nowrap"
      >
        <Download className="w-3 h-3" />
        {isGenerating ? 'Wait...' : buttonText || 'Download'}
        <ChevronDown className="w-3 h-3" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 shadow-lg rounded-md z-20 py-1">
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => handleGenerate(t)}
                className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <FileText className="w-3 h-3" />
                {t.name} {t.is_default && '(Default)'}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
