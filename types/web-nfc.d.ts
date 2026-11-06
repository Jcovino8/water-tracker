interface NDEFWriteOptions {
  overwrite?: boolean;
}

interface NDEFRecordInit {
  recordType: string;
  data?: string | BufferSource | null;
  mediaType?: string;
  id?: string;
  encoding?: string;
  lang?: string;
}

interface NDEFMessageInit {
  records: NDEFRecordInit[];
}

declare class NDEFReader {
  write(data: NDEFMessageInit, options?: NDEFWriteOptions): Promise<void>;
  scan(): Promise<void>;
}

interface Window {
  NDEFReader?: typeof NDEFReader;
}