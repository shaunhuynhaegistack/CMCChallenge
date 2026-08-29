/**
 * The reporter ships no types. Only the options this project passes are
 * declared, so a typo in the call is still caught.
 */
declare module 'multiple-cucumber-html-reporter' {
  interface ReportMetadata {
    browser?: { name?: string; version?: string };
    device?: string;
    platform?: { name?: string; version?: string };
  }

  interface CustomDataEntry {
    label: string;
    value: string;
  }

  interface GenerateOptions {
    jsonDir: string;
    reportPath: string;
    pageTitle?: string;
    reportName?: string;
    displayDuration?: boolean;
    displayReportTime?: boolean;
    openReportInBrowser?: boolean;
    customStyle?: string;
    hideMetadata?: boolean;
    metadata?: ReportMetadata;
    customData?: { title: string; data: CustomDataEntry[] };
  }

  export function generate(options: GenerateOptions): void;
}
