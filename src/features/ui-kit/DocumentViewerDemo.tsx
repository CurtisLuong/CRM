import { useState } from 'react';
import { DocumentViewer, type DocumentViewerFile } from '@/components/crm';
import { Button } from '@/components/ui/button';
import { OfflineDocumentError } from '@/lib/document-viewer/files';

const files: DocumentViewerFile[] = [
  {
    id: 'image',
    name: 'Ảnh mẫu.svg',
    mime: 'image/svg+xml',
    size: 2048,
    load: async () =>
      new Blob(
        [
          '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><rect width="1600" height="1000" fill="white"/><circle cx="800" cy="500" r="300" fill="currentColor"/><text x="800" y="900" text-anchor="middle" font-size="64">Tài liệu mẫu</text></svg>',
        ],
        { type: 'image/svg+xml' },
      ),
  },
  {
    id: 'other',
    name: 'Bảng thông tin.docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 4096,
    load: async () => new Blob(['Tài liệu mẫu']),
  },
  {
    id: 'error',
    name: 'Tệp lỗi.pdf',
    mime: 'application/pdf',
    size: 100,
    load: async () => {
      throw new Error('Tải lỗi');
    },
  },
  {
    id: 'offline',
    name: 'Tệp chưa có trên máy.pdf',
    mime: 'application/pdf',
    size: 100,
    load: async () => {
      throw new OfflineDocumentError();
    },
  },
];
export function DocumentViewerDemo() {
  const [fileId, setFileId] = useState('');
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((file) => (
        <Button key={file.id} onClick={() => setFileId(file.id)}>
          {file.name}
        </Button>
      ))}
      <DocumentViewer
        files={files}
        fileId={fileId}
        open={!!fileId}
        onOpenChange={(open) => {
          if (!open) setFileId('');
        }}
        onFileChange={setFileId}
      />
    </div>
  );
}
