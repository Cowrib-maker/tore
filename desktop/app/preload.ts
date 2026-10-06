import { contextBridge, ipcRenderer } from "electron";

/** The renderer gets a narrow, explicit API — never ipcRenderer, never Node. */
const call = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld("spell", {
  licenseState: () => call("license:state"),
  activate: (code: string, confirmTransferOfActivationId?: string) => call("license:activate", code, confirmTransferOfActivationId),
  validate: () => call("license:validate"),
  deactivate: () => call("license:deactivate"),
  check: (text: string, reportUnknown: boolean) => call("spell:check", text, reportUnknown),
  replace: (text: string, issue: unknown, replacement: string) => call("spell:replace", text, issue, replacement),
  ignoreOnce: (issue: unknown) => call("spell:ignoreOnce", issue),
  ignoreAll: (issue: unknown) => call("spell:ignoreAll", issue),
  addWord: (word: string) => call("dict:add", word),
  removeWord: (word: string) => call("dict:remove", word),
  words: () => call("dict:words"),
  feedbackAdd: (entry: unknown) => call("feedback:add", entry),
  feedbackCount: () => call("feedback:count"),
  feedbackExport: () => call("feedback:export"),
});
