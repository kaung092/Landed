import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { resolveAsset, ASSET_ROOT } from "@/lib/config";

test("resolveAsset resolves paths inside ASSET_ROOT", () => {
  assert.equal(resolveAsset("resume/resume-ref.docx"), path.join(ASSET_ROOT, "resume/resume-ref.docx"));
  assert.equal(resolveAsset("interview-prep/GLOBAL"), path.join(ASSET_ROOT, "interview-prep/GLOBAL"));
});

test("resolveAsset rejects the root itself and traversal escapes", () => {
  assert.equal(resolveAsset(""), null); // the root
  assert.equal(resolveAsset("."), null); // the root
  assert.equal(resolveAsset("../etc/passwd"), null);
  assert.equal(resolveAsset("../../secret"), null);
  assert.equal(resolveAsset("resume/../../escape"), null);
});
