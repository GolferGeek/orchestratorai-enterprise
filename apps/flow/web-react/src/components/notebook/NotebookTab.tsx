import { useState } from 'react';
import { CollectionBrowser } from './CollectionBrowser';
import { DocumentManager } from './DocumentManager';
import { QAChat } from './QAChat';

type NotebookView = 'collections' | 'documents' | 'chat';

interface SelectedCollection {
  id: string;
  name: string;
}

export function NotebookTab() {
  const [view, setView] = useState<NotebookView>('collections');
  const [selectedCollection, setSelectedCollection] =
    useState<SelectedCollection | null>(null);

  const handleSelectCollection = (collection: SelectedCollection) => {
    setSelectedCollection(collection);
    setView('documents');
  };

  const handleOpenChat = () => {
    setView('chat');
  };

  const handleBack = () => {
    if (view === 'chat') {
      setView('documents');
    } else if (view === 'documents') {
      setSelectedCollection(null);
      setView('collections');
    }
  };

  return (
    <div className="h-full flex flex-col">
      {view === 'collections' && (
        <CollectionBrowser onSelect={handleSelectCollection} />
      )}
      {view === 'documents' && selectedCollection && (
        <DocumentManager
          collection={selectedCollection}
          onBack={handleBack}
          onOpenChat={handleOpenChat}
        />
      )}
      {view === 'chat' && selectedCollection && (
        <QAChat collection={selectedCollection} onBack={handleBack} />
      )}
    </div>
  );
}
