import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSpellEngineV1 } from "@/spell-engine";
import { DEV_LICENSE_STATE, NO_DEV, devOptionsFromEnv } from "../../desktop/core/dev-mode";
import { DesktopSpellSession, type DictionaryDoc } from "../../desktop/core/spell-session";
import { FileStore } from "../../desktop/core/store";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "spell-persist-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const open = (file: string) =>
  new DesktopSpellSession(createSpellEngineV1(), new FileStore<DictionaryDoc>(file), { isEntitled: async () => true });

describe("personal dictionary persistence (real files)", () => {
  it("survives an app restart: a new session on the same file sees the words", async () => {
    const file = path.join(dir, "userData", "dictionary.json");
    open(file).addToDictionary("Зоригтбаатар");
    const restarted = open(file);
    expect(restarted.dictionaryWords()).toContain("Зоригтбаатар");
    const r = await restarted.check("Бид Зоригтбаатар гэж нэрлэв.", { reportUnknown: true });
    if (r.locked) throw new Error("locked");
    expect(r.issues.some((i) => i.token === "Зоригтбаатар")).toBe(false);
  });

  it("lives in the user-data directory, not next to the program (update/reinstall safe)", () => {
    // main.ts passes app.getPath("userData")/dictionary.json; nothing in the store derives a path from the install dir.
    const main = fs.readFileSync(path.resolve(__dirname, "../../desktop/app/main.ts"), "utf8");
    expect(main).toMatch(/app\.getPath\("userData"\)/);
    expect(main).toMatch(/path\.join\(dir, "dictionary\.json"\)/);
    expect(main).not.toMatch(/process\.resourcesPath|app\.getAppPath\(\)[^;]*dictionary/);
    const builder = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../desktop/package.json"), "utf8")) as { build: { nsis: { deleteAppDataOnUninstall: boolean } } };
    expect(builder.build.nsis.deleteAppDataOnUninstall).toBe(false);
  });

  it("a corrupted file falls back to the last good backup instead of wiping the dictionary", () => {
    const file = path.join(dir, "dictionary.json");
    const s = open(file);
    s.addToDictionary("Алтанцэцэг");
    s.addToDictionary("Ганбаатар"); // second write makes the first state the .bak
    fs.writeFileSync(file, "{ this is not json"); // disk damage / crash mid-write by another tool
    const restarted = open(file);
    expect(restarted.dictionaryWords().length).toBeGreaterThan(0);
    expect(restarted.dictionaryWords()).toContain("Алтанцэцэг");
  });

  it("when both files are unreadable it starts empty (and does not throw)", () => {
    const file = path.join(dir, "dictionary.json");
    fs.writeFileSync(file, "garbage");
    fs.writeFileSync(`${file}.bak`, "garbage");
    expect(open(file).dictionaryWords()).toEqual([]);
  });

  it("a failed write never corrupts the existing file (atomic temp + rename)", () => {
    const file = path.join(dir, "dictionary.json");
    const store = new FileStore<DictionaryDoc>(file);
    store.write({ version: 1, words: ["а"] });
    store.write({ version: 1, words: ["а", "б"] });
    expect(store.read()!.words).toEqual(["а", "б"]);
    expect(fs.readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("searches the personal dictionary (case-insensitive substring)", () => {
    const s = open(path.join(dir, "d.json"));
    for (const w of ["Зоригтбаатар", "Баатар", "Сарнай"]) s.addToDictionary(w);
    expect(s.searchDictionary("баатар").sort()).toEqual(["Баатар", "Зоригтбаатар"]);
    expect(s.searchDictionary("  САР ")).toEqual(["Сарнай"]);
    expect(s.searchDictionary("xyz")).toEqual([]);
  });

  it("add, remove, ignore-once and ignore-all behave as documented", async () => {
    const s = open(path.join(dir, "d.json"));
    const text = "Хууль тогтоох байгууллага Цэвэгмидэнхүү.";
    const first = await s.check(text, { reportUnknown: true });
    if (first.locked) throw new Error("locked");
    const name = first.issues.find((i) => i.token === "Цэвэгмидэнхүү");
    expect(name).toBeDefined();
    s.ignoreAll(name!);
    const again = await s.check(text, { reportUnknown: true });
    if (again.locked) throw new Error("locked");
    expect(again.issues.some((i) => i.token === "Цэвэгмидэнхүү")).toBe(false);
    s.addToDictionary("Цэвэгмидэнхүү");
    expect(s.removeFromDictionary("Цэвэгмидэнхүү")).toBe(true);
    expect(s.removeFromDictionary("Цэвэгмидэнхүү")).toBe(false);
  });
});

describe("development switches", () => {
  it("are inert unless set, and the dev licence is unmistakably synthetic", () => {
    expect(devOptionsFromEnv({})).toEqual({ devLicense: false, researchDir: undefined, frequencyFile: undefined });
    expect(devOptionsFromEnv({ TORE_SPELL_DEV_LICENSE: "1", TORE_SPELL_RESEARCH_DIR: "C:\\r" }).devLicense).toBe(true);
    expect(NO_DEV.devLicense).toBe(false);
    expect(DEV_LICENSE_STATE).toMatchObject({ kind: "ACTIVE", planCode: "DEV" });
  });

  it("main.ts only reads them behind the compile-time development constant", () => {
    const main = fs.readFileSync(path.resolve(__dirname, "../../desktop/app/main.ts"), "utf8");
    expect(main).toMatch(/__TORE_ENV__ === "development" \? devOptionsFromEnv\(process\.env\) : NO_DEV/);
    expect(main).toMatch(/__TORE_ENV__ === "development" && dev\.researchDir/);
  });
});
