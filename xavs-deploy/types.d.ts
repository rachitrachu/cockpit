// Type definitions for Cockpit API and project-specific globals

declare const cockpit: {
  file: (path: string, options?: { superuser?: string }) => {
    read: () => Promise<string>;
    write: (content: string) => Promise<void>;
  };
  spawn: (command: string[], options?: any) => any;
};

export {};
